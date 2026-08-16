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

export class OpenAIProvider extends AIProvider {
  constructor(apiKey, model = "gpt-4o-mini") {
    super();
    this.apiKey = apiKey;
    this.model = model;
  }

  async isAvailable() {
    return !!this.apiKey;
  }

  async chat(messages) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.3 }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    return data.choices[0]?.message?.content || "";
  }

  async generateAnswer(question, context) {
    return new OllamaProvider().generateAnswer.call(
      { chat: this.chat.bind(this) },
      question,
      context
    );
  }
}

// Factory — returns the first available provider
export async function getProvider(config = {}) {
  if (config.openaiKey) {
    const p = new OpenAIProvider(config.openaiKey);
    if (await p.isAvailable()) return p;
  }
  const ollama = new OllamaProvider(
    config.ollamaUrl || "http://localhost:11434",
    config.ollamaModel || "llama3.2"
  );
  if (await ollama.isAvailable()) return ollama;
  return null;
}
