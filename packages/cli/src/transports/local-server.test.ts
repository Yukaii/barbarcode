import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { loadWebAssets, type WebAssets } from "../web-assets";
import { type LocalServer, startLocalServer } from "./local-server";

const SESSION = "AAAAAAAAAAAAAAAAAAAAAA";
const PAGE_FILES: Record<string, string> = {
  "index.html": "<html>page</html>",
  "assets/app.js": "console.log(1)",
};
const fakeAssets: WebAssets = {
  read: async (p) => (p in PAGE_FILES ? new TextEncoder().encode(PAGE_FILES[p]) : null),
};

let server: LocalServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(assets: WebAssets = fakeAssets, frames: string[] = []) {
  server = await startLocalServer({
    sessionId: SESSION,
    host: "127.0.0.1",
    port: 0,
    assets,
    on: { frame: (f) => frames.push(f), phones: () => {}, notice: () => {} },
  });
  return `http://127.0.0.1:${server.port}`;
}

describe("local server", () => {
  it("serves assets with their type and long caching", async () => {
    const base = await start();
    const res = await fetch(`${base}/assets/app.js`);
    expect(await res.text()).toBe("console.log(1)");
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("falls back to the uncached page for session URLs and index.html", async () => {
    const base = await start();
    for (const path of [`/s/${SESSION}`, "/", "/index.html", "/missing.js"]) {
      const res = await fetch(base + path);
      expect(await res.text()).toBe("<html>page</html>");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("never serves files outside the page directory", async () => {
    const base = await start(loadWebAssets());
    const res = await fetch(`${base}/..%2f..%2fpackage.json`);
    expect(await res.text()).not.toContain('"name"');
  });

  it("only accepts phones on this session's socket", async () => {
    const frames: string[] = [];
    const base = (await start(fakeAssets, frames)).replace("http", "ws");
    const rejected = new WebSocket(`${base}/ws/BBBBBBBBBBBBBBBBBBBBBB?role=phone`);
    await new Promise((r) => rejected.on("error", r));

    const phone = new WebSocket(`${base}/ws/${SESSION}?role=phone`);
    const notice = await new Promise<string>((r) => phone.on("message", (d) => r(String(d))));
    expect(JSON.parse(notice)).toEqual({ t: "sys", host: true, phones: 1 });
    phone.send('{"t":"enc","iv":"x","ct":"y"}');
    await new Promise((r) => setTimeout(r, 50));
    expect(frames).toEqual(['{"t":"enc","iv":"x","ct":"y"}']);
    phone.close();
  });
});
