import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../db/database.js";
import { asyncHandler, HttpError } from "../middleware/errors.js";
import { requireObject, requireString, str, oneOf } from "../middleware/validate.js";
import { generateCoverLetter } from "../ai/tasks.js";
import { requireProvider } from "../ai/index.js";
import { resumeRows } from "./documents.js";

const VARIANTS = ["concise", "standard", "detailed"];
const router = Router();

const toApi = (r) => ({ id: r.id, applicationId: r.application_id, company: r.company, role: r.role, variant: r.variant,
  content: r.content, createdAt: r.created_at, updatedAt: r.updated_at });

// POST /api/cover-letter — generate one or more variants. Nothing is saved until the user saves.
router.post("/", asyncHandler(async (req, res) => {
  const b = requireObject(req.body);
  const profile = b.profile && typeof b.profile === "object" ? b.profile : null;
  if (!profile) throw new HttpError(400, "profile required");
  const variants = (Array.isArray(b.variants) && b.variants.length ? b.variants : [b.variant || "standard"]).filter((v) => VARIANTS.includes(v));
  const resume = b.resumeId ? resumeRows().find((r) => r.id === b.resumeId) : resumeRows().find((r) => r.isDefault);
  const job = { company: str(b.company, 120), role: str(b.role, 160), jobDescription: str(b.jobDescription || b.jobContext, 6000), pageText: "" };
  const provider = requireProvider();

  const letters = [];
  for (const variant of variants) {
    const out = await generateCoverLetter(provider, { profile, resumeText: resume?.text, job, variant });
    letters.push({ variant, ...out });
  }
  res.json({ letters, letter: letters[0]?.letter ?? null });
}));

router.get("/", (req, res) => {
  const q = str(req.query.q, 100).toLowerCase();
  let rows = db.prepare("SELECT * FROM cover_letters ORDER BY updated_at DESC LIMIT 200").all();
  if (req.query.applicationId) rows = rows.filter((r) => r.application_id === req.query.applicationId);
  if (q) rows = rows.filter((r) => `${r.company} ${r.role} ${r.content}`.toLowerCase().includes(q));
  res.json({ coverLetters: rows.map(toApi) });
});

router.post("/save", (req, res) => {
  const b = requireObject(req.body);
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(`INSERT INTO cover_letters (id, application_id, company, role, variant, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, b.applicationId || null, str(b.company, 120), str(b.role, 160), oneOf(b.variant, VARIANTS, "variant", "standard"), requireString(b.content, "content", 10000), now, now);
  if (b.applicationId) db.prepare("UPDATE applications SET cover_letter_id = ?, updated_at = ? WHERE id = ?").run(id, now, b.applicationId);
  res.status(201).json({ coverLetter: toApi(db.prepare("SELECT * FROM cover_letters WHERE id = ?").get(id)) });
});

router.patch("/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM cover_letters WHERE id = ?").get(req.params.id);
  if (!r) throw new HttpError(404, "Cover letter not found", "NOT_FOUND");
  db.prepare("UPDATE cover_letters SET content = ?, updated_at = ? WHERE id = ?")
    .run(requireString(requireObject(req.body).content, "content", 10000), new Date().toISOString(), r.id);
  res.json({ coverLetter: toApi(db.prepare("SELECT * FROM cover_letters WHERE id = ?").get(r.id)) });
});

router.get("/:id/export", (req, res) => {
  const r = db.prepare("SELECT * FROM cover_letters WHERE id = ?").get(req.params.id);
  if (!r) throw new HttpError(404, "Cover letter not found", "NOT_FOUND");
  const name = `cover-letter-${(r.company || "letter").replace(/[^\w-]+/g, "_")}.${req.query.format === "md" ? "md" : "txt"}`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  res.send(r.content);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM cover_letters WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
