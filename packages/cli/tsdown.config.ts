import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  platform: "node",
  target: "node22",
  format: "esm",
  fixedExtension: true,
});
