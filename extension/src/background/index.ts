import { ExtMessage, NormalizedField, UserProfile, FieldResult, defaultProfile } from "../shared/types";
import { resolveAllFields, buildSummary } from "../engines/profileResolver";
import { LOCAL_API_BASE } from "../shared/constants";
import { saveApplicationRecord, ApplicationRecord } from "../shared/storage";

// ─── Profile helpers ──────────────────────────────────────────────────────────

async function getProfile(): Promise<UserProfile> {
  return new Promise((resolve) => {
    chrome.storage.local.get("profile", (data) => {
      resolve(data.profile ?? defaultProfile);
    });
  });
}

async function saveProfile(profile: UserProfile): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ profile }, resolve);
  });
}

// ─── Local API check (cached 30s to avoid ping on every scan) ─────────────────

let _apiCache: { online: boolean; ts: number } | null = null;

async function checkApiStatus(): Promise<boolean> {
  if (_apiCache && Date.now() - _apiCache.ts < 30_000) return _apiCache.online;
  try {
    const res = await fetch(`${LOCAL_API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    _apiCache = { online: res.ok, ts: Date.now() };
    return res.ok;
  } catch {
    _apiCache = { online: false, ts: Date.now() };
    return false;
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

function mergeFields(existing: NormalizedField[], incoming: NormalizedField[]): { merged: NormalizedField[]; novel: NormalizedField[] } {
  const existingIds = new Set(existing.map((f) => f.id));
  const novel = incoming.filter((f) => !existingIds.has(f.id));
  return { merged: novel.length > 0 ? [...existing, ...novel] : existing, novel };
}

// ─── Field result cache (15-min TTL prevents re-calling Ollama for same fields)

interface CacheEntry { result: FieldResult; ts: number }
const fieldResultCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function fieldFingerprint(f: NormalizedField): string {
  return `${f.label}|${f.name}|${f.placeholder}|${f.fieldType}`;
}

function getCachedResult(field: NormalizedField): FieldResult | null {
  const entry = fieldResultCache.get(fieldFingerprint(field));
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.result;
}

function cacheResult(field: NormalizedField, result: FieldResult): void {
  fieldResultCache.set(fieldFingerprint(field), { result, ts: Date.now() });
}

// ─── Two-phase analysis ───────────────────────────────────────────────────────
//
// Phase 1 (instant): deterministic profile resolver → push to session storage
// Phase 2 (async):   AI batch call → update session storage when done
//
// This makes the side panel show name/email/etc. immediately while AI fields
// (open-ended textareas) fill in a few seconds later in the background.

async function pushTabState(
  tabId: number,
  fields: NormalizedField[],
  results: FieldResult[],
  meta: { url: string; title: string },
  analyzing: boolean
): Promise<void> {
  const summary = buildSummary(results, fields.length);
  tabStates.set(tabId, { fields, results, url: meta.url, title: meta.title });
  await chrome.storage.session.set({
    [`tab_${tabId}`]: { results, summary, url: meta.url, title: meta.title, fieldCount: fields.length, analyzing },
  });
}

async function runAIPhase(
  tabId: number,
  fields: NormalizedField[],
  results: FieldResult[],
  meta: { url: string; title: string }
): Promise<void> {
  const profile = await getProfile();
  const uncached = results.filter((r) => r.status === "ai" && !getCachedResult(r.normalizedField));

  // Serve any AI fields from cache immediately
  for (const r of results.filter((r) => r.status === "ai")) {
    const cached = getCachedResult(r.normalizedField);
    if (cached) {
      const idx = results.findIndex((res) => res.fieldId === r.fieldId);
      if (idx !== -1) results[idx] = { ...cached, fieldId: r.fieldId };
    }
  }

  if (uncached.length === 0) {
    await pushTabState(tabId, fields, results, meta, false);
    return;
  }

  const apiAvailable = await checkApiStatus();
  if (!apiAvailable) {
    await pushTabState(tabId, fields, results, meta, false);
    return;
  }

  try {
    const res = await fetch(`${LOCAL_API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: uncached.map((r) => r.normalizedField), profile }),
    });
    if (res.ok) {
      const { results: aiResults } = await res.json();
      for (const aiResult of aiResults) {
        const idx = results.findIndex((r) => r.fieldId === aiResult.fieldId);
        if (idx !== -1) {
          results[idx] = aiResult;
          const origField = uncached.find((r) => r.fieldId === aiResult.fieldId)?.normalizedField;
          if (origField && aiResult.status === "ai") cacheResult(origField, aiResult);
        }
      }
    }
  } catch {}

  await pushTabState(tabId, fields, results, meta, false);
  // Update content script highlights with final AI values
  chrome.tabs.sendMessage(tabId, { type: "FIELDS_ANALYZED", payload: { results } }).catch(() => {});
}

