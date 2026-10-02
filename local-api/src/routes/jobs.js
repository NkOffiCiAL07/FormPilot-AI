import { Router } from "express";
import db from "../db/database.js";
import { asyncHandler } from "../middleware/errors.js";
import { requireObject, str } from "../middleware/validate.js";
import { analyzeJob, mergeJobInfo } from "../services/jobAnalysis.js";
import { rankResumes, scoreMatch, MATCH_DISCLAIMER } from "../services/matching.js";
import { detectInjection } from "../ai/prompts.js";
import { extractJobWithAI } from "../ai/tasks.js";
import { getProvider } from "../ai/index.js";
import { resumeRows } from "./documents.js";

const router = Router();

// POST /api/jobs/analyze — deterministic job extraction + explainable match + resume recommendation.
// Page text is untrusted: it is pattern-matched here and only ever sent to the LLM inside fenced data blocks.
router.post("/analyze", asyncHandler(async (req, res) => {
  const body = requireObject(req.body);
  const text = str(body.text, 20000);
  const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
  let job = analyzeJob({ title: str(body.title, 200), company: str(body.company, 120), text, url: str(body.url, 500) });
  const injectionSuspected = detectInjection(text);

  let aiUsed = false, aiError;
  const weak = job.requiredSkills.length === 0 && text.length > 300;
  if (body.useAI !== false && weak) {
    try { job = mergeJobInfo(job, await extractJobWithAI(getProvider(), { text })); aiUsed = true; }
    catch (e) { aiError = e.userMessage || "AI extraction unavailable"; }
  }

  const resumes = resumeRows();
  const ranked = resumes.length ? rankResumes({ job, profile, resumes }) : [];
  const best = ranked[0] || null;
  const bestResume = best ? resumes.find((r) => r.id === best.id) : null;
  const match = scoreMatch({ job, profile, resume: bestResume });

  res.json({
    job, match, resumes: ranked,
    recommendedResume: best && best.score != null ? best : null,
    injectionSuspected, aiUsed, aiError, disclaimer: MATCH_DISCLAIMER,
  });
}));

export default router;
