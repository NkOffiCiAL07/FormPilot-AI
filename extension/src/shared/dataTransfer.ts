// Portable export/import. Pure functions + a thin layer over the API so they're testable.

import { api } from "./api";
import { AppSettings, normalizeSettings } from "./storage";
import { UserProfile, defaultProfile, normalizeProfile } from "./types";

export const EXPORT_APP = "formpilot-ai";
export const EXPORT_VERSION = 1;

export interface ExportFile {
  app: string;
  version: number;
  exportedAt: string;
  profile: Partial<UserProfile>;
  preferences: Record<string, unknown>;
  answers: unknown[];
  applications: unknown[];
  coverLetters: unknown[];
  documents: unknown[];
}

export async function buildExport(profile: UserProfile, settings: AppSettings): Promise<ExportFile> {
  const server = (await api.data.exportAll()) as unknown as ExportFile;
  return { ...server, profile, preferences: { ...(server.preferences ?? {}), extension: settings } };
}

export interface ValidationResult { ok: boolean; errors: string[]; profileKeys: number }

export function parseExport(text: string): { data: ExportFile | null; error?: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { data: null, error: "This file isn't valid JSON." }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { data: null, error: "This file isn't a FormPilot export." };
  return { data: raw as ExportFile };
}

export function validateProfile(p: unknown): string[] {
  const errors: string[] = [];
  if (p === undefined) return errors;
  if (!p || typeof p !== "object" || Array.isArray(p)) return ["Profile must be an object."];
  const o = p as Record<string, unknown>;
  for (const k of ["firstName", "lastName", "email", "phone", "currentCompany", "currentTitle", "summary"]) {
    if (o[k] !== undefined && typeof o[k] !== "string") errors.push(`Profile field "${k}" must be text.`);
  }
  for (const k of ["skills", "technologies", "employment", "education", "customFields"]) {
    if (o[k] !== undefined && !Array.isArray(o[k])) errors.push(`Profile field "${k}" must be a list.`);
  }
  if (o.address !== undefined && (typeof o.address !== "object" || o.address === null)) errors.push("Profile address must be an object.");
  return errors;
}

/** Local checks (no network). The API validates the rest (answers, applications, documents). */
export function validateExport(d: ExportFile): ValidationResult {
  const errors: string[] = [];
  if (d.app && d.app !== EXPORT_APP) errors.push("This file wasn't exported from FormPilot AI.");
  if (!Number.isInteger(d.version)) errors.push("The export is missing its version number.");
  else if (d.version > EXPORT_VERSION) errors.push(`This export (v${d.version}) is newer than this version of FormPilot supports (v${EXPORT_VERSION}). Update FormPilot and try again.`);
  else if (d.version < 1) errors.push("Unsupported export version.");
  errors.push(...validateProfile(d.profile));
  return { ok: errors.length === 0, errors, profileKeys: d.profile ? Object.keys(d.profile).length : 0 };
}

const isBlank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

export interface ProfileDiff { added: string[]; conflicts: string[] }

/** What a merge would do — used to show the user before anything changes. */
export function diffProfile(current: UserProfile, incoming: Partial<UserProfile>): ProfileDiff {
  const inc = normalizeProfile(incoming);
  const added: string[] = [], conflicts: string[] = [];
  for (const k of Object.keys(defaultProfile) as (keyof UserProfile)[]) {
    if (k === "updatedAt" || k === "address") continue;
    const a = current[k], b = inc[k];
    if (isBlank(b) || JSON.stringify(a) === JSON.stringify(b)) continue;
    if (Array.isArray(a) || Array.isArray(b)) { added.push(k); continue; }
    (isBlank(a) ? added : conflicts).push(k);
  }
  for (const k of Object.keys(defaultProfile.address) as (keyof UserProfile["address"])[]) {
    const a = current.address[k], b = inc.address[k];
    if (isBlank(b) || a === b) continue;
    (isBlank(a) ? added : conflicts).push(`address.${k}`);
  }
  return { added, conflicts };
}

const sig = (...p: (string | undefined)[]) => p.map((x) => (x ?? "").trim().toLowerCase()).join("|");

/** Merge: fills blanks and unions lists. Existing non-empty values are NEVER overwritten. */
export function mergeProfile(current: UserProfile, incoming: Partial<UserProfile>): UserProfile {
  const inc = normalizeProfile(incoming);
  const out: UserProfile = { ...current, address: { ...current.address } };
  for (const k of Object.keys(defaultProfile) as (keyof UserProfile)[]) {
    if (["updatedAt", "address", "skills", "technologies", "employment", "education", "customFields"].includes(k)) continue;
    if (isBlank(out[k]) && !isBlank(inc[k])) (out as unknown as Record<string, unknown>)[k] = inc[k];
  }
  for (const k of Object.keys(out.address) as (keyof UserProfile["address"])[]) if (isBlank(out.address[k])) out.address[k] = inc.address[k];
  const union = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()))];
  out.skills = union(current.skills, inc.skills);
  out.technologies = union(current.technologies, inc.technologies);
  out.employment = [...current.employment, ...inc.employment.filter((e) => !current.employment.some((c) => sig(c.company, c.title, c.startDate) === sig(e.company, e.title, e.startDate)))];
  out.education = [...current.education, ...inc.education.filter((e) => !current.education.some((c) => sig(c.institution, c.degree) === sig(e.institution, e.degree)))];
  out.customFields = [...current.customFields, ...inc.customFields.filter((e) => !current.customFields.some((c) => sig(c.key) === sig(e.key)))];
  out.updatedAt = new Date().toISOString();
  return out;
}

export function replaceProfile(incoming: Partial<UserProfile>): UserProfile {
  return { ...normalizeProfile(incoming), updatedAt: new Date().toISOString() };
}

export function extensionSettingsFrom(d: ExportFile): AppSettings | null {
  const ext = (d.preferences as { extension?: Partial<AppSettings> } | undefined)?.extension;
  return ext && typeof ext === "object" ? normalizeSettings(ext) : null;
}
