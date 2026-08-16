import { Router } from "express";
import multer from "multer";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, unlinkSync } from "fs";
import db from "../db/database.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dir, "../../data/documents");

const storage = multer.diskStorage({
  destination: DOCS_DIR,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    cb(null, unique);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

router.get("/", (_req, res) => {
  const docs = db.prepare("SELECT * FROM documents ORDER BY uploaded_at DESC").all();
  res.json({ documents: docs.map((d) => ({ ...d, tags: JSON.parse(d.tags) })) });
});

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File required" });

  const { name, category = "other", tags = "[]" } = req.body;
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO documents (id, name, category, filename, size, tags, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name || req.file.originalname, category, req.file.filename, req.file.size, tags, new Date().toISOString());

  res.json({ id, filename: req.file.filename });
});

router.delete("/:id", (req, res) => {
  const doc = db.prepare("SELECT filename FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });

  const filePath = join(DOCS_DIR, doc.filename);
  if (existsSync(filePath)) unlinkSync(filePath);

  db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.get("/recommend", async (req, res) => {
  const { jobDescription } = req.query;
  const docs = db.prepare("SELECT * FROM documents WHERE category = 'resume'").all()
    .map((d) => ({ ...d, tags: JSON.parse(d.tags) }));

  if (!jobDescription || docs.length === 0) {
    return res.json({ recommendations: docs.map((d, i) => ({ ...d, score: 1 - i * 0.1 })) });
  }

  const { getProvider } = await import("../ai/provider.js");
  const provider = await getProvider();

  if (!provider) {
    return res.json({ recommendations: docs.map((d, i) => ({ ...d, score: 1 - i * 0.1 })) });
  }

  const scored = await provider.scoreResume(jobDescription, docs);
  res.json({ recommendations: scored });
});

export default router;
