import { Router } from "express";
import db from "../db/database.js";

const router = Router();

router.get("/", (_req, res) => {
  const records = db.prepare("SELECT * FROM application_history ORDER BY date DESC LIMIT 100").all();
  res.json({ history: records.map((r) => ({ ...r, answers: JSON.parse(r.answers || "{}") })) });
});

router.post("/", (req, res) => {
  const { company, role, website, date, resumeUsed, status = "applied", url, answers } = req.body;
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO application_history (id, company, role, website, date, resume_used, status, url, answers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, company, role, website, date || new Date().toISOString(), resumeUsed, status, url, JSON.stringify(answers || {}));

  res.json({ id });
});

router.patch("/:id", (req, res) => {
  const { status } = req.body;
  db.prepare("UPDATE application_history SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM application_history WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
