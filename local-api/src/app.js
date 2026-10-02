import express from "express";
import cors from "cors";
import { corsOptions, localOnly } from "./middleware/security.js";
import { errorHandler } from "./middleware/errors.js";
import { APP_VERSION } from "./config.js";
import { getProvider } from "./ai/index.js";
import db from "./db/database.js";
import analyzeRouter from "./routes/analyze.js";
import profileRouter from "./routes/profile.js";
import documentsRouter from "./routes/documents.js";
import applicationsRouter from "./routes/applications.js";
import answersRouter from "./routes/answers.js";
import coverLetterRouter from "./routes/coverLetter.js";
import interviewPrepRouter from "./routes/interviewPrep.js";
import jobsRouter from "./routes/jobs.js";
import settingsRouter from "./routes/settings.js";
import dataRouter from "./routes/data.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(localOnly);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "40mb" })); // imports can embed documents as base64

  app.use("/api/analyze", analyzeRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/applications", applicationsRouter);
  app.use("/api/answers", answersRouter);
  app.use("/api/cover-letter", coverLetterRouter);
  app.use("/api/interview-prep", interviewPrepRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/data", dataRouter);

  app.get("/health", async (_req, res) => {
    let ai = { online: false, model: null };
    try { const s = await getProvider().status(); ai = { online: s.online, model: s.model, provider: getProvider().name }; } catch { /* reported as offline */ }
    const dbVersion = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get().v;
    res.json({ status: "ok", version: APP_VERSION, dbVersion, ai, timestamp: new Date().toISOString() });
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found", code: "NOT_FOUND" }));
  app.use(errorHandler);
  return app;
}
