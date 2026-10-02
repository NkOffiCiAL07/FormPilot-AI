// Typed AI errors. `userMessage` is safe to show in the UI; `details` is developer-only.

export const AI_ERROR = {
  UNAVAILABLE: "OLLAMA_UNAVAILABLE",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  TIMEOUT: "TIMEOUT",
  MALFORMED: "MALFORMED_RESPONSE",
  FAILED: "GENERATION_FAILED",
  BLOCKED_URL: "NON_LOCAL_URL",
};

const MESSAGES = {
  [AI_ERROR.UNAVAILABLE]: "Ollama isn't running. Start Ollama and try again.",
  [AI_ERROR.MODEL_UNAVAILABLE]: "The selected model isn't installed in Ollama. Pick an installed model in Settings or run `ollama pull <model>`.",
  [AI_ERROR.TIMEOUT]: "The model took too long to respond. Try again, or choose a smaller model in Settings.",
  [AI_ERROR.MALFORMED]: "The model returned an answer FormPilot couldn't read. Try regenerating.",
  [AI_ERROR.FAILED]: "The model couldn't generate a response. Try again.",
  [AI_ERROR.BLOCKED_URL]: "For your privacy, FormPilot only connects to Ollama on this computer (localhost).",
};

export class AIError extends Error {
  constructor(code, details) {
    super(MESSAGES[code] || MESSAGES[AI_ERROR.FAILED]);
    this.name = "AIError";
    this.code = code;
    this.userMessage = this.message;
    this.details = details ? String(details) : undefined;
  }
}

export function toAIError(err) {
  if (err instanceof AIError) return err;
  return new AIError(AI_ERROR.FAILED, err?.message);
}
