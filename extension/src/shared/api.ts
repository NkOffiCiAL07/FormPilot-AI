// Single place that talks to the local API. Every call returns typed data or throws ApiError
// with a message that is safe to show to the user (never raw ECONNREFUSED / stack traces).

import { LOCAL_API_BASE } from "./constants";
import { FieldResult, NormalizedField, UserProfile } from "./types";

export class ApiError extends Error {
  code: string;
  offline: boolean;
  debug?: string;
  status?: number;
  constructor(message: string, code = "ERROR", opts: { offline?: boolean; debug?: string; status?: number } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.offline = !!opts.offline;
    this.debug = opts.debug;
    this.status = opts.status;
  }
}

export interface FriendlyError { title: string; message: string; action?: "retry" | "settings" | "start-api" | "start-ollama"; debug?: string }

export function describeError(e: unknown): FriendlyError {
  const err = e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : "Something went wrong", "ERROR");
  switch (err.code) {
    case "API_OFFLINE":
      return { title: "Local server isn't running", message: "Start the FormPilot local API (cd local-api && npm start), then try again.", action: "start-api", debug: err.debug };
    case "OLLAMA_UNAVAILABLE":
      return { title: "Ollama isn't running", message: "Start Ollama and try again.", action: "start-ollama", debug: err.debug };
    case "MODEL_UNAVAILABLE":
      return { title: "Model not installed", message: err.message, action: "settings", debug: err.debug };
    case "TIMEOUT":
      return { title: "The model took too long", message: err.message, action: "retry", debug: err.debug };
    case "MALFORMED_RESPONSE":
      return { title: "Couldn't read the AI's answer", message: err.message, action: "retry", debug: err.debug };
    default:
      return { title: "Something went wrong", message: err.message, action: "retry", debug: err.debug };
  }
}

