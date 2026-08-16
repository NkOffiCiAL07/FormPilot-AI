import { ExtMessage, NormalizedField, UserProfile, FieldResult, defaultProfile } from "../shared/types";
import { resolveAllFields, buildSummary } from "../engines/profileResolver";
import { LOCAL_API_BASE } from "../shared/constants";

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
        // Can come from popup (no senderTabId) — get the active tab ourselves
        const payload = message.payload as { tabId?: number } | undefined;
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        if (!targetTabId) break;
        try {
          await chrome.tabs.sendMessage(targetTabId, { type: "SCAN_FORM" });
        } catch {
          // tab may not have content script yet
        }
        sendResponse({ ok: true });
        break;
      }

      case "FILL_FORM": {
        const payload = message.payload as { results: FieldResult[]; tabId?: number };
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        if (!targetTabId) break;
        try {
          await chrome.tabs.sendMessage(targetTabId, { type: "FILL_FORM", payload: { results: payload.results } });
        } catch (e) {
          console.error("[FormPilot] Fill error:", e);
        }
        sendResponse({ ok: true });
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

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`);
});

// Open side panel on extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await openSidePanel(tab.id);
});
