import { Router } from "express";
import multer from "multer";
import { join, extname } from "path";
import { existsSync, unlinkSync, createReadStream } from "fs";
import { randomUUID } from "crypto";
import db from "../db/database.js";
import { DOCS_DIR } from "../config.js";
import { HttpError, asyncHandler } from "../middleware/errors.js";
import { requireObject, str, strList, oneOf } from "../middleware/validate.js";
import { extractText } from "../services/documentText.js";
import { canonicalizeSkill } from "../services/skills.js";

export const DOC_CATEGORIES = ["resume", "cover_letter", "certificate", "transcript", "id", "other"];
const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg"]);
const MIME = { ".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain", ".md": "text/markdown", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const INLINE_OK = new Set([".pdf", ".png", ".jpg", ".jpeg", ".txt"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: DOCS_DIR,
    // Never trust the client filename on disk — random name, whitelisted extension.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_EXT.has(extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new HttpError(415, "Unsupported file type. Use PDF, Word, text or image files.", "UNSUPPORTED_TYPE")),
});

const router = Router();
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function toApi(d, r) {
  return {
    id: d.id, name: d.name, category: d.category, description: d.description || "", tags: json(d.tags, []),
    size: d.size, mimeType: d.mime_type || MIME[extname(d.filename)] || "application/octet-stream",
    ext: extname(d.filename), isDefault: !!d.is_default, createdAt: d.uploaded_at, updatedAt: d.updated_at || d.uploaded_at,
    resume: r ? { targetRole: r.target_role, skills: json(r.skills, []), hasText: !!r.text } : undefined,
  };
}

// Resumes as the matching engine consumes them
export function resumeRows() {
  return db.prepare(`SELECT d.*, r.target_role, r.skills AS r_skills, r.text FROM documents d
      LEFT JOIN resumes r ON r.document_id = d.id WHERE d.category = 'resume' ORDER BY d.is_default DESC, d.uploaded_at DESC`).all()
    .map((d) => ({ id: d.id, name: d.name, isDefault: !!d.is_default, targetRole: d.target_role || "", skills: [...json(d.r_skills, []), ...json(d.tags, [])], text: d.text || "" }));
}

function upsertResume(id, { targetRole, skills, text }) {
  const now = new Date().toISOString();
  const cur = db.prepare("SELECT * FROM resumes WHERE document_id = ?").get(id);
  db.prepare(`INSERT INTO resumes (document_id, target_role, skills, text, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET target_role = excluded.target_role, skills = excluded.skills, text = excluded.text, updated_at = excluded.updated_at`)
    .run(id, targetRole ?? cur?.target_role ?? "", JSON.stringify(skills ?? json(cur?.skills, [])), text ?? cur?.text ?? "", now);
}

function setDefault(id, category) {
  db.prepare("UPDATE documents SET is_default = 0 WHERE category = ?").run(category);
  db.prepare("UPDATE documents SET is_default = 1 WHERE id = ?").run(id);
}

const get = (id) => db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
const getResume = (id) => db.prepare("SELECT * FROM resumes WHERE document_id = ?").get(id);

router.get("/", (req, res) => {
  const q = str(req.query.q, 100).toLowerCase();
  const cat = str(req.query.category, 30);
  let docs = db.prepare("SELECT * FROM documents ORDER BY is_default DESC, COALESCE(updated_at, uploaded_at) DESC").all();
  if (cat) docs = docs.filter((d) => d.category === cat);
  if (q) docs = docs.filter((d) => `${d.name} ${d.description} ${d.tags}`.toLowerCase().includes(q));
  res.json({ documents: docs.map((d) => toApi(d, getResume(d.id))) });
});

router.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, "File required");
  const category = DOC_CATEGORIES.includes(req.body.category) ? req.body.category : "other";
  const id = randomUUID();
  const ext = extname(req.file.filename);
  const now = new Date().toISOString();
  const name = str(req.body.name, 120).trim() || req.file.originalname.replace(/\.[^.]+$/, "");
  const tags = strList(json(req.body.tags, []));

  db.prepare(`INSERT INTO documents (id, name, category, filename, size, tags, uploaded_at, description, mime_type, updated_at, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
    .run(id, name, category, req.file.filename, req.file.size, JSON.stringify(tags), now, str(req.body.description, 500), MIME[ext] || "", now);

  if (category === "resume") {
    upsertResume(id, {
      targetRole: str(req.body.targetRole, 120),
      skills: strList(json(req.body.skills, [])).map(canonicalizeSkill),
      text: extractText(join(DOCS_DIR, req.file.filename), MIME[ext]),
    });
  }
  const hasDefault = db.prepare("SELECT 1 FROM documents WHERE category = ? AND is_default = 1").get(category);
  if (req.body.isDefault === "true" || req.body.isDefault === true || !hasDefault) setDefault(id, category);
  res.status(201).json({ document: toApi(get(id), getResume(id)) });
}));

router.patch("/:id", (req, res) => {
  const d = get(req.params.id);
  if (!d) throw new HttpError(404, "Document not found", "NOT_FOUND");
  const b = requireObject(req.body);
  const category = b.category !== undefined ? oneOf(b.category, DOC_CATEGORIES, "category") : d.category;
  db.prepare("UPDATE documents SET name = ?, description = ?, tags = ?, category = ?, updated_at = ? WHERE id = ?").run(
    b.name !== undefined ? (str(b.name, 120).trim() || d.name) : d.name,
    b.description !== undefined ? str(b.description, 500) : d.description,
    b.tags !== undefined ? JSON.stringify(strList(b.tags)) : d.tags,
    category, new Date().toISOString(), d.id);
  if (category === "resume") {
    const cur = getResume(d.id);
    upsertResume(d.id, {
      targetRole: b.targetRole !== undefined ? str(b.targetRole, 120) : undefined,
      skills: b.skills !== undefined ? strList(b.skills).map(canonicalizeSkill) : undefined,
      text: b.text !== undefined ? str(b.text, 20000) : cur ? undefined : extractText(join(DOCS_DIR, d.filename), d.mime_type),
    });
  }
  if (b.isDefault === true) setDefault(d.id, category);
  res.json({ document: toApi(get(d.id), getResume(d.id)) });
});

router.get("/:id/file", (req, res) => {
  const d = get(req.params.id);
  const path = d && join(DOCS_DIR, d.filename);
  if (!d || !existsSync(path)) throw new HttpError(404, "File not found", "NOT_FOUND");
  const ext = extname(d.filename);
  const download = req.query.download === "1" || !INLINE_OK.has(ext);
  const safeName = `${d.name.replace(/[^\w .-]/g, "_")}${ext}`;
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${safeName}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  createReadStream(path).pipe(res);
});

router.delete("/:id", (req, res) => {
  const d = get(req.params.id);
  if (!d) throw new HttpError(404, "Document not found", "NOT_FOUND");
  const path = join(DOCS_DIR, d.filename);
  if (existsSync(path)) unlinkSync(path);
  db.prepare("DELETE FROM documents WHERE id = ?").run(d.id);
  // Promote another document to default if this one was.
  if (d.is_default) {
    const next = db.prepare("SELECT id FROM documents WHERE category = ? ORDER BY uploaded_at DESC LIMIT 1").get(d.category);
    if (next) setDefault(next.id, d.category);
  }
  res.json({ ok: true });
});

export default router;
