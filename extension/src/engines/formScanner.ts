import { NormalizedField, FieldType, SelectOption } from "../shared/types";

let fieldCounter = 0;
function genId(): string {
  return `fp_${Date.now()}_${fieldCounter++}`;
}

// ─── Label resolution ─────────────────────────────────────────────────────────

function resolveLabel(el: HTMLElement): string {
  // 1. <label for="id">
  if (el.id) {
    const lbl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl) return lbl.innerText.trim();
  }

  // 2. wrapping <label>
  const wrap = el.closest("label");
  if (wrap) {
    const clone = wrap.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
    const t = clone.innerText.trim();
    if (t) return t;
  }

  // 3. aria-label
  const al = el.getAttribute("aria-label");
  if (al) return al.trim();

  // 4. aria-labelledby
  const alb = el.getAttribute("aria-labelledby");
  if (alb) {
    const texts = alb.split(/\s+/).map((id) => document.getElementById(id)?.innerText.trim()).filter(Boolean);
    if (texts.length) return texts.join(" ");
  }

  // 5. data-automation-id label (Workday pattern)
  const autoId = el.getAttribute("data-automation-id");
  if (autoId) {
    const lblEl = document.querySelector(`[data-automation-id="${CSS.escape(autoId)}-label"]`);
    if (lblEl) return (lblEl as HTMLElement).innerText.trim();
  }

  // 6. Preceding element with text in same container
  const parent = el.parentElement;
  if (parent) {
    let sib = el.previousElementSibling;
    while (sib) {
      const t = (sib as HTMLElement).innerText?.trim();
      if (t && t.length < 200) return t;
      sib = sib.previousElementSibling;
    }
    // grandparent preceding text
    const gp = parent.parentElement;
    if (gp) {
      let gpSib = parent.previousElementSibling;
      while (gpSib) {
        const t = (gpSib as HTMLElement).innerText?.trim();
        if (t && t.length < 150 && !t.includes("\n\n")) return t;
        gpSib = gpSib.previousElementSibling;
      }
    }
  }

  // 7. placeholder fallback
  return (el as HTMLInputElement).placeholder || "";
}

function resolveSectionContext(el: HTMLElement): string {
  let anc = el.parentElement;
  while (anc && anc.tagName !== "BODY") {
    if (anc.tagName === "FIELDSET") {
      const leg = anc.querySelector("legend");
      if (leg) return (leg as HTMLElement).innerText.trim();
    }
    // nearest heading sibling above us
    const prev = anc.previousElementSibling;
    if (prev && /^H[1-6]$/.test(prev.tagName)) {
      return (prev as HTMLElement).innerText.trim();
    }
    if (anc.tagName === "FORM") break;
    anc = anc.parentElement;
  }
  return "";
}

function resolveNearbyText(el: HTMLElement): string {
  const container = el.parentElement?.parentElement || el.parentElement;
  if (!container) return "";
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input,select,textarea,button,script,style,svg").forEach((c) => c.remove());
  return clone.innerText.trim().slice(0, 300);
}

function resolveFieldType(el: HTMLElement): FieldType {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "input") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    const valid: FieldType[] = ["text","email","tel","number","password","date","url","file","hidden","radio","checkbox"];
    return valid.includes(t as FieldType) ? (t as FieldType) : "text";
  }
  return "custom";
}

function resolveOptions(el: HTMLElement): SelectOption[] {
  if (el.tagName.toLowerCase() === "select") {
    return Array.from((el as HTMLSelectElement).options)
      .filter((o) => o.value)
      .map((o) => ({ value: o.value, label: o.text.trim() }));
  }
  const t = (el as HTMLInputElement).type;
  if (t === "radio" || t === "checkbox") {
    const name = (el as HTMLInputElement).name;
    if (name) {
      return Array.from(
        document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`)
      ).map((inp) => ({ value: inp.value, label: resolveLabel(inp) || inp.value }));
    }
  }
  return [];
}

// ─── Visibility — use getBoundingClientRect instead of offsetParent
// offsetParent is null for position:fixed elements (common in Workday modals/sticky forms)

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (parseFloat(style.opacity) === 0) return false;
  // getBoundingClientRect works for all positioning contexts
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function isInsideIgnoredArea(el: HTMLElement): boolean {
  // Only skip true navigation/search bars — not form sections that happen to be in a header element
  if (el.closest('[role="search"]')) return true;
  // Skip only if directly inside <nav>, not a form inside a page that has a nav somewhere
  const nav = el.closest("nav");
  if (nav && !nav.querySelector("form,input,select,textarea")) return true;
  return false;
}

// ─── Selectors — extended for Workday, Greenhouse, Lever, Ashby, custom ATSes

const FORM_SELECTORS = [
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=search])",
  "textarea",
  "select",
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="spinbutton"]',
  '[contenteditable="true"]',
  // Workday specific
  '[data-automation-id*="formField"]:not(label)',
].join(", ");

// ─── Normalize a single element into NormalizedField ─────────────────────────

function normalizeElement(el: HTMLElement): NormalizedField | null {
  const fieldType = resolveFieldType(el);
  if (fieldType === "hidden") return null;

  // Reuse existing ID if already tagged (re-scan returns same fields, not 0)
  let id = el.dataset.fpId || "";
  if (!id) {
    id = genId();
    el.dataset.fpId = id;
  }

  const label      = resolveLabel(el);
  const placeholder = (el as HTMLInputElement).placeholder || "";
  const name       = (el as HTMLInputElement).name || "";
  const elId       = el.id || "";
  const ariaLabel  = el.getAttribute("aria-label") || "";
  const required   =
    (el as HTMLInputElement).required ||
    el.getAttribute("aria-required") === "true" ||
    !!el.getAttribute("required");

  return {
    id,
    elementId: elId || name || id,
    fieldType,
    label,
    placeholder,
    name,
    ariaLabel,
    required,
    options: resolveOptions(el),
    sectionContext: resolveSectionContext(el),
    pageContext: [document.title, document.querySelector("h1")?.innerText.trim()].filter(Boolean).join(" | "),
    nearbyText: resolveNearbyText(el),
    ...(fieldType === "file" ? { acceptedFileTypes: (el as HTMLInputElement).accept || undefined } : {}),
  };
}

// ─── Main scan ────────────────────────────────────────────────────────────────

export function scanForms(): NormalizedField[] {
  const elements = document.querySelectorAll<HTMLElement>(FORM_SELECTORS);
  const fields: NormalizedField[] = [];
  const seenRadioNames = new Set<string>();

  for (const el of Array.from(elements)) {
    if (!isVisible(el)) continue;
    if (isInsideIgnoredArea(el)) continue;

    const type = (el as HTMLInputElement).type?.toLowerCase() || "";
    const name = (el as HTMLInputElement).name || "";

    // Collapse radio groups to one representative element
    if (type === "radio" && name) {
      if (seenRadioNames.has(name)) continue;
      seenRadioNames.add(name);
    }

    try {
      const field = normalizeElement(el);
      if (field) fields.push(field);
    } catch {
      // malformed element — skip
    }
  }

  return fields;
}

// ─── MutationObserver for SPA / dynamic forms ────────────────────────────────

export function watchForNewFields(callback: (fields: NormalizedField[]) => void): MutationObserver {
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const fields = scanForms();
      if (fields.length > 0) callback(fields);
    }, 600);
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: false });
  return observer;
}
