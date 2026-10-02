import { Router } from "express";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join, extname } from "path";
import db from "../db/database.js";
import { DOCS_DIR } from "../config.js";
import { HttpError } from "../middleware/errors.js";
import { requireObject, str, oneOf } from "../middleware/validate.js";
import { getSettings, saveSettings } from "../services/settings.js";
import { tokenize, categorize } from "../services/answerMemory.js";
import { STATUSES } from "./applications.js";
import { DOC_CATEGORIES } from "./documents.js";

export const EXPORT_APP = "formpilot-ai";
export const EXPORT_VERSION = 1;
const router = Router();
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// ── Export ────────────────────────────────────────────────────────────────
export function buildExport({ includeFiles = true } = {}) {
  const profileRow = db.prepare("SELECT data FROM profile WHERE id = 1").get();
  const documents = db.prepare("SELECT * FROM documents").all().map((d) => {
    const r = db.prepare("SELECT * FROM resumes WHERE document_id = ?").get(d.id);
    const path = join(DOCS_DIR, d.filename);
    return {
      id: d.id, name: d.name, category: d.category, description: d.description, tags: json(d.tags, []), ext: extname(d.filename),
      mimeType: d.mime_type, isDefault: !!d.is_default, createdAt: d.uploaded_at, updatedAt: d.updated_at,
      resume: r ? { targetRole: r.target_role, skills: json(r.skills, []), text: r.text } : undefined,
      data: includeFiles && existsSync(path) ? readFileSync(path).toString("base64") : undefined,
    };
  });
  return {
    app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: new Date().toISOString(),
    profile: profileRow ? json(profileRow.data, {}) : {},
    preferences: getSettings(),
    answers: db.prepare("SELECT * FROM answer_memory").all().map((r) => ({
      id: r.id, question: r.question, answer: r.answer, category: r.category, tags: json(r.tags, []), company: r.company, role: r.role,
      userApproved: !!r.user_approved, createdAt: r.created_at, updatedAt: r.updated_at })),
    applications: db.prepare("SELECT * FROM applications").all().map((a) => ({
      id: a.id, company: a.company, role: a.role, url: a.url, location: a.location, status: a.status, appliedAt: a.applied_at,
      notes: a.notes, matchScore: a.match_score, job: json(a.job_data, {}), createdAt: a.created_at, updatedAt: a.updated_at })),
    coverLetters: db.prepare("SELECT * FROM cover_letters").all().map((c) => ({
      id: c.id, company: c.company, role: c.role, variant: c.variant, content: c.content, createdAt: c.created_at, updatedAt: c.updated_at })),
    documents,
  };
}

// ── Validation (no side effects) ─────────────────────────────────────────
export function validateImport(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["File is not a FormPilot export."], summary: null };
  if (data.app && data.app !== EXPORT_APP) errors.push("This file wasn't exported from FormPilot AI.");
  if (!Number.isInteger(data.version)) errors.push("Missing export version.");
  else if (data.version > EXPORT_VERSION) errors.push(`This export (v${data.version}) is newer than this version of FormPilot supports (v${EXPORT_VERSION}). Update FormPilot and try again.`);
  else if (data.version < 1) errors.push("Unsupported export version.");

  for (const k of ["answers", "applications", "coverLetters", "documents"]) {
    if (data[k] !== undefined && !Array.isArray(data[k])) errors.push(`"${k}" must be a list.`);
  }
  for (const k of ["profile", "preferences"]) {
    if (data[k] !== undefined && (typeof data[k] !== "object" || data[k] === null || Array.isArray(data[k]))) errors.push(`"${k}" must be an object.`);
  }
  const bad = (arr, test) => (Array.isArray(arr) ? arr.filter((x) => !x || typeof x !== "object" || !test(x)).length : 0);
  const nBadAnswers = bad(data.answers, (a) => typeof a.question === "string" && typeof a.answer === "string");
  if (nBadAnswers) errors.push(`${nBadAnswers} answer(s) are missing a question or answer.`);
  const nBadApps = bad(data.applications, (a) => typeof a.company === "string" && (a.status === undefined || STATUSES.includes(a.status)));
  if (nBadApps) errors.push(`${nBadApps} application(s) are invalid.`);
  const nBadDocs = bad(data.documents, (d) => typeof d.name === "string" && (d.category === undefined || DOC_CATEGORIES.includes(d.category)));
  if (nBadDocs) errors.push(`${nBadDocs} document(s) are invalid.`);

  const hasProfile = !!(data.profile && Object.keys(data.profile).length);
  return {
    ok: errors.length === 0, errors,
    summary: errors.length ? null : {
      profile: hasProfile, answers: data.answers?.length || 0, applications: data.applications?.length || 0,
      coverLetters: data.coverLetters?.length || 0, documents: data.documents?.length || 0, exportedAt: data.exportedAt,
    },
  };
}

