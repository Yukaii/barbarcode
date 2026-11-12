import {
  type HostMessage,
  type PhoneMessage,
  PROTOCOL_VERSION,
  parsePhoneMessage,
  parseWireFrame,
  seal,
  unseal,
} from "@barbarcode/protocol";
import type { Profile } from "./config";
import { type KeyDriver, KeyDriverError } from "./keys/drivers";
import { type Action, render } from "./keys/pattern";

export interface HostEvents {
  scan(e: { code: string; format: string; profile: string; actions: Action[] }): void;
  typed(e: { code: string; ms: number }): void;
  failed(e: { code: string; error: Error }): void;
  profile(name: string): void;
  rejected(): void;
}

export interface HostSessionOptions {
  sessionId: string;
  key: CryptoKey;
  hostName: string;
  profiles: Profile[];
  activeProfile: string;
  driver: KeyDriver;
  send(frame: string): void;
  events?: Partial<HostEvents>;
}

type Ack = Extract<HostMessage, { t: "ack" }>;
const REMEMBERED_SCANS = 500;

/**
 * The computer side of a pairing, independent of how frames travel (relay or local server).
 * Decrypts phone messages, types scans one at a time, and acknowledges each scan.
 */
export class HostSession {
  private active: string;
  private queue: Promise<void> = Promise.resolve();
  /** scan id -> ack (undefined while typing). Phones resend unacknowledged scans on reconnect. */
  private readonly results = new Map<string, Ack | undefined>();

  constructor(private readonly opts: HostSessionOptions) {
    this.active = opts.activeProfile;
  }

  get activeProfile() {
    return this.active;
  }

  async receive(raw: string): Promise<void> {
    const frame = parseWireFrame(raw);
    if (frame?.t !== "enc") return;
    const message = parsePhoneMessage(
      await unseal(this.opts.key, this.opts.sessionId, "phone->host", frame),
    );
    if (!message) {
      this.opts.events?.rejected?.();
      return;
    }
    await this.handle(message);
  }

  private async handle(message: PhoneMessage) {
    switch (message.t) {
      case "hello":
        return this.reply({
          t: "hello",
          v: PROTOCOL_VERSION,
          host: this.opts.hostName,
          profiles: this.opts.profiles.map(({ name, pattern }) => ({ name, pattern })),
          active: this.active,
        });
      case "profile":
        if (!this.opts.profiles.some((p) => p.name === message.name)) return;
        this.active = message.name;
        this.opts.events?.profile?.(message.name);
        return this.reply({ t: "profile", active: this.active });
      case "scan":
        return this.scan(message);
    }
  }

  private async scan({ id, code, format }: Extract<PhoneMessage, { t: "scan" }>) {
    if (this.results.has(id)) {
      const previous = this.results.get(id);
      if (previous) await this.reply(previous);
      return; // still typing the first copy
    }
    this.results.set(id, undefined);
    while (this.results.size > REMEMBERED_SCANS) {
      this.results.delete(this.results.keys().next().value as string);
    }

    const profile = this.opts.profiles.find((p) => p.name === this.active);
    if (!profile) return;
    const actions = render(profile.steps, code);
    this.opts.events?.scan?.({ code, format, profile: profile.name, actions });

    // Serialise typing so two quick scans never interleave their keystrokes.
    const done = this.queue.then(async (): Promise<Ack> => {
      const started = performance.now();
      try {
        await this.opts.driver.type(actions);
        this.opts.events?.typed?.({ code, ms: Math.round(performance.now() - started) });
        return { t: "ack", id, ok: true };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.opts.events?.failed?.({ code, error: err });
        const short = err instanceof KeyDriverError ? err.short : "Typing failed on the computer";
        return { t: "ack", id, ok: false, error: short };
      }
    });
    this.queue = done.then(() => undefined);
    const ack = await done;
    this.results.set(id, ack);
    await this.reply(ack);
  }

  private async reply(message: HostMessage) {
    this.opts.send(await seal(this.opts.key, this.opts.sessionId, "host->phone", message));
  }
}
