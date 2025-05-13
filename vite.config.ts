// vite.config.ts
import { defineConfig } from "vite";
import react from '@vitejs/plugin-react';
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
    react(),
    tailwindcss()
  ]
});
