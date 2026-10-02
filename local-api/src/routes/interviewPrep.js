import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../db/database.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";
import { requireObject, requireString, str } from "../middleware/validate.js";
import { generateInterviewQuestions, analyzePracticeAnswer } from "../ai/tasks.js";
import { requireProvider } from "../ai/index.js";
import { resumeRows } from "./documents.js";

const router = Router();
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const toApi = (r) => ({ id: r.id, applicationId: r.application_id, company: r.company, role: r.role,
  questions: json(r.questions, {}), practice: json(r.practice, []), createdAt: r.created_at, updatedAt: r.updated_at });

const jobOf = (b) => ({ company: str(b.company, 120), role: str(b.role, 160), jobDescription: str(b.jobDescription, 6000), pageText: "" });

// POST /api/interview-prep — technical / behavioral / company questions (no model answers: the user practises)
router.post("/", asyncHandler(async (req, res) => {
  const b = requireObject(req.body);
  const profile = b.profile && typeof b.profile === "object" ? b.profile : {};
  const resume = b.resumeId ? resumeRows().find((r) => r.id === b.resumeId) : resumeRows().find((r) => r.isDefault);
  const questions = await generateInterviewQuestions(requireProvider(), { profile, resumeText: resume?.text, job: jobOf(b) });
  const now = new Date().toISOString(), id = randomUUID();
  db.prepare("INSERT INTO interview_sessions (id, application_id, company, role, questions, practice, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?)")
    .run(id, b.applicationId || null, str(b.company, 120), str(b.role, 160), JSON.stringify(questions), now, now);
  res.json({ session: toApi(db.prepare("SELECT * FROM interview_sessions WHERE id = ?").get(id)) });
}));

// POST /api/interview-prep/analyze — feedback on a practice answer
router.post("/analyze", asyncHandler(async (req, res) => {
  const b = requireObject(req.body);
  const question = requireString(b.question, "question", 500);
  const answer = requireString(b.answer, "answer", 4000);
  const profile = b.profile && typeof b.profile === "object" ? b.profile : {};
  const feedback = await analyzePracticeAnswer(requireProvider(), { question, answer, profile, job: jobOf(b) });
  if (b.sessionId) {
    const s = db.prepare("SELECT * FROM interview_sessions WHERE id = ?").get(b.sessionId);
    if (s) {
      const practice = json(s.practice, []);
      practice.push({ question, answer, feedback, at: new Date().toISOString() });
      db.prepare("UPDATE interview_sessions SET practice = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(practice.slice(-50)), new Date().toISOString(), s.id);
    }
  }
  res.json({ feedback, note: "Feedback is a writing aid, not a prediction of interview results." });
}));

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM interview_sessions ORDER BY updated_at DESC LIMIT 50").all();
  res.json({ sessions: rows.filter((r) => !req.query.applicationId || r.application_id === req.query.applicationId).map(toApi) });
});

router.get("/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM interview_sessions WHERE id = ?").get(req.params.id);
  if (!r) throw new HttpError(404, "Session not found", "NOT_FOUND");
  res.json({ session: toApi(r) });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM interview_sessions WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
