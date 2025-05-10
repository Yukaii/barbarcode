import { defineConfig } from "vite";
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "landing",
  build: {
    outDir: path.resolve(__dirname, "dist/landing"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "landing/index.html")
    }
  },
  plugins: [
    tailwindcss()
  ]
});
