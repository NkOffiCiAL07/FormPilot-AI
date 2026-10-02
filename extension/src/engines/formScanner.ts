// Universal form scanner. Gathers many independent signals per field (label, aria, autocomplete,
// name/id/data-* hints, placeholder, group question, section, nearby text) — the resolver decides
// what they mean. Works through open shadow roots; iframes are handled by running one scanner per frame.

import { NormalizedField, FieldType, SelectOption } from "../shared/types";
import { normalize } from "./text";
import { cssEscape } from "./dom";

export interface ScanOptions {
  /** Require real layout boxes (browsers). Tests running in jsdom pass false. */
  requireLayout?: boolean;
}

let fieldCounter = 0;
const genId = () => `fp_${Date.now().toString(36)}_${fieldCounter++}`;

type Root = Document | ShadowRoot;
const rootOf = (el: Element): Root => el.getRootNode() as Root;

const NON_CONTENT = /^(HEAD|SCRIPT|STYLE|NOSCRIPT|TITLE|META|LINK|TEMPLATE)$/;
const txt = (el: Element | null | undefined): string =>
  !el || NON_CONTENT.test(el.tagName) ? "" : ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();

const CONTROL_SEL = "input,select,textarea,button,[role=textbox],[role=combobox],[role=listbox],[contenteditable=true]";

// ─── Selectors ───────────────────────────────────────────────────────────────

export const FORM_SELECTORS = [
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=search])",
  "textarea",
  "select",
  '[role="textbox"]',
  '[role="combobox"]:not(input)',
  '[role="listbox"]',
  '[role="spinbutton"]',
  '[contenteditable="true"]',
  '[data-automation-id*="formField"]:not(label)',
].join(", ");

// ─── Shadow DOM traversal ────────────────────────────────────────────────────

const MAX_NODES = 12000;

function* shadowRoots(root: Root | Element): Generator<ShadowRoot> {
  let seen = 0;
  const stack: (Root | Element)[] = [root];
  while (stack.length) {
    const r = stack.pop()!;
    for (const el of Array.from(r.querySelectorAll("*"))) {
      if (++seen > MAX_NODES) return;
      const sr = (el as HTMLElement).shadowRoot;
      if (sr) { yield sr; stack.push(sr); }
    }
  }
}

export function deepQueryAll<T extends Element = HTMLElement>(selector: string, root: Root = document): T[] {
  const out = Array.from(root.querySelectorAll<T>(selector));
  for (const sr of shadowRoots(root)) out.push(...Array.from(sr.querySelectorAll<T>(selector)));
  return out;
}

export function deepQuery<T extends Element = HTMLElement>(selector: string, root: Root = document): T | null {
  const hit = root.querySelector<T>(selector);
  if (hit) return hit;
  for (const sr of shadowRoots(root)) {
    const h = sr.querySelector<T>(selector);
    if (h) return h;
  }
  return null;
}

export function findByFpId(id: string): HTMLElement | null {
  return deepQuery<HTMLElement>(`[data-fp-id="${cssEscape(id)}"]`);
}

// ─── Label & context resolution ──────────────────────────────────────────────

function labelFor(el: HTMLElement): string {
  const root = rootOf(el);
  const parts: string[] = [];

  if (el.id) {
    const labels = root.querySelectorAll<HTMLLabelElement>(`label[for="${cssEscape(el.id)}"]`);
    labels.forEach((l) => parts.push(stripControls(l)));
  }
  const labelsProp = (el as HTMLInputElement).labels;
  if (!parts.length && labelsProp?.length) Array.from(labelsProp).forEach((l) => parts.push(stripControls(l)));
  if (!parts.length) {
    const wrap = el.closest("label");
    if (wrap) parts.push(stripControls(wrap));
  }
  const text = parts.join(" ").trim();
  return text;
}

function stripControls(label: Element): string {
  const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input,select,textarea,button,svg,script,style").forEach((c) => c.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function labelledBy(el: HTMLElement): string {
  const ids = el.getAttribute("aria-labelledby");
  if (!ids) return "";
  const root = rootOf(el);
  return ids.split(/\s+/).map((id) => txt((root as Document).getElementById?.(id) ?? root.querySelector(`#${cssEscape(id)}`))).filter(Boolean).join(" ");
}

// A label-ish element that belongs to a different control must not be borrowed.
function labelsAnotherControl(cand: HTMLElement, el: HTMLElement): boolean {
  const root = rootOf(el);
  if (cand.id) {
    const owner = root.querySelector(`[aria-labelledby~="${cssEscape(cand.id)}"]`);
    if (owner && owner !== el) return true;
  }
  const forId = cand.getAttribute("for");
  return !!forId && forId !== el.id;
}

