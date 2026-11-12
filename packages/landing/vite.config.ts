import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// One page per locale, rendered from src/page.html by scripts/render.mjs.
const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        en: page("./index.html"),
        "zh-tw": page("./zh-tw/index.html"),
        ja: page("./ja/index.html"),
      },
    },
  },
});
