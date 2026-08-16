import { Router } from "express";
import { getProvider } from "../ai/provider.js";
import db from "../db/database.js";

const router = Router();

// POST /api/cover-letter
router.post("/", async (req, res) => {
  const { profile, company, role, jobContext } = req.body;
  if (!profile) return res.status(400).json({ error: "profile required" });

  const provider = await getProvider();
  if (!provider) {
    return res.json({
      error: "AI unavailable",
      letter: null,
    });
  }

  try {
    const letter = await provider.generateCoverLetter({ profile, company, role, jobContext });

    // Save to memory for future reference
    try {
      const key = `cover_${(company || "").toLowerCase()}_${(role || "").toLowerCase()}`;
      db.prepare(`INSERT OR REPLACE INTO answer_memory (id, question_hash, question, answer, context, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), key, `Cover letter: ${role} at ${company}`, letter, "{}", new Date().toISOString());
    } catch { /* non-critical */ }

    res.json({ letter });
  } catch (err) {
    res.status(500).json({ error: err.message, letter: null });
  }
});

// DELETE /api/cover-letter/memory — clear AI answer memory
router.delete("/memory", (_req, res) => {
  try {
    db.prepare("DELETE FROM answer_memory").run();
    res.json({ ok: true, cleared: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
