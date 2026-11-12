import { DurableObject } from "cloudflare:workers";
import {
  MAX_FRAME_BYTES,
  type Role,
  SESSION_ID_RE,
  type SystemMessage,
} from "@barbarcode/protocol";

const MAX_PHONES = 4;
const WS_PATH = /^\/ws\/([^/]+)$/;

/**
 * A pairing room: at most one host (the CLI) and a few phones.
 *
 * The room is a dumb pipe. Every phone->host and host->phone payload is AES-GCM encrypted with a
 * key that only exists in the QR code's URL fragment, so the relay can neither read barcodes nor
 * inject keystrokes. The only thing it says itself is who is online (`sys` frames).
 *
 * Uses the WebSocket Hibernation API, so an idle paired session costs nothing.
 */
export class Room extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const role = new URL(request.url).searchParams.get("role");
    if (role !== "host" && role !== "phone") {
      return new Response("role must be host or phone", { status: 400 });
    }
    if (role === "phone" && this.sockets("phone").length >= MAX_PHONES) {
      return new Response("Too many phones in this session", { status: 429 });
    }
    if (role === "host") {
      // A restarted CLI reuses its session; the newest host connection wins.
      for (const old of this.sockets("host")) old.close(4001, "Replaced by a newer host");
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [role]);
    this.announce();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > MAX_FRAME_BYTES) {
      ws.close(1009, "Frame rejected");
      return;
    }
    const target: Role = this.roleOf(ws) === "host" ? "phone" : "host";
    for (const peer of this.sockets(target)) peer.send(message);
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
    this.announce(ws);
  }

  override async webSocketError(ws: WebSocket) {
    this.announce(ws);
  }

  private roleOf(ws: WebSocket): Role {
    return this.ctx.getTags(ws)[0] === "host" ? "host" : "phone";
  }

  private sockets(role: Role, except?: WebSocket): WebSocket[] {
    return this.ctx
      .getWebSockets(role)
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  /** Tells everyone in the room who is currently connected. */
  private announce(leaving?: WebSocket) {
    const hosts = this.sockets("host", leaving);
    const phones = this.sockets("phone", leaving);
    const notice: SystemMessage = { t: "sys", host: hosts.length > 0, phones: phones.length };
    const frame = JSON.stringify(notice);
    for (const ws of [...hosts, ...phones]) ws.send(frame);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "barbarcode-relay" });
    }
    const sessionId = WS_PATH.exec(url.pathname)?.[1];
    if (sessionId !== undefined) {
      if (!SESSION_ID_RE.test(sessionId)) return new Response("Bad session id", { status: 400 });
      return env.ROOM.get(env.ROOM.idFromName(sessionId)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
