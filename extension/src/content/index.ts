import { scanForms, watchForNewFields } from "../engines/formScanner";
import { fillAllFields, highlightFields } from "../engines/autofill";
import { ExtMessage, FieldResult, NormalizedField } from "../shared/types";

let currentFields: NormalizedField[] = [];
let currentResults: FieldResult[] = [];
let observer: MutationObserver | null = null;

// ─── Initial scan ─────────────────────────────────────────────────────────────

function doScan(): NormalizedField[] {
  currentFields = scanForms();
  return currentFields;
}

// notify background that we found fields
function notifyBackground(fields: NormalizedField[]) {
  chrome.runtime.sendMessage<ExtMessage>({
    type: "FORM_SCANNED",
    payload: { fields, url: location.href, title: document.title },
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  switch (message.type) {
    case "SCAN_FORM": {
      const fields = doScan();
      sendResponse({ fields });
      if (fields.length > 0) notifyBackground(fields);
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

  return true; // keep channel open for async
});

// ─── Auto-scan on load ────────────────────────────────────────────────────────

(function init() {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    const fields = doScan();
    if (fields.length > 0) notifyBackground(fields);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      const fields = doScan();
      if (fields.length > 0) notifyBackground(fields);
    });
  }

  // watch for SPA route changes / dynamic form injection
  observer = watchForNewFields((newFields) => {
    currentFields = newFields;
    notifyBackground(newFields);
  });
})();
