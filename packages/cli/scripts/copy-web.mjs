// Ships the phone page inside the npm package, for the self-hosted modes (cloudflare/tailscale/lan).
import { cpSync, existsSync, rmSync } from "node:fs";

const from = new URL("../../web/dist/", import.meta.url);
const to = new URL("../dist/web/", import.meta.url);
if (!existsSync(new URL("index.html", from))) {
  console.error("packages/web is not built. Run `pnpm build` from the repo root.");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
