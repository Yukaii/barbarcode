import { describe, expect, it } from "vitest";
import {
  createPairing,
  importKey,
  pairingUrl,
  parsePairingLocation,
  parsePhoneMessage,
  parseWireFrame,
  type SealedFrame,
  seal,
  unseal,
} from "./index";

describe("pairing", () => {
  it("round-trips through the QR URL", () => {
    const pairing = createPairing();
    const url = new URL(pairingUrl("https://relay.example/", pairing));
    expect(url.pathname).toBe(`/s/${pairing.sessionId}`);
    expect(parsePairingLocation(url.pathname, url.hash)).toEqual(pairing);
  });

  it("rejects malformed locations", () => {
    expect(parsePairingLocation("/s/short", "#nope")).toBeNull();
    expect(parsePairingLocation("/", "")).toBeNull();
  });
});

describe("sealed frames", () => {
  it("encrypts and decrypts", async () => {
    const { sessionId, key } = createPairing();
    const k = await importKey(key);
    const raw = await seal(k, sessionId, "phone->host", { t: "hello", v: 1 });
    const frame = parseWireFrame(raw) as SealedFrame;
    expect(frame.t).toBe("enc");
    expect(raw).not.toContain("hello");
    expect(await unseal(k, sessionId, "phone->host", frame)).toEqual({ t: "hello", v: 1 });
  });

  it("rejects frames under the wrong key, session, or direction", async () => {
    const a = createPairing();
    const b = createPairing();
    const ka = await importKey(a.key);
    const kb = await importKey(b.key);
    const frame = parseWireFrame(
      await seal(ka, a.sessionId, "phone->host", { t: "x" }),
    ) as SealedFrame;
    expect(await unseal(kb, a.sessionId, "phone->host", frame)).toBeNull();
    expect(await unseal(ka, b.sessionId, "phone->host", frame)).toBeNull();
    expect(await unseal(ka, a.sessionId, "host->phone", frame)).toBeNull();
  });

  it("rejects tampered ciphertext", async () => {
    const { sessionId, key } = createPairing();
    const k = await importKey(key);
    const frame = parseWireFrame(
      await seal(k, sessionId, "phone->host", { t: "x" }),
    ) as SealedFrame;
    const flipped = frame.ct.startsWith("A") ? `B${frame.ct.slice(1)}` : `A${frame.ct.slice(1)}`;
    expect(await unseal(k, sessionId, "phone->host", { ...frame, ct: flipped })).toBeNull();
  });
});

describe("message validation", () => {
  it("accepts a valid scan and rejects bad ones", () => {
    expect(parsePhoneMessage({ t: "scan", id: "1", code: "123", format: "ean_13" })).toEqual({
      t: "scan",
      id: "1",
      code: "123",
      format: "ean_13",
    });
    expect(parsePhoneMessage({ t: "scan", id: "1", code: "", format: "x" })).toBeNull();
    expect(parsePhoneMessage({ t: "scan", id: 1, code: "1", format: "x" })).toBeNull();
    expect(parsePhoneMessage({ t: "nope" })).toBeNull();
  });

  it("parses relay notices", () => {
    expect(parseWireFrame('{"t":"sys","host":true,"phones":2}')).toEqual({
      t: "sys",
      host: true,
      phones: 2,
    });
    expect(parseWireFrame("not json")).toBeNull();
  });
});