function nearbyLabelElement(el: HTMLElement): string {
  // React/Material style: <div><span class="label">Name</span><input/></div>
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    if (node.matches("form,body")) break;
    if (node.querySelectorAll(CONTROL_SEL).length > 1 && depth > 0) break; // container holds other fields
    const cand = node.querySelector<HTMLElement>("label, legend, [class*='label' i], [class*='title' i], [data-label], [class*='question' i]");
    if (cand && !cand.contains(el) && !cand.querySelector(CONTROL_SEL) && !labelsAnotherControl(cand, el)) {
      const t = txt(cand);
      if (t && t.length < 200) return t;
    }
  }
  // preceding sibling text (skip siblings that are themselves fields)
  let sib = el.previousElementSibling as HTMLElement | null;
  for (let i = 0; sib && i < 3; i++, sib = sib.previousElementSibling as HTMLElement | null) {
    if (sib.matches(CONTROL_SEL) || sib.querySelector(CONTROL_SEL) || labelsAnotherControl(sib, el)) continue;
    const t = txt(sib);
    if (t && t.length < 160) return t;
  }
  const p = el.parentElement;
  if (p && !/^(BODY|HTML|FORM)$/.test(p.tagName)) {
    let ps = p.previousElementSibling as HTMLElement | null;
    for (let i = 0; ps && i < 2; i++, ps = ps.previousElementSibling as HTMLElement | null) {
      if (ps.matches(CONTROL_SEL) || ps.querySelector(CONTROL_SEL) || labelsAnotherControl(ps, el)) continue;
      const t = txt(ps);
      if (t && t.length < 150 && !t.includes("\n\n")) return t;
    }
  }
  return "";
}

function resolveLabel(el: HTMLElement): string {
  return (
    labelFor(el) ||
    labelledBy(el) ||
    (el.getAttribute("aria-label") ?? "").trim() ||
    workdayLabel(el) ||
    nearbyLabelElement(el) ||
    (el.getAttribute("title") ?? "").trim() ||
    (el as HTMLInputElement).placeholder ||
    ""
  );
}

function workdayLabel(el: HTMLElement): string {
  const id = el.getAttribute("data-automation-id");
  if (!id) return "";
  const l = deepQuery<HTMLElement>(`[data-automation-id="${cssEscape(id)}-label"]`, rootOf(el));
  return l ? txt(l) : "";
}

// The question a radio / checkbox group answers ("Are you willing to relocate?")
function resolveGroupLabel(el: HTMLInputElement): string {
  const fs = el.closest("fieldset");
  const legend = fs?.querySelector("legend");
  if (legend) return txt(legend);
  const grp = el.closest<HTMLElement>('[role="radiogroup"],[role="group"]');
  if (grp) {
    const t = labelledBy(grp) || grp.getAttribute("aria-label") || "";
    if (t) return t.trim();
  }
  // climb until the container holds every radio of the group, then read the text before the options
  const name = el.name;
  const total = name ? rootOf(el).querySelectorAll(`input[type="${el.type}"][name="${cssEscape(name)}"]`).length : 1;
  let box: HTMLElement | null = el.parentElement;
  for (let i = 0; box && i < 6; i++, box = box.parentElement) {
    const n = name ? box.querySelectorAll(`input[type="${el.type}"][name="${cssEscape(name)}"]`).length : 1;
    if (n < total) continue;
    // question text = leading text of the container that is not an option label
    const leading = Array.from(box.children).find((c) => {
      const t = txt(c);
      return t && !c.querySelector(`input[type="${el.type}"]`) && t.length < 250 && !/^(yes|no)$/i.test(t);
    });
    if (leading) return txt(leading);
    let ps = box.previousElementSibling as HTMLElement | null;
    for (let k = 0; ps && k < 2; k++, ps = ps.previousElementSibling as HTMLElement | null) {
      const t = txt(ps);
      if (t && t.length < 250 && !ps.querySelector(CONTROL_SEL)) return t;
    }
    if (n === total && i >= 1) break;
  }
  return "";
}

