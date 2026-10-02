import { Router } from "express";
import { getSettings, saveSettings } from "../services/settings.js";
import { requireObject } from "../middleware/validate.js";
import { HttpError, asyncHandler } from "../middleware/errors.js";
import { isLocalUrl, OllamaProvider } from "../ai/provider.js";
import { getProvider } from "../ai/index.js";
import { AIError, AI_ERROR } from "../ai/errors.js";

const router = Router();

router.get("/", (_req, res) => res.json({ settings: getSettings() }));

router.put("/", (req, res) => {
  const body = requireObject(req.body);
  if (body.ai?.ollamaUrl && !isLocalUrl(String(body.ai.ollamaUrl))) {
    throw new HttpError(400, new AIError(AI_ERROR.BLOCKED_URL).userMessage, AI_ERROR.BLOCKED_URL);
  }
  res.json({ settings: saveSettings(body) });
});

// AI connection status for the current settings
router.get("/ai/status", asyncHandler(async (_req, res) => {
  try {
    res.json(await getProvider().status());
  } catch (e) {
    res.json({ online: false, model: null, models: [], error: e.userMessage || "AI unavailable" });
  }
}));

// Test a connection with unsaved values (the "Test connection" button)
router.post("/ai/test", asyncHandler(async (req, res) => {
  const { ollamaUrl, model } = requireObject(req.body);
  const cfg = getSettings().ai;
  const url = (ollamaUrl || cfg.ollamaUrl).toString();
  if (!isLocalUrl(url)) return res.json({ online: false, models: [], error: new AIError(AI_ERROR.BLOCKED_URL).userMessage, code: AI_ERROR.BLOCKED_URL });
  const provider = new OllamaProvider({ ...cfg, baseUrl: url, model: typeof model === "string" ? model : cfg.model });
  const st = await provider.status();
  res.json({
    ...st,
    code: !st.online ? AI_ERROR.UNAVAILABLE : !st.model ? AI_ERROR.MODEL_UNAVAILABLE : undefined,
    error: !st.online ? new AIError(AI_ERROR.UNAVAILABLE).userMessage : !st.model ? new AIError(AI_ERROR.MODEL_UNAVAILABLE).userMessage : undefined,
  });
}));

export default router;
