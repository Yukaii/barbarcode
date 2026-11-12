import {
  createPairing,
  type HostMessage,
  importKey,
  type PhoneMessage,
  parseWireFrame,
  type SealedFrame,
  seal,
  unseal,
} from "@barbarcode/protocol";
import { describe, expect, it } from "vitest";
import { HostSession } from "./host";
import type { Action } from "./keys/pattern";
import { compilePattern } from "./keys/pattern";

async function setup(driverImpl?: (a: Action[]) => Promise<void>) {
  const { sessionId, key } = createPairing();
  const k = await importKey(key);
  const typed: Action[][] = [];
  const outbox: string[] = [];
  const host = new HostSession({
    sessionId,
    key: k,
    hostName: "test-mac",
    profiles: [
      { name: "enter", pattern: "{barcode}{enter}", steps: compilePattern("{barcode}{enter}") },
      { name: "tab", pattern: "{barcode}{tab}", steps: compilePattern("{barcode}{tab}") },
    ],
    activeProfile: "enter",
    driver: {
      name: "fake",
      type: driverImpl ?? (async (a) => void typed.push(a)),
    },
    send: (f) => outbox.push(f),
  });
  const fromPhone = async (m: PhoneMessage) =>
    host.receive(await seal(k, sessionId, "phone->host", m));
  const replies = async () =>
    Promise.all(
      outbox
        .splice(0)
        .map(
          async (f) =>
            (await unseal(
              k,
              sessionId,
              "host->phone",
              parseWireFrame(f) as SealedFrame,
            )) as HostMessage,
        ),
    );
  return { host, typed, fromPhone, replies, sessionId };
}

describe("HostSession", () => {
  it("answers hello with profiles", async () => {
    const { fromPhone, replies } = await setup();
    await fromPhone({ t: "hello", v: 1 });
    expect(await replies()).toEqual([
      {
        t: "hello",
        v: 1,
        host: "test-mac",
        active: "enter",
        profiles: [
          { name: "enter", pattern: "{barcode}{enter}" },
          { name: "tab", pattern: "{barcode}{tab}" },
        ],
      },
    ]);
  });

  it("types a scan with the active profile and acks it", async () => {
    const { fromPhone, replies, typed } = await setup();
    await fromPhone({ t: "profile", name: "tab" });
    await fromPhone({ t: "scan", id: "a", code: "42", format: "ean_13" });
    expect(typed).toEqual([
      [
        { kind: "text", text: "42" },
        { kind: "key", key: "tab", modifiers: [] },
      ],
    ]);
    expect(await replies()).toEqual([
      { t: "profile", active: "tab" },
      { t: "ack", id: "a", ok: true },
    ]);
  });

  it("does not type a resent scan twice", async () => {
    const { fromPhone, replies, typed } = await setup();
    await fromPhone({ t: "scan", id: "a", code: "1", format: "x" });
    await fromPhone({ t: "scan", id: "a", code: "1", format: "x" });
    expect(typed).toHaveLength(1);
    expect(await replies()).toEqual([
      { t: "ack", id: "a", ok: true },
      { t: "ack", id: "a", ok: true },
    ]);
  });

  it("reports driver failures to the phone", async () => {
    const { fromPhone, replies } = await setup(async () => {
      throw new Error("boom");
    });
    await fromPhone({ t: "scan", id: "a", code: "1", format: "x" });
    expect(await replies()).toEqual([
      { t: "ack", id: "a", ok: false, error: "Typing failed on the computer" },
    ]);
  });

  it("ignores frames it cannot decrypt", async () => {
    const { host, typed } = await setup();
    const other = createPairing();
    const forged = await seal(await importKey(other.key), other.sessionId, "phone->host", {
      t: "scan",
      id: "x",
      code: "evil",
      format: "x",
    });
    await host.receive(forged);
    expect(typed).toEqual([]);
  });
});
