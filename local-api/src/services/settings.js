import db from "../db/database.js";
import { DEFAULT_OLLAMA_URL } from "../config.js";

export const DEFAULT_SETTINGS = {
  ai: { ollamaUrl: DEFAULT_OLLAMA_URL, model: "", temperature: 0.3, maxTokens: 700, timeoutMs: 90000 },
  autofill: { autoThreshold: 0.9, reviewThreshold: 0.7, autoFillHigh: true, reviewMedium: true },
  appearance: { theme: "system" },
  shortcuts: {},
  onboardingComplete: false,
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Validate + coerce; unknown keys are dropped, bad values fall back to defaults.
export function normalizeSettings(input = {}) {
  const d = DEFAULT_SETTINGS;
  const ai = input.ai || {};
  const af = input.autofill || {};
  const review = clamp(num(af.reviewThreshold, d.autofill.reviewThreshold), 0.3, 0.95);
  const auto = clamp(num(af.autoThreshold, d.autofill.autoThreshold), review, 1);
  return {
    ai: {
      ollamaUrl: typeof ai.ollamaUrl === "string" && ai.ollamaUrl.trim() ? ai.ollamaUrl.trim().replace(/\/+$/, "") : d.ai.ollamaUrl,
      model: typeof ai.model === "string" ? ai.model.trim() : d.ai.model,
      temperature: clamp(num(ai.temperature, d.ai.temperature), 0, 1.5),
      maxTokens: clamp(Math.round(num(ai.maxTokens, d.ai.maxTokens)), 64, 4096),
      timeoutMs: clamp(Math.round(num(ai.timeoutMs, d.ai.timeoutMs)), 5000, 300000),
    },
    autofill: {
      autoThreshold: auto,
      reviewThreshold: review,
      autoFillHigh: af.autoFillHigh !== false,
      reviewMedium: af.reviewMedium !== false,
    },
    appearance: { theme: ["light", "dark", "system"].includes(input.appearance?.theme) ? input.appearance.theme : "system" },
    shortcuts: input.shortcuts && typeof input.shortcuts === "object" && !Array.isArray(input.shortcuts)
      ? Object.fromEntries(Object.entries(input.shortcuts).filter(([k, v]) => typeof v === "string" && k.length < 40).map(([k, v]) => [k, v.slice(0, 40)]))
      : {},
    onboardingComplete: input.onboardingComplete === true,
  };
}

export function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const stored = {};
  for (const r of rows) {
    try { stored[r.key] = JSON.parse(r.value); } catch { /* ignore corrupt row */ }
  }
  return normalizeSettings(stored);
}

export function saveSettings(patch = {}) {
  const merged = normalizeSettings({ ...getSettings(), ...patch,
    ai: { ...getSettings().ai, ...(patch.ai || {}) },
    autofill: { ...getSettings().autofill, ...(patch.autofill || {}) },
    appearance: { ...getSettings().appearance, ...(patch.appearance || {}) },
  });
  const now = new Date().toISOString();
  const up = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const [k, v] of Object.entries(merged)) up.run(k, JSON.stringify(v), now);
  return merged;
}
