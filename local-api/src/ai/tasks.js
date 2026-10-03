// Application-level AI tasks. Provider-agnostic: they only call provider.chat().

import { parseJson } from "./json.js";
import { AIError, AI_ERROR } from "./errors.js";
import {
  answersPrompt, coverLetterPrompt, interviewPrompt, analyzeAnswerPrompt,
  classifyFieldsPrompt, jobExtractPrompt, guardOutput, detectInjection,
} from "./prompts.js";

const strArr = { type: "array", items: { type: "string" } };

// One retry for malformed output — small local models often fix themselves on a second pass.
async function askJson(provider, prompt, schema, opts = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.chat({ ...prompt, json: true, ...opts, temperature: attempt ? 0.1 : opts.temperature });
    try { return parseJson(raw, schema); } catch (e) {
      if (!(e instanceof AIError) || e.code !== AI_ERROR.MALFORMED) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

// Small models sometimes "answer" with an admission that the profile lacks the facts. That's not
// something to paste into a form — surface it as missing information instead.
const ADMITS_MISSING = /\b(profile|resume|information|details)\b[^.]{0,40}\b(does not|doesn't|do not|don't|not)\b[^.]{0,30}\b(contain|include|provide|mention|have|specif)|\b(no|not enough|insufficient|lack of) (information|details|data)\b|\bI (do not|don't|cannot|can't) (have|answer|provide)\b/i;

export async function generateAnswers(provider, { questions, profile, resumeText, job, approved, notes }) {
  const schema = { type: "object", props: { answers: { type: "array", items: { type: "object", props: {
    answer: { type: "string" }, missing: { ...strArr, optional: true } } } } } };
  const out = await askJson(provider, answersPrompt({ questions, profile, resumeText, job, approved, notes }), schema);
  const injectionSuspected = detectInjection(`${job?.jobDescription || ""} ${job?.pageText || ""}`);
  return questions.map((_, i) => {
    const a = out.answers[i] || { answer: "", missing: [] };
    const g = guardOutput(a.answer, { profile });
    const admitsMissing = ADMITS_MISSING.test(g.text);
    const missing = a.missing?.length ? a.missing : admitsMissing ? ["Details needed to answer this question"] : [];
    return { answer: admitsMissing ? "" : g.text, missing, sanitized: g.removed, injectionSuspected };
  });
}

export async function generateCoverLetter(provider, { profile, resumeText, job, variant = "standard" }) {
  const schema = { type: "object", props: { letter: { type: "string" }, missing: { ...strArr, optional: true } } };
  const out = await askJson(provider, coverLetterPrompt({ profile, resumeText, job, variant }), schema, { maxTokens: variant === "detailed" ? 1100 : 800 });
  const g = guardOutput(out.letter, { profile });
  if (!g.text) throw new AIError(AI_ERROR.MALFORMED, "empty letter");
  return { letter: g.text, missing: out.missing || [], sanitized: g.removed };
}

export async function generateInterviewQuestions(provider, { profile, resumeText, job }) {
  const item = { type: "object", props: { question: { type: "string" }, why: { type: "string", optional: true } } };
  const list = { type: "array", items: item, optional: true };
  const schema = { type: "object", props: { technical: list, behavioral: list, company: list } };
  const out = await askJson(provider, interviewPrompt({ profile, resumeText, job }), schema, { maxTokens: 1400 });
  const clean = (arr = []) => arr.map((q) => ({ question: guardOutput(q.question).text, why: q.why ? guardOutput(q.why).text : "" })).filter((q) => q.question);
  return { technical: clean(out.technical), behavioral: clean(out.behavioral), company: clean(out.company) };
}

export async function analyzePracticeAnswer(provider, { question, answer, profile, job }) {
  const schema = { type: "object", props: {
    structure: { type: "string" }, relevance: { type: "string" }, clarity: { type: "string" },
    missing: { ...strArr, optional: true }, improvements: { ...strArr, optional: true },
    scores: { type: "object", optional: true, props: {
      structure: { type: "number", optional: true }, relevance: { type: "number", optional: true }, clarity: { type: "number", optional: true } } },
  } };
  const out = await askJson(provider, analyzeAnswerPrompt({ question, answer, profile, job }), schema, { maxTokens: 800 });
  const scores = out.scores || {};
  for (const k of Object.keys(scores)) scores[k] = Math.min(5, Math.max(1, Math.round(scores[k])));
  return { ...out, missing: out.missing || [], improvements: out.improvements || [], scores };
}

// Fields the deterministic resolver couldn't place. `keys` constrains the model's choices.
export async function classifyFields(provider, { fields, keys }) {
  const schema = { type: "object", props: { matches: { type: "array", items: { type: "object", props: {
    id: { type: "string" }, key: { type: "string" }, confidence: { type: "number", optional: true } } } } } };
  const out = await askJson(provider, classifyFieldsPrompt({ fields, keys }), schema, { maxTokens: 600, temperature: 0.1 });
  const allowed = new Set(keys);
  return out.matches
    .filter((m) => allowed.has(m.key))
    .map((m) => ({ id: m.id, key: m.key, confidence: Math.min(0.75, Math.max(0, m.confidence ?? 0.6)) }));
}

export async function extractJobWithAI(provider, { text }) {
  const schema = { type: "object", props: {
    title: { type: "string", optional: true }, company: { type: "string", optional: true }, location: { type: "string", optional: true },
    employmentType: { type: "string", optional: true }, experience: { type: "string", optional: true },
    requiredSkills: { ...strArr, optional: true }, preferredSkills: { ...strArr, optional: true },
    education: { type: "string", optional: true }, salary: { type: "string", optional: true }, sponsorship: { type: "string", optional: true } } };
  return askJson(provider, jobExtractPrompt({ text }), schema, { maxTokens: 600, temperature: 0.1 });
}
