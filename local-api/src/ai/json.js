import { AIError, AI_ERROR } from "./errors.js";

// LLMs wrap JSON in prose or markdown fences. Find the first balanced JSON value and parse it.
export function extractJson(text) {
  if (typeof text !== "string") throw new AIError(AI_ERROR.MALFORMED, "empty response");
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .trim();
  try { return JSON.parse(cleaned); } catch { /* fall through to scan */ }

  for (let start = 0; start < cleaned.length; start++) {
    const open = cleaned[start];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  throw new AIError(AI_ERROR.MALFORMED, `no JSON found in: ${cleaned.slice(0, 120)}`);
}

// Tiny schema checker: { type: "object"|"array"|"string"|"number"|"boolean", items?, props?, optional? }
export function validate(value, schema, path = "$") {
  const fail = (msg) => { throw new AIError(AI_ERROR.MALFORMED, `${path}: ${msg}`); };
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") fail("expected string");
      return value;
    case "number": {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n !== "number" || Number.isNaN(n)) fail("expected number");
      return n;
    }
    case "boolean":
      if (typeof value !== "boolean") fail("expected boolean");
      return value;
    case "array":
      if (!Array.isArray(value)) fail("expected array");
      return value.map((v, i) => validate(v, schema.items, `${path}[${i}]`));
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("expected object");
      const out = {};
      for (const [k, s] of Object.entries(schema.props || {})) {
        if (value[k] === undefined || value[k] === null) {
          if (!s.optional) fail(`missing "${k}"`);
          continue;
        }
        out[k] = validate(value[k], s, `${path}.${k}`);
      }
      return out;
    }
    default:
      return value;
  }
}

export function parseJson(text, schema) {
  const value = extractJson(text);
  return schema ? validate(value, schema) : value;
}
