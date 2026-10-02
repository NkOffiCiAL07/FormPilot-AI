import { createApp } from "./app.js";
import { PORT, HOST } from "./config.js";
import { getProvider } from "./ai/index.js";

createApp().listen(PORT, HOST, async () => {
  console.log(`FormPilot local API running on http://${HOST}:${PORT}`);
  console.log("  → Only accessible from this computer (Chrome extension)");
  try {
    const s = await getProvider().status();
    console.log(s.online ? `  → Ollama online, model: ${s.model ?? "none installed"}` : "  → Ollama not running (AI features disabled)");
  } catch (e) {
    console.log(`  → AI unavailable: ${e.userMessage || e.message}`);
  }
});
