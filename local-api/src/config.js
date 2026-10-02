import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.FORMPILOT_PORT) || 3710;
export const HOST = "127.0.0.1";
export const DATA_DIR = process.env.FORMPILOT_DATA_DIR || join(__dir, "../data");
export const DOCS_DIR = join(DATA_DIR, "documents");
export const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
export const APP_VERSION = "0.2.0";
