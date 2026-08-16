import { FieldResult, NormalizedField } from "../shared/types";

// ─── Native event trigger (React / Vue / Angular compatible) ─────────────────

function nativeSet(el: HTMLElement, value: string) {
  const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" && inputSetter) {
    inputSetter.call(el, value);
  } else if (tag === "textarea" && textareaSetter) {
    textareaSetter.call(el, value);
  } else {
    (el as HTMLInputElement).value = value;
  }
}

function triggerEvents(el: HTMLElement) {
  ["input", "change", "blur"].forEach((evt) =>
    el.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }))
  );
  // Also fire React synthetic event via KeyboardEvent trick
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

function fillTextField(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.focus();
  nativeSet(el, value);
  triggerEvents(el);
}

function fillSelect(el: HTMLSelectElement, value: string) {
  const lower = value.toLowerCase();
  let matched = false;

  // 1. exact value match
  for (const opt of Array.from(el.options)) {
    if (opt.value === value) { el.value = opt.value; matched = true; break; }
  }
  // 2. exact label match
  if (!matched) {
    for (const opt of Array.from(el.options)) {
      if (opt.text.toLowerCase() === lower) { el.value = opt.value; matched = true; break; }
    }
  }
  // 3. partial match
  if (!matched) {
    for (const opt of Array.from(el.options)) {
      if (opt.text.toLowerCase().includes(lower) || lower.includes(opt.text.toLowerCase())) {
        el.value = opt.value; matched = true; break;
      }
    }
  }
  if (matched) triggerEvents(el);
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

function flashHighlight(el: HTMLElement, color: string) {
  const prev = el.style.outline;
  el.style.outline = `2px solid ${color}`;
  el.style.outlineOffset = "2px";
  setTimeout(() => { el.style.outline = prev; el.style.outlineOffset = ""; }, 2500);
}

// ─── Core fill by element reference ──────────────────────────────────────────

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
      el.innerText = value;
      triggerEvents(el);
      ok = true;
    }
    if (ok) flashHighlight(el, "#4f6ef7");
    return ok;
  } catch {
    return false;
  }
}

// ─── Find element — by fp-id first, then fallback by name/label ──────────────

function findElement(result: FieldResult): HTMLElement | null {
  const f = result.normalizedField;

  // 1. Primary: by data-fp-id (set during scan)
  if (f.id) {
    const el = document.querySelector<HTMLElement>(`[data-fp-id="${f.id}"]`);
    if (el) return el;
  }

  // 2. Fallback: by element id
  if (f.elementId && f.elementId !== f.id) {
    const el = document.getElementById(f.elementId);
    if (el) return el;
  }

  // 3. Fallback: by name attribute
  if (f.name) {
    const el = document.querySelector<HTMLElement>(`[name="${CSS.escape(f.name)}"]`);
    if (el) return el;
  }

  // 4. Fallback: by aria-label
  if (f.ariaLabel) {
    const el = document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(f.ariaLabel)}"]`);
    if (el) return el;
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
    // Only fill auto and ai-resolved fields with actual values
    if (result.status === "skipped" || result.status === "needs_input" ||
        result.status === "sensitive" || result.status === "document") {
      skipped++;
      continue;
    }
    if (!result.value) { skipped++; continue; }

    const el = findElement(result);
    if (!el) {
      console.debug(`[FormPilot] Element not found for field "${result.normalizedField.label}" (id=${result.fieldId})`);
      failed++;
      continue;
    }

    const ok = fillElement(el, result.value);
    if (ok) {
      success++;
      console.debug(`[FormPilot] Filled "${result.normalizedField.label}" → "${result.value.slice(0, 40)}"`);
    } else {
      failed++;
      console.debug(`[FormPilot] Failed to fill "${result.normalizedField.label}"`);
    }
  }

  console.debug(`[FormPilot] Fill complete: ${success} filled, ${failed} failed, ${skipped} skipped`);
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
