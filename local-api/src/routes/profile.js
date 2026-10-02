import { Router } from "express";
import db from "../db/database.js";
import { requireObject } from "../middleware/validate.js";

const router = Router();

router.get("/", (_req, res) => {
  const row = db.prepare("SELECT data FROM profile WHERE id = 1").get();
  res.json({ profile: row ? JSON.parse(row.data) : null });
});

// The extension is the editing surface; this mirror lets exports/imports and AI features work server-side.
router.put("/", (req, res) => {
  const profile = { ...requireObject(req.body, "profile"), updatedAt: new Date().toISOString() };
  db.prepare(`INSERT INTO profile (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(JSON.stringify(profile), profile.updatedAt);
  res.json({ ok: true });
});

export default router;
