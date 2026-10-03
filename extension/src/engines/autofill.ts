// Filling (and un-filling) fields. Works with React/Vue/Angular controlled inputs and shadow DOM.

import { FieldResult, FillStats, NormalizedField } from "../shared/types";
import { deepQuery, deepQueryAll, findByFpId } from "./formScanner";
import { cssEscape } from "./dom";
import { normalize } from "./text";

export interface FillItem {
  fieldId: string;
  value: string;
  field?: NormalizedField; // used to re-find the element if the page re-rendered and dropped data-fp-id
}

// ─── Native value setters (frameworks track the property descriptor, not the attribute) ──────

function nativeSet(el: HTMLElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else (el as HTMLInputElement).value = value;
}

function fire(el: HTMLElement, value = "") {
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("focus"));
  el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, data: value || null, inputType: "insertText" }));
  el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new FocusEvent("blur"));
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

// ─── Snapshots for undo ────────────────────────────────────────────────────────

type Snapshot =
  | { kind: "text"; value: string }
  | { kind: "editable"; value: string }
  | { kind: "select"; value: string }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "radio"; name: string; checkedValue: string | null };

const undoStack = new Map<string, Snapshot>();

function rootOf(el: Element): Document | ShadowRoot { return el.getRootNode() as Document | ShadowRoot; }
function radiosOf(el: HTMLInputElement): HTMLInputElement[] {
  return el.name ? Array.from(rootOf(el).querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${cssEscape(el.name)}"]`)) : [el];
}

function snapshot(el: HTMLElement): Snapshot | null {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type?.toLowerCase();
  if (tag === "select") return { kind: "select", value: (el as HTMLSelectElement).value };
  if (type === "checkbox") return { kind: "checkbox", checked: (el as HTMLInputElement).checked };
  if (type === "radio") {
    const checked = radiosOf(el as HTMLInputElement).find((r) => r.checked);
    return { kind: "radio", name: (el as HTMLInputElement).name, checkedValue: checked ? checked.value : null };
  }
  if (tag === "input" || tag === "textarea") return { kind: "text", value: (el as HTMLInputElement).value };
  if (el.getAttribute("contenteditable") === "true" || el.getAttribute("role") === "textbox") return { kind: "editable", value: el.innerText };
  return null;
}

function restore(el: HTMLElement, s: Snapshot) {
  switch (s.kind) {
    case "text": nativeSet(el, s.value); fire(el, s.value); break;
    case "select": nativeSet(el, s.value); fire(el, s.value); break;
    case "editable": el.innerText = s.value; fire(el, s.value); break;
    case "checkbox": if ((el as HTMLInputElement).checked !== s.checked) { (el as HTMLInputElement).click(); } break;
    case "radio": {
      const radios = radiosOf(el as HTMLInputElement);
      if (s.checkedValue === null) { radios.forEach((r) => { r.checked = false; }); fire(el); }
      else radios.find((r) => r.value === s.checkedValue)?.click();
      break;
    }
  }
}

// ─── Per-type fillers ─────────────────────────────────────────────────────────────

function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  el.focus();
  nativeSet(el, "");
  el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" }));
  nativeSet(el, value);
  fire(el, value);
  return true;
}

function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const want = value.trim().toLowerCase();
  const opts = Array.from(el.options);
  const hit =
    opts.find((o) => o.value === value) ??
    opts.find((o) => o.text.trim().toLowerCase() === want) ??
    opts.find((o) => o.value && o.text.trim().toLowerCase().startsWith(want)) ??
    opts.find((o) => o.value && want.length > 2 && o.text.trim().toLowerCase().includes(want));
  if (!hit) return false;
  nativeSet(el, hit.value);
  fire(el, hit.value);
  return true;
}

function labelTextOf(radio: HTMLInputElement): string {
  const root = rootOf(radio);
  const l = radio.id ? root.querySelector<HTMLLabelElement>(`label[for="${cssEscape(radio.id)}"]`) : radio.closest("label");
  return (l?.textContent ?? radio.value).trim().toLowerCase();
}

function fillRadio(el: HTMLInputElement, value: string): boolean {
  const want = value.trim().toLowerCase();
  const radios = radiosOf(el);
  const hit = radios.find((r) => r.value.toLowerCase() === want) ?? radios.find((r) => labelTextOf(r) === want) ??
    radios.find((r) => normalize(labelTextOf(r)) === normalize(want));
  if (!hit) return false;
  if (!hit.checked) hit.click();
  fire(hit);
  return true;
}

function fillCheckbox(el: HTMLInputElement, value: string): boolean {
  const shouldCheck = ["true", "yes", "1", "on", "checked", "y"].includes(value.trim().toLowerCase());
  if (el.checked !== shouldCheck) el.click();
  return true;
}

function fillEditable(el: HTMLElement, value: string): boolean {
  el.focus();
  el.innerText = value;
  fire(el, value);
  return true;
}

// Returns whether the value was applied.
function fillElement(el: HTMLElement, value: string): boolean {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type?.toLowerCase() || "";
  try {
    if (tag === "select") return fillSelect(el as HTMLSelectElement, value);
    if (type === "radio") return fillRadio(el as HTMLInputElement, value);
    if (type === "checkbox") return fillCheckbox(el as HTMLInputElement, value);
    if (type === "file") return false; // files are chosen by the user (browsers forbid scripted file selection)
    if (tag === "input" || tag === "textarea") return fillText(el as HTMLInputElement | HTMLTextAreaElement, value);
    if (el.getAttribute("contenteditable") === "true" || el.getAttribute("role") === "textbox") return fillEditable(el, value);
  } catch (e) {
    console.debug("[FormPilot] fill error", e);
  }
  return false;
}

