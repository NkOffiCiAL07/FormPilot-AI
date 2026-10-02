// Provider layer: a thin transport. All prompts/tasks live in ai/tasks.js so any
// provider that implements chat()/status()/listModels() works without touching app logic.

import { AIError, AI_ERROR } from "./errors.js";
import { DEFAULT_OLLAMA_URL } from "../config.js";

export class AIProvider {
  get name() { return "base"; }
  // chat({ system, user, json?, temperature?, maxTokens?, timeoutMs? }) -> string
  async chat(_req) { throw new Error("Not implemented"); }
  // -> { online: boolean, model: string|null, models: string[], error?: string }
  async status() { throw new Error("Not implemented"); }
  async listModels() { return (await this.status()).models; }
}

// Only loopback Ollama endpoints are allowed — profile data must never leave this machine.
export function isLocalUrl(url) {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "http:" && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

export class OllamaProvider extends AIProvider {
  constructor({ baseUrl = DEFAULT_OLLAMA_URL, model = "", temperature = 0.3, maxTokens = 700, timeoutMs = 90000 } = {}) {
    super();
    if (!isLocalUrl(baseUrl)) throw new AIError(AI_ERROR.BLOCKED_URL, baseUrl);
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.configuredModel = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.timeoutMs = timeoutMs;
  }

  get name() { return "ollama"; }

  async #fetch(path, init, timeoutMs) {
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") throw new AIError(AI_ERROR.TIMEOUT, err.message);
      throw new AIError(AI_ERROR.UNAVAILABLE, err?.cause?.code || err?.message);
    }
  }

  async status() {
    try {
      const res = await this.#fetch("/api/tags", {}, 3000);
      if (!res.ok) return { online: false, model: null, models: [], error: `HTTP ${res.status}` };
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      return { online: true, model: this.#pick(models), models, configuredModel: this.configuredModel || null,
        modelInstalled: !this.configuredModel || models.some((m) => m === this.configuredModel || m.startsWith(`${this.configuredModel}:`)) };
    } catch (err) {
      return { online: false, model: null, models: [], error: err.userMessage || err.message };
    }
  }

  // Configured model if installed; otherwise (auto mode) the first installed model.
  #pick(models) {
    if (this.configuredModel) {
      return models.find((m) => m === this.configuredModel || m.startsWith(`${this.configuredModel}:`)) || null;
    }
    return models[0] || null;
  }

  async chat({ system, user, json = false, temperature, maxTokens, timeoutMs }) {
    const st = await this.status();
    if (!st.online) throw new AIError(AI_ERROR.UNAVAILABLE, st.error);
    const model = st.model;
    if (!model) throw new AIError(AI_ERROR.MODEL_UNAVAILABLE, `installed: ${st.models.join(", ") || "none"}; wanted: ${this.configuredModel || "any"}`);

    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });

    const res = await this.#fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model, messages, stream: false, think: false,
        ...(json ? { format: "json" } : {}),
        options: { temperature: temperature ?? this.temperature, num_predict: maxTokens ?? this.maxTokens },
      }),
    }, timeoutMs ?? this.timeoutMs);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 404 || /not found/i.test(body)) throw new AIError(AI_ERROR.MODEL_UNAVAILABLE, body);
      throw new AIError(AI_ERROR.FAILED, `HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    let data;
    try { data = await res.json(); } catch (e) { throw new AIError(AI_ERROR.MALFORMED, e.message); }
    const content = data?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new AIError(AI_ERROR.MALFORMED, "empty content");
    return content;
  }
}

// Deterministic provider for tests/offline development.
// handler(req) may return a string, or throw an AIError to simulate failures.
export class MockProvider extends AIProvider {
  constructor(handler = () => "{}") {
    super();
    this.handler = typeof handler === "function" ? handler : () => handler;
    this.calls = [];
  }
  get name() { return "mock"; }
  async chat(req) {
    this.calls.push(req);
    return this.handler(req);
  }
  async status() { return { online: true, model: "mock", models: ["mock"], modelInstalled: true }; }
}
