import type { SealedFrame } from "./messages";

/** Message direction, bound into the AEAD tag so frames cannot be reflected back. */
export type Direction = "phone->host" | "host->phone";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomToken(byteLength: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64Url(key), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function aad(sessionId: string, dir: Direction) {
  return encoder.encode(`barbarcode/v1/${sessionId}/${dir}`);
}

/** Encrypts a message into a wire frame string. */
export async function seal(
  key: CryptoKey,
  sessionId: string,
  dir: Direction,
  message: unknown,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(sessionId, dir) },
    key,
    encoder.encode(JSON.stringify(message)),
  );
  const frame: SealedFrame = { t: "enc", iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
  return JSON.stringify(frame);
}

/** Decrypts a sealed frame. Returns null for anything forged, tampered with, or malformed. */
export async function unseal(
  key: CryptoKey,
  sessionId: string,
  dir: Direction,
  frame: SealedFrame,
): Promise<unknown> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(frame.iv), additionalData: aad(sessionId, dir) },
      key,
      fromBase64Url(frame.ct),
    );
    return JSON.parse(decoder.decode(plain));
  } catch {
    return null;
  }
}
