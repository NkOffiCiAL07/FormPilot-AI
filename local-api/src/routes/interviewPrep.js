import express from "express";
import { getProvider } from "../ai/provider.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { profile, company, role, jobDescription } = req.body;
  const provider = await getProvider();
  if (!provider) return res.json({ error: "AI unavailable", questions: [] });
  try {
    const questions = await provider.generateInterviewPrep({ profile, company, role, jobDescription });
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ error: e.message, questions: [] });
  }
});

export default router;