// ─── Highlights ───────────────────────────────────────────────────────────────────

const OUTLINE_KEY = "fpPrevOutline";

function setOutline(el: HTMLElement, css: string | null, style: "solid" | "dashed" = "solid") {
  if (css === null) {
    if (el.dataset[OUTLINE_KEY] !== undefined) {
      el.style.removeProperty("outline"); el.style.removeProperty("outline-offset");
      if (el.dataset[OUTLINE_KEY]) el.style.outline = el.dataset[OUTLINE_KEY]!;
      delete el.dataset[OUTLINE_KEY];
    }
    return;
  }
  if (el.dataset[OUTLINE_KEY] === undefined) el.dataset[OUTLINE_KEY] = el.style.outline;
  el.style.setProperty("outline", `2px ${style} ${css}`, "important");
  el.style.setProperty("outline-offset", "2px", "important");
}

function flash(el: HTMLElement, color = "#4f6ef7", ms = 2200) {
  setOutline(el, color);
  setTimeout(() => setOutline(el, null), ms);
}

// ─── Element lookup ───────────────────────────────────────────────────────────────

function normLabel(s: string) { return s.toLowerCase().replace(/[*\s()[\]]+/g, " ").trim(); }

export function findElement(fieldId: string, f?: NormalizedField): HTMLElement | null {
  const byId = findByFpId(fieldId);
  if (byId) return byId;
  if (!f) return null;

  // The page re-rendered and dropped our marker. Re-find by other signals, and re-tag.
  const attempts: (() => HTMLElement | null)[] = [
    () => (f.elementId && f.elementId !== f.id ? deepQuery(`#${cssEscape(f.elementId)}`) : null),
    () => (f.name ? deepQuery(`[name="${cssEscape(f.name)}"]`) : null),
    () => (f.ariaLabel ? deepQuery(`[aria-label="${cssEscape(f.ariaLabel)}"]`) : null),
    () => (f.placeholder ? deepQuery(`[placeholder="${cssEscape(f.placeholder)}"]`) : null),
    () => {
      if (!f.label) return null;
      const target = normLabel(f.label);
      for (const lbl of deepQueryAll<HTMLLabelElement>("label")) {
        const n = normLabel(lbl.textContent ?? "");
        if (n !== target && !n.startsWith(target) && !target.startsWith(n)) continue;
        const forId = lbl.getAttribute("for");
        const root = rootOf(lbl);
        const c = (forId && root.querySelector<HTMLElement>(`#${cssEscape(forId)}`)) || lbl.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea");
        if (c) return c;
      }
      return null;
    },
  ];
  for (const a of attempts) {
    const el = a();
    if (el) { el.dataset.fpId = fieldId; return el; }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────────

export function fillItems(items: FillItem[]): FillStats {
  const stats: FillStats = { success: 0, failed: 0, skipped: 0, filled: [] };
  for (const item of items) {
    if (!item.value) { stats.skipped++; continue; }
    const el = findElement(item.fieldId, item.field);
    if (!el) { stats.failed++; continue; }
    const before = undoStack.has(item.fieldId) ? null : snapshot(el);
    if (fillElement(el, item.value)) {
      if (before) undoStack.set(item.fieldId, before);
      flash(el);
      stats.success++;
      stats.filled.push(item.fieldId);
    } else {
      stats.failed++;
    }
  }
  return stats;
}

export function fillField(fieldId: string, value: string): boolean {
  return fillItems([{ fieldId, value }]).success === 1;
}

/** Restore original values. No ids → undo everything FormPilot filled on this page. */
export function undoFill(fieldIds?: string[]): number {
  const all = !fieldIds?.length;
  const ids = all ? Array.from(undoStack.keys()) : fieldIds!;
  let n = 0;
  for (const id of ids) {
    const snap = undoStack.get(id);
    const el = findByFpId(id);
    if (!snap || !el) { if (all) undoStack.delete(id); continue; }
    restore(el, snap);
    undoStack.delete(id);
    flash(el, "#f59e0b", 1200);
    n++;
  }
  return n;
}

// Entries for fields the page has since removed can never be undone — drop them.
export function undoCount(): number {
  for (const id of Array.from(undoStack.keys())) if (!findByFpId(id)) undoStack.delete(id);
  return undoStack.size;
}

export function highlightFields(results: FieldResult[]) {
  for (const r of results) {
    const el = findElement(r.fieldId, r.normalizedField);
    if (!el || undoStack.has(r.fieldId)) continue; // don't repaint fields we just filled
    switch (r.status) {
      case "needs_input": case "sensitive": setOutline(el, "#f59e0b"); break;
      case "document": setOutline(el, "#8b5cf6"); break;
      case "review": setOutline(el, "#f59e0b", "dashed"); break;
      case "ai": case "memory": setOutline(el, "#4f6ef7", "dashed"); break;
      default: setOutline(el, null);
    }
  }
}

export function clearHighlights() {
  for (const el of deepQueryAll<HTMLElement>("[data-fp-id]")) setOutline(el, null);
}
