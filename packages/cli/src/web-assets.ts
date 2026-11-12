import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The built phone page, served by the local server in cloudflare/tailscale/lan modes. */
export interface WebAssets {
  /** Reads a file by its path relative to the page root, e.g. "assets/app.js". */
  read(relativePath: string): Promise<Uint8Array | null>;
}

/** Where `bun build --compile --asset dist/web` puts the page inside a standalone binary. */
export const EMBEDDED_PREFIX = "dist/web/";

type NamedBlob = Blob & { name?: string };

/** Files embedded in a Bun standalone binary, or null when running on Node. */
function embeddedAssets(): WebAssets | null {
  const bun = (globalThis as { Bun?: { embeddedFiles?: NamedBlob[] } }).Bun;
  const files = new Map<string, NamedBlob>();
  for (const blob of bun?.embeddedFiles ?? []) {
    if (blob.name?.startsWith(EMBEDDED_PREFIX)) {
      files.set(blob.name.slice(EMBEDDED_PREFIX.length), blob);
    }
  }
  if (!files.has("index.html")) return null;
  return {
    // Exact-name lookups only, so "../" can't reach anything else.
    read: async (relativePath) => {
      const blob = files.get(relativePath);
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    },
  };
}

/** The page on disk: next to the bundled CLI (npm), or the workspace build (development). */
function diskAssets(): WebAssets {
  const candidates = ["./web/", "../../web/dist/", "../web/dist/"].map((p) =>
    fileURLToPath(new URL(p, import.meta.url)),
  );
  const found = candidates.find((dir) => existsSync(path.join(dir, "index.html")));
  if (!found) throw new Error("Phone page not found. Run `pnpm build` first.");
  const root = path.resolve(found);
  return {
    read: async (relativePath) => {
      const file = path.join(root, relativePath);
      if (!file.startsWith(root + path.sep)) return null;
      try {
        if (!(await stat(file)).isFile()) return null;
        return await readFile(file);
      } catch {
        return null;
      }
    },
  };
}

export function loadWebAssets(): WebAssets {
  return embeddedAssets() ?? diskAssets();
}
