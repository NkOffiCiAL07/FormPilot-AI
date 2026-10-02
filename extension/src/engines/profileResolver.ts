// Deterministic profile resolver.
//
//   field signals ──► canonical key (registry) ──► profile value ──► option/format adaptation ──► confidence
//
// No network and no LLM here. Fields it cannot place are returned as "ai" (open-ended questions)
// or "needs_input" (unmatched); the background decides whether to ask the local LLM about those.

import { FieldResult, FillStatus, NormalizedField, UserProfile } from "../shared/types";
import { DEFAULT_THRESHOLDS, SENSITIVE_KEYWORDS } from "../shared/constants";
import { FieldDef, REGISTRY, Kind } from "./fieldRegistry";
import { adaptValue, pickOption } from "./choices";
import { containsPhrase, matchPhrase, normalize, tokenize } from "./text";

export interface Thresholds {
  auto: number;
  review: number;
  autoFillHigh: boolean;
  reviewMedium: boolean;
}

export const DEFAULT_TH: Thresholds = {
  auto: DEFAULT_THRESHOLDS.AUTO, review: DEFAULT_THRESHOLDS.REVIEW, autoFillHigh: true, reviewMedium: true,
};

// ─── Signals ─────────────────────────────────────────────────────────────────

type Source = "autocomplete" | "type" | "label" | "aria" | "group" | "attribute" | "placeholder" | "nearby" | "section";

interface Signal { source: Source; text: string; tokens: string[]; weight: number }

const SOURCE_NAME: Record<Source, string> = {
  autocomplete: "autocomplete attribute", type: "input type", label: "label", aria: "aria-label", group: "question",
  attribute: "field name", placeholder: "placeholder", nearby: "nearby text", section: "section heading",
};

function collectSignals(f: NormalizedField): Signal[] {
  const raw: [Source, string, number][] = [
    ["label", f.label, 1],
    ["aria", f.ariaLabel && f.ariaLabel !== f.label ? f.ariaLabel : "", 1],
    ["group", f.groupLabel && f.groupLabel !== f.label ? f.groupLabel : "", 1],
    ["attribute", [f.name, f.attrHints].filter(Boolean).join(" "), 0.85],
    ["placeholder", f.placeholder, 0.75],
    ["nearby", (f.nearbyText || "").slice(0, 160), 0.45],
    ["section", f.sectionContext, 0.3],
  ];
  return raw.filter(([, t]) => t && t.trim()).map(([source, text, weight]) => ({ source, text, tokens: tokenize(text), weight }));
}

// ─── Scoring one registry entry against a field ─────────────────────────────

interface Hit { score: number; source: Source; text: string; corroborating: number }

const phraseTokenCache = new Map<string, string[]>();
const ptok = (p: string) => { let t = phraseTokenCache.get(p); if (!t) { t = tokenize(p); phraseTokenCache.set(p, t); } return t; };

