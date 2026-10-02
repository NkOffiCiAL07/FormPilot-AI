import { Router } from "express";
import db from "../db/database.js";
import { HttpError } from "../middleware/errors.js";
import { requireObject, requireString, str, strList } from "../middleware/validate.js";
import { findSimilar, saveAnswer, listAnswers, toApi } from "../services/answerMemory.js";

const router = Router();

router.get("/", (req, res) => {
  res.json({ answers: listAnswers({ search: str(req.query.q, 100), category: str(req.query.category, 30), approvedOnly: req.query.approved === "1" }) });
});

router.get("/similar", (req, res) => {
  const q = requireString(req.query.q, "q", 400);
  res.json({ similar: findSimilar(q, { company: str(req.query.company, 120), role: str(req.query.role, 120) }) });
});

// Save an answer the user reviewed. `approved` makes it eligible for future reuse.
router.post("/", (req, res) => {
  const b = requireObject(req.body);
  const id = saveAnswer({
    question: requireString(b.question, "question", 500), answer: requireString(b.answer, "answer", 5000),
    company: str(b.company, 120), role: str(b.role, 120), approved: b.approved !== false, tags: strList(b.tags, 10),
  });
  res.status(201).json({ answer: toApi(db.prepare("SELECT * FROM answer_memory WHERE id = ?").get(id)) });
});

router.patch("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM answer_memory WHERE id = ?").get(req.params.id);
  if (!row) throw new HttpError(404, "Answer not found", "NOT_FOUND");
  const b = requireObject(req.body);
  db.prepare("UPDATE answer_memory SET answer = ?, user_approved = ?, tags = ?, updated_at = ? WHERE id = ?").run(
    b.answer !== undefined ? requireString(b.answer, "answer", 5000) : row.answer,
    b.userApproved !== undefined ? (b.userApproved ? 1 : 0) : row.user_approved,
    b.tags !== undefined ? JSON.stringify(strList(b.tags, 10)) : row.tags,
    new Date().toISOString(), row.id);
  res.json({ answer: toApi(db.prepare("SELECT * FROM answer_memory WHERE id = ?").get(row.id)) });
});

router.post("/:id/used", (req, res) => {
  db.prepare("UPDATE answer_memory SET used_count = used_count + 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM answer_memory WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.delete("/", (_req, res) => {
  db.prepare("DELETE FROM answer_memory").run();
  res.json({ ok: true });
});

export default router;
