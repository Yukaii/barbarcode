import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The ZXing WASM decoder (~1 MB) is only loaded on browsers without a native BarcodeDetector.
    chunkSizeWarningLimit: 1500,
  },
});
