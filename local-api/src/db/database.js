import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "../../data");
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(join(DATA_DIR, "documents"), { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, "formpilot.db"));

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    filename TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    tags TEXT NOT NULL DEFAULT '[]',
    uploaded_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS answer_memory (
    id TEXT PRIMARY KEY,
    question_hash TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    context TEXT,
    created_at TEXT NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS application_history (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    website TEXT,
    date TEXT NOT NULL,
    resume_used TEXT,
    status TEXT NOT NULL DEFAULT 'applied',
    url TEXT,
    answers TEXT DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_answer_memory_hash ON answer_memory(question_hash);
`);

// Wrapper to make node:sqlite API match the better-sqlite3 interface
// so routes don't need to change

const wrap = (stmt) => ({
  get: (...params) => stmt.get(...params),
  all: (...params) => stmt.all(...params),
  run: (...params) => stmt.run(...params),
});

const originalPrepare = db.prepare.bind(db);
db.prepare = (sql) => wrap(originalPrepare(sql));

export default db;
