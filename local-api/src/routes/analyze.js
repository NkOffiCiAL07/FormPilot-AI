import { Router } from "express";
import { getProvider } from "../ai/provider.js";
import db from "../db/database.js";
import { createHash } from "crypto";

const router = Router();

function hashQuestion(question) {
  return createHash("sha256").update(question.toLowerCase().trim()).digest("hex").slice(0, 16);
}

function findSimilarAnswers(question) {
  const hash = hashQuestion(question);
  return db.prepare("SELECT * FROM answer_memory WHERE question_hash = ? ORDER BY used_count DESC LIMIT 3").all(hash);
}

function saveAnswer(question, answer, context) {
  const hash = hashQuestion(question);
  const existing = db.prepare("SELECT id FROM answer_memory WHERE question_hash = ?").get(hash);
  if (existing) {
    db.prepare("UPDATE answer_memory SET used_count = used_count + 1, answer = ? WHERE question_hash = ?").run(answer, hash);
  } else {
    db.prepare(`INSERT INTO answer_memory (id, question_hash, question, answer, context, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(),
      hash,
      question,
      answer,
      JSON.stringify(context || {}),
      new Date().toISOString()
    );
  }
}

// POST /api/analyze
// Batches all AI-required fields into a single LLM call for speed.
// Falls back to parallel individual calls if batch parsing fails.
router.post("/", async (req, res) => {
  const { fields, profile, jobDescription } = req.body;

  if (!fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: "fields array required" });
  }

  const provider = await getProvider();
  const results = [];

  // Annotate each field with its question text and cached similar answers
  const annotated = fields.map((field) => {
    const question = field.label || field.ariaLabel || field.placeholder || field.name;
    if (!question) return { field, question: null, similar: [] };
    const similar = findSimilarAnswers(question);
    return { field, question, similar };
  });

  // Serve fields with no question immediately
  const noQuestion = annotated.filter((a) => !a.question);
  for (const { field } of noQuestion) {
    results.push({ fieldId: field.id, status: "needs_input", value: "", source: "no_question" });
  }

  // Split remaining into: memory-cached (answer already known) vs needs-LLM
  const withQuestion = annotated.filter((a) => !!a.question);
  const fromMemory = [];
  const needsLLM = [];

  for (const item of withQuestion) {
    if (item.similar.length > 0) {
      fromMemory.push(item);
    } else {
      needsLLM.push(item);
    }
  }

  // Return memory-cached answers immediately
  for (const { field, similar } of fromMemory) {
    results.push({
      fieldId: field.id,
      status: "ai",
      value: similar[0].answer,
      source: "memory_cache",
      confidence: 0.85,
      reasoning: `From answer memory (used ${similar[0].used_count} times)`,
    });
  }

  // If no LLM-required fields, we're done
  if (needsLLM.length === 0) {
    return res.json({ results });
  }

  // No provider available
  if (!provider) {
    for (const { field, question } of needsLLM) {
      results.push({
        fieldId: field.id,
        status: "needs_input",
        value: "",
        source: "ai_unavailable",
        needsUserInput: true,
        userPrompt: `AI unavailable. Please answer: "${question}"`,
      });
    }
    return res.json({ results });
  }

  // ── Batch all LLM-required fields into ONE call ──────────────────────────────
  try {
    const questions = needsLLM.map((a) => a.question);
    const previousAnswers = needsLLM.flatMap((a) => a.similar.map((s) => s.answer));

    const batchAnswers = await provider.generateAnswerBatch(questions, {
      profile,
      jobDescription,
      previousAnswers,
    });

    for (let i = 0; i < needsLLM.length; i++) {
      const { field, question } = needsLLM[i];
      const answer = (batchAnswers[i] || "").trim();
      if (answer) saveAnswer(question, answer, { jobDescription: jobDescription?.slice(0, 200) });
      results.push({
        fieldId: field.id,
        status: answer ? "ai" : "needs_input",
        value: answer,
        source: answer ? "ai_generated" : "ai_empty",
        confidence: 0.75,
        reasoning: `Batch AI — ${needsLLM.length} field(s) in one call`,
        needsUserInput: !answer,
        userPrompt: answer ? undefined : `Please answer: "${question}"`,
      });
    }
  } catch (batchErr) {
    // ── Fallback: parallel individual calls (still faster than serial) ──────
    console.warn("[FormPilot] Batch failed, falling back to parallel:", batchErr?.message);
    await Promise.all(
      needsLLM.map(async ({ field, question, similar }) => {
        try {
          const answer = await provider.generateAnswer(question, {
            profile,
            jobDescription,
            previousAnswers: similar.map((s) => s.answer),
          });
          saveAnswer(question, answer, { jobDescription: jobDescription?.slice(0, 200) });
          results.push({
            fieldId: field.id,
            status: "ai",
            value: answer,
            source: "ai_generated",
            confidence: 0.75,
            reasoning: `AI (parallel fallback)`,
          });
        } catch {
          results.push({
            fieldId: field.id,
            status: "needs_input",
            value: "",
            source: "ai_error",
            needsUserInput: true,
            userPrompt: `AI failed. Please answer: "${question}"`,
          });
        }
      })
    );
  }

  res.json({ results });
});

export default router;
