import { randomToken } from "./crypto";

/** 16 random bytes, base64url without padding. */
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{22}$/;
/** 32 random bytes, base64url without padding. */
export const KEY_RE = /^[A-Za-z0-9_-]{43}$/;

export type Role = "host" | "phone";

export interface Pairing {
  sessionId: string;
  key: string;
}

export function createPairing(): Pairing {
  return { sessionId: randomToken(16), key: randomToken(32) };
}

/**
 * The URL encoded in the QR code. The key lives in the fragment, which browsers never send to
 * the server, so whoever serves the page (relay, tunnel) cannot read or forge messages.
 */
export function pairingUrl(baseUrl: string, { sessionId, key }: Pairing): string {
  return `${baseUrl.replace(/\/+$/, "")}/s/${sessionId}#${key}`;
}

export function parsePairingLocation(pathname: string, hash: string): Pairing | null {
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname);
  const sessionId = match?.[1];
  const key = hash.replace(/^#/, "");
  if (!sessionId || !SESSION_ID_RE.test(sessionId) || !KEY_RE.test(key)) return null;
  return { sessionId, key };
}

export function socketPath(sessionId: string, role: Role): string {
  return `/ws/${sessionId}?role=${role}`;
}

/** http(s)://host/base -> ws(s)://host/base */
export function toWebSocketUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/^http/, "ws");
}