function scoreDef(def: FieldDef, signals: Signal[], f: NormalizedField): Hit | null {
  const found: { score: number; source: Source; text: string }[] = [];

  const ac = (f.autocomplete || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (def.autocomplete && ac.some((t) => def.autocomplete!.includes(t))) {
    found.push({ score: 1, source: "autocomplete", text: ac.join(" ") });
  }
  const itype = (f as { inputType?: string }).inputType ?? f.fieldType;
  if (def.inputTypes?.includes(f.fieldType) || def.inputTypes?.includes(itype)) {
    found.push({ score: 0.92, source: "type", text: f.fieldType });
  }

  for (const sig of signals) {
    if (def.exclude?.some((ex) => containsPhrase(sig.text, ex))) continue;
    let best = 0;
    for (const phrase of def.phrases) {
      const m = matchPhrase(sig.tokens, ptok(phrase));
      if (m.score > best) best = m.score;
      if (best === 1) break;
    }
    if (best >= 0.5) found.push({ score: best * sig.weight, source: sig.source, text: sig.text });
  }
  if (!found.length) return null;
  found.sort((a, b) => b.score - a.score);
  const top = found[0];
  const sources = new Set(found.filter((x) => x.score >= 0.6 && x.source !== top.source).map((x) => x.source));
  return { score: top.score, source: top.source, text: top.text, corroborating: sources.size };
}

function toConfidence(hit: Hit, def: FieldDef): number {
  const conf = 0.45 + 0.53 * hit.score + 0.04 * Math.min(2, hit.corroborating);
  return Math.min(def.cap ?? 0.99, Math.max(0, Math.round(conf * 100) / 100));
}

// ─── Special-case detectors ─────────────────────────────────────────────────

const labelText = (f: NormalizedField) => [f.label, f.ariaLabel, f.groupLabel, f.name, f.placeholder].filter(Boolean).join(" ");

export function isSensitive(f: NormalizedField): boolean {
  const text = labelText(f) || f.nearbyText.slice(0, 80);
  return SENSITIVE_KEYWORDS.some((kw) => containsPhrase(text, kw));
}

const CONSENT_WORDS = ["certify", "acknowledge", "agree", "consent", "confirm that", "authorize", "authorise", "hereby", "i accept", "terms", "privacy policy", "i have read", "declare"];
export function isConsent(f: NormalizedField): boolean {
  if (f.fieldType !== "checkbox") return false;
  const t = normalize([f.label, f.groupLabel, f.nearbyText.slice(0, 200)].join(" "));
  return CONSENT_WORDS.some((w) => t.includes(w));
}

// Questions that can only be answered in prose. A profile keyword inside them ("…at our company?") is not a match.
const PROSE_QUESTION = /^(why|describe|tell us|tell me|explain|share|please (describe|explain|tell|share)|give (us )?an? (example|description)|how (would|do|did|have) you|what (makes|motivates|interests|attracts|excites|are your (strengths|goals|weaknesses))|in what (way|ways))/;
export function isProseQuestion(f: NormalizedField): boolean {
  return PROSE_QUESTION.test(normalize(f.label || f.ariaLabel || f.placeholder || ""));
}
export function isOpenQuestion(f: NormalizedField): boolean {
  if (f.fieldType === "textarea" || f.fieldType === "custom") return true;
  const q = normalize(f.label || f.ariaLabel || f.placeholder);
  return f.fieldType === "text" && q.length >= 22 && isProseQuestion(f);
}

export function questionText(f: NormalizedField): string {
  return (f.label || f.ariaLabel || f.groupLabel || f.placeholder || f.name || "").replace(/\s+/g, " ").trim();
}

// ─── Result construction ────────────────────────────────────────────────────

const base = (f: NormalizedField): Pick<FieldResult, "fieldId" | "normalizedField"> => ({ fieldId: f.id, normalizedField: f });

function result(f: NormalizedField, r: Partial<FieldResult> & { status: FillStatus; reason: string }): FieldResult {
  return { ...base(f), confidence: 0, value: "", source: "none", requiresReview: false, ...r };
}

export function bandFor(conf: number, th: Thresholds, forceReview: boolean): "auto" | "review" | "none" {
  if (conf >= th.auto) return forceReview || !th.autoFillHigh ? "review" : "auto";
  if (conf >= th.review) return th.reviewMedium ? "review" : "none";
  return "none";
}

export function confidenceLabel(r: Pick<FieldResult, "confidence" | "status">, th: Thresholds = DEFAULT_TH): "High" | "Medium" | "Low" {
  if (r.confidence >= th.auto) return "High";
  if (r.confidence >= th.review) return "Medium";
  return "Low";
}

function hintOf(f: NormalizedField): string {
  return `${f.label} ${f.placeholder}`.toLowerCase();
}

// Fill result for a known canonical key (used by the deterministic path and by LLM classification).
export function resolveWithDef(
  f: NormalizedField, def: FieldDef, profile: UserProfile, th: Thresholds,
  conf: number, reason: string, source: string, exact = false,
): FieldResult {
  const common = { canonicalKey: def.key, source };
  const raw = (def.get(profile, f) || "").trim();

  if (!raw) {
    return result(f, {
      ...common, status: "needs_input", confidence: conf, needsUserInput: true,
      reason: `${reason}. Your profile has no ${def.label.toLowerCase()} yet.`,
      userPrompt: `Add "${def.label}" to your profile so FormPilot can fill it next time.`,
    });
  }

  // Long free-text fields ("Tell us about yourself"): only trust the profile when the label is basically the key.
  if (f.fieldType === "textarea" && def.key === "summary" && !exact) {
    return result(f, { status: "ai", confidence: 0.5, source: "ai_pending", reason: "Open-ended question — will be drafted from your profile" });
  }

  let value = adaptValue(def.key, def.kind as Kind, raw, f.fieldType, hintOf(f));
  let c = conf;
  let why = reason;

  if (["select", "radio", "checkbox"].includes(f.fieldType) && f.options.length > 0 && f.fieldType !== "checkbox") {
    const pick = pickOption(f.options, value || raw, def.kind, def.key);
    if (!pick) {
      return result(f, {
        ...common, status: "needs_input", confidence: Math.min(conf, 0.6), suggestion: raw, needsUserInput: true,
        reason: `${reason}, but none of the options match "${raw}"`,
        userPrompt: `Choose the closest option for "${questionText(f)}".`,
      });
    }
    value = pick.value;
    c = Math.round(Math.min(c, c * (0.85 + 0.15 * pick.quality)) * 100) / 100;
    if (pick.quality < 1) why += ` (option "${pick.label}")`;
  } else if (f.fieldType === "checkbox") {
    // single checkbox ("I am willing to relocate")
    if (def.kind !== "yesno") return result(f, { ...common, status: "needs_input", confidence: 0, reason: "Checkbox needs your decision", needsUserInput: true });
    value = raw.toLowerCase().startsWith("y") ? "true" : "false";
  } else if (def.kind === "yesno") {
    value = raw.toLowerCase().startsWith("y") ? "Yes" : "No";
  }

  const forceReview = !!def.review;
  const band = bandFor(c, th, forceReview);
  if (band === "none") {
    return result(f, {
      ...common, status: "needs_input", confidence: c, suggestion: value, needsUserInput: true, requiresReview: true,
      reason: `${why}. Confidence ${Math.round(c * 100)}% is below your auto-fill threshold`,
    });
  }
  return result(f, {
    ...common, status: band === "auto" ? "auto" : "review", confidence: c, value,
    requiresReview: band === "review", reason: why,
  });
}

// ─── Main resolver ──────────────────────────────────────────────────────────

function fileKind(f: NormalizedField): string {
  const t = normalize(`${f.label} ${f.name} ${f.nearbyText.slice(0, 100)}`);
  if (/\b(cover letter|covering letter)\b/.test(t)) return "cover_letter";
  if (/\b(resume|cv|curriculum vitae)\b/.test(t)) return "resume";
  if (/\b(transcript|marksheet|certificate)\b/.test(t)) return "certificate";
  return "other";
}

function customDefs(profile: UserProfile): FieldDef[] {
  return profile.customFields
    .filter((c) => c.value && (c.label || c.key))
    .map((c) => ({ key: `custom.${c.key}`, label: c.label || c.key, kind: "text" as Kind, get: () => c.value,
      phrases: [c.label, c.key].filter(Boolean).map(normalize), cap: 0.92 }));
}

const SALUTATION = /^(mr|mrs|ms|miss|mx|dr|prof|sir|madam|shri|smt)$/;
function looksLikeSalutation(f: NormalizedField): boolean {
  const labels = f.options.map((o) => normalize(o.label));
  return labels.filter((l) => SALUTATION.test(l)).length >= 2;
}

export function resolveField(field: NormalizedField, profile: UserProfile, th: Thresholds = DEFAULT_TH): FieldResult {
  const f = field;

  if (f.fieldType === "file") {
    const kind = fileKind(f);
    return result(f, { status: "document", canonicalKey: kind, source: "document_manager",
      reason: kind === "resume" ? "Resume upload — pick one in FormPilot" : "File upload — choose a document" });
  }
  if (f.fieldType === "password") {
    return result(f, { status: "skipped", reason: "Password fields are never filled" });
  }
  if (isConsent(f)) {
    return result(f, { status: "sensitive", source: "ask_user", needsUserInput: true,
      reason: "Consent / agreement — you must read and check this yourself", userPrompt: "Please review and check this agreement manually." });
  }
  if (isSensitive(f)) {
    return result(f, { status: "sensitive", source: "ask_user", needsUserInput: true,
      reason: "Personal question — FormPilot never guesses this", userPrompt: `"${questionText(f)}" is personal. Please answer it yourself.` });
  }
  if (f.fieldType === "textarea" && fileKind({ ...f, nearbyText: "" }) === "cover_letter") {
    return result(f, { status: "needs_input", canonicalKey: "coverLetter", needsUserInput: true,
      reason: "Cover letter field — generate one in the Cover Letter tab", userPrompt: "Generate a cover letter in the side panel, then insert it here." });
  }

  const signals = collectSignals(f);
  const defs = [...REGISTRY, ...customDefs(profile)];
  const hits: { def: FieldDef; hit: Hit }[] = [];
  for (const def of defs) {
    const hit = scoreDef(def, signals, f);
    if (hit) hits.push({ def, hit });
  }
  hits.sort((a, b) => b.hit.score - a.hit.score);

  // "Title" with Mr/Ms/Dr options is a salutation, not a job title
  if (hits[0]?.def.key === "currentTitle" && looksLikeSalutation(f)) hits.shift();
  const best = hits[0];
  if (best && best.hit.score >= 0.5) {
    let conf = toConfidence(best.hit, best.def);
    let why = best.hit.source === "autocomplete" || best.hit.source === "type"
      ? `Matched ${SOURCE_NAME[best.hit.source]} "${best.hit.text}"`
      : `Matched ${SOURCE_NAME[best.hit.source]} "${best.hit.text.replace(/\s+/g, " ").trim().slice(0, 60)}"`;
    const second = hits.find((h) => h.def.key !== best.def.key);
    if (second && second.hit.score >= 0.6 && best.hit.score - second.hit.score < 0.1) {
      conf = Math.max(0, Math.round((conf - 0.15) * 100) / 100);
      why += `; also resembles ${second.def.label.toLowerCase()}`;
    }
    // Prose questions ("Why do you want to join our company?") are answers, not lookups, unless the match is exact.
    const prose = isProseQuestion(f) && best.hit.score < 0.95;
    if (!prose) {
      return resolveWithDef(f, best.def, profile, th, conf, why, best.def.key.startsWith("custom.") ? "profile.custom" : "profile", best.hit.score >= 0.95);
    }
  }

  if (isOpenQuestion(f) && questionText(f).length > 3) {
    return result(f, { status: "ai", confidence: 0.5, source: "ai_pending", reason: "Open-ended question — will be drafted from your profile" });
  }
  return result(f, {
    status: "needs_input", needsUserInput: true, source: "no_match", reason: "No matching profile field",
    userPrompt: `Could not match "${questionText(f) || "this field"}". Fill it manually.`,
  });
}

export function resolveAllFields(fields: NormalizedField[], profile: UserProfile, th: Thresholds = DEFAULT_TH): FieldResult[] {
  return fields.map((f) => resolveField(f, profile, th));
}

export function buildSummary(results: FieldResult[], totalFields?: number) {
  const n = (...s: FillStatus[]) => results.filter((r) => s.includes(r.status)).length;
  return {
    total: totalFields ?? results.length,
    auto: n("auto"),
    review: n("review"),
    ai: n("ai", "memory"),
    needsInput: n("needs_input", "sensitive"),
    documents: n("document"),
  };
}
