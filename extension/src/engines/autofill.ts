import { FieldResult } from "../shared/types";

// Simulates real user input so React/Vue/Angular listeners fire correctly
function nativeInputTrigger(el: HTMLElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value"
  )?.set;

  const tag = el.tagName.toLowerCase();
  if (tag === "input" && nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else if (tag === "textarea" && nativeTextareaSetter) {
    nativeTextareaSetter.call(el, value);
  } else {
    (el as HTMLInputElement).value = value;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fillTextField(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.focus();
  nativeInputTrigger(el, value);
}

function fillSelect(el: HTMLSelectElement, value: string) {
  // try exact value match first, then label match
  let matched = false;
  for (const opt of Array.from(el.options)) {
    if (opt.value === value || opt.text.toLowerCase() === value.toLowerCase()) {
      el.value = opt.value;
      matched = true;
      break;
    }
  }
  if (!matched) {
    // fuzzy: find option whose label contains the value
    for (const opt of Array.from(el.options)) {
      if (opt.text.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(opt.text.toLowerCase())) {
        el.value = opt.value;
        matched = true;
        break;
      }
    }
  }
  if (matched) {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function fillRadio(name: string, value: string) {
  const radios = document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`);
  for (const radio of Array.from(radios)) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${radio.id}"]`);
    const labelText = label?.innerText.trim().toLowerCase() || radio.value.toLowerCase();
    if (radio.value.toLowerCase() === value.toLowerCase() || labelText === value.toLowerCase()) {
      radio.click();
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      break;
    }
  }
}

function fillCheckbox(el: HTMLInputElement, value: string) {
  const shouldCheck = ["true", "yes", "1", "on", "checked"].includes(value.toLowerCase());
  if (el.checked !== shouldCheck) {
    el.click();
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

// ─── Main fill function ───────────────────────────────────────────────────────

export function fillField(fieldId: string, value: string): boolean {
  // find element by its fp data attribute
  const el = document.querySelector<HTMLElement>(`[data-fp-id="${fieldId}"]`);
  if (!el) return false;

  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type?.toLowerCase() || "";
  const name = (el as HTMLInputElement).name || "";

  try {
    if (tag === "select") {
      fillSelect(el as HTMLSelectElement, value);
    } else if (type === "radio") {
      fillRadio(name, value);
    } else if (type === "checkbox") {
      fillCheckbox(el as HTMLInputElement, value);
    } else if (tag === "input" || tag === "textarea") {
      fillTextField(el as HTMLInputElement | HTMLTextAreaElement, value);
    } else if (el.getAttribute("contenteditable") === "true") {
      el.focus();
      el.innerText = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // highlight filled field briefly
    el.style.outline = "2px solid #4f6ef7";
    el.style.outlineOffset = "2px";
    setTimeout(() => {
      el.style.outline = "";
      el.style.outlineOffset = "";
    }, 2000);
    return true;
  } catch {
    return false;
  }
}

export function fillAllFields(results: FieldResult[]): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "skipped" || result.status === "needs_input" || result.status === "document") continue;
    if (!result.value) continue;

    const ok = fillField(result.fieldId, result.value);
    if (ok) success++;
    else failed++;
  }

  return { success, failed };
}

export function highlightFields(results: FieldResult[]) {
  for (const result of results) {
    const el = document.querySelector<HTMLElement>(`[data-fp-id="${result.fieldId}"]`);
    if (!el) continue;

    // remove old highlights
    el.style.outline = "";
    el.style.backgroundColor = "";

    if (result.status === "needs_input" || result.status === "sensitive") {
      el.style.outline = "2px solid #f59e0b";
    } else if (result.status === "document") {
      el.style.outline = "2px solid #8b5cf6";
    }
  }
}
