import { FieldResult, NormalizedField } from "../shared/types";

// ─── Native value setter (React / Vue / Angular compatible) ──────────────────

function nativeSet(el: HTMLElement, value: string) {
  const tag = el.tagName.toLowerCase();
  if (tag === "input") {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) { setter.call(el, value); return; }
  }
  if (tag === "textarea") {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) { setter.call(el, value); return; }
  }
  (el as HTMLInputElement).value = value;
}

// Dispatch the full event sequence React/Angular/Vue listen to
function triggerEvents(el: HTMLElement, value = "") {
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  // InputEvent (not generic Event) — React 17+ uses InputEvent internally
  el.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    data: value || null,
    inputType: "insertText",
  }));
  el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

function fillTextField(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.focus();
  el.click();
  // Clear first so React re-fires
  nativeSet(el, "");
  el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" }));
  // Set actual value
  nativeSet(el, value);
  triggerEvents(el, value);
}

function fillSelect(el: HTMLSelectElement, value: string) {
  const lower = value.toLowerCase().trim();
  let matched = false;

  // 1. exact value
  for (const opt of Array.from(el.options)) {
    if (opt.value === value) { el.value = opt.value; matched = true; break; }
  }
  // 2. exact label
  if (!matched) {
    for (const opt of Array.from(el.options)) {
      if (opt.text.trim().toLowerCase() === lower) { el.value = opt.value; matched = true; break; }
    }
  }
  // 3. starts-with label match
  if (!matched) {
    for (const opt of Array.from(el.options)) {
      const t = opt.text.trim().toLowerCase();
      if (t.startsWith(lower) || lower.startsWith(t)) { el.value = opt.value; matched = true; break; }
    }
  }
  // 4. partial containment
  if (!matched) {
    for (const opt of Array.from(el.options)) {
      const t = opt.text.trim().toLowerCase();
      if (t.includes(lower) || lower.includes(t)) { el.value = opt.value; matched = true; break; }
    }
  }
  if (matched) triggerEvents(el, value);
  return matched;
}

