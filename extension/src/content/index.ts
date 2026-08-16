import { scanForms, watchForNewFields } from "../engines/formScanner";
import { fillAllFields, highlightFields } from "../engines/autofill";
import { ExtMessage, FieldResult, NormalizedField } from "../shared/types";

let currentFields: NormalizedField[] = [];
let currentResults: FieldResult[] = [];
let observer: MutationObserver | null = null;

// Skip scanning in tiny/navigation frames to avoid noise
function shouldSkipFrame(): boolean {
  if (window.self === window.top) return false; // always scan top frame
  const w = window.innerWidth || document.documentElement.clientWidth;
  const h = window.innerHeight || document.documentElement.clientHeight;
  // Skip if the frame is too small to be a real form container
  if (w < 100 || h < 100) return true;
  // Skip known non-form iframes
  const src = window.location.href;
  const skipPatterns = ["/tracking", "/analytics", "/ads", "doubleclick", "googlesyndication", "facebook.net/tr"];
  if (skipPatterns.some((p) => src.includes(p))) return true;
  return false;
}

// ─── Scan & notify ────────────────────────────────────────────────────────────

function doScan(): NormalizedField[] {
  currentFields = scanForms();
  return currentFields;
}

function notifyBackground(fields: NormalizedField[]) {
  if (fields.length === 0) return;
  chrome.runtime.sendMessage<ExtMessage>({
    type: "FORM_SCANNED",
    payload: { fields, url: window.top?.location.href ?? location.href, title: window.top?.document.title ?? document.title },
  }).catch(() => {/* extension may be reloading */});
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  switch (message.type) {
    case "SCAN_FORM": {
      const fields = doScan();
      sendResponse({ fields });
      notifyBackground(fields);
      break;
    }

    case "FIELDS_ANALYZED": {
      const { results } = message.payload as { results: FieldResult[] };
      currentResults = results;
      highlightFields(results);
      sendResponse({ ok: true });
      break;
    }

    case "FILL_FORM": {
      const { results } = message.payload as { results: FieldResult[] };
      const stats = fillAllFields(results);
      sendResponse({ stats });
      break;
    }

    default:
      sendResponse({ error: "unknown message type" });
  }

  return true;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  if (shouldSkipFrame()) return;

  function runScan() {
    const fields = doScan();
    notifyBackground(fields);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    runScan();
    // Also try after a short delay — some SPAs hydrate late
    setTimeout(runScan, 1500);
    setTimeout(runScan, 4000);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      runScan();
      setTimeout(runScan, 1500);
    });
  }

  // Watch for SPA route changes and dynamically injected forms
  observer = watchForNewFields((newFields) => {
    currentFields = newFields;
    notifyBackground(newFields);
  });
})();
