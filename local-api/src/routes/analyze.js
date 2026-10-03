import { Router } from "express";
import { asyncHandler } from "../middleware/errors.js";
import { requireObject, str } from "../middleware/validate.js";
import { findSimilar } from "../services/answerMemory.js";
import { generateAnswers, classifyFields } from "../ai/tasks.js";
import { requireProvider } from "../ai/index.js";
import { resumeRows } from "./documents.js";

const router = Router();
const BATCH = 4;

const questionOf = (f) => str(f.label || f.ariaLabel || f.placeholder || f.name, 300).trim();

// POST /api/analyze — answers for open-ended questions.
//   1. approved answers from memory (reused only when the context fits)  2. LLM for the rest.
// Nothing here is auto-saved: answers become reusable only after the user approves them.
router.post("/", asyncHandler(async (req, res) => {
  const body = requireObject(req.body);
  if (!Array.isArray(body.fields)) return res.status(400).json({ error: "fields array required", code: "BAD_REQUEST" });
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  const company = str(body.company, 120), role = str(body.role, 120);
  const job = { company, role, jobDescription: str(body.jobDescription, 6000), pageText: str(body.pageText, 3000) };
  const forceNew = body.forceNew === true;
  const notesById = body.notes && typeof body.notes === "object" ? body.notes : {};

  const resume = body.resumeId ? resumeRows().find((r) => r.id === body.resumeId) : resumeRows().find((r) => r.isDefault);
  const results = [];
  const needsLLM = [];

  for (const field of body.fields.slice(0, 40)) {
    const question = questionOf(field);
    if (!question) { results.push({ fieldId: field.id, status: "needs_input", value: "", source: "no_question", requiresReview: true, confidence: 0, reason: "No question text found" }); continue; }
    const similar = findSimilar(question, { company, role });
    const reusable = !forceNew && similar.find((s) => s.contextMatch && s.similarity >= 0.75);
    if (reusable) {
      results.push({
        fieldId: field.id, status: "memory", value: reusable.answer, source: "answer_memory", confidence: Math.min(0.9, reusable.similarity),
        requiresReview: true, reason: `Reused an answer you approved earlier ("${reusable.question.slice(0, 60)}")`,
        reused: { id: reusable.id, question: reusable.question, similarity: reusable.similarity, company: reusable.company }, similar,
      });
    } else {
      needsLLM.push({ field, question, similar });
    }
  }

  let ai = { ok: true };
  if (needsLLM.length) {
    try {
      const provider = requireProvider();
      for (let i = 0; i < needsLLM.length; i += BATCH) {
        const chunk = needsLLM.slice(i, i + BATCH);
        const out = await generateAnswers(provider, {
          questions: chunk.map((c) => c.question), profile, resumeText: resume?.text, job,
          approved: chunk.flatMap((c) => c.similar.filter((s) => s.contextMatch).slice(0, 1)),
          notes: chunk.map((c) => str(notesById[c.field.id], 800)),
        });
        chunk.forEach((c, j) => {
          const a = out[j];
          const hasAnswer = !!a.answer;
          results.push({
            fieldId: c.field.id, status: hasAnswer ? "ai" : "needs_input", value: a.answer, source: "ai_generated",
            confidence: hasAnswer ? (a.missing.length ? 0.55 : 0.75) : 0,
            requiresReview: true, missing: a.missing, similar: c.similar,
            sanitized: a.sanitized || undefined, injectionSuspected: a.injectionSuspected || undefined,
            reason: hasAnswer
              ? (a.missing.length ? "Drafted from your profile — some details were missing" : "Drafted from your profile and this job")
              : "Your profile doesn't have enough information to answer this honestly",
          });
        });
      }
    } catch (err) {
      ai = { ok: false, error: err.userMessage || "AI unavailable", code: err.code, debug: err.details };
      for (const c of needsLLM) {
        results.push({ fieldId: c.field.id, status: "needs_input", value: "", source: "ai_unavailable", confidence: 0, requiresReview: true,
          similar: c.similar, reason: ai.error, needsUserInput: true });
      }
    }
  }
  res.json({ results, ai });
}));

// POST /api/analyze/classify — the LLM only sees fields the deterministic resolver couldn't place,
// and may only answer with a key from the allowed list.
router.post("/classify", asyncHandler(async (req, res) => {
  const body = requireObject(req.body);
  const fields = (Array.isArray(body.fields) ? body.fields : []).slice(0, 25);
  const keys = (Array.isArray(body.keys) ? body.keys : []).filter((k) => typeof k === "string").slice(0, 80);
  if (!fields.length || !keys.length) return res.json({ matches: [] });
  try {
    const matches = await classifyFields(requireProvider(), {
      fields: fields.map((f) => ({ id: str(f.id, 80), label: str(f.label, 200), name: str(f.name, 100), placeholder: str(f.placeholder, 150),
        fieldType: str(f.fieldType, 20), sectionContext: str(f.sectionContext, 120) })),
      keys,
    });
    res.json({ matches });
  } catch (err) {
    res.json({ matches: [], ai: { ok: false, error: err.userMessage, code: err.code } });
  }
}));

export default router;
