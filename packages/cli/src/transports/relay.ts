import { parseWireFrame, socketPath, toWebSocketUrl } from "@barbarcode/protocol";
import type { Transport, TransportHandlers } from "./types";

export const DEFAULT_RELAY_URL = "https://scan.barbarcode.yukai.dev";

/**
 * Connects outbound to the hosted relay (a Cloudflare Worker). Works behind any NAT or firewall
 * and needs nothing installed. The relay only ever sees encrypted frames.
 */
export async function connectRelay(
  relayUrl: string,
  sessionId: string,
  on: TransportHandlers,
): Promise<Transport> {
  const url = toWebSocketUrl(relayUrl) + socketPath(sessionId, "host");
  let ws: WebSocket;
  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () =>
    new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      ws = socket;
      socket.onopen = () => {
        if (attempt > 0) on.notice("Reconnected to relay", "info");
        attempt = 0;
        resolve();
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const frame = parseWireFrame(event.data);
        if (frame?.t === "sys") on.phones(frame.phones);
        else if (frame) on.frame(event.data);
      };
      socket.onerror = () => reject(new Error(`Could not connect to relay ${relayUrl}`));
      socket.onclose = (event) => {
        if (closed || ws !== socket) return;
        if (event.code === 4001) {
          on.notice("Another barbarcode took over this session", "warn");
          return;
        }
        on.phones(0);
        const delay = Math.min(15_000, 500 * 2 ** attempt++);
        on.notice(`Lost relay connection, retrying in ${Math.round(delay / 1000)}s…`, "warn");
        timer = setTimeout(() => open().catch(() => undefined), delay);
      };
    });

  await open();

  return {
    baseUrl: relayUrl.replace(/\/+$/, ""),
    label: `relay ${new URL(relayUrl).host}`,
    send: (frame) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(frame);
    },
    close: async () => {
      closed = true;
      clearTimeout(timer);
      ws.close(1000, "bye");
    },
  };
}
