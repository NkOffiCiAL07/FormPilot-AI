import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// Custom plugin to copy manifest + icons to dist after build
function copyExtensionAssets(): Plugin {
  return {
    name: "copy-extension-assets",
    closeBundle() {
      // manifest
      copyFileSync("manifest.json", "dist/manifest.json");

      // icons
      const iconsSrc = "public/icons";
      const iconsDst = "dist/icons";
      if (existsSync(iconsSrc)) {
        mkdirSync(iconsDst, { recursive: true });
        for (const f of readdirSync(iconsSrc)) {
          copyFileSync(join(iconsSrc, f), join(iconsDst, f));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionAssets()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "src/background/index.js";
          if (chunk.name === "content") return "src/content/index.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
