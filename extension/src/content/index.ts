import { scanForms, watchForNewFields, findByFpId } from "../engines/formScanner";
import { fillItems, FillItem, highlightFields, undoFill, undoCount, clearHighlights } from "../engines/autofill";
import { ExtMessage, FieldResult, NormalizedField } from "../shared/types";
import { extractPageContext } from "./pageContext";
import { comboOf } from "../shared/quickCopy";
import { quickValue } from "../shared/quickCopy";
import { normalizeProfile } from "../shared/types";

const IS_TOP = window.self === window.top;

// Skip noise frames (tracking pixels, tiny ad iframes)
function shouldSkipFrame(): boolean {
  if (IS_TOP) return false;
  try {
    if (window.innerWidth < 200 || window.innerHeight < 120) return true;
  } catch { return true; }
  return ["/tracking", "/pixel", "/analytics", "doubleclick", "googlesyndication", "facebook.net/tr", "google-analytics"].some((p) => location.href.includes(p));
}

function send(msg: ExtMessage) {
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch { /* extension reloaded — the old content script is orphaned */ }
}

function notifyFields(fields: NormalizedField[]) {
  if (fields.length === 0) return;
  send({ type: "FORM_SCANNED", payload: { fields, frameUrl: location.href, isTop: IS_TOP } });
}

function notifyContext() {
  if (!IS_TOP) return;
  send({ type: "PAGE_CONTEXT", payload: { context: extractPageContext(), isTop: true } });
}

// ─── Messages from the background / side panel ───────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  switch (message.type) {
    case "SCAN_FORM": {
      const fields = scanForms();
      sendResponse({ fields, frameUrl: location.href });
      notifyFields(fields);
      notifyContext();
      return false;
    }
    case "GET_PAGE_CONTEXT":
      sendResponse(IS_TOP ? { context: extractPageContext() } : {});
      return false;

    case "FIELDS_ANALYZED": {
      const { results } = message.payload as { results: FieldResult[] };
      highlightFields(results);
      sendResponse({ ok: true });
      return false;
    }
    case "FILL_FORM": {
      const { items } = message.payload as { items: FillItem[] };
      sendResponse({ stats: fillItems(items) });
      return false;
    }
    case "UNDO_FILL": {
      const { fieldIds } = (message.payload ?? {}) as { fieldIds?: string[] };
      sendResponse({ undone: undoFill(fieldIds), remaining: undoCount() });
      return false;
    }
    case "CLICK_FILE_INPUT": {
      const { fieldId } = message.payload as { fieldId: string };
      const el = findByFpId(fieldId) ?? document.querySelector<HTMLElement>('input[type="file"]');
      if (!el) { sendResponse({ ok: false }); return false; }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => (el as HTMLInputElement).click(), 300);
      sendResponse({ ok: true });
      return false;
    }
    case "SCROLL_TO_FIELD": {
      const { fieldId } = message.payload as { fieldId: string };
      const el = findByFpId(fieldId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        pulse(el, "#4f6ef7", 4);
      }
      sendResponse({ ok: !!el });
      return false;
    }
    case "HIGHLIGHT_UPLOAD_AREA": {
      const { fieldId } = message.payload as { fieldId: string };
      const fileEl = findByFpId(fieldId) ?? document.querySelector<HTMLElement>('input[type="file"]');
      let target: HTMLElement | null = fileEl;
      if (fileEl) {
        // the visible clickable part of a custom upload widget
        let anc: HTMLElement | null = fileEl.parentElement;
        while (anc && anc.tagName !== "BODY") {
          const r = anc.getBoundingClientRect();
          if (r.height > 40 && r.width > 40) { target = anc; break; }
          anc = anc.parentElement;
        }
        target = target?.querySelector<HTMLElement>("button, label, [role='button']") ?? target;
      }
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "center" }); pulse(target, "#6366f1", 8); }
      sendResponse({ ok: !!target });
      return false;
    }
    case "ATTACH_FILE": {
      const { fieldId, name, mime, base64 } = message.payload as { fieldId: string; name: string; mime: string; base64: string };
      const el = findByFpId(fieldId) as HTMLInputElement | null;
      if (!el || el.type !== "file") { sendResponse({ ok: false, reason: "not-found" }); return false; }
      try {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name, { type: mime }));
        el.files = dt.files;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        sendResponse({ ok: el.files.length === 1 });
      } catch {
        sendResponse({ ok: false, reason: "blocked" });
      }
      return false;
    }
    case "SETTINGS_CHANGED":
      sendResponse({ ok: true });
      return false;
    default:
      return false;
  }
});

