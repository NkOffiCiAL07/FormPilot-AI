import { detectSkills, canonicalizeSkill } from "./skills.js";
import { parseYears, educationLevel } from "./jobAnalysis.js";

export const MATCH_DISCLAIMER =
  "This score only compares your stored skills and details with the posting. It is not a prediction of hiring outcomes.";

const uniq = (a) => [...new Set(a)];

export function candidateSkills(profile = {}, resume = null) {
  return uniq([
    ...(profile.skills || []), ...(profile.technologies || []),
    ...(resume?.skills || []),
    ...detectSkills(resume?.text || ""),
    ...detectSkills((profile.employment || []).map((e) => e.description).join("\n")),
  ].map(canonicalizeSkill).filter(Boolean));
}

function locationMatch(job, profile) {
  const loc = (job.location || "").toLowerCase();
  if (!loc) return null;
  if (job.workModes?.length && job.workModes.every((m) => m === "Remote")) return { score: 1, detail: "Remote role" };
  const a = profile.address || {};
  const mine = [a.city, a.state, a.country].filter(Boolean).map((s) => s.toLowerCase());
  if (!mine.length) return { score: 0.5, detail: "Add your city in your profile to compare location" };
  if (mine.some((m) => loc.includes(m))) return { score: 1, detail: `Matches your location (${[a.city, a.country].filter(Boolean).join(", ")})` };
  if (job.workModes?.includes("Remote")) return { score: 0.8, detail: "Remote option available" };
  return { score: 0.2, detail: `Role is in ${job.location}; you're in ${[a.city, a.country].filter(Boolean).join(", ")}` };
}

// Explainable score: each component carries its own weight and a human-readable detail.
export function scoreMatch({ job, profile = {}, resume = null }) {
  const mine = candidateSkills(profile, resume);
  const mineLower = new Set(mine.map((s) => s.toLowerCase()));
  const has = (s) => mineLower.has(s.toLowerCase());
  const req = job.requiredSkills || [];
  const pref = job.preferredSkills || [];
  const matchedReq = req.filter(has), missingReq = req.filter((s) => !has(s));
  const matchedPref = pref.filter(has), missingPref = pref.filter((s) => !has(s));

  const components = [];
  if (req.length) components.push({ key: "requiredSkills", label: "Required skills", weight: 45, score: matchedReq.length / req.length,
    detail: `${matchedReq.length} of ${req.length} required skills found` });
  if (pref.length) components.push({ key: "preferredSkills", label: "Preferred skills", weight: 10, score: matchedPref.length / pref.length,
    detail: `${matchedPref.length} of ${pref.length} preferred skills found` });

  if (job.minYears != null) {
    const mineYears = parseYears(profile.totalExperience);
    if (mineYears == null) components.push({ key: "experience", label: "Experience", weight: 20, score: 0.5, detail: `Posting asks for ${job.experience}; add your total experience to compare` });
    else components.push({ key: "experience", label: "Experience", weight: 20, score: Math.min(1, mineYears / job.minYears),
      detail: mineYears >= job.minYears ? `${mineYears} years meets the ${job.experience} requested` : `${mineYears} years vs ${job.experience} requested` });
  }
  if (job.educationLevel) {
    const mineLevel = Math.max(0, ...((profile.education || []).map((e) => educationLevel(e.degree))));
    components.push({ key: "education", label: "Education", weight: 10, score: mineLevel >= job.educationLevel ? 1 : mineLevel ? 0.5 : 0.3,
      detail: mineLevel >= job.educationLevel ? "Meets the education requirement" : mineLevel ? "Below the stated education level" : "Add your education to compare" });
  }
  const loc = locationMatch(job, profile);
  if (loc) components.push({ key: "location", label: "Location", weight: 15, ...loc });

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score = totalWeight ? Math.round((components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) * 100) : null;

  return {
    score,
    components: components.map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 })),
    matchedSkills: uniq([...matchedReq, ...matchedPref]),
    missingSkills: missingReq,
    missingPreferred: missingPref,
    disclaimer: MATCH_DISCLAIMER,
  };
}

const words = (s) => String(s || "").toLowerCase().match(/[a-z]{3,}/g) || [];

// Rank stored resumes for a job. Includes why each was chosen.
export function rankResumes({ job, profile, resumes }) {
  const jobTitleWords = new Set(words(job.title));
  return resumes.map((r) => {
    const m = scoreMatch({ job, profile, resume: r });
    const roleWords = words(r.targetRole || r.name);
    const roleOverlap = roleWords.filter((w) => jobTitleWords.has(w));
    const roleBonus = roleOverlap.length ? Math.min(8, roleOverlap.length * 4) : 0;
    const score = m.score == null ? (roleBonus ? 50 + roleBonus : null) : Math.min(100, m.score + roleBonus);
    return {
      id: r.id, name: r.name, isDefault: !!r.isDefault, score,
      matchedSkills: m.matchedSkills, missingSkills: m.missingSkills,
      reasons: [
        ...(m.matchedSkills.length ? [`Covers ${m.matchedSkills.slice(0, 6).join(", ")}`] : []),
        ...(roleOverlap.length ? [`Target role "${r.targetRole || r.name}" fits "${job.title}"`] : []),
        ...(r.isDefault ? ["Your default resume"] : []),
        ...(!r.text && !(r.skills || []).length ? ["No skills or text stored for this resume — add skills for better matching"] : []),
      ],
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || Number(b.isDefault) - Number(a.isDefault));
}