async function request<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData; timeoutMs?: number } = {}): Promise<T> {
  const { method = opts.body !== undefined || opts.form ? "POST" : "GET", body, form, timeoutMs = 20000 } = opts;
  let res: Response;
  try {
    res = await fetch(`${LOCAL_API_BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    throw new ApiError(timeout ? "The request timed out." : "Can't reach the local FormPilot server.", timeout ? "TIMEOUT" : "API_OFFLINE", { offline: !timeout, debug: String((e as Error)?.message) });
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON (downloads) handled by callers using urls */ }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string; debug?: string };
    throw new ApiError(d.error || `Request failed (${res.status})`, d.code || "ERROR", { status: res.status, debug: d.debug });
  }
  return data as T;
}

// ─── Types mirrored from the API ──────────────────────────────────────────────────

export type AppStatus = "saved" | "applied" | "assessment" | "interview" | "offer" | "rejected" | "withdrawn";
export const APP_STATUSES: AppStatus[] = ["saved", "applied", "assessment", "interview", "offer", "rejected", "withdrawn"];
export const STATUS_LABEL: Record<AppStatus, string> = {
  saved: "Saved", applied: "Applied", assessment: "Assessment", interview: "Interview", offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn",
};

export interface Health { status: string; version: string; dbVersion: number; ai: { online: boolean; model: string | null; provider?: string } }
export interface AiStatus { online: boolean; model: string | null; models: string[]; configuredModel?: string | null; modelInstalled?: boolean; error?: string; code?: string }

export interface ApiSettings {
  ai: { ollamaUrl: string; model: string; temperature: number; maxTokens: number; timeoutMs: number };
  autofill: { autoThreshold: number; reviewThreshold: number; autoFillHigh: boolean; reviewMedium: boolean };
  appearance: { theme: "light" | "dark" | "system" };
  shortcuts: Record<string, string>;
  onboardingComplete: boolean;
}

export interface JobInfo {
  title: string; company: string; url: string; location: string; workModes: string[]; employmentType: string;
  experience: string; minYears: number | null; requiredSkills: string[]; preferredSkills: string[];
  education: string; salary: string; sponsorship: string; applicationQuestions: string[];
}
export interface MatchComponent { key: string; label: string; weight: number; score: number; detail: string }
export interface MatchResult {
  score: number | null; components: MatchComponent[]; matchedSkills: string[]; missingSkills: string[]; missingPreferred: string[]; disclaimer: string;
}
export interface ResumeRank { id: string; name: string; isDefault: boolean; score: number | null; matchedSkills: string[]; missingSkills: string[]; reasons: string[] }
export interface JobAnalysis {
  job: JobInfo; match: MatchResult; resumes: ResumeRank[]; recommendedResume: ResumeRank | null;
  injectionSuspected: boolean; aiUsed: boolean; aiError?: string;
}

export interface DocMeta {
  id: string; name: string; category: "resume" | "cover_letter" | "certificate" | "transcript" | "id" | "other";
  description: string; tags: string[]; size: number; mimeType: string; ext: string; isDefault: boolean; createdAt: string; updatedAt: string;
  resume?: { targetRole: string; skills: string[]; hasText: boolean };
}
export interface ApplicationRec {
  id: string; company: string; role: string; url: string; domain: string; location: string; status: AppStatus; appliedAt: string | null;
  resumeId: string | null; coverLetterId: string | null; matchScore: number | null; notes: string; createdAt: string; updatedAt: string; job: Partial<JobInfo>;
}
export interface AppStats {
  total: number; thisWeek: number; thisMonth: number; byStatus: Record<AppStatus, number>;
  topRoles: { name: string; count: number }[]; topCompanies: { name: string; count: number }[]; reusableAnswers: number;
}
export interface AnswerRec { id: string; question: string; answer: string; category: string; tags: string[]; company: string; role: string; userApproved: boolean; usedCount: number; createdAt: string; updatedAt: string }
export type LetterVariant = "concise" | "standard" | "detailed";
export interface GeneratedLetter { variant: LetterVariant; letter: string; missing: string[]; sanitized?: boolean }
export interface CoverLetterRec { id: string; applicationId: string | null; company: string; role: string; variant: LetterVariant; content: string; createdAt: string; updatedAt: string }
export interface InterviewQ { question: string; why: string }
export interface InterviewSession { id: string; company: string; role: string; questions: { technical: InterviewQ[]; behavioral: InterviewQ[]; company: InterviewQ[] }; practice: PracticeEntry[]; createdAt: string }
export interface PracticeFeedback { structure: string; relevance: string; clarity: string; missing: string[]; improvements: string[]; scores: { structure?: number; relevance?: number; clarity?: number } }
export interface PracticeEntry { question: string; answer: string; feedback: PracticeFeedback; at: string }

export interface JobContextBody { company?: string; role?: string; jobDescription?: string; resumeId?: string | null }

// ─── Endpoints ────────────────────────────────────────────────────────────────────

export const api = {
  health: () => request<Health>("/health", { timeoutMs: 2500 }),

  settings: {
    get: () => request<{ settings: ApiSettings }>("/api/settings").then((r) => r.settings),
    save: (patch: Partial<{ [K in keyof ApiSettings]: Partial<ApiSettings[K]> }>) => request<{ settings: ApiSettings }>("/api/settings", { method: "PUT", body: patch }).then((r) => r.settings),
    aiStatus: () => request<AiStatus>("/api/settings/ai/status", { timeoutMs: 6000 }),
    testAi: (b: { ollamaUrl?: string; model?: string }) => request<AiStatus>("/api/settings/ai/test", { body: b, timeoutMs: 8000 }),
  },

  profile: { save: (p: UserProfile) => request<{ ok: boolean }>("/api/profile", { method: "PUT", body: p }) },

  jobs: {
    analyze: (b: { title: string; company: string; url: string; text: string; profile: UserProfile; useAI?: boolean }) =>
      request<JobAnalysis>("/api/jobs/analyze", { body: b, timeoutMs: 60000 }),
  },

  analyze: {
    answers: (b: JobContextBody & { fields: NormalizedField[]; profile: UserProfile; forceNew?: boolean; pageText?: string; notes?: Record<string, string> }) =>
      request<{ results: Partial<FieldResult>[]; ai: { ok: boolean; error?: string; code?: string; debug?: string } }>("/api/analyze", { body: b, timeoutMs: 180000 }),
    classify: (b: { fields: Partial<NormalizedField>[]; keys: string[] }) =>
      request<{ matches: { id: string; key: string; confidence: number }[]; ai?: { ok: boolean; error?: string } }>("/api/analyze/classify", { body: b, timeoutMs: 60000 }),
  },

  documents: {
    list: (q = "", category = "") => request<{ documents: DocMeta[] }>(`/api/documents?q=${encodeURIComponent(q)}&category=${category}`).then((r) => r.documents),
    upload: (file: File, meta: { name?: string; category: string; description?: string; tags?: string[]; targetRole?: string; skills?: string[]; isDefault?: boolean }) => {
      const f = new FormData();
      f.append("file", file);
      f.append("category", meta.category);
      if (meta.name) f.append("name", meta.name);
      if (meta.description) f.append("description", meta.description);
      if (meta.targetRole) f.append("targetRole", meta.targetRole);
      f.append("tags", JSON.stringify(meta.tags ?? []));
      f.append("skills", JSON.stringify(meta.skills ?? []));
      if (meta.isDefault) f.append("isDefault", "true");
      return request<{ document: DocMeta }>("/api/documents", { form: f, timeoutMs: 60000 }).then((r) => r.document);
    },
    update: (id: string, patch: Partial<DocMeta> & { targetRole?: string; skills?: string[]; text?: string }) =>
      request<{ document: DocMeta }>(`/api/documents/${id}`, { method: "PATCH", body: patch }).then((r) => r.document),
    remove: (id: string) => request<{ ok: boolean }>(`/api/documents/${id}`, { method: "DELETE" }),
    fileUrl: (id: string, download = false) => `${LOCAL_API_BASE}/api/documents/${id}/file${download ? "?download=1" : ""}`,
    /** Fetch the bytes (the file route is only reachable from extension pages). */
    blob: async (id: string): Promise<Blob> => {
      const res = await fetch(`${LOCAL_API_BASE}/api/documents/${id}/file?download=1`).catch(() => { throw new ApiError("Can't reach the local FormPilot server.", "API_OFFLINE", { offline: true }); });
      if (!res.ok) throw new ApiError("Couldn't load the file.", "ERROR");
      return res.blob();
    },
  },

  applications: {
    list: (p: { status?: string; q?: string } = {}) =>
      request<{ applications: ApplicationRec[]; total: number }>(`/api/applications?status=${p.status ?? ""}&q=${encodeURIComponent(p.q ?? "")}`).then((r) => r.applications),
    stats: () => request<AppStats>("/api/applications/stats"),
    get: (id: string) => request<{ application: ApplicationRec; fields: { label: string; key: string; value: string; source: string; confidence: number }[]; answers: { question: string; answer: string; approved: boolean }[]; coverLetters: { id: string; variant: string; content: string }[] }>(`/api/applications/${id}`),
    upsert: (b: Partial<ApplicationRec> & { url: string }) => request<{ application: ApplicationRec; created: boolean }>("/api/applications", { body: b }),
    update: (id: string, patch: Partial<ApplicationRec>) => request<{ application: ApplicationRec }>(`/api/applications/${id}`, { method: "PATCH", body: patch }).then((r) => r.application),
    saveFields: (id: string, b: { fields: { label: string; key?: string; value: string; source?: string; confidence?: number }[]; answers?: { question: string; answer: string; approved?: boolean }[] }) =>
      request<{ ok: boolean }>(`/api/applications/${id}/fields`, { method: "PUT", body: b }),
    remove: (id: string) => request<{ ok: boolean }>(`/api/applications/${id}`, { method: "DELETE" }),
  },

  answers: {
    list: (q = "") => request<{ answers: AnswerRec[] }>(`/api/answers?q=${encodeURIComponent(q)}`).then((r) => r.answers),
    save: (b: { question: string; answer: string; company?: string; role?: string; approved?: boolean }) => request<{ answer: AnswerRec }>("/api/answers", { body: b }).then((r) => r.answer),
    update: (id: string, b: { answer?: string; userApproved?: boolean }) => request<{ answer: AnswerRec }>(`/api/answers/${id}`, { method: "PATCH", body: b }).then((r) => r.answer),
    markUsed: (id: string) => request<{ ok: boolean }>(`/api/answers/${id}/used`, { method: "POST", body: {} }),
    remove: (id: string) => request<{ ok: boolean }>(`/api/answers/${id}`, { method: "DELETE" }),
    clear: () => request<{ ok: boolean }>("/api/answers", { method: "DELETE" }),
  },

  coverLetters: {
    generate: (b: JobContextBody & { profile: UserProfile; variants: LetterVariant[] }) =>
      request<{ letters: GeneratedLetter[] }>("/api/cover-letter", { body: b, timeoutMs: 240000 }),
    list: (applicationId = "") => request<{ coverLetters: CoverLetterRec[] }>(`/api/cover-letter?applicationId=${applicationId}`).then((r) => r.coverLetters),
    save: (b: { content: string; company?: string; role?: string; variant?: LetterVariant; applicationId?: string }) =>
      request<{ coverLetter: CoverLetterRec }>("/api/cover-letter/save", { body: b }).then((r) => r.coverLetter),
    update: (id: string, content: string) => request<{ coverLetter: CoverLetterRec }>(`/api/cover-letter/${id}`, { method: "PATCH", body: { content } }).then((r) => r.coverLetter),
    remove: (id: string) => request<{ ok: boolean }>(`/api/cover-letter/${id}`, { method: "DELETE" }),
  },

  interview: {
    generate: (b: JobContextBody & { profile: UserProfile; applicationId?: string }) => request<{ session: InterviewSession }>("/api/interview-prep", { body: b, timeoutMs: 240000 }).then((r) => r.session),
    analyze: (b: JobContextBody & { question: string; answer: string; profile: UserProfile; sessionId?: string }) =>
      request<{ feedback: PracticeFeedback; note: string }>("/api/interview-prep/analyze", { body: b, timeoutMs: 120000 }),
    sessions: () => request<{ sessions: InterviewSession[] }>("/api/interview-prep").then((r) => r.sessions),
  },

  data: {
    exportAll: () => request<Record<string, unknown>>("/api/data/export", { timeoutMs: 60000 }),
    validate: (data: unknown) => request<{ ok: boolean; errors: string[]; summary: Record<string, unknown> | null }>("/api/data/validate", { body: { data }, timeoutMs: 30000 }),
    import: (data: unknown, mode: "merge" | "replace") => request<{ ok: boolean; added: Record<string, number> }>("/api/data/import", { body: { data, mode }, timeoutMs: 120000 }),
    clearHistory: () => request<{ ok: boolean }>("/api/data/clear-history", { body: { confirm: true } }),
    reset: () => request<{ ok: boolean }>("/api/data/reset", { body: { confirm: "RESET" } }),
  },
};