function resolveSectionContext(el: HTMLElement): string {
  let anc: HTMLElement | null = el.parentElement;
  while (anc && anc.tagName !== "BODY") {
    if (anc.tagName === "FIELDSET") {
      const leg = anc.querySelector("legend");
      if (leg) return txt(leg);
    }
    const aria = anc.getAttribute("aria-label");
    if (aria && anc.matches("section,[role=group],[role=region]")) return aria.trim();
    let prev = anc.previousElementSibling;
    for (let i = 0; prev && i < 3; i++, prev = prev.previousElementSibling) {
      if (/^H[1-6]$/.test(prev.tagName)) return txt(prev);
    }
    const head = anc.matches("section,[role=group],[role=region]") ? anc.querySelector(":scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > header") : null;
    if (head) return txt(head);
    if (anc.tagName === "FORM") break;
    anc = anc.parentElement;
  }
  return "";
}

const nearbyCache = new WeakMap<Element, string>();
function resolveNearbyText(el: HTMLElement): string {
  const container = el.parentElement?.parentElement || el.parentElement;
  if (!container) return "";
  const cached = nearbyCache.get(container);
  if (cached !== undefined) return cached;
  let out = "";
  if ((container.textContent?.length ?? 0) < 1500) {
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,select,textarea,button,script,style,svg").forEach((c) => c.remove());
    out = (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  }
  nearbyCache.set(container, out);
  return out;
}

function attrHints(el: HTMLElement): string {
  const a = (n: string) => el.getAttribute(n) ?? "";
  return [el.id, a("data-automation-id"), a("data-testid"), a("data-qa"), a("data-test"), a("data-cy"), a("data-field"), a("formcontrolname"), a("ng-reflect-name")]
    .filter(Boolean).join(" ");
}

// ─── Types & options ─────────────────────────────────────────────────────────

function resolveFieldType(el: HTMLElement): FieldType {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "input") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    if (t === "month" || t === "datetime-local") return "date";
    const valid: FieldType[] = ["text", "email", "tel", "number", "password", "date", "url", "file", "hidden", "radio", "checkbox"];
    return valid.includes(t as FieldType) ? (t as FieldType) : "text";
  }
  if (el.getAttribute("contenteditable") === "true") return "textarea";
  if (el.getAttribute("role") === "textbox") return "text";
  return "custom";
}