// Blocking version used for profile saves (must complete before responding)
async function analyzeFields(fields: NormalizedField[]): Promise<FieldResult[]> {
  const profile = await getProfile();
  const results = resolveAllFields(fields, profile);
  const aiFields = results.filter((r) => r.status === "ai");
  if (aiFields.length === 0) return results;

  const uncached: FieldResult[] = [];
  for (const r of aiFields) {
    const cached = getCachedResult(r.normalizedField);
    if (cached) {
      const idx = results.findIndex((res) => res.fieldId === r.fieldId);
      if (idx !== -1) results[idx] = { ...cached, fieldId: r.fieldId };
    } else {
      uncached.push(r);
    }
  }
  if (uncached.length === 0) return results;

  const apiAvailable = await checkApiStatus();
  if (!apiAvailable) return results;

  try {
    const res = await fetch(`${LOCAL_API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: uncached.map((r) => r.normalizedField), profile }),
    });
    if (res.ok) {
      const { results: aiResults } = await res.json();
      for (const aiResult of aiResults) {
        const idx = results.findIndex((r) => r.fieldId === aiResult.fieldId);
        if (idx !== -1) {
          results[idx] = aiResult;
          const origField = uncached.find((r) => r.fieldId === aiResult.fieldId)?.normalizedField;
          if (origField && aiResult.status === "ai") cacheResult(origField, aiResult);
        }
      }
    }
  } catch {}
  return results;
}

// ─── Company / role extraction ────────────────────────────────────────────────

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function extractCompany(url: string, title: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    let m = url.match(/greenhouse\.io\/([^/?#]+)/);
    if (m) return capitalize(m[1]);
    m = url.match(/lever\.co\/([^/?#]+)/);
    if (m) return capitalize(m[1]);
    if (/\.workday\.com/.test(hostname)) return capitalize(hostname.split(".")[0]);
    if (/\.rippling\.com/.test(hostname)) return capitalize(hostname.split(".")[0]);
    const atMatch = title.match(/\s[Aa][Tt]\s(.+?)(?:\s[-|]|$)/);
    if (atMatch) return atMatch[1].trim();
    const pipeMatch = title.split(/\s\|\s/);
    if (pipeMatch.length > 1) return pipeMatch[pipeMatch.length - 1].trim();
    const dashMatch = title.split(/\s[-–]\s/);
    if (dashMatch.length > 1) return dashMatch[dashMatch.length - 1].trim();
    return capitalize(hostname.split(".")[0]);
  } catch { return "Unknown"; }
}

function extractRole(title: string): string {
  return title
    .replace(/\s\|\s.*$/, "")
    .replace(/\s[-–]\s.*$/, "")
    .replace(/\s[Aa][Tt]\s.*$/, "")
    .trim() || title;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Side panel ───────────────────────────────────────────────────────────────

async function openSidePanel(tabId: number) {
  try {
    await chrome.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });
    await chrome.sidePanel.open({ tabId });
  } catch (e) {
    console.error("[FormPilot] Side panel error:", e);
  }
}

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, sender, sendResponse) => {
  const senderTabId = sender.tab?.id;

  (async () => {
    switch (message.type) {
      case "FORM_SCANNED": {
        if (!senderTabId) break;
        const { fields, url, title } = message.payload as { fields: NormalizedField[]; url: string; title: string };
        if (fields.length === 0) break;

        const existing = tabStates.get(senderTabId);
        const { merged: mergedFields, novel } = existing
          ? mergeFields(existing.fields, fields)
          : { merged: fields, novel: fields };

        // Drop re-scans that add no new fields (1.5s and 4s content-script scans)
        if (existing && novel.length === 0 && existing.results.length > 0) {
          sendResponse({ ok: true });
          break;
        }

        const profile = await getProfile();

        // ── Phase 1: deterministic (instant) ──────────────────────────────────
        const partialResults = resolveAllFields(mergedFields, profile);
        const hasUncachedAI = partialResults.some(
          (r) => r.status === "ai" && !getCachedResult(r.normalizedField)
        );

        await pushTabState(senderTabId, mergedFields, partialResults, { url, title }, hasUncachedAI);

        chrome.tabs.sendMessage(senderTabId, {
          type: "FIELDS_ANALYZED", payload: { results: partialResults },
        }).catch(() => {});

        chrome.action.setBadgeText({ text: String(mergedFields.length), tabId: senderTabId }).catch(() => {});
        chrome.action.setBadgeBackgroundColor({ color: "#4f6ef7", tabId: senderTabId }).catch(() => {});

        // Respond immediately — content script doesn't need to wait for AI
        sendResponse({ ok: true });

        // ── Phase 2: AI (async — updates session storage when done) ───────────
        if (hasUncachedAI) {
          runAIPhase(senderTabId, mergedFields, partialResults, { url, title }).catch(() => {});
        }
        break;
      }

      case "SCAN_FORM": {
        const payload = message.payload as { tabId?: number } | undefined;
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        if (!targetTabId) break;
        await broadcastToAllFrames(targetTabId, { type: "SCAN_FORM" });
        sendResponse({ ok: true });
        break;
      }

      case "FILL_FORM": {
        const payload = message.payload as { results: FieldResult[]; tabId?: number };
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        sendResponse({ ok: true });
        if (!targetTabId) break;
        broadcastToAllFrames(targetTabId, { type: "FILL_FORM", payload: { results: payload.results } }).catch(() => {});

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
        const payload = message.payload as { tabId?: number } | undefined;
        const targetTabId = payload?.tabId ?? senderTabId ?? (await getActiveTabId());
        if (!targetTabId) { sendResponse({ error: "no tab" }); break; }
        await openSidePanel(targetTabId);
        sendResponse({ ok: true });
        break;
      }

      case "CLICK_FILE_INPUT":
      case "SCROLL_TO_FIELD":
      case "HIGHLIGHT_UPLOAD_AREA": {
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
        } catch {
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
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await openSidePanel(tab.id);
});