function pulse(el: HTMLElement, color: string, ticks: number) {
  const prev = { o: el.style.outline, off: el.style.outlineOffset };
  let i = 0;
  const t = setInterval(() => {
    el.style.outline = i % 2 === 0 ? `3px solid ${color}` : "3px solid #a855f7";
    el.style.outlineOffset = "4px";
    if (++i > ticks) { clearInterval(t); setTimeout(() => { el.style.outline = prev.o; el.style.outlineOffset = prev.off; }, 500); }
  }, 350);
}

// ─── Detect submission (only after FormPilot filled something) ───────────────

const SUBMIT_TEXT = /^(submit|apply|send|submit application|send application|apply now|finish|complete application)\b/i;
function reportSubmit() { if (undoCount() > 0) send({ type: "FORM_SUBMITTED", payload: { frameUrl: location.href } }); }

document.addEventListener("submit", reportSubmit, true);
document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement | null)?.closest?.("button,[type=submit],[role=button],input[type=button]") as HTMLElement | null;
  const label = (t?.innerText || (t as HTMLInputElement | null)?.value || "").trim();
  if (t && SUBMIT_TEXT.test(label)) reportSubmit();
}, true);

// ─── Quick-copy hotkeys (configured in Settings → Keyboard shortcuts) ─────────────────

let hotkeys: Record<string, string> = {};   // combo → profile key
let hotProfile = normalizeProfile(null);

function loadHotkeys() {
  try {
    chrome.storage.local.get(["fp_settings", "profile"], (r) => {
      const sc = (r.fp_settings?.shortcuts ?? {}) as Record<string, string>; // key → combo
      hotkeys = Object.fromEntries(Object.entries(sc).filter(([, c]) => c).map(([k, c]) => [c, k]));
      hotProfile = normalizeProfile(r.profile);
    });
  } catch { /* extension context invalidated */ }
}
loadHotkeys();
try { chrome.storage.onChanged.addListener(loadHotkeys); } catch { /* ignore */ }

document.addEventListener("keydown", (e) => {
  if (!e.altKey && !e.ctrlKey && !e.metaKey) return;
  const key = hotkeys[comboOf(e)];
  if (!key) return;
  const value = quickValue(hotProfile, key);
  if (!value) return;
  e.preventDefault();
  e.stopPropagation();
  const el = document.activeElement as HTMLElement | null;
  const editable = el && (el.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]),textarea,[contenteditable=true]"));
  if (editable) {
    if (!el.dataset.fpId) el.dataset.fpId = `fp_hot_${Date.now().toString(36)}`;
    fillItems([{ fieldId: el.dataset.fpId, value }]);
  } else {
    navigator.clipboard?.writeText(value).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = value; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    });
  }
}, true);

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  if (shouldSkipFrame()) return;
  const run = () => { notifyFields(scanForms()); notifyContext(); };

  if (document.readyState === "complete" || document.readyState === "interactive") run();
  else document.addEventListener("DOMContentLoaded", run);
  // many ATS pages render the form after load
  setTimeout(run, 1500);
  setTimeout(run, 4000);

  watchForNewFields(notifyFields);

  // SPA navigation: let the background reset state and rescan
  let lastPath = location.pathname + location.search;
  setInterval(() => {
    const p = location.pathname + location.search;
    if (p !== lastPath) { lastPath = p; clearHighlights(); setTimeout(run, 800); }
  }, 1000);
})();
