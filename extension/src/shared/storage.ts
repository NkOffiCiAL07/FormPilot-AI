// chrome.storage helpers: extension settings + one-time migration from the pre-0.2 storage layout.
// Documents, applications and answers now live in the local API (SQLite).

import { api } from "./api";

const get = <T,>(key: string, fallback: T): Promise<T> =>
  new Promise((resolve) => chrome.storage.local.get(key, (res) => resolve((res[key] as T) ?? fallback)));
const set = (obj: Record<string, unknown>): Promise<void> => new Promise((resolve) => chrome.storage.local.set(obj, resolve));

// ─── Settings ──────────────────────────────────────────────────────────────────────

export type Theme = "system" | "light" | "dark";

export interface AppSettings {
  highlightFields: boolean;
  showConfidence: boolean;
  autoThreshold: number;       // >= → fill automatically
  reviewThreshold: number;     // >= → fill but highlight for review; below → never auto-filled
  autoFillHigh: boolean;
  reviewMedium: boolean;
  autoFillOnDetect: boolean;   // fill high-confidence fields as soon as a form is detected
  theme: Theme;
  shortcuts: Record<string, string>;   // quick-copy hotkeys, e.g. { email: "Alt+Shift+E" }
  quickCopyFields: string[];           // which fields appear in Quick Copy
  onboardingComplete: boolean;
  debug: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  highlightFields: true,
  showConfidence: true,
  autoThreshold: 0.9,
  reviewThreshold: 0.7,
  autoFillHigh: true,
  reviewMedium: true,
  autoFillOnDetect: false,
  theme: "system",
  shortcuts: {},
  quickCopyFields: ["email", "phone", "address", "linkedin", "github", "portfolio", "currentCompany", "expectedSalary", "noticePeriod"],
  onboardingComplete: false,
  debug: false,
};

const SETTINGS_KEY = "fp_settings";

export function normalizeSettings(s: Partial<AppSettings> | undefined): AppSettings {
  const m = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  const review = Math.min(0.95, Math.max(0.3, Number(m.reviewThreshold) || DEFAULT_SETTINGS.reviewThreshold));
  const auto = Math.min(1, Math.max(review, Number(m.autoThreshold) || DEFAULT_SETTINGS.autoThreshold));
  return { ...m, autoThreshold: auto, reviewThreshold: review, shortcuts: m.shortcuts ?? {}, quickCopyFields: m.quickCopyFields ?? DEFAULT_SETTINGS.quickCopyFields };
}

export async function getSettings(): Promise<AppSettings> {
  return normalizeSettings(await get<Partial<AppSettings>>(SETTINGS_KEY, {}));
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch });
  await set({ [SETTINGS_KEY]: next });
  return next;
}

export function onSettingsChanged(cb: (s: AppSettings) => void): () => void {
  const l = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[SETTINGS_KEY]) cb(normalizeSettings(changes[SETTINGS_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(l);
  return () => chrome.storage.onChanged.removeListener(l);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export async function clearAllData(): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.clear(resolve));
}

// ─── Legacy (pre-0.2) data ───────────────────────────────────────────────────────────

interface LegacyDoc { id: string; name: string; category: string; filename: string; mimeType: string; tags: string[]; data: string }
interface LegacyApp { id: string; company: string; role: string; url: string; date: string; status: string; notes?: string }

const DOCS_KEY = "fp_documents";
const HISTORY_KEY = "fp_history";

export async function hasLegacyData(): Promise<boolean> {
  const [d, h] = await Promise.all([get<LegacyDoc[]>(DOCS_KEY, []), get<LegacyApp[]>(HISTORY_KEY, [])]);
  return d.length > 0 || h.length > 0;
}

function b64ToFile(d: LegacyDoc): File {
  const bin = atob(d.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], d.filename || `${d.name}.pdf`, { type: d.mimeType || "application/octet-stream" });
}

/**
 * Move documents / history saved by older versions (or queued while the API was offline) into the
 * local API. Items are removed from chrome.storage only after the API accepted them.
 */
export async function migrateLegacyData(): Promise<{ documents: number; applications: number }> {
  const out = { documents: 0, applications: 0 };
  const docs = await get<LegacyDoc[]>(DOCS_KEY, []);
  const keepDocs: LegacyDoc[] = [];
  for (const d of docs) {
    try {
      const cat = ["resume", "cover_letter", "certificate", "transcript", "id", "other"].includes(d.category) ? d.category : "other";
      await api.documents.upload(b64ToFile(d), { name: d.name, category: cat, tags: d.tags ?? [], skills: cat === "resume" ? d.tags ?? [] : [] });
      out.documents++;
    } catch { keepDocs.push(d); }
  }
  await set({ [DOCS_KEY]: keepDocs });

  const hist = await get<LegacyApp[]>(HISTORY_KEY, []);
  const keepHist: LegacyApp[] = [];
  const map: Record<string, string> = { applied: "applied", interviewing: "interview", in_progress: "interview", offer: "offer", rejected: "rejected" };
  for (const h of hist) {
    try {
      await api.applications.upsert({ url: h.url || `legacy:${h.id}`, company: h.company, role: h.role, status: (map[h.status] ?? "applied") as never, appliedAt: h.date, notes: h.notes ?? "" });
      out.applications++;
    } catch { keepHist.push(h); }
  }
  await set({ [HISTORY_KEY]: keepHist });
  return out;
}

/** Queue an application locally when the API is offline; migrateLegacyData() uploads it later. */
export async function queueOfflineApplication(a: { company: string; role: string; url: string; status?: string }): Promise<void> {
  const hist = await get<LegacyApp[]>(HISTORY_KEY, []);
  if (hist.some((h) => h.url === a.url)) return;
  hist.unshift({ id: crypto.randomUUID(), company: a.company, role: a.role, url: a.url, date: new Date().toISOString(), status: a.status ?? "applied" });
  await set({ [HISTORY_KEY]: hist.slice(0, 200) });
}
