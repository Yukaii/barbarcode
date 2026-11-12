export const PROTOCOL_VERSION = 1;
/** Upper bound for any frame on the wire. Barcodes are tiny; this keeps abuse cheap to reject. */
export const MAX_FRAME_BYTES = 8 * 1024;
export const MAX_BARCODE_LENGTH = 2048;

export interface ProfileInfo {
  name: string;
  pattern: string;
}

/** Phone -> computer (always end-to-end encrypted). */
export type PhoneMessage =
  | { t: "hello"; v: number }
  | { t: "scan"; id: string; code: string; format: string }
  | { t: "profile"; name: string };

/** Computer -> phone (always end-to-end encrypted). */
export type HostMessage =
  | { t: "hello"; v: number; host: string; profiles: ProfileInfo[]; active: string }
  | { t: "ack"; id: string; ok: boolean; error?: string }
  | { t: "profile"; active: string };

/**
 * Plaintext presence notices produced by the relay (or the local server) itself.
 * They carry no user data, only who is online.
 */
export interface SystemMessage {
  t: "sys";
  host: boolean;
  phones: number;
}

export interface SealedFrame {
  t: "enc";
  iv: string;
  ct: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 256): v is string => typeof v === "string" && v.length <= max;

export function parsePhoneMessage(v: unknown): PhoneMessage | null {
  if (!isObj(v)) return null;
  switch (v.t) {
    case "hello":
      return typeof v.v === "number" ? { t: "hello", v: v.v } : null;
    case "scan":
      if (!isStr(v.id, 64) || !isStr(v.format, 64) || !isStr(v.code, MAX_BARCODE_LENGTH)) {
        return null;
      }
      if (v.code.length === 0) return null;
      return { t: "scan", id: v.id, code: v.code, format: v.format };
    case "profile":
      return isStr(v.name, 128) ? { t: "profile", name: v.name } : null;
    default:
      return null;
  }
}

export function parseHostMessage(v: unknown): HostMessage | null {
  if (!isObj(v)) return null;
  switch (v.t) {
    case "hello": {
      if (typeof v.v !== "number" || !isStr(v.host) || !isStr(v.active, 128)) return null;
      if (!Array.isArray(v.profiles)) return null;
      const profiles: ProfileInfo[] = [];
      for (const p of v.profiles) {
        if (!isObj(p) || !isStr(p.name, 128) || !isStr(p.pattern, 1024)) return null;
        profiles.push({ name: p.name, pattern: p.pattern });
      }
      return { t: "hello", v: v.v, host: v.host, profiles, active: v.active };
    }
    case "ack":
      if (!isStr(v.id, 64) || typeof v.ok !== "boolean") return null;
      return isStr(v.error, 512)
        ? { t: "ack", id: v.id, ok: v.ok, error: v.error }
        : { t: "ack", id: v.id, ok: v.ok };
    case "profile":
      return isStr(v.active, 128) ? { t: "profile", active: v.active } : null;
    default:
      return null;
  }
}

/** Parses a raw wire frame into either a relay notice or a sealed (encrypted) frame. */
export function parseWireFrame(raw: string): SystemMessage | SealedFrame | null {
  if (raw.length > MAX_FRAME_BYTES) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  if (v.t === "sys" && typeof v.host === "boolean" && typeof v.phones === "number") {
    return { t: "sys", host: v.host, phones: v.phones };
  }
  if (v.t === "enc" && isStr(v.iv, 32) && isStr(v.ct, MAX_FRAME_BYTES)) {
    return { t: "enc", iv: v.iv, ct: v.ct };
  }
  return null;
}
