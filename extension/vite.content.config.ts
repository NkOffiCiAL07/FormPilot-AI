import { defineConfig, Plugin } from "vite";
import { resolve } from "path";

// Content scripts are classic scripts: they cannot `import` shared chunks, so they are built
// as one self-contained IIFE bundle (run after the main build, which empties dist/).
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
  plugins: [asciiOnly()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: resolve(__dirname, "src/content/index.ts"), formats: ["iife"], name: "FormPilotContent", fileName: () => "src/content/index.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
