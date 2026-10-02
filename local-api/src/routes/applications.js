import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../db/database.js";
import { HttpError } from "../middleware/errors.js";
import { requireObject, str, oneOf, clampInt } from "../middleware/validate.js";

export const STATUSES = ["saved", "applied", "assessment", "interview", "offer", "rejected", "withdrawn"];
const router = Router();
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

export const toApi = (r) => ({
  id: r.id, company: r.company, role: r.role, url: r.url, domain: r.domain, location: r.location, status: r.status,
  appliedAt: r.applied_at, resumeId: r.resume_id, coverLetterId: r.cover_letter_id, matchScore: r.match_score,
  job: json(r.job_data, {}), notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
});

const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const get = (id) => db.prepare("SELECT * FROM applications WHERE id = ?").get(id);

router.get("/", (req, res) => {
  const status = str(req.query.status, 20), q = str(req.query.q, 100).toLowerCase();
  const limit = clampInt(req.query.limit, 1, 500, 200);
  let rows = db.prepare("SELECT * FROM applications ORDER BY COALESCE(applied_at, created_at) DESC").all();
  if (status) rows = rows.filter((r) => r.status === status);
  if (q) rows = rows.filter((r) => `${r.company} ${r.role} ${r.url} ${r.notes}`.toLowerCase().includes(q));
  res.json({ applications: rows.slice(0, limit).map(toApi), total: rows.length });
});

// Local-only analytics. Descriptive counts, no predictions.
router.get("/stats", (_req, res) => {
  const rows = db.prepare("SELECT * FROM applications").all();
  const now = Date.now(), DAY = 86400000;
  const when = (r) => new Date(r.applied_at || r.created_at).getTime();
  const countBy = (key) => Object.entries(rows.reduce((m, r) => (r[key] ? ((m[r[key]] = (m[r[key]] || 0) + 1), m) : m), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const submitted = rows.filter((r) => r.status !== "saved");
  res.json({
    total: rows.length,
    thisWeek: submitted.filter((r) => now - when(r) < 7 * DAY).length,
    thisMonth: submitted.filter((r) => now - when(r) < 30 * DAY).length,
    byStatus, topRoles: countBy("role"), topCompanies: countBy("company"),
    reusableAnswers: db.prepare("SELECT COUNT(*) AS n FROM answer_memory WHERE user_approved = 1").get().n,
  });
});

router.get("/:id", (req, res) => {
  const a = get(req.params.id);
  if (!a) throw new HttpError(404, "Application not found", "NOT_FOUND");
  res.json({
    application: toApi(a),
    fields: db.prepare("SELECT * FROM application_fields WHERE application_id = ? ORDER BY created_at").all(a.id)
      .map((f) => ({ id: f.id, label: f.label, key: f.canonical_key, value: f.value, source: f.source, confidence: f.confidence })),
    answers: db.prepare("SELECT * FROM answers WHERE application_id = ? ORDER BY created_at").all(a.id)
      .map((x) => ({ id: x.id, question: x.question, answer: x.answer, source: x.source, approved: !!x.user_approved })),
    coverLetters: db.prepare("SELECT id, variant, content, created_at FROM cover_letters WHERE application_id = ? ORDER BY created_at DESC").all(a.id),
  });
});

// Create — or update the existing record for the same URL (re-filling the same form must not duplicate it).
router.post("/", (req, res) => {
  const b = requireObject(req.body);
  const url = str(b.url, 800);
  const now = new Date().toISOString();
  const existing = url ? db.prepare("SELECT * FROM applications WHERE url = ? ORDER BY created_at DESC LIMIT 1").get(url) : null;
  const status = oneOf(b.status, STATUSES, "status", existing?.status || "saved");
  const appliedAt = status !== "saved" ? (existing?.applied_at || str(b.appliedAt, 40) || now) : null;

  let id;
  if (existing) {
    id = existing.id;
    db.prepare(`UPDATE applications SET company = ?, role = ?, location = ?, status = ?, applied_at = ?, resume_id = ?, cover_letter_id = ?,
      match_score = ?, job_data = ?, updated_at = ? WHERE id = ?`).run(
      str(b.company, 120) || existing.company, str(b.role, 160) || existing.role, str(b.location, 160) || existing.location,
      status === "saved" && existing.status !== "saved" ? existing.status : status, existing.applied_at || appliedAt,
      b.resumeId ?? existing.resume_id, b.coverLetterId ?? existing.cover_letter_id,
      Number.isFinite(b.matchScore) ? b.matchScore : existing.match_score,
      b.job ? JSON.stringify(b.job).slice(0, 20000) : existing.job_data, now, id);
  } else {
    id = randomUUID();
    db.prepare(`INSERT INTO applications (id, company, role, url, domain, location, status, applied_at, resume_id, cover_letter_id, match_score, job_data, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, str(b.company, 120), str(b.role, 160), url, domainOf(url), str(b.location, 160), status, appliedAt,
      b.resumeId || null, b.coverLetterId || null, Number.isFinite(b.matchScore) ? b.matchScore : null,
      JSON.stringify(b.job || {}).slice(0, 20000), str(b.notes, 4000), now, now);
  }
  res.status(existing ? 200 : 201).json({ application: toApi(get(id)), created: !existing });
});

router.patch("/:id", (req, res) => {
  const a = get(req.params.id);
  if (!a) throw new HttpError(404, "Application not found", "NOT_FOUND");
  const b = requireObject(req.body);
  const status = b.status !== undefined ? oneOf(b.status, STATUSES, "status") : a.status;
  const now = new Date().toISOString();
  db.prepare(`UPDATE applications SET company = ?, role = ?, location = ?, status = ?, notes = ?, resume_id = ?, cover_letter_id = ?, applied_at = ?, updated_at = ? WHERE id = ?`).run(
    b.company !== undefined ? str(b.company, 120) : a.company, b.role !== undefined ? str(b.role, 160) : a.role,
    b.location !== undefined ? str(b.location, 160) : a.location, status, b.notes !== undefined ? str(b.notes, 4000) : a.notes,
    b.resumeId !== undefined ? b.resumeId : a.resume_id, b.coverLetterId !== undefined ? b.coverLetterId : a.cover_letter_id,
    a.applied_at || (status !== "saved" ? now : null), now, a.id);
  res.json({ application: toApi(get(a.id)) });
});

// Replace the fields/answers recorded for an application.
router.put("/:id/fields", (req, res) => {
  const a = get(req.params.id);
  if (!a) throw new HttpError(404, "Application not found", "NOT_FOUND");
  const b = requireObject(req.body);
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM application_fields WHERE application_id = ?").run(a.id);
    db.prepare("DELETE FROM answers WHERE application_id = ?").run(a.id);
    for (const f of (Array.isArray(b.fields) ? b.fields : []).slice(0, 300)) {
      db.prepare("INSERT INTO application_fields (id, application_id, label, canonical_key, value, source, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), a.id, str(f.label, 200), str(f.key, 60), str(f.value, 2000), str(f.source, 60), Number(f.confidence) || 0, now);
    }
    for (const x of (Array.isArray(b.answers) ? b.answers : []).slice(0, 50)) {
      db.prepare("INSERT INTO answers (id, application_id, question, answer, source, user_approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), a.id, str(x.question, 500), str(x.answer, 5000), str(x.source, 40) || "ai", x.approved ? 1 : 0, now);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ ok: true });
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM applications WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