function resolveOptions(el: HTMLElement): SelectOption[] {
  if (el.tagName.toLowerCase() === "select") {
    return Array.from((el as HTMLSelectElement).options)
      .filter((o) => o.value || o.text.trim())
      .filter((o) => !/^(select|choose|please select|--|—)/i.test(o.text.trim()) || o.value)
      .map((o) => ({ value: o.value, label: o.text.trim() }));
  }
  const t = (el as HTMLInputElement).type;
  if (t === "radio") {
    const name = (el as HTMLInputElement).name;
    if (name) {
      return Array.from(rootOf(el).querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${cssEscape(name)}"]`))
        .map((inp) => ({ value: inp.value, label: labelFor(inp) || inp.value }));
    }
  }
  return [];
}

// ─── Visibility ──────────────────────────────────────────────────────────────

function isVisible(el: HTMLElement, requireLayout: boolean): boolean {
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (parseFloat(style.opacity) === 0 && (el as HTMLInputElement).type !== "file") return false;
  if (!requireLayout) return true;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

function hasVisibleAncestor(el: HTMLElement, requireLayout: boolean): boolean {
  let p = el.parentElement;
  for (let i = 0; p && i < 6; i++, p = p.parentElement) if (isVisible(p, requireLayout)) return true;
  return false;
}

function isInsideIgnoredArea(el: HTMLElement): boolean {
  if (el.closest('[role="search"]')) return true;
  const nav = el.closest("nav");
  return !!nav && !nav.querySelector("form,input:not([type=search]),select,textarea");
}

// ─── Normalise one element ───────────────────────────────────────────────────

function normalizeElement(el: HTMLElement, pageContext: string): NormalizedField | null {
  const fieldType = resolveFieldType(el);
  if (fieldType === "hidden") return null;

  let id = el.dataset.fpId || "";
  if (!id) { id = genId(); el.dataset.fpId = id; }

  const input = el as HTMLInputElement;
  const isChoice = fieldType === "radio" || fieldType === "checkbox";
  const ownLabel = resolveLabel(el);
  const groupLabel = isChoice ? resolveGroupLabel(input) : "";
  // For a radio group the question is the label; the option text belongs in `options`.
  const label = fieldType === "radio" ? groupLabel || ownLabel : ownLabel;

  return {
    id,
    elementId: el.id || input.name || id,
    fieldType,
    label,
    placeholder: input.placeholder || "",
    name: input.name || "",
    ariaLabel: el.getAttribute("aria-label") || "",
    required: input.required || el.getAttribute("aria-required") === "true",
    options: resolveOptions(el),
    sectionContext: resolveSectionContext(el),
    pageContext,
    nearbyText: resolveNearbyText(el),
    autocomplete: (el.getAttribute("autocomplete") || "").toLowerCase() === "off" ? "" : (el.getAttribute("autocomplete") || "").toLowerCase(),
    groupLabel,
    attrHints: attrHints(el),
    inShadow: rootOf(el) !== document,
    ...(fieldType === "file" ? { acceptedFileTypes: input.accept || undefined } : {}),
  };
}

// Repeated blocks (employment #1, #2 …): same label/name signature appearing several times.
function assignRepeatIndexes(fields: NormalizedField[]) {
  const sig = (f: NormalizedField) =>
    `${f.fieldType}|${normalize(f.label)}|${normalize(f.name.replace(/\d+/g, "#").replace(/\[#?\]/g, ""))}`;
  const groups = new Map<string, NormalizedField[]>();
  for (const f of fields) {
    if (f.fieldType === "radio" || f.fieldType === "file" || !normalize(f.label)) continue;
    const k = sig(f);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(f);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.forEach((f, i) => { f.repeatIndex = i; f.repeatCount = list.length; });
  }
  // "Work Experience 2" / "Education 3" section headings
  for (const f of fields) {
    if (f.repeatIndex !== undefined) continue;
    const m = f.sectionContext.match(/(?:experience|employment|education|school|degree|job|position)\s*#?\s*(\d+)/i);
    if (m) { f.repeatIndex = Math.max(0, Number(m[1]) - 1); f.repeatCount = Math.max(f.repeatIndex + 1, 2); }
  }
}

// ─── Main scan ───────────────────────────────────────────────────────────────

export function scanForms(opts: ScanOptions = {}): NormalizedField[] {
  const requireLayout = opts.requireLayout ?? true;
  const pageContext = [document.title, document.querySelector("h1")?.textContent?.trim()].filter(Boolean).join(" | ");
  const elements = deepQueryAll<HTMLElement>(FORM_SELECTORS);
  const fields: NormalizedField[] = [];
  const seenGroups = new Set<string>();

  for (const el of elements) {
    const type = (el as HTMLInputElement).type?.toLowerCase() || "";
    const visible = type === "file" ? isVisible(el, requireLayout) || hasVisibleAncestor(el, requireLayout) : isVisible(el, requireLayout);
    if (!visible) continue;
    if (isInsideIgnoredArea(el)) continue;
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) continue;

    // Collapse radio groups to one representative element
    const name = (el as HTMLInputElement).name || "";
    if (type === "radio" && name) {
      const key = `${name}@${el.closest("form")?.id ?? ""}`;
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
    }
    try {
      const field = normalizeElement(el, pageContext);
      if (field) fields.push(field);
    } catch (e) {
      console.debug("[FormPilot] skipped malformed element", e);
    }
  }
  assignRepeatIndexes(fields);
  return fields;
}

// ─── Observing dynamic forms ─────────────────────────────────────────────────

function mutationMatters(records: MutationRecord[]): boolean {
  for (const m of records) {
    if (m.type === "childList") {
      for (const n of Array.from(m.addedNodes)) {
        if (n.nodeType !== 1) continue;
        const e = n as Element;
        if (e.matches?.(FORM_SELECTORS) || e.querySelector?.(FORM_SELECTORS) || e.shadowRoot) return true;
      }
    } else if (m.type === "attributes") {
      const t = m.target as Element;
      // A container being shown/hidden (multi-step forms). Ignore changes on controls themselves (our own highlight).
      if (!t.matches?.(CONTROL_SEL) && t.querySelector?.(FORM_SELECTORS)) return true;
    }
  }
  return false;
}

export function watchForNewFields(callback: (fields: NormalizedField[]) => void, opts: ScanOptions = {}): MutationObserver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const observed = new WeakSet<Node>();

  const observer = new MutationObserver((records) => {
    if (!mutationMatters(records)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const fields = scanForms(opts);
      attachShadow();
      if (fields.length > 0) callback(fields);
    }, 600);
  });
  const config: MutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class", "aria-hidden"] };
  function attachShadow() {
    for (const sr of shadowRoots(document)) if (!observed.has(sr)) { observed.add(sr); observer.observe(sr, config); }
  }
  observer.observe(document.documentElement, config);
  attachShadow();
  return observer;
}
