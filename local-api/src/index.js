import express from "express";
import cors from "cors";
import analyzeRouter from "./routes/analyze.js";
import profileRouter from "./routes/profile.js";
import documentsRouter from "./routes/documents.js";
import historyRouter from "./routes/history.js";
import coverLetterRouter from "./routes/coverLetter.js";
import interviewPrepRouter from "./routes/interviewPrep.js";
import { getProvider } from "./ai/provider.js";

const app = express();
const PORT = 3710;

// Access control. Browsers attach Origin / Sec-Fetch-Site to requests made by web pages,
// so a malicious page cannot reach this API (CSRF via simple multipart POSTs, DNS rebinding).
const LOCAL_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
app.use((req, res, next) => {
  if (!LOCAL_HOSTS.has(req.headers.host)) return res.status(403).json({ error: "Forbidden host" });
  const origin = req.headers.origin;
  const site = req.headers["sec-fetch-site"];
  const fromExtension = !origin || origin.startsWith("chrome-extension://");
  if (!fromExtension || site === "cross-site" && !origin) {
    return res.status(403).json({ error: "Forbidden origin" });
  }
  next();
});
app.use(cors({ origin: (origin, cb) => cb(null, !origin || origin.startsWith("chrome-extension://")) }));

app.use(express.json({ limit: "2mb" }));

// Routes
app.use("/api/analyze", analyzeRouter);
app.use("/api/profile", profileRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/history", historyRouter);
app.use("/api/cover-letter", coverLetterRouter);
app.use("/api/interview-prep", interviewPrepRouter);

// Health check
app.get("/health", async (_req, res) => {
  const provider = await getProvider();
  res.json({
    status: "ok",
    version: "0.1.0",
    ai: provider ? provider.constructor.name : null,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`FormPilot local API running on http://127.0.0.1:${PORT}`);
  console.log("  → Only accessible from localhost (Chrome extension)");
  getProvider().then((p) => {
    console.log(`  → AI Provider: ${p ? p.constructor.name : "None (offline mode)"}`);
  });
});