function fillRadio(name: string, value: string) {
  const lower = value.toLowerCase();
  const radios = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`);
  for (const radio of Array.from(radios)) {
    const labelEl = document.querySelector<HTMLLabelElement>(`label[for="${radio.id}"]`);
    const labelText = (labelEl?.innerText || radio.value).toLowerCase();
    if (radio.value.toLowerCase() === lower || labelText === lower) {
      radio.click();
      triggerEvents(radio);
      return true;
    }
  }
  return false;
}

function fillCheckbox(el: HTMLInputElement, value: string) {
  const shouldCheck = ["true", "yes", "1", "on", "checked", "agree", "accept"].includes(value.toLowerCase());
  if (el.checked !== shouldCheck) {
    el.click();
    triggerEvents(el);
  }
  return true;
}

function flashHighlight(el: HTMLElement) {
  const prev = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  el.style.outline = "2px solid #4f6ef7";
  el.style.outlineOffset = "2px";
  setTimeout(() => { el.style.outline = prev; el.style.outlineOffset = prevOffset; }, 2500);
}

// ─── Core fill logic ──────────────────────────────────────────────────────────

function fillElement(el: HTMLElement, value: string): boolean {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type?.toLowerCase() || "";
  const name = (el as HTMLInputElement).name || "";

  try {
    let ok = false;
    if (tag === "select") {
      ok = fillSelect(el as HTMLSelectElement, value);
    } else if (type === "radio") {
      ok = fillRadio(name, value);
    } else if (type === "checkbox") {
      ok = fillCheckbox(el as HTMLInputElement, value);
    } else if (tag === "input" || tag === "textarea") {
      fillTextField(el as HTMLInputElement | HTMLTextAreaElement, value);
      ok = true;
    } else if (el.getAttribute("contenteditable") === "true" || el.getAttribute("role") === "textbox") {
      el.focus();
      el.click();
      el.innerText = value;
      triggerEvents(el, value);
      ok = true;
    }
    if (ok) flashHighlight(el);
    return ok;
  } catch {
    return false;
  }
}

// ─── Element finder — 6 strategies, most robust to least ─────────────────────

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[*\s()\[\]]+/g, " ").trim();
}

function findElement(result: FieldResult): HTMLElement | null {
  const f = result.normalizedField;

  // Strategy 1 — data-fp-id (set during scan, may be gone after React re-render)
  if (f.id) {
    const el = document.querySelector<HTMLElement>(`[data-fp-id="${f.id}"]`);
    if (el) return el;
  }

  // Strategy 2 — DOM element id
  if (f.elementId && f.elementId !== f.id) {
    const el = document.getElementById(f.elementId);
    if (el) return el;
  }

  // Strategy 3 — name attribute
  if (f.name) {
    const el = document.querySelector<HTMLElement>(`[name="${CSS.escape(f.name)}"]`);
    if (el) return el;
  }

  // Strategy 4 — aria-label
  if (f.ariaLabel) {
    const el = document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(f.ariaLabel)}"]`);
    if (el) return el;
  }

  // Strategy 5 — placeholder text
  if (f.placeholder) {
    const el = document.querySelector<HTMLElement>(`[placeholder="${CSS.escape(f.placeholder)}"]`);
    if (el) return el;
  }

  // Strategy 6 — label text → input association (handles React re-renders best)
  if (f.label) {
    const target = normalizeLabel(f.label);
    const allLabels = Array.from(document.querySelectorAll<HTMLLabelElement>("label"));
    for (const lbl of allLabels) {
      const lblNorm = normalizeLabel(lbl.innerText);
      if (lblNorm === target || lblNorm.startsWith(target) || target.startsWith(lblNorm)) {
        // Try for="id" linkage
        const forId = lbl.getAttribute("for");
        if (forId) {
          const el = document.getElementById(forId);
          if (el) return el;
        }
        // Try child input/select/textarea
        const child = lbl.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
        if (child) return child;
        // Try next sibling inputs
        let sib = lbl.nextElementSibling as HTMLElement | null;
        while (sib) {
          if (sib.matches("input:not([type=hidden]), select, textarea")) return sib;
          const inner = sib.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea");
          if (inner) return inner;
          sib = sib.nextElementSibling as HTMLElement | null;
        }
      }
    }
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function fillField(fieldId: string, value: string): boolean {
  const el = document.querySelector<HTMLElement>(`[data-fp-id="${fieldId}"]`);
  if (!el) return false;
  return fillElement(el, value);
}

export function fillAllFields(results: FieldResult[]): { success: number; failed: number; skipped: number } {
  let success = 0, failed = 0, skipped = 0;

  for (const result of results) {
    if (
      result.status === "skipped" ||
      result.status === "needs_input" ||
      result.status === "sensitive" ||
      result.status === "document"
    ) { skipped++; continue; }

    if (!result.value) { skipped++; continue; }

    const el = findElement(result);
    if (!el) {
      console.debug(`[FormPilot] Not found: "${result.normalizedField.label}" (id=${result.fieldId})`);
      failed++;
      continue;
    }

    const ok = fillElement(el, result.value);
    if (ok) {
      success++;
      console.debug(`[FormPilot] Filled "${result.normalizedField.label}" → "${result.value.slice(0, 40)}"`);
    } else {
      failed++;
      console.debug(`[FormPilot] Fill failed: "${result.normalizedField.label}"`);
    }
  }

  console.debug(`[FormPilot] Fill: ${success} filled, ${failed} failed, ${skipped} skipped`);
  return { success, failed, skipped };
}

export function highlightFields(results: FieldResult[]) {
  for (const result of results) {
    const el = findElement(result);
    if (!el) continue;
    el.style.outline = "";
    if (result.status === "needs_input" || result.status === "sensitive") {
      el.style.outline = "2px solid #f59e0b";
      el.style.outlineOffset = "2px";
    } else if (result.status === "document") {
      el.style.outline = "2px solid #8b5cf6";
      el.style.outlineOffset = "2px";
    }
  }
}
