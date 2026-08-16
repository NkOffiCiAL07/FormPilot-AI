import express from "express";
import cors from "cors";
import analyzeRouter from "./routes/analyze.js";
import profileRouter from "./routes/profile.js";
import documentsRouter from "./routes/documents.js";
import historyRouter from "./routes/history.js";
import { getProvider } from "./ai/provider.js";

const app = express();
const PORT = 3710;

// Only allow requests from the Chrome extension
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin.startsWith("chrome-extension://")) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed"), false);
    }
  },
}));

app.use(express.json({ limit: "2mb" }));

// Routes
app.use("/api/analyze", analyzeRouter);
app.use("/api/profile", profileRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/history", historyRouter);

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
