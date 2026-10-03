// Pure review-panel logic: what the user has accepted/edited/rejected, and what gets filled.
// Kept free of React/chrome so it can be unit-tested.

import { FieldResult } from "../shared/types";
import { questionText } from "../engines/profileResolver";

export interface Decision { accepted?: boolean; rejected?: boolean; value?: string }
export type Decisions = Record<string, Decision>;

export interface Effective { value: string; accepted: boolean; rejected: boolean; edited: boolean }

const NEVER_FILL = new Set(["document", "sensitive", "skipped"]);

// Deterministic matches are pre-accepted. AI drafts and reused answers wait for an explicit accept.
const preAccepted = (r: FieldResult) => (r.status === "auto" || r.status === "review") && !!r.value;

export function effective(r: FieldResult, d?: Decision): Effective {
  const value = d?.value ?? r.value;
  return {
    value,
    edited: d?.value !== undefined && d.value !== r.value,
    rejected: !!d?.rejected,
    accepted: !d?.rejected && (d?.accepted ?? preAccepted(r)),
  };
}

export const isFillable = (r: FieldResult, e: Effective) => !NEVER_FILL.has(r.status) && e.accepted && !e.rejected && e.value.trim() !== "";

export interface FillRequestItems {
  items: { fieldId: string; value: string }[];
  accepted: { fieldId: string; value: string; label: string; key?: string; source: string; confidence: number; question?: string; isAnswer: boolean; reusedId?: string }[];
}

/** mode "selected": only what's accepted. mode "all": everything that has a value (except rejected / never-fill). */
export function buildFill(results: FieldResult[], decisions: Decisions, mode: "selected" | "all"): FillRequestItems {
  const items: FillRequestItems["items"] = [];
  const accepted: FillRequestItems["accepted"] = [];
  for (const r of results) {
    const e = effective(r, decisions[r.fieldId]);
    const ok = mode === "all" ? !NEVER_FILL.has(r.status) && !e.rejected && e.value.trim() !== "" : isFillable(r, e);
    if (!ok) continue;
    items.push({ fieldId: r.fieldId, value: e.value });
    const isAnswer = r.status === "ai" || r.status === "memory";
    accepted.push({
      fieldId: r.fieldId, value: e.value, label: questionText(r.normalizedField), key: r.canonicalKey, source: r.source,
      confidence: r.confidence, isAnswer, question: isAnswer ? questionText(r.normalizedField) : undefined, reusedId: r.reused?.id,
    });
  }
  return { items, accepted };
}

export type Group = "ready" | "review" | "ai" | "input" | "files" | "personal" | "skipped";

export function groupOf(r: FieldResult): Group {
  switch (r.status) {
    case "auto": return "ready";
    case "review": return "review";
    case "ai": case "memory": return "ai";
    case "needs_input": return r.suggestion ? "review" : "input";
    case "document": return "files";
    case "sensitive": return "personal";
    default: return "skipped";
  }
}

/** Items that still need a decision from the user (the "Review N items" count). */
export function attentionCount(results: FieldResult[], decisions: Decisions): number {
  return results.filter((r) => {
    const g = groupOf(r);
    if (g === "ready" || g === "files" || g === "personal" || g === "skipped") return false;
    const d = decisions[r.fieldId];
    return !(d?.accepted || d?.rejected);
  }).length;
}

export function counts(results: FieldResult[], decisions: Decisions) {
  const sel = buildFill(results, decisions, "selected").items.length;
  const all = buildFill(results, decisions, "all").items.length;
  return { selected: sel, all, attention: attentionCount(results, decisions) };
}
