import { randomUUID } from "crypto";
import db from "../db/database.js";

const STOP = new Set("a an the and or of to in on for with at by from is are was were be been do does did you your yours we our us this that it its as how what why when where which who whom can could would should will about please tell me describe explain give us have has had i my".split(" "));

export function tokenize(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, ""));
}

const CATEGORY_RULES = [
  ["why_company", /why.*(this company|us\b|here|join|work (for|at|with)|interested in (us|this|the (company|role|position)))|what (attracts|interests) you/],
  ["why_role", /why.*(role|position|job)/],
  ["about_you", /tell (us|me) about yourself|introduce yourself|about yourself|brief (bio|introduction)/],
  ["leaving", /(why|reason).*(leav|chang|look|seek)|leaving your/],
  ["challenge", /(challeng|difficult|hardest|problem).*(project|situation|time|problem)|biggest (challenge|accomplishment)/],
  ["fit", /(good|great|right|best) fit|why should we (hire|choose)|what makes you|qualif/],
  ["goals", /career goals|where do you see yourself|five years|long[- ]term/],
  ["leadership", /leadership|led a team|manage(d)? (a )?team|mentor/],
  ["strengths", /strengths?\b/],
  ["weaknesses", /weakness|areas? (for|of) improvement/],
  ["conflict", /conflict|disagree/],
  ["failure", /fail(ure|ed)|mistake/],
];

export function categorize(question) {
  const q = String(question || "").toLowerCase();
  for (const [cat, re] of CATEGORY_RULES) if (re.test(q)) return cat;
  return "general";
}

// Categories whose answers are only valid for one company/role.
const CONTEXTUAL = new Set(["why_company", "why_role"]);

function similarity(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size); // Dice coefficient
}

const norm = (s) => String(s || "").trim().toLowerCase();

// Look up previously approved answers that resemble `question`.
// `contextMatch` is false when a company-specific answer was written for another company.
export function findSimilar(question, { company = "", role = "", minSimilarity = 0.5, limit = 3 } = {}) {
  const qTokens = tokenize(question);
  const category = categorize(question);
  const rows = db.prepare("SELECT * FROM answer_memory WHERE user_approved = 1").all();
  const out = [];
  for (const r of rows) {
    const sim = similarity(qTokens, r.tokens ? r.tokens.split(" ") : tokenize(r.question));
    const sameCat = r.category === category && category !== "general";
    // Two questions in the same recognised category (e.g. both "why this company") are near-equivalent
    const score = sameCat ? Math.max(sim, 0.8 + sim * 0.2) : sim;
    if (score < minSimilarity) continue;
    const contextual = CONTEXTUAL.has(category);
    const contextMatch = !contextual || (norm(r.company) !== "" && norm(r.company) === norm(company));
    out.push({
      id: r.id, question: r.question, answer: r.answer, category: r.category,
      similarity: Math.round(score * 100) / 100, contextMatch, contextual,
      company: r.company, role: r.role, usedCount: r.used_count, updatedAt: r.updated_at || r.created_at,
    });
  }
  return out.sort((a, b) => Number(b.contextMatch) - Number(a.contextMatch) || b.similarity - a.similarity).slice(0, limit);
}

export function saveAnswer({ question, answer, company = "", role = "", approved = false, tags = [] }) {
  const now = new Date().toISOString();
  const tokens = tokenize(question).join(" ");
  const category = categorize(question);
  // Update the exact same question for the same company instead of piling up duplicates.
  const existing = db.prepare("SELECT id FROM answer_memory WHERE tokens = ? AND company = ?").get(tokens, company);
  if (existing) {
    db.prepare(`UPDATE answer_memory SET answer = ?, role = ?, updated_at = ?, user_approved = MAX(user_approved, ?), used_count = used_count + 1 WHERE id = ?`)
      .run(answer, role, now, approved ? 1 : 0, existing.id);
    return existing.id;
  }
  const id = randomUUID();
  db.prepare(`INSERT INTO answer_memory
    (id, question_hash, question, answer, context, created_at, updated_at, used_count, category, tags, tokens, company, role, user_approved)
    VALUES (?, ?, ?, ?, '{}', ?, ?, 1, ?, ?, ?, ?, ?, ?)`)
    .run(id, tokens.slice(0, 64), question, answer, now, now, category, JSON.stringify(tags), tokens, company, role, approved ? 1 : 0);
  return id;
}

export function listAnswers({ search = "", category = "", approvedOnly = false } = {}) {
  let rows = db.prepare("SELECT * FROM answer_memory ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 500").all();
  if (approvedOnly) rows = rows.filter((r) => r.user_approved);
  if (category) rows = rows.filter((r) => r.category === category);
  if (search) { const s = search.toLowerCase(); rows = rows.filter((r) => `${r.question} ${r.answer} ${r.company}`.toLowerCase().includes(s)); }
  return rows.map(toApi);
}

export const toApi = (r) => ({
  id: r.id, question: r.question, answer: r.answer, category: r.category, tags: safeJson(r.tags, []),
  company: r.company, role: r.role, userApproved: !!r.user_approved, usedCount: r.used_count,
  createdAt: r.created_at, updatedAt: r.updated_at || r.created_at,
});

function safeJson(s, d) { try { return JSON.parse(s); } catch { return d; } }
