import { HttpError } from "./errors.js";

export const str = (v, max = 5000) => (typeof v === "string" ? v.slice(0, max) : "");
export const strList = (v, maxItems = 50, maxLen = 80) =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems) : [];

export function requireObject(body, what = "body") {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, `${what} must be a JSON object`);
  return body;
}

export function requireString(v, name, max = 5000) {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${name} is required`);
  return v.trim().slice(0, max);
}

export function oneOf(v, allowed, name, fallback) {
  if (v === undefined && fallback !== undefined) return fallback;
  if (!allowed.includes(v)) throw new HttpError(400, `${name} must be one of: ${allowed.join(", ")}`);
  return v;
}

export function clampInt(v, lo, hi, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}
