// Per-tab state. Persisted in chrome.storage.session because MV3 service workers are suspended
// after ~30s idle — in-memory maps would silently lose the scan. The side panel reads the same key.

import { FieldResult, NormalizedField, PageContext } from "../shared/types";
import { JobAnalysis } from "../shared/api";

export interface AiProblem { code: string; message: string; debug?: string }

export interface TabState {
  url: string;
  title: string;
  fields: NormalizedField[];
  results: FieldResult[];
  frames: Record<string, number>;     // fieldId → frameId that owns it
  page: PageContext | null;
  job: JobAnalysis | null;
  jobUrl: string;                     // URL the job analysis was computed for
  resumeId: string | null;            // user-chosen resume (null = recommended/default)
  applicationId: string | null;
  jobStatus: "idle" | "running" | "done" | "error";
  answersStatus: "idle" | "running" | "done" | "error";
  ai: AiProblem | null;               // last AI problem to surface in the UI
  apiOnline: boolean;
  generation: number;                 // bumped on reset so stale async work can detect it
  updatedAt: number;
}

export const emptyTab = (): TabState => ({
  url: "", title: "", fields: [], results: [], frames: {}, page: null, job: null, jobUrl: "", resumeId: null, applicationId: null,
  jobStatus: "idle", answersStatus: "idle", ai: null, apiOnline: true, generation: 0, updatedAt: Date.now(),
});

const key = (tabId: number) => `tab_${tabId}`;

export async function loadTab(tabId: number): Promise<TabState> {
  const res = await chrome.storage.session.get(key(tabId));
  return { ...emptyTab(), ...(res[key(tabId)] ?? {}) };
}

export async function saveTab(tabId: number, state: TabState): Promise<void> {
  state.updatedAt = Date.now();
  await chrome.storage.session.set({ [key(tabId)]: state });
}

export async function dropTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(key(tabId));
}

export async function allTabIds(): Promise<number[]> {
  const all = await chrome.storage.session.get(null);
  return Object.keys(all).filter((k) => k.startsWith("tab_")).map((k) => Number(k.slice(4))).filter((n) => !Number.isNaN(n));
}

// Serialise work per tab so interleaved messages can't clobber each other's state.
const chains = new Map<number, Promise<unknown>>();
export function withTab<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(tabId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  chains.set(tabId, next.catch(() => {}));
  return next;
}
