import { DatabaseSync } from "node:sqlite";
import { join } from "path";
import { mkdirSync } from "fs";
import { DATA_DIR, DOCS_DIR } from "../config.js";
import { runMigrations } from "./migrations.js";

mkdirSync(DOCS_DIR, { recursive: true });

const db = new DatabaseSync(process.env.FORMPILOT_DB || join(DATA_DIR, "formpilot.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

runMigrations(db);

// Make node:sqlite statements behave like better-sqlite3's (plain objects, spreadable params)
const wrap = (stmt) => ({
  get: (...p) => stmt.get(...p),
  all: (...p) => stmt.all(...p),
  run: (...p) => stmt.run(...p),
});
const originalPrepare = db.prepare.bind(db);
db.prepare = (sql) => wrap(originalPrepare(sql));

export default db;
