import { detectSkills } from "./skills.js";

const SECTION_PREFERRED = /(preferred|nice[- ]to[- ]have|bonus|plus|good to have|desirable|a plus)/i;
const SECTION_REQUIRED = /(required|requirements|must[- ]have|qualifications|what you('| wi)ll need|what we('re| are) looking for|you have|minimum)/i;

function splitSections(text) {
  // Split job text into labelled chunks so skills can be classed required/preferred.
  const lines = String(text || "").split(/\n+/);
  const out = { required: [], preferred: [], other: [] };
  let current = "other";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isHeading = line.length < 70 && !/[.;]$/.test(line);
    if (isHeading && SECTION_PREFERRED.test(line)) { current = "preferred"; continue; }
    if (isHeading && SECTION_REQUIRED.test(line)) { current = "required"; continue; }
    if (isHeading && /^(about|responsibilities|benefits|perks|why|who we are|what you('| wi)ll do)/i.test(line)) { current = "other"; continue; }
    out[current].push(line);
    if (current === "other" && SECTION_PREFERRED.test(line) && line.length > 70) out.preferred.push(line);
  }
  return out;
}

const EXP_RE = /(\d{1,2})\s*(?:\+|plus)?\s*(?:[-–to]+\s*(\d{1,2})\s*)?(?:\+\s*)?years?(?:'|’)?\s*(?:of\s+)?(?:relevant\s+|professional\s+|work\s+|industry\s+|hands[- ]on\s+)?(?:experience|exp)/i;
const EDU_RE = /\b(ph\.?d|doctorate|master'?s?|m\.?s\.?c?|m\.?tech|mba|bachelor'?s?|b\.?s\.?c?|b\.?e\.?|b\.?tech|degree)\b/i;
const SALARY_RE = /((?:[$€£₹]|USD|INR|EUR|GBP)\s?\d[\d,.]*\s*(?:k|K|lpa|LPA|lakhs?|million|m)?(?:\s*[-–to]+\s*(?:[$€£₹]|USD|INR|EUR|GBP)?\s?\d[\d,.]*\s*(?:k|K|lpa|LPA|lakhs?|million|m)?)?(?:\s*(?:per|\/|a)\s*(?:year|yr|annum|month|hour|hr))?)/;

export function parseYears(text) {
  const m = String(text || "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function educationLevel(text) {
  const t = String(text || "").toLowerCase();
  if (/ph\.?d|doctorate/.test(t)) return 4;
  if (/master|m\.?s\.?c?\b|m\.?tech|mba|\bm\.?e\b/.test(t)) return 3;
  if (/bachelor|b\.?s\.?c?\b|b\.?e\b|b\.?tech|undergrad/.test(t)) return 2;
  if (/diploma|associate/.test(t)) return 1;
  return 0;
}

function detectWorkMode(text) {
  const t = text.toLowerCase();
  const modes = [];
  if (/\bhybrid\b/.test(t)) modes.push("Hybrid");
  if (/\bremote\b|work from home|wfh/.test(t)) modes.push("Remote");
  if (/\bon[- ]?site\b|in[- ]office|in[- ]person/.test(t)) modes.push("On-site");
  return modes;
}

function detectLocation(text) {
  const m = text.match(/(?:^|\n)\s*(?:location|office location|job location|where)\s*[:\-–]\s*([^\n]{2,80})/i)
    || text.match(/\b(?:based in|located in|office in)\s+([A-Z][\w .,'-]{2,60}?)(?:[.\n;]|\s(?:and|or|with)\b|$)/);
  return m ? m[1].trim().replace(/[.;,]$/, "") : "";
}

function detectEmploymentType(text) {
  const t = text.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return "Internship";
  if (/\bcontract(or)?\b|\bfreelance\b|fixed[- ]term/.test(t)) return "Contract";
  if (/part[- ]time/.test(t)) return "Part-time";
  if (/full[- ]time|permanent/.test(t)) return "Full-time";
  return "";
}

function detectSponsorship(text) {
  const t = text.toLowerCase();
  if (/(unable|not able|cannot|can't|do not|don't|will not|won't)\b[^.\n]{0,30}\bsponsor/.test(t) || /no (visa )?sponsorship/.test(t)) return "No sponsorship offered";
  if (/(visa )?sponsorship (is )?(available|provided|offered)|we (can|will) sponsor|will sponsor/.test(t)) return "Sponsorship available";
  if (/authori[sz]ed to work|right to work|work authori[sz]ation/.test(t)) return "Work authorization required";
  return "";
}

// Deterministic extraction — no LLM. `text` is untrusted page text; it's only pattern-matched here.
export function analyzeJob({ title = "", company = "", text = "", url = "" } = {}) {
  const body = String(text || "").slice(0, 20000);
  const sections = splitSections(body);
  const reqText = sections.required.join("\n");
  const prefText = sections.preferred.join("\n");
  const allSkills = detectSkills(`${title}\n${body}`);
  const preferredSkills = detectSkills(prefText);
  const requiredFromSection = detectSkills(reqText);
  const requiredSkills = (requiredFromSection.length ? requiredFromSection : allSkills).filter((s) => !preferredSkills.includes(s) || requiredFromSection.includes(s));
  const expMatch = body.match(EXP_RE);
  const eduLine = body.split(/\n+/).find((l) => EDU_RE.test(l) && /degree|bachelor|master|ph\.?d|b\.?tech|m\.?tech|bs|ms|mba/i.test(l)) || "";
  const modes = detectWorkMode(body);
  const location = detectLocation(body);
  const salary = (body.match(SALARY_RE) || [])[1] || "";
  const questions = body.split(/\n+/).map((l) => l.trim()).filter((l) => l.endsWith("?") && l.length > 15 && l.length < 220).slice(0, 8);

  return {
    title: title.trim(),
    company: company.trim(),
    url,
    location: [location, ...modes.filter((m) => !location.toLowerCase().includes(m.toLowerCase()))].filter(Boolean).join(" / "),
    workModes: modes,
    employmentType: detectEmploymentType(body),
    experience: expMatch ? `${expMatch[1]}${expMatch[2] ? `–${expMatch[2]}` : "+"} years` : "",
    minYears: expMatch ? Number(expMatch[1]) : null,
    requiredSkills: requiredSkills.slice(0, 20),
    preferredSkills: preferredSkills.filter((s) => !requiredSkills.includes(s)).slice(0, 12),
    education: eduLine.trim().slice(0, 160),
    educationLevel: educationLevel(eduLine),
    salary: salary.trim(),
    sponsorship: detectSponsorship(body),
    applicationQuestions: questions,
    descriptionLength: body.length,
  };
}

// Merge an AI extraction into a deterministic one; deterministic facts win when both exist.
export function mergeJobInfo(det, ai = {}) {
  const pick = (a, b) => (a ? a : b || "");
  const list = (a = [], b = []) => [...new Set([...(a || []), ...(b || [])])];
  return {
    ...det,
    title: pick(det.title, ai.title),
    company: pick(det.company, ai.company),
    location: pick(det.location, ai.location),
    employmentType: pick(det.employmentType, ai.employmentType),
    experience: pick(det.experience, ai.experience),
    minYears: det.minYears ?? parseYears(ai.experience),
    requiredSkills: list(det.requiredSkills, ai.requiredSkills).slice(0, 20),
    preferredSkills: list(det.preferredSkills, ai.preferredSkills).filter((s) => !det.requiredSkills.includes(s)).slice(0, 12),
    education: pick(det.education, ai.education),
    educationLevel: det.educationLevel || educationLevel(ai.education),
    salary: pick(det.salary, ai.salary),
    sponsorship: pick(det.sponsorship, ai.sponsorship),
  };
}
