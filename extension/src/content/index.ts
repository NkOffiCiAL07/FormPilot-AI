import { scanForms, watchForNewFields } from "../engines/formScanner";
import { fillAllFields, highlightFields } from "../engines/autofill";
import { ExtMessage, FieldResult, NormalizedField } from "../shared/types";

let currentResults: FieldResult[] = [];
let observer: MutationObserver | null = null;

// Safe cross-origin access — window.top from a cross-origin iframe throws SecurityError
function safeTopHref(): string {
  try { return window.top?.location.href ?? location.href; } catch { return location.href; }
}
function safeTopTitle(): string {
  try { return window.top?.document.title ?? document.title; } catch { return document.title; }
}

// Skip noise frames (tracking pixels, tiny ad iframes)
function shouldSkipFrame(): boolean {
  if (window.self === window.top) return false;
  try {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 200 || h < 200) return true;
  } catch { return true; }
  const src = location.href;
  const skip = ["/tracking", "/pixel", "/analytics", "doubleclick", "googlesyndication", "facebook.net/tr", "google-analytics"];
  return skip.some((p) => src.includes(p));
}

// ─── Scan & notify ────────────────────────────────────────────────────────────

function doScan(): NormalizedField[] {
  return scanForms();
}

function notifyBackground(fields: NormalizedField[]) {
  if (fields.length === 0) return;
  console.debug(`[FormPilot] Sending ${fields.length} fields to background`);
  chrome.runtime.sendMessage<ExtMessage>({
    type: "FORM_SCANNED",
    payload: {
      fields,
      url: safeTopHref(),
      title: safeTopTitle(),
      frameUrl: location.href,
    },
  }).catch((e) => console.debug("[FormPilot] sendMessage error:", e?.message));
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  switch (message.type) {
    case "SCAN_FORM": {
      const fields = doScan();
      console.debug(`[FormPilot] Manual scan: ${fields.length} fields in ${location.href}`);
      sendResponse({ fields, frameUrl: location.href });
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

    case "CLICK_FILE_INPUT": {
      const { fieldId } = message.payload as { fieldId: string };
      // Find by fp-id first, then any file input
      let el = document.querySelector<HTMLElement>(`[data-fp-id="${fieldId}"]`);
      if (!el) el = document.querySelector<HTMLElement>('input[type="file"]');
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => (el as HTMLInputElement).click(), 300);
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "file input not found" });
      }
      break;
    }

    case "SCROLL_TO_FIELD": {
      const { fieldId } = message.payload as { fieldId: string };
      const el = document.querySelector<HTMLElement>(`[data-fp-id="${fieldId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.outline = "3px solid #4f6ef7";
        el.style.outlineOffset = "3px";
        setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; }, 2000);
      }
      sendResponse({ ok: !!el });
      break;
    }

    default:
      sendResponse({ error: "unknown" });
  }

  return true;
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  if (shouldSkipFrame()) return;

  function runScan(label: string) {
    const fields = doScan();
    console.debug(`[FormPilot] Auto-scan (${label}): ${fields.length} fields found in ${location.href}`);
    notifyBackground(fields);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    runScan("immediate");
    setTimeout(() => runScan("1.5s"), 1500);
    setTimeout(() => runScan("4s"), 4000);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      runScan("DOMContentLoaded");
      setTimeout(() => runScan("DOMContentLoaded+1.5s"), 1500);
    });
  }

  observer = watchForNewFields((fields) => {
    console.debug(`[FormPilot] MutationObserver: ${fields.length} fields in ${location.href}`);
    notifyBackground(fields);
  });
})();
