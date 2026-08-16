// Shared local storage helpers — documents + application history

export interface StoredDocument {
  id: string;
  name: string;
  category: "resume" | "cover_letter" | "certificate" | "transcript" | "id" | "other";
  filename: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  tags: string[];
  data: string; // base64
}

const DOCS_KEY = "fp_documents";

export async function getDocuments(): Promise<StoredDocument[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(DOCS_KEY, (res) => {
      resolve(res[DOCS_KEY] ?? []);
    });
  });
}

export async function getDocument(id: string): Promise<StoredDocument | null> {
  const docs = await getDocuments();
  return docs.find((d) => d.id === id) ?? null;
}

export async function saveDocument(doc: StoredDocument): Promise<void> {
  const docs = await getDocuments();
  const idx = docs.findIndex((d) => d.id === doc.id);
  if (idx >= 0) docs[idx] = doc;
  else docs.push(doc);
  return new Promise((resolve) => chrome.storage.local.set({ [DOCS_KEY]: docs }, resolve));
}

export async function deleteDocument(id: string): Promise<void> {
  const docs = await getDocuments();
  return new Promise((resolve) =>
    chrome.storage.local.set({ [DOCS_KEY]: docs.filter((d) => d.id !== id) }, resolve)
  );
}

// Read a File object into base64
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:...;base64," prefix
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Create an object URL from base64 for download/preview
export function base64ToObjectUrl(data: string, mimeType: string): string {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
}

// Recommend best resume for a given context (job title / page text)
export function recommendResume(docs: StoredDocument[], context: string): StoredDocument | null {
  const resumes = docs.filter((d) => d.category === "resume");
  if (!resumes.length) return null;
  if (!context) return resumes[0];

  const ctxLower = context.toLowerCase();
  const scored = resumes.map((r) => {
    const score = r.tags.reduce((s, t) => s + (ctxLower.includes(t.toLowerCase()) ? 1 : 0), 0);
    return { doc: r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].doc;
}

// ─── Application History ──────────────────────────────────────────────────────

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  url: string;
  domain: string;
  date: string;
  status: "applied" | "interviewing" | "offer" | "rejected";
  fieldsCount: number;
  notes?: string;
}

const HISTORY_KEY = "fp_history";

export async function getHistory(): Promise<ApplicationRecord[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(HISTORY_KEY, (res) => resolve(res[HISTORY_KEY] ?? []));
  });
}

export async function saveApplicationRecord(record: ApplicationRecord): Promise<void> {
  const history = await getHistory();
  // Deduplicate: same URL within the last hour → update instead of new entry
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentIdx = history.findIndex(
    (r) => r.url === record.url && new Date(r.date).getTime() > oneHourAgo
  );
  if (recentIdx >= 0) {
    history[recentIdx] = { ...history[recentIdx], fieldsCount: record.fieldsCount, date: record.date };
  } else {
    history.unshift(record);
  }
  return new Promise((resolve) =>
    chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, 200) }, resolve)
  );
}

export async function updateApplicationRecord(
  id: string,
  patch: Partial<Pick<ApplicationRecord, "status" | "notes">>
): Promise<void> {
  const history = await getHistory();
  const idx = history.findIndex((r) => r.id === id);
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...patch };
    return new Promise((resolve) => chrome.storage.local.set({ [HISTORY_KEY]: history }, resolve));
  }
}

export async function deleteApplicationRecord(id: string): Promise<void> {
  const history = await getHistory();
  return new Promise((resolve) =>
    chrome.storage.local.set({ [HISTORY_KEY]: history.filter((r) => r.id !== id) }, resolve)
  );
}

export async function clearHistory(): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ [HISTORY_KEY]: [] }, resolve));
}
