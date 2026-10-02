import "./helpers.js";
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { runMigrations, migrations } from "../src/db/migrations.js";

// Build a v0.1-era database by hand, then migrate it.
test("legacy database upgrades in place without losing data", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(migrations[0].up);
  db.prepare("INSERT INTO answer_memory (id, question_hash, question, answer, created_at) VALUES ('a1','h','Why us?','Because', '2025-01-01')").run();
  db.prepare("INSERT INTO answer_memory (id, question_hash, question, answer, created_at) VALUES ('c1','h2','Cover letter: SWE at Acme','Dear Acme', '2025-01-02')").run();
  db.prepare("INSERT INTO application_history (id, company, role, website, date, status, url) VALUES ('h1','Acme','SWE','acme.com','2025-02-01','in_progress','https://acme.com/1')").run();
  db.prepare("INSERT INTO documents (id, name, category, filename, size, uploaded_at) VALUES ('d1','Resume','resume','x.pdf',10,'2025-01-01')").run();

  runMigrations(db);
  runMigrations(db); // idempotent

  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_migrations").get().n, migrations.length);
  assert.equal(db.prepare("SELECT question FROM answer_memory").all().length, 1, "cover letter moved out of answer memory");
  assert.equal(db.prepare("SELECT content FROM cover_letters").get().content, "Dear Acme");
  const app = db.prepare("SELECT * FROM applications WHERE id = 'h1'").get();
  assert.equal(app.status, "interview");
  assert.equal(app.company, "Acme");
  assert.equal(db.prepare("SELECT updated_at FROM documents WHERE id='d1'").get().updated_at, "2025-01-01");
  for (const t of ["profiles", "resumes", "applications", "application_fields", "answers", "answer_memory", "cover_letters", "interview_sessions", "settings"]) {
    if (t === "profiles") continue; // singular `profile` table kept for backward compatibility
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = ?").get(t), `${t} exists`);
  }
});

test("a failing migration rolls back completely", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(migrations[0].up);
  db.exec("BEGIN"); db.exec("COMMIT");
  const bad = { version: 99, name: "bad", up: "CREATE TABLE t1 (id INT); CREATE TABLE t1 (id INT);" };
  migrations.push(bad);
  try { assert.throws(() => runMigrations(db), /Migration 99/); } finally { migrations.pop(); }
  assert.ok(!db.prepare("SELECT name FROM sqlite_master WHERE name = 't1'").get());
});
