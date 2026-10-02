// Versioned, additive migrations. Never edit a shipped migration — append a new one.
// Each migration runs once inside a transaction and is recorded in schema_migrations.

export const migrations = [
  {
    version: 1,
    name: "baseline",
    up: `
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
    `,
  },
  {
    version: 2,
    name: "application-assistant",
    up: `
      -- key/value app settings (AI, autofill, privacy, shortcuts, ...)
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- richer document metadata (resumes are documents with category = 'resume')
      ALTER TABLE documents ADD COLUMN description TEXT NOT NULL DEFAULT '';
      ALTER TABLE documents ADD COLUMN mime_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE documents ADD COLUMN updated_at TEXT;
      ALTER TABLE documents ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);

      -- resume intelligence: extracted text + structured hints per resume document
      CREATE TABLE IF NOT EXISTS resumes (
        document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
        target_role TEXT NOT NULL DEFAULT '',
        skills TEXT NOT NULL DEFAULT '[]',
        text TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );

      -- tracked applications
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        domain TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'saved',
        applied_at TEXT,
        resume_id TEXT,
        cover_letter_id TEXT,
        match_score REAL,
        job_data TEXT NOT NULL DEFAULT '{}',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
      CREATE INDEX IF NOT EXISTS idx_applications_url ON applications(url);
      CREATE INDEX IF NOT EXISTS idx_applications_created ON applications(created_at);

      -- what was filled for each application
      CREATE TABLE IF NOT EXISTS application_fields (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT '',
        canonical_key TEXT NOT NULL DEFAULT '',
        value TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        confidence REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_app_fields_app ON application_fields(application_id);

      -- approved/generated answers for open-ended questions
      CREATE TABLE IF NOT EXISTS answers (
        id TEXT PRIMARY KEY,
        application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'ai',
        user_approved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_answers_app ON answers(application_id);

      -- cover letters are no longer stored in answer_memory
      CREATE TABLE IF NOT EXISTS cover_letters (
        id TEXT PRIMARY KEY,
        application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
        company TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        variant TEXT NOT NULL DEFAULT 'standard',
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cover_letters_app ON cover_letters(application_id);

      CREATE TABLE IF NOT EXISTS interview_sessions (
        id TEXT PRIMARY KEY,
        application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
        company TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        questions TEXT NOT NULL DEFAULT '{}',
        practice TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- answer memory: similarity matching + approval + usage
      ALTER TABLE answer_memory ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
      ALTER TABLE answer_memory ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE answer_memory ADD COLUMN tokens TEXT NOT NULL DEFAULT '';
      ALTER TABLE answer_memory ADD COLUMN company TEXT NOT NULL DEFAULT '';
      ALTER TABLE answer_memory ADD COLUMN role TEXT NOT NULL DEFAULT '';
      ALTER TABLE answer_memory ADD COLUMN user_approved INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE answer_memory ADD COLUMN updated_at TEXT;
      CREATE INDEX IF NOT EXISTS idx_answer_memory_category ON answer_memory(category);
    `,
    // Legacy cover letters were stashed in answer_memory under "Cover letter:" — move them out.
    after(db) {
      const rows = db.prepare("SELECT * FROM answer_memory WHERE question LIKE 'Cover letter:%'").all();
      const insert = db.prepare(
        "INSERT INTO cover_letters (id, company, role, variant, content, created_at, updated_at) VALUES (?, '', ?, 'standard', ?, ?, ?)"
      );
      for (const r of rows) {
        insert.run(r.id, r.question.replace(/^Cover letter:\s*/, ""), r.answer, r.created_at, r.created_at);
      }
      db.prepare("DELETE FROM answer_memory WHERE question LIKE 'Cover letter:%'").run();
      db.prepare("UPDATE answer_memory SET updated_at = created_at WHERE updated_at IS NULL").run();
      db.prepare("UPDATE documents SET updated_at = uploaded_at WHERE updated_at IS NULL").run();
      // Legacy history rows become applications so old data shows up in the tracker.
      const statusMap = { applied: "applied", in_progress: "interview", interviewing: "interview", rejected: "rejected", offer: "offer" };
      const hist = db.prepare("SELECT * FROM application_history").all();
      const ins = db.prepare(`INSERT OR IGNORE INTO applications
        (id, company, role, url, domain, status, applied_at, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`);
      for (const h of hist) {
        ins.run(h.id, h.company, h.role, h.url || "", h.website || "", statusMap[h.status] || "applied", h.date, h.date, h.date);
      }
    },
  },
];

export function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  )`);
  const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version));
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.up);
      m.after?.(db);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        m.version, m.name, new Date().toISOString()
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${err.message}`);
    }
  }
}
