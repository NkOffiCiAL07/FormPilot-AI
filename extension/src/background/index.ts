import { ExtMessage, NormalizedField, UserProfile, FieldResult } from "../shared/types";
import { resolveAllFields, buildSummary } from "../engines/profileResolver";
import { LOCAL_API_BASE } from "../shared/constants";

// ─── Profile helpers ──────────────────────────────────────────────────────────

async function getProfile(): Promise<UserProfile | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get("profile", (data) => {
      resolve(data.profile ?? null);
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
  if (!profile) return [];

  // Phase 1: deterministic resolution (no AI)
  const results = resolveAllFields(fields, profile);

  // Phase 2+: try local API for AI fields
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
          // merge AI results back
          for (const aiResult of aiResults) {
            const idx = results.findIndex((r) => r.fieldId === aiResult.fieldId);
            if (idx !== -1) results[idx] = aiResult;
          }
        }
      } catch {
        // local API unavailable — leave as "ai" status for user to fill
      }
    }
  }

  return results;
}

// ─── Side panel management ────────────────────────────────────────────────────

async function openSidePanel(tabId: number) {
  try {
    await chrome.sidePanel.open({ tabId });
    await chrome.sidePanel.setOptions({
      tabId,
      path: "sidepanel.html",
      enabled: true,
    });
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

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  (async () => {
    switch (message.type) {
      case "FORM_SCANNED": {
        if (!tabId) break;
        const { fields, url, title } = message.payload as { fields: NormalizedField[]; url: string; title: string };

        if (fields.length === 0) break;

        const results = await analyzeFields(fields);
        const summary = buildSummary(results);

        tabStates.set(tabId, { fields, results, url, title });

        // push results back to content script
        await chrome.tabs.sendMessage(tabId, {
          type: "FIELDS_ANALYZED",
          payload: { results },
        });

        // update badge
        const count = fields.length;
        await chrome.action.setBadgeText({ text: String(count), tabId });
        await chrome.action.setBadgeBackgroundColor({ color: "#4f6ef7", tabId });

        // store for side panel
        await chrome.storage.session.set({ [`tab_${tabId}`]: { results, summary, url, title } });

        sendResponse({ ok: true });
        break;
      }

      case "SCAN_FORM": {
        if (!tabId) break;
        await chrome.tabs.sendMessage(tabId, { type: "SCAN_FORM" });
        sendResponse({ ok: true });
        break;
      }

      case "FILL_FORM": {
        if (!tabId) break;
        const { results } = message.payload as { results: FieldResult[] };
        await chrome.tabs.sendMessage(tabId, { type: "FILL_FORM", payload: { results } });
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
        sendResponse({ ok: true });
        break;
      }

      case "OPEN_SIDEPANEL": {
        if (!tabId) break;
        await openSidePanel(tabId);
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

  return true; // async
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  chrome.storage.session.remove(`tab_${tabId}`);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await openSidePanel(tab.id);
});