function wipe({ keepSettings = false } = {}) {
  for (const t of ["application_fields", "answers", "cover_letters", "interview_sessions", "applications", "answer_memory", "resumes", "documents", "application_history"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  db.prepare("DELETE FROM profile").run();
  if (!keepSettings) db.prepare("DELETE FROM settings").run();
  for (const f of existsSync(DOCS_DIR) ? readdirSync(DOCS_DIR) : []) { try { unlinkSync(join(DOCS_DIR, f)); } catch { /* ignore */ } }
}

export function applyImport(data, mode) {
  const now = new Date().toISOString();
  const has = (table, id) => !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
  db.exec("BEGIN");
  try {
    if (mode === "replace") wipe({ keepSettings: true });
    const added = { answers: 0, applications: 0, coverLetters: 0, documents: 0 };

    for (const a of data.answers || []) {
      const id = typeof a.id === "string" && a.id ? a.id : randomUUID();
      const tokens = tokenize(a.question).join(" ");
      // Merge: skip answers we already have (same id, or same question text for the same company)
      if (has("answer_memory", id) || db.prepare("SELECT 1 FROM answer_memory WHERE tokens = ? AND company = ?").get(tokens, str(a.company, 120))) continue;
      db.prepare(`INSERT INTO answer_memory (id, question_hash, question, answer, context, created_at, updated_at, used_count, category, tags, tokens, company, role, user_approved)
        VALUES (?, ?, ?, ?, '{}', ?, ?, 1, ?, ?, ?, ?, ?, ?)`).run(id, tokens.slice(0, 64), str(a.question, 500), str(a.answer, 5000),
        a.createdAt || now, a.updatedAt || now, a.category || categorize(a.question), JSON.stringify(a.tags || []), tokens, str(a.company, 120), str(a.role, 160), a.userApproved ? 1 : 0);
      added.answers++;
    }
    for (const a of data.applications || []) {
      const id = typeof a.id === "string" && a.id ? a.id : randomUUID();
      if (has("applications", id) || (a.url && db.prepare("SELECT 1 FROM applications WHERE url = ?").get(a.url))) continue;
      let domain = ""; try { domain = new URL(a.url).hostname.replace(/^www\./, ""); } catch { /* no url */ }
      db.prepare(`INSERT INTO applications (id, company, role, url, domain, location, status, applied_at, match_score, job_data, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, str(a.company, 120), str(a.role, 160), str(a.url, 800), domain, str(a.location, 160),
        a.status || "saved", a.appliedAt || null, Number.isFinite(a.matchScore) ? a.matchScore : null, JSON.stringify(a.job || {}).slice(0, 20000), str(a.notes, 4000), a.createdAt || now, a.updatedAt || now);
      added.applications++;
    }
    for (const c of data.coverLetters || []) {
      const id = typeof c.id === "string" && c.id ? c.id : randomUUID();
      if (has("cover_letters", id) || typeof c.content !== "string") continue;
      db.prepare("INSERT INTO cover_letters (id, company, role, variant, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, str(c.company, 120), str(c.role, 160), str(c.variant, 20) || "standard", c.content.slice(0, 10000), c.createdAt || now, c.updatedAt || now);
      added.coverLetters++;
    }
    for (const d of data.documents || []) {
      const id = typeof d.id === "string" && d.id ? d.id : randomUUID();
      if (has("documents", id) || typeof d.data !== "string") continue;
      const ext = /^\.(pdf|docx?|txt|md|png|jpe?g)$/i.test(d.ext || "") ? d.ext.toLowerCase() : ".pdf";
      const filename = `${randomUUID()}${ext}`;
      const bytes = Buffer.from(d.data, "base64");
      writeFileSync(join(DOCS_DIR, filename), bytes);
      db.prepare(`INSERT INTO documents (id, name, category, filename, size, tags, uploaded_at, description, mime_type, updated_at, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, str(d.name, 120), d.category || "other", filename, bytes.length, JSON.stringify(d.tags || []),
        d.createdAt || now, str(d.description, 500), str(d.mimeType, 100), d.updatedAt || now, d.isDefault && mode === "replace" ? 1 : 0);
      if (d.resume) db.prepare("INSERT INTO resumes (document_id, target_role, skills, text, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, str(d.resume.targetRole, 120), JSON.stringify(d.resume.skills || []), str(d.resume.text, 20000), now);
      added.documents++;
    }
    if (mode === "replace") {
      if (data.profile && Object.keys(data.profile).length) {
        db.prepare("INSERT INTO profile (id, data, updated_at) VALUES (1, ?, ?)").run(JSON.stringify(data.profile), now);
      }
      if (data.preferences) saveSettings(data.preferences);
    }
    db.exec("COMMIT");
    return added;
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

router.get("/export", (req, res) => {
  const data = buildExport({ includeFiles: req.query.files !== "0" });
  res.setHeader("Content-Disposition", `attachment; filename="formpilot-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
});

router.post("/validate", (req, res) => res.json(validateImport(req.body?.data)));

router.post("/import", (req, res) => {
  const b = requireObject(req.body);
  const mode = oneOf(b.mode, ["merge", "replace"], "mode");
  const v = validateImport(b.data);
  if (!v.ok) throw new HttpError(400, v.errors.join(" "), "INVALID_IMPORT");
  res.json({ ok: true, mode, added: applyImport(b.data, mode) });
});

// Destructive actions require an explicit confirmation flag from the UI.
router.post("/clear-history", (req, res) => {
  if (req.body?.confirm !== true) throw new HttpError(400, "Confirmation required", "CONFIRM_REQUIRED");
  for (const t of ["application_fields", "answers", "cover_letters", "interview_sessions", "applications", "application_history"]) db.prepare(`DELETE FROM ${t}`).run();
  res.json({ ok: true });
});

router.post("/reset", (req, res) => {
  if (req.body?.confirm !== "RESET") throw new HttpError(400, "Type RESET to confirm", "CONFIRM_REQUIRED");
  wipe();
  res.json({ ok: true });
});

export default router;
