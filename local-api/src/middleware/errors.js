import { AIError } from "../ai/errors.js";

export class HttpError extends Error {
  constructor(status, message, code = "BAD_REQUEST") { super(message); this.status = status; this.code = code; }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Never leak stack traces or internal messages to clients. Developer details only in `debug`.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AIError) {
    const status = err.code === "OLLAMA_UNAVAILABLE" ? 503 : err.code === "TIMEOUT" ? 504 : 502;
    return res.status(status).json({ error: err.userMessage, code: err.code, debug: err.details });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request too large", code: "TOO_LARGE" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON", code: "BAD_JSON" });
  if (err?.name === "MulterError") return res.status(400).json({ error: "Upload failed", code: "UPLOAD", debug: err.code });
  console.error("[FormPilot API]", err);
  res.status(500).json({ error: "Something went wrong on the local server.", code: "INTERNAL", debug: err?.message });
}
