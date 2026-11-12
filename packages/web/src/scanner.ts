export interface Detection {
  value: string;
  format: string;
}

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
}

interface NativeDetectorStatic {
  new (options?: { formats?: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

/**
 * Prefers the browser's native BarcodeDetector (Android Chrome) and falls back to ZXing compiled
 * to WebAssembly (iOS Safari, Firefox). The WASM is bundled with the page rather than pulled from
 * a CDN, so self-hosted setups (Tailscale, LAN) work offline.
 */
async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: NativeDetectorStatic }).BarcodeDetector;
  if (native) {
    try {
      const formats = await native.getSupportedFormats();
      if (formats.length > 0) return new native({ formats });
    } catch {
      // fall through to ZXing
    }
  }
  const [{ BarcodeDetector: ZXingDetector, prepareZXingModule }, { default: wasmUrl }] =
    await Promise.all([
      import("barcode-detector/ponyfill"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) =>
        path.endsWith(".wasm") ? wasmUrl : prefix + path,
    },
  });
  return new ZXingDetector();
}

export class CameraScanner {
  private stream: MediaStream | null = null;
  private detector: Detector | null = null;
  private running = false;
  private lastValue = "";
  private lastAt = 0;
  private pausedUntil = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onDetect: (detection: Detection) => void,
    /** The same code is ignored for this long, so holding the phone still doesn't spam. */
    private readonly repeatCooldownMs = 2500,
  ) {}

  async start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraError(
        "insecure",
        "The camera needs a secure (HTTPS) page. Use the relay, Cloudflare or Tailscale mode.",
      );
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
    } catch (error) {
      const name = (error as DOMException).name;
      if (name === "NotAllowedError") {
        throw new CameraError(
          "denied",
          "Camera access was blocked. Allow it in the browser's site settings, then try again.",
        );
      }
      throw new CameraError("unavailable", `Could not open the camera (${name}).`);
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    this.detector ??= await createDetector();
    this.running = true;
    void this.loop();
  }

  get torchSupported(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
    return Boolean(caps?.torch);
  }

  async setTorch(on: boolean) {
    const track = this.stream?.getVideoTracks()[0];
    await track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  }

  stop() {
    this.running = false;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }

  private async loop() {
    while (this.running) {
      const now = performance.now();
      if (
        document.visibilityState === "visible" &&
        now >= this.pausedUntil &&
        this.video.readyState >= 2
      ) {
        try {
          const [hit] = (await this.detector?.detect(this.video)) ?? [];
          if (hit?.rawValue) this.accept({ value: hit.rawValue, format: hit.format });
        } catch {
          // A single bad frame is not interesting.
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private accept(detection: Detection) {
    const now = performance.now();
    if (detection.value === this.lastValue && now - this.lastAt < this.repeatCooldownMs) {
      this.lastAt = now;
      return;
    }
    this.lastValue = detection.value;
    this.lastAt = now;
    this.pausedUntil = now + 700;
    this.onDetect(detection);
  }
}

export class CameraError extends Error {
  constructor(
    readonly reason: "insecure" | "denied" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}
