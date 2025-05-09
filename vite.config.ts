// vite.config.ts
import { defineConfig } from "vite";
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: "src",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/index.html"
    }
  },
  plugins: [
    tailwindcss()
  ]
});
