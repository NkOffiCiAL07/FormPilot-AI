import { OllamaProvider, MockProvider } from "./provider.js";
import { AIError, AI_ERROR } from "./errors.js";
import { getSettings } from "../services/settings.js";

let override = null; // tests inject a provider
export function setProviderOverride(p) { override = p; }

// The provider is cheap to build (no I/O) so it always reflects the latest settings.
export function getProvider() {
  if (override) return override;
  if (process.env.FORMPILOT_MOCK_AI === "1") return new MockProvider();
  const { ai } = getSettings();
  return new OllamaProvider({ baseUrl: ai.ollamaUrl, model: ai.model, temperature: ai.temperature, maxTokens: ai.maxTokens, timeoutMs: ai.timeoutMs });
}

// Like getProvider but converts a blocked URL into an AIError that routes can report.
export function requireProvider() {
  try { return getProvider(); } catch (e) {
    if (e instanceof AIError) throw e;
    throw new AIError(AI_ERROR.FAILED, e.message);
  }
}
