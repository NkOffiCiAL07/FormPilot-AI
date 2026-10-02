// Import this FIRST in every test file: it points the API at a throwaway data dir + port.
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export const TEST_PORT = 38000 + Math.floor(Math.random() * 1500);
process.env.FORMPILOT_DATA_DIR = mkdtempSync(join(tmpdir(), "formpilot-test-"));
process.env.FORMPILOT_PORT = String(TEST_PORT);

export async function startServer() {
  const { createApp } = await import("../src/app.js");
  const server = await new Promise((resolve) => { const s = createApp().listen(TEST_PORT, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${TEST_PORT}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method, headers: { ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return { server, call, close: () => new Promise((r) => server.close(r)) };
}
