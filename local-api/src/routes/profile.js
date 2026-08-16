import { Router } from "express";
import db from "../db/database.js";

const router = Router();

router.get("/", (_req, res) => {
  const row = db.prepare("SELECT data FROM profile WHERE id = 1").get();
  if (!row) return res.json({ profile: null });
  res.json({ profile: JSON.parse(row.data) });
});

router.put("/", (req, res) => {
  const profile = req.body;
  if (!profile) return res.status(400).json({ error: "Profile data required" });
  profile.updatedAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO profile (id, data, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(JSON.stringify(profile), profile.updatedAt);

  res.json({ ok: true });
});

export default router;
