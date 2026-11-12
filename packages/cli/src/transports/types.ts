export interface TransportHandlers {
  /** An encrypted frame from a phone. */
  frame(raw: string): void;
  /** How many phones are connected right now. */
  phones(count: number): void;
  /** Connectivity problems worth telling the user about (reconnecting, recovered…). */
  notice(message: string, level: "info" | "warn"): void;
}

export interface Transport {
  /** Base URL the phone opens; the QR code points at `${baseUrl}/s/<session>#<key>`. */
  readonly baseUrl: string;
  /** One-line description for the terminal, e.g. "Cloudflare quick tunnel". */
  readonly label: string;
  send(frame: string): void;
  close(): Promise<void>;
}
