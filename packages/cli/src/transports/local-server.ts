import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { MAX_FRAME_BYTES, type SystemMessage } from "@barbarcode/protocol";
import { WebSocket, WebSocketServer } from "ws";
import type { WebAssets } from "../web-assets";
import type { TransportHandlers } from "./types";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

export interface LocalServer {
  port: number;
  send(frame: string): void;
  close(): Promise<void>;
}

/**
 * Serves the phone page and a WebSocket endpoint from this machine, mirroring the relay's
 * protocol, so the same page works whether it's reached through the relay or a tunnel.
 */
export async function startLocalServer(opts: {
  sessionId: string;
  host: string;
  port: number;
  assets: WebAssets;
  on: TransportHandlers;
}): Promise<LocalServer> {
  const indexHtml = await opts.assets.read("index.html");
  if (!indexHtml) throw new Error("Phone page is missing index.html");

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true,"service":"barbarcode"}');
      return;
    }
    let relativePath = "";
    try {
      relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      // malformed escape sequence: serve the page
    }
    const isPage = relativePath === "" || relativePath === "index.html";
    const asset = isPage ? null : await opts.assets.read(relativePath);
    // Anything that isn't a file (e.g. /s/<session>) gets the single-page app.
    const body = asset ?? indexHtml;
    res.writeHead(200, {
      "content-type": asset
        ? (MIME[path.extname(relativePath)] ?? "application/octet-stream")
        : MIME[".html"],
      "cache-control": asset ? "public, max-age=31536000, immutable" : "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    res.end(body);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const expectedPath = `/ws/${opts.sessionId}`;

  const announce = () => {
    const count = wss.clients.size;
    opts.on.phones(count);
    const notice: SystemMessage = { t: "sys", host: true, phones: count };
    for (const client of wss.clients) client.send(JSON.stringify(notice));
  };

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://local");
    if (
      url.pathname !== expectedPath ||
      url.searchParams.get("role") !== "phone" ||
      wss.clients.size >= 4
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on("message", (data, isBinary) => {
        if (!isBinary) opts.on.frame(data.toString());
      });
      ws.on("close", announce);
      announce();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, opts.host, resolve);
  });

  return {
    port: (server.address() as AddressInfo).port,
    send(frame) {
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(frame);
      }
    },
    async close() {
      for (const client of wss.clients) client.close(1001, "barbarcode stopped");
      wss.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}
