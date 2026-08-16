import { ExtMessage, NormalizedField, UserProfile, FieldResult, defaultProfile } from "../shared/types";
import { resolveAllFields, buildSummary } from "../engines/profileResolver";
import { LOCAL_API_BASE } from "../shared/constants";
import { saveApplicationRecord, ApplicationRecord } from "../shared/storage";

// ─── Profile helpers ──────────────────────────────────────────────────────────

async function getProfile(): Promise<UserProfile> {
  return new Promise((resolve) => {
    chrome.storage.local.get("profile", (data) => {
      // Fall back to defaultProfile so field detection always works even before setup
      resolve(data.profile ?? defaultProfile);
    });
  });
}

async function saveProfile(profile: UserProfile): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ profile }, resolve);
  });
}

// ─── Local API check ──────────────────────────────────────────────────────────

async function checkApiStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Analyze fields ───────────────────────────────────────────────────────────

async function analyzeFields(fields: NormalizedField[]): Promise<FieldResult[]> {
  const profile = await getProfile();

  // Phase 1: deterministic resolution
  const results = resolveAllFields(fields, profile);

  // Phase 2+: call local API for AI-required fields
  const apiAvailable = await checkApiStatus();
  if (apiAvailable) {
    const aiFields = results.filter((r) => r.status === "ai");
    if (aiFields.length > 0) {
      try {
        const res = await fetch(`${LOCAL_API_BASE}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: aiFields.map((r) => r.normalizedField), profile }),
        });
        if (res.ok) {
          const { results: aiResults } = await res.json();
          for (const aiResult of aiResults) {
            const idx = results.findIndex((r) => r.fieldId === aiResult.fieldId);
            if (idx !== -1) results[idx] = aiResult;
          }
        }
      } catch {
        // leave as "ai" status — user will see them in review panel
      }
    }
  }

  return results;
}

// ─── Company / role extraction from URL + title ───────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function extractCompany(url: string, title: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // ATS patterns: greenhouse.io/company, lever.co/company, workday subdomain
    let m = url.match(/greenhouse\.io\/([^/?#]+)/);
    if (m) return capitalize(m[1]);
    m = url.match(/lever\.co\/([^/?#]+)/);
    if (m) return capitalize(m[1]);
    if (/\.workday\.com/.test(hostname)) return capitalize(hostname.split(".")[0]);
    if (/\.rippling\.com/.test(hostname)) return capitalize(hostname.split(".")[0]);
    // Title: "Role at Company - ..." or "Role | Company"
    const atMatch = title.match(/\s[Aa][Tt]\s(.+?)(?:\s[-|]|$)/);
    if (atMatch) return atMatch[1].trim();
    const pipeMatch = title.split(/\s\|\s/);
    if (pipeMatch.length > 1) return pipeMatch[pipeMatch.length - 1].trim();
    const dashMatch = title.split(/\s[-–]\s/);
    if (dashMatch.length > 1) return dashMatch[dashMatch.length - 1].trim();
    return capitalize(hostname.split(".")[0]);
  } catch {
    return "Unknown";
  }
}

function extractRole(title: string): string {
  // Drop common suffixes
  return title
    .replace(/\s\|\s.*$/, "")
    .replace(/\s[-–]\s.*$/, "")
    .replace(/\s[Aa][Tt]\s.*$/, "")
    .trim() || title;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Side panel management ────────────────────────────────────────────────────

async function openSidePanel(tabId: number) {
  try {
    await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
    await chrome.sidePanel.open({ tabId });
  } catch (e) {
    console.error("[FormPilot] Side panel error:", e);
  }
}

// ─── Tab state ────────────────────────────────────────────────────────────────

interface TabState {
  fields: NormalizedField[];
  results: FieldResult[];
  url: string;
  title: string;
}

const tabStates = new Map<number, TabState>();

// Merge new fields into existing tab state (for multi-frame / dynamic form updates)
function mergeFields(existing: NormalizedField[], incoming: NormalizedField[]): NormalizedField[] {
  const existingIds = new Set(existing.map((f) => f.id));
  const novel = incoming.filter((f) => !existingIds.has(f.id));
  return [...existing, ...novel];
}

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, sender, sendResponse) => {
  // sender.tab?.id is set for content scripts; undefined for popup/sidepanel messages
  const senderTabId = sender.tab?.id;

  (async () => {
    switch (message.type) {
      case "FORM_SCANNED": {
        if (!senderTabId) break;
        const { fields, url, title } = message.payload as { fields: NormalizedField[]; url: string; title: string };
        if (fields.length === 0) break;

        // Merge with any previously detected fields (handles multi-frame / dynamic forms)
        const existing = tabStates.get(senderTabId);
        const mergedFields = existing ? mergeFields(existing.fields, fields) : fields;

        const results = await analyzeFields(mergedFields);
        // summary.total = actual detected field count, not just resolved count
        const summary = buildSummary(results, mergedFields.length);

        tabStates.set(senderTabId, { fields: mergedFields, results, url, title });

        // Push results back to content script for highlighting
        try {
          await chrome.tabs.sendMessage(senderTabId, {
            type: "FIELDS_ANALYZED",
            payload: { results },
          });
        } catch {
          // content script may not be ready in the sender frame yet
        }

        // Badge shows total detected fields
        await chrome.action.setBadgeText({ text: String(mergedFields.length), tabId: senderTabId });
        await chrome.action.setBadgeBackgroundColor({ color: "#4f6ef7", tabId: senderTabId });

        // Store for popup + side panel
        await chrome.storage.session.set({
          [`tab_${senderTabId}`]: { results, summary, url, title, fieldCount: mergedFields.length },
        });

        sendResponse({ ok: true });
        break;
      }

      case "SCAN_FORM": {
        const payload = message.payload as { tabId?: number } | undefined;
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        if (!targetTabId) break;
        // Broadcast to ALL frames — Workday/ATS forms are often in iframes
        await broadcastToAllFrames(targetTabId, { type: "SCAN_FORM" });
        sendResponse({ ok: true });
        break;
      }

      case "FILL_FORM": {
        const payload = message.payload as { results: FieldResult[]; tabId?: number };
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        // Respond immediately — don't await the fill so MV3 service worker
        // doesn't drop the response channel while waiting for content script
        sendResponse({ ok: true });
        if (!targetTabId) break;
        // Broadcast to ALL frames — the tagged elements live in the frame that scanned them
        broadcastToAllFrames(targetTabId, { type: "FILL_FORM", payload: { results: payload.results } }).catch(() => {});

        // Auto-save application history when a form is meaningfully filled
        const filledCount = payload.results.filter(
          (r) => (r.status === "auto" || r.status === "ai") && r.value
        ).length;
        if (filledCount > 0) {
          const state = tabStates.get(targetTabId);
          if (state?.url) {
            const record: ApplicationRecord = {
              id: crypto.randomUUID(),
              company: extractCompany(state.url, state.title),
              role: extractRole(state.title),
              url: state.url,
              domain: extractDomain(state.url),
              date: new Date().toISOString(),
              status: "applied",
              fieldsCount: filledCount,
            };
            saveApplicationRecord(record).catch(() => {});
          }
        }
        break;
      }

      case "GET_PROFILE": {
        const profile = await getProfile();
        sendResponse({ profile });
        break;
      }

      case "SAVE_PROFILE": {
        await saveProfile(message.payload as UserProfile);
        // Re-analyze current tab fields with updated profile
        const activeTabId = await getActiveTabId();
        if (activeTabId) {
          const state = tabStates.get(activeTabId);
          if (state && state.fields.length > 0) {
            const results = await analyzeFields(state.fields);
            const summary = buildSummary(results, state.fields.length);
            tabStates.set(activeTabId, { ...state, results });
            await chrome.storage.session.set({
              [`tab_${activeTabId}`]: { results, summary, url: state.url, title: state.title, fieldCount: state.fields.length },
            });
          }
        }
        sendResponse({ ok: true });
        break;
      }

      case "OPEN_SIDEPANEL": {
        // tabId can come from payload (popup sends it) or sender (content script)
        const payload = message.payload as { tabId?: number } | undefined;
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        if (!targetTabId) { sendResponse({ error: "no tab" }); break; }
        await openSidePanel(targetTabId);
        sendResponse({ ok: true });
        break;
      }

      case "CLICK_FILE_INPUT":
      case "SCROLL_TO_FIELD": {
        const payload = message.payload as { fieldId: string; tabId?: number };
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        sendResponse({ ok: true });
        if (targetTabId) {
          broadcastToAllFrames(targetTabId, { type: message.type, payload: { fieldId: payload.fieldId } }).catch(() => {});
        }
        break;
      }

      case "GENERATE_COVER_LETTER": {
        const payload = message.payload as { profile: unknown; company: string; role: string; jobContext?: string };
        try {
          const res = await fetch(`${LOCAL_API_BASE}/api/cover-letter`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(45000),
          });
          const data = await res.json();
          sendResponse(data);
        } catch (e) {
          sendResponse({ error: "API unreachable", letter: null });
        }
        break;
      }

      case "CLEAR_AI_MEMORY": {
        try {
          const res = await fetch(`${LOCAL_API_BASE}/api/cover-letter/memory`, {
            method: "DELETE",
            signal: AbortSignal.timeout(5000),
          });
          const data = await res.json();
          sendResponse(data);
        } catch {
          sendResponse({ error: "API unreachable" });
        }
        break;
      }

      case "API_STATUS": {
        const online = await checkApiStatus();
        sendResponse({ online });
        break;
      }

      default:
        sendResponse({ error: "unknown" });
    }
  })();

  return true;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

// Send a message to every frame in a tab (main + all iframes)
async function broadcastToAllFrames(tabId: number, msg: ExtMessage): Promise<void> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames) return;
    await Promise.allSettled(
      frames.map((frame) =>
        chrome.tabs.sendMessage(tabId, msg, { frameId: frame.frameId }).catch(() => {})
      )
    );
  } catch {
    // webNavigation not available — fall back to main frame only
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`);
});

// Open side panel on extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await openSidePanel(tab.id);
});
