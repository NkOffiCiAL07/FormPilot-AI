// Abstract AI provider interface — swap backend without touching core logic

export class AIProvider {
  async classify(_field) { throw new Error("Not implemented"); }
  async generateAnswer(_question, _context) { throw new Error("Not implemented"); }
  async scoreResume(_jobDescription, _resumeText) { throw new Error("Not implemented"); }
  async isAvailable() { return false; }
}

export class OllamaProvider extends AIProvider {
  constructor(baseUrl = "http://localhost:11434", model = "llama3.2") {
    super();
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async isAvailable() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(messages, options = {}) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: { temperature: 0.3, ...options },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.message?.content || "";
  }

  async classify(field) {
    const prompt = `You are a form field classifier. Classify this form field into a semantic category.

Field info:
- Label: ${field.label || "(none)"}
- Name attr: ${field.name || "(none)"}
- Placeholder: ${field.placeholder || "(none)"}
- Type: ${field.fieldType}
- Section: ${field.sectionContext || "(none)"}
- Nearby text: ${field.nearbyText?.slice(0, 200) || "(none)"}

Respond with ONLY a JSON object like:
{"semantic_key": "employment.current_company", "confidence": 0.92, "is_sensitive": false}

Valid top-level keys: personal, employment, education, professional, open_ended, unknown`;

    const content = await this.chat([{ role: "user", content: prompt }]);
    try {
      const match = content.match(/\{[^}]+\}/);
      return match ? JSON.parse(match[0]) : { semantic_key: "unknown", confidence: 0, is_sensitive: false };
    } catch {
      return { semantic_key: "unknown", confidence: 0, is_sensitive: false };
    }
  }

  // Answers all questions in a single LLM call — returns string[] in same order
  async generateAnswerBatch(questions, context) {
    const { profile, jobDescription, previousAnswers } = context;

    // Compact profile — fewer tokens = faster response
    const profileSummary = [
      [profile.firstName, profile.lastName].filter(Boolean).join(" "),
      profile.currentTitle ? `${profile.currentTitle} at ${profile.currentCompany}` : "",
      profile.totalExperience ? `Exp: ${profile.totalExperience}` : "",
      profile.skills?.length ? `Skills: ${profile.skills.slice(0, 6).join(", ")}` : "",
      profile.summary ? profile.summary.slice(0, 200) : "",
    ].filter(Boolean).join(" | ");

    const questionsBlock = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

    const systemPrompt = `Job application assistant. Answer questions honestly using only the profile given. Under 100 words each. First person. Return ONLY a JSON string array, no extra text.`;

    const userPrompt = `Profile: ${profileSummary}
${jobDescription ? `Job: ${jobDescription.slice(0, 300)}` : ""}
${previousAnswers?.length ? `Context: ${previousAnswers.slice(0, 2).join(" | ")}` : ""}

Questions:
${questionsBlock}

Return JSON array of ${questions.length} answer(s): ["answer1"${questions.length > 1 ? ',"answer2"' : ""}${questions.length > 2 ? ",..." : ""}]`;

    const content = await this.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { temperature: 0.3 });

    try {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return questions.map((_, i) => parsed[i] || "");
      }
    } catch {}
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return questions.map((_, i) => parsed[i] || "");
    } catch {}

    // Unparseable — throw so caller falls back to parallel individual calls
    throw new Error("Batch response was not a valid JSON array");
  }

  async generateAnswer(question, context) {
    const { profile, jobDescription, previousAnswers } = context;

    const profileSummary = [
      `Name: ${[profile.firstName, profile.lastName].filter(Boolean).join(" ")}`,
      `Current Role: ${profile.currentTitle} at ${profile.currentCompany}`,
      `Experience: ${profile.totalExperience}`,
      `Skills: ${profile.skills?.slice(0, 10).join(", ")}`,
      `Summary: ${profile.summary?.slice(0, 300)}`,
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are an expert at writing professional, honest, and concise answers for job applications and forms.
Use only the information provided — NEVER fabricate facts, qualifications, or experience.
Keep the answer professional and under 200 words unless a longer answer is requested.
Write in first person.`;

    const userPrompt = `Question: "${question}"

User profile:
${profileSummary}

${jobDescription ? `Job description context:\n${jobDescription.slice(0, 500)}` : ""}

${previousAnswers?.length ? `User's similar previous answers:\n${previousAnswers.join("\n")}` : ""}

Write the best answer for this question based on the profile above.`;

    return await this.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
  }

  async generateCoverLetter({ profile, company, role, jobContext }) {
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "the applicant";
    const profileSummary = [
      `Name: ${fullName}`,
      profile.currentTitle ? `Current role: ${profile.currentTitle} at ${profile.currentCompany}` : "",
      profile.totalExperience ? `Experience: ${profile.totalExperience}` : "",
      profile.skills?.length ? `Skills: ${profile.skills.slice(0, 10).join(", ")}` : "",
      profile.summary ? `About: ${profile.summary.slice(0, 400)}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are an expert career coach. Write professional, compelling cover letters that highlight the candidate's genuine strengths. Never fabricate experience. Write in first person, under 350 words, 3-4 paragraphs.`;

    const userPrompt = `Write a cover letter for ${fullName} applying for the role of ${role || "this position"} at ${company || "this company"}.

Candidate profile:
${profileSummary}
${jobContext ? `\nJob context: ${jobContext.slice(0, 500)}` : ""}

Write a complete, ready-to-use cover letter with proper greeting and sign-off.`;

    return await this.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
  }

  async generateInterviewPrep({ profile, company, role, jobDescription }) {
    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Candidate";
    const profileSummary = [
      `Name: ${fullName}`,
      profile.currentTitle ? `Role: ${profile.currentTitle} at ${profile.currentCompany}` : "",
      profile.totalExperience ? `Experience: ${profile.totalExperience}` : "",
      profile.skills?.length ? `Skills: ${profile.skills.slice(0, 8).join(", ")}` : "",
      profile.summary ? `About: ${profile.summary.slice(0, 250)}` : "",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are an expert interview coach. Generate realistic interview questions a hiring manager would ask for this role and provide concise, strong candidate answers based on the profile. Always respond with valid JSON only — no markdown, no extra text.`;

    const userPrompt = `Generate exactly 6 interview questions and model answers for:
Role: ${role || "this position"} at ${company || "this company"}
${jobDescription ? `\nJob context: ${jobDescription.slice(0, 500)}` : ""}

Candidate profile:
${profileSummary}

Return ONLY a JSON array:
[{"q": "Tell me about yourself.", "a": "..."}, ...]`;

    const content = await this.chat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { temperature: 0.5 });

    try {
      const match = content.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    try { return JSON.parse(content); } catch {}
    return [];
  }

  async scoreResume(jobDescription, resumes) {
    const scores = [];
    for (const resume of resumes) {
      const prompt = `Score how well this resume matches the job description.
Return ONLY a JSON: {"score": 0.87, "reasoning": "..."}

Job description (first 500 chars): ${jobDescription.slice(0, 500)}
Resume name: ${resume.name}
Resume tags: ${resume.tags?.join(", ")}`;

      try {
        const content = await this.chat([{ role: "user", content: prompt }]);
        const match = content.match(/\{[^}]+\}/s);
        if (match) {
          const parsed = JSON.parse(match[0]);
          scores.push({ ...resume, score: parsed.score, reasoning: parsed.reasoning });
        } else {
          scores.push({ ...resume, score: 0.5, reasoning: "Unable to score" });
        }
      } catch {
        scores.push({ ...resume, score: 0.5, reasoning: "Error during scoring" });
      }
    }
    return scores.sort((a, b) => b.score - a.score);
  }
}

// Deterministic provider for tests and offline development
export class MockProvider extends AIProvider {
  constructor(responses = {}) { super(); this.responses = responses; this.model = "mock"; }
  async isAvailable() { return true; }
  async generateAnswerBatch(questions) { return questions.map((q) => this.responses[q] ?? `Mock answer to: ${q}`); }
  async generateAnswer(q) { return this.responses[q] ?? `Mock answer to: ${q}`; }
  async generateCoverLetter() { return this.responses.coverLetter ?? "Mock cover letter"; }
  async generateInterviewPrep() { return this.responses.interviewPrep ?? []; }
  async scoreResume(_jd, resumes) { return resumes.map((r) => ({ ...r, score: 0.5, reasoning: "mock" })); }
}

// Factory — cached for 2 minutes to avoid pinging Ollama on every request
let _cachedProvider = null;
let _cachedProviderAt = 0;
let _cachedKey = "";
const PROVIDER_TTL = 2 * 60 * 1000;

// Only loopback Ollama endpoints are allowed — profile data must never leave this machine.
export function isLocalUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

export async function getProvider(config = {}) {
  if (process.env.FORMPILOT_MOCK_AI === "1") return new MockProvider();
  const url = config.ollamaUrl && isLocalUrl(config.ollamaUrl) ? config.ollamaUrl : "http://localhost:11434";
  const model = config.ollamaModel || "llama3.2";
  const key = `${url}|${model}`;
  if (_cachedProvider && _cachedKey === key && Date.now() - _cachedProviderAt < PROVIDER_TTL) {
    return _cachedProvider;
  }
  const ollama = new OllamaProvider(url, model);
  _cachedProvider = (await ollama.isAvailable()) ? ollama : null;
  _cachedKey = key;
  _cachedProviderAt = Date.now();
  return _cachedProvider;
}
