import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// Custom plugin to copy manifest + icons to dist after build
function copyExtensionAssets(): Plugin {
  let out = "dist";
  return {
    name: "copy-extension-assets",
    configResolved(cfg) { out = cfg.build.outDir; },
    closeBundle() {
      // manifest
      copyFileSync("manifest.json", join(out, "manifest.json"));

      // icons
      const iconsSrc = "public/icons";
      const iconsDst = join(out, "icons");
      if (existsSync(iconsSrc)) {
        mkdirSync(iconsDst, { recursive: true });
        for (const f of readdirSync(iconsSrc)) {
          copyFileSync(join(iconsSrc, f), join(iconsDst, f));
        }
      }
    },
  };
}

// Chrome refuses extension scripts containing non-characters (e.g. U+FFFF). Emit ASCII-only output.

// Chrome rejects extension scripts that contain non-characters (e.g. U+FFFF) and can mis-decode other
// non-ASCII text, so escape everything outside ASCII in the emitted bundles.
function asciiOnly(): Plugin {
  return {
    name: "ascii-only-output",
    renderChunk(code) {
      return { code: code.replace(/[^\x00-\x7F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`), map: null };
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionAssets(), asciiOnly()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "src/background/index.js";
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
