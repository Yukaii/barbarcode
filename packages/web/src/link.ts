import {
  type HostMessage,
  importKey,
  type Pairing,
  type PhoneMessage,
  parseHostMessage,
  parseWireFrame,
  seal,
  socketPath,
  toWebSocketUrl,
  unseal,
} from "@barbarcode/protocol";

export type LinkState =
  | { kind: "connecting" }
  | { kind: "waiting" } // connected to the relay, computer not there (yet)
  | { kind: "online" } // computer is there; handshake in flight
  | { kind: "offline"; retryInMs: number };

interface Handlers {
  state(state: LinkState): void;
  message(message: HostMessage): void;
}

/** The phone side of a pairing: a self-healing WebSocket carrying end-to-end encrypted frames. */
export class Link {
  private ws: WebSocket | null = null;
  private key: CryptoKey | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly pairing: Pairing,
    private readonly baseUrl: string,
    private readonly on: Handlers,
  ) {}

  async start() {
    this.key = await importKey(this.pairing.key);
    this.connect();
    // Phones drop sockets aggressively when the screen locks; reconnect as soon as we're back.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.ws?.readyState !== WebSocket.OPEN) {
        this.reconnectNow();
      }
    });
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async send(message: PhoneMessage): Promise<boolean> {
    const ws = this.ws;
    if (!this.key || !ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(await seal(this.key, this.pairing.sessionId, "phone->host", message));
    return true;
  }

  private reconnectNow() {
    clearTimeout(this.timer);
    this.attempt = 0;
    this.ws?.close();
    this.connect();
  }

  private connect() {
    this.on.state({ kind: "connecting" });
    const url = toWebSocketUrl(this.baseUrl) + socketPath(this.pairing.sessionId, "phone");
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
    };
    ws.onmessage = async (event) => {
      if (typeof event.data !== "string" || !this.key) return;
      const frame = parseWireFrame(event.data);
      if (!frame) return;
      if (frame.t === "sys") {
        this.on.state({ kind: frame.host ? "online" : "waiting" });
        if (frame.host) await this.send({ t: "hello", v: 1 });
        return;
      }
      const message = parseHostMessage(
        await unseal(this.key, this.pairing.sessionId, "host->phone", frame),
      );
      if (message) this.on.message(message);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const retryInMs = Math.min(15_000, 500 * 2 ** this.attempt++);
      this.on.state({ kind: "offline", retryInMs });
      this.timer = setTimeout(() => this.connect(), retryInMs);
    };
  }
}
