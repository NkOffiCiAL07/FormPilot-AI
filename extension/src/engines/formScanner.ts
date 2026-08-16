import { NormalizedField, FieldType, SelectOption } from "../shared/types";

let fieldCounter = 0;

function genId(): string {
  return `fp_${Date.now()}_${fieldCounter++}`;
}

// ─── Label resolution ─────────────────────────────────────────────────────────

function resolveLabel(el: HTMLElement): string {
  // 1. <label for="id">
  if (el.id) {
    const labelEl = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`);
    if (labelEl) return labelEl.innerText.trim();
  }

  // 2. wrapping <label>
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true) as HTMLElement;
    // remove child inputs so we only get the label text
    clone.querySelectorAll("input,select,textarea").forEach((c) => c.remove());
    const text = clone.innerText.trim();
    if (text) return text;
  }

  // 3. aria-label / aria-labelledby
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const texts = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.innerText.trim())
      .filter(Boolean);
    if (texts.length) return texts.join(" ");
  }

  // 4. placeholder as fallback
  const placeholder = (el as HTMLInputElement).placeholder;
  if (placeholder) return placeholder;

  // 5. preceding sibling text / nearby text
  const parent = el.parentElement;
  if (parent) {
    // walk siblings before this element
    let sibling = el.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        const text = (sibling as HTMLElement).innerText?.trim();
        if (text && text.length < 200) return text;
        break;
      }
      if (sibling.nodeType === Node.TEXT_NODE) {
        const text = sibling.textContent?.trim();
        if (text) return text;
      }
      sibling = sibling.previousSibling;
    }

    // parent text
    const parentClone = parent.cloneNode(true) as HTMLElement;
    parentClone.querySelectorAll("input,select,textarea,button").forEach((c) => c.remove());
    const parentText = parentClone.innerText.trim();
    if (parentText && parentText.length < 150) return parentText;
  }

  return "";
}

function resolveSectionContext(el: HTMLElement): string {
  let ancestor = el.parentElement;
  while (ancestor) {
    if (ancestor.tagName === "FIELDSET") {
      const legend = ancestor.querySelector("legend");
      if (legend) return legend.innerText.trim();
    }
    // look for a heading nearby
    const headings = ancestor.querySelectorAll("h1,h2,h3,h4,h5,h6");
    if (headings.length) {
      return Array.from(headings)
        .map((h) => (h as HTMLElement).innerText.trim())
        .filter(Boolean)
        .join(" > ");
    }
    if (ancestor.tagName === "FORM" || ancestor.tagName === "BODY") break;
    ancestor = ancestor.parentElement;
  }
  return "";
}

function resolvePageContext(): string {
  const title = document.title || "";
  const h1 = document.querySelector("h1")?.innerText.trim() || "";
  return [title, h1].filter(Boolean).join(" | ");
}

function resolveNearbyText(el: HTMLElement): string {
  const parent = el.parentElement?.parentElement;
  if (!parent) return "";
  const clone = parent.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input,select,textarea,button,script,style").forEach((c) => c.remove());
  return clone.innerText.trim().slice(0, 300);
}

function resolveFieldType(el: HTMLElement): FieldType {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type?.toLowerCase() || "text";
    const validTypes: FieldType[] = ["text", "email", "tel", "number", "password", "date", "url", "file", "hidden", "radio", "checkbox"];
    return validTypes.includes(type as FieldType) ? (type as FieldType) : "text";
  }
  // custom controls (contenteditable, role="combobox", etc.)
  return "custom";
}

function resolveOptions(el: HTMLElement): SelectOption[] {
  const tag = el.tagName.toLowerCase();
  if (tag === "select") {
    return Array.from((el as HTMLSelectElement).options)
      .filter((o) => o.value)
      .map((o) => ({ value: o.value, label: o.text.trim() }));
  }
  if ((el as HTMLInputElement).type === "radio" || (el as HTMLInputElement).type === "checkbox") {
    // gather all same-name siblings
    const name = (el as HTMLInputElement).name;
    if (name) {
      return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`)).map((inp) => ({
        value: inp.value,
        label: resolveLabel(inp) || inp.value,
      }));
    }
  }
  return [];
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

function normalizeElement(el: HTMLElement): NormalizedField | null {
  const fieldType = resolveFieldType(el);
  if (fieldType === "hidden") return null;

  // skip already-processed
  if (el.dataset.fpId) return null;

  const id = genId();
  el.dataset.fpId = id;

  const label = resolveLabel(el);
  const placeholder = (el as HTMLInputElement).placeholder || "";
  const name = (el as HTMLInputElement).name || "";
  const elId = el.id || "";
  const ariaLabel = el.getAttribute("aria-label") || "";
  const required =
    (el as HTMLInputElement).required ||
    el.getAttribute("aria-required") === "true" ||
    !!el.closest("[required]");

  const options = resolveOptions(el);
  const sectionContext = resolveSectionContext(el);
  const pageContext = resolvePageContext();
  const nearbyText = resolveNearbyText(el);
  const acceptedFileTypes = (el as HTMLInputElement).accept || undefined;

  return {
    id,
    elementId: elId || name || id,
    fieldType,
    label,
    placeholder,
    name,
    ariaLabel,
    required,
    options,
    sectionContext,
    pageContext,
    nearbyText,
    ...(fieldType === "file" ? { acceptedFileTypes } : {}),
  };
}

function isVisible(el: HTMLElement): boolean {
  if (!el.offsetParent && el.tagName !== "BODY") return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function isInsideIgnoredArea(el: HTMLElement): boolean {
  return !!el.closest('[role="search"]') || !!el.closest("nav") || !!el.closest("header");
}

const FORM_SELECTORS = [
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image])",
  "textarea",
  "select",
  '[role="combobox"]',
  '[role="listbox"]',
  '[contenteditable="true"]',
].join(", ");

export function scanForms(): NormalizedField[] {
  const elements = document.querySelectorAll<HTMLElement>(FORM_SELECTORS);
  const fields: NormalizedField[] = [];
  const seenNames = new Set<string>();

  for (const el of Array.from(elements)) {
    if (!isVisible(el)) continue;
    if (isInsideIgnoredArea(el)) continue;

    const type = (el as HTMLInputElement).type?.toLowerCase();
    const name = (el as HTMLInputElement).name || "";

    // de-duplicate radio groups
    if (type === "radio" && name && seenNames.has(`radio_${name}`)) continue;
    if (type === "radio" && name) seenNames.add(`radio_${name}`);

    const field = normalizeElement(el);
    if (field) fields.push(field);
  }

  return fields;
}

// ─── MutationObserver for SPA/dynamic forms ──────────────────────────────────

export function watchForNewFields(callback: (fields: NormalizedField[]) => void): MutationObserver {
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const newFields = scanForms();
      if (newFields.length > 0) callback(newFields);
    }, 600);
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: false });
  return observer;
}
