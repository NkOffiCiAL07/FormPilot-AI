import { describe, it, expect } from "vitest";
import { buildFill, effective, attentionCount, groupOf, counts } from "../src/sidebar/review";
import { FieldResult } from "../src/shared/types";
import { makeField } from "./helpers";

const res = (p: Partial<FieldResult> & { status: FieldResult["status"] }, label = "Q"): FieldResult => {
  const f = makeField({ label });
  return { fieldId: f.id, normalizedField: f, confidence: 0.9, value: "", source: "profile", reason: "", requiresReview: false, ...p };
};

describe("review decisions", () => {
  const auto = res({ status: "auto", value: "Asha" }, "First name");
  const review = res({ status: "review", value: "30 LPA", requiresReview: true }, "Expected salary");
  const ai = res({ status: "ai", value: "I build compilers.", source: "ai_generated" }, "Why us?");
  const memory = res({ status: "memory", value: "Old answer", source: "answer_memory", reused: { id: "m1", question: "Why join?", similarity: 0.9, company: "Acme" } }, "Why do you want to join?");
  const empty = res({ status: "needs_input" }, "Favourite colour");
  const sens = res({ status: "sensitive" }, "Gender");
  const doc = res({ status: "document" }, "Resume");
  const all = [auto, review, ai, memory, empty, sens, doc];

  it("deterministic matches are pre-accepted; AI drafts and reused answers are not", () => {
    expect(effective(auto).accepted).toBe(true);
    expect(effective(review).accepted).toBe(true);
    expect(effective(ai).accepted).toBe(false);
    expect(effective(memory).accepted).toBe(false);
  });
  it("Fill selected only fills accepted items", () => {
    expect(buildFill(all, {}, "selected").items.map((i) => i.value)).toEqual(["Asha", "30 LPA"]);
    const d = { [ai.fieldId]: { accepted: true } };
    expect(buildFill(all, d, "selected").items.map((i) => i.value)).toContain("I build compilers.");
  });
  it("Fill all includes drafts but never sensitive, files, empty values or rejected items", () => {
    const v = buildFill(all, { [review.fieldId]: { rejected: true } }, "all").items.map((i) => i.value);
    expect(v).toEqual(["Asha", "I build compilers.", "Old answer"]);
  });
  it("edits override the proposed value and are tracked", () => {
    const d = { [ai.fieldId]: { value: "My own words", accepted: true } };
    expect(effective(ai, d[ai.fieldId])).toMatchObject({ value: "My own words", edited: true, accepted: true });
    expect(buildFill(all, d, "selected").items.find((i) => i.fieldId === ai.fieldId)!.value).toBe("My own words");
  });
  it("a user can supply a value for an unmatched field", () => {
    const d = { [empty.fieldId]: { value: "Teal", accepted: true } };
    expect(buildFill(all, d, "selected").items.map((i) => i.value)).toContain("Teal");
  });
  it("rejecting wins over everything", () => {
    expect(effective(auto, { rejected: true, accepted: true }).accepted).toBe(false);
    expect(buildFill([auto], { [auto.fieldId]: { rejected: true } }, "all").items).toHaveLength(0);
  });
  it("answers are flagged so they're saved to answer memory; other fields are not", () => {
    const { accepted } = buildFill(all, { [ai.fieldId]: { accepted: true }, [memory.fieldId]: { accepted: true } }, "selected");
    expect(accepted.find((a) => a.fieldId === ai.fieldId)).toMatchObject({ isAnswer: true, question: "Why us?" });
    expect(accepted.find((a) => a.fieldId === memory.fieldId)!.reusedId).toBe("m1");
    expect(accepted.find((a) => a.fieldId === auto.fieldId)!.isAnswer).toBe(false);
  });
  it("attention count = items awaiting a decision", () => {
    // salary (review band), AI draft, reused answer, unmatched field — until the user accepts or rejects them
    expect(attentionCount(all, {})).toBe(4);
    expect(attentionCount(all, { [review.fieldId]: { accepted: true }, [ai.fieldId]: { rejected: true } })).toBe(2);
  });
  it("groups", () => {
    expect(all.map(groupOf)).toEqual(["ready", "review", "ai", "ai", "input", "personal", "files"]);
    expect(groupOf(res({ status: "needs_input", suggestion: "x" }))).toBe("review");
  });
  it("counts", () => {
    expect(counts(all, {})).toMatchObject({ selected: 2, all: 4 });
  });
});
