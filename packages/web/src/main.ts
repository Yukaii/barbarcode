import "./styles.css";
import {
  type HostMessage,
  type Pairing,
  type ProfileInfo,
  parsePairingLocation,
  randomToken,
} from "@barbarcode/protocol";
import { beep, keepAwake, unlockAudio } from "./feedback";
import { Link, type LinkState } from "./link";
import { CameraError, CameraScanner } from "./scanner";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type ScanStatus = "queued" | "sent" | "typed" | "failed";
interface ScanEntry {
  id: string;
  code: string;
  format: string;
  status: ScanStatus;
  error?: string;
  el: HTMLLIElement;
}

const MAX_HISTORY = 30;

/**
 * The key arrives in the URL fragment. Move it into sessionStorage and strip it from the address
 * bar, so it doesn't end up in screenshots, shared links or browser history, while a reload in
 * the same tab keeps working.
 */
function readPairing(): Pairing | null {
  const fromUrl = parsePairingLocation(location.pathname, location.hash);
  const storageKey = `barbarcode:${location.pathname}`;
  try {
    if (fromUrl) {
      sessionStorage.setItem(storageKey, fromUrl.key);
      history.replaceState(null, "", location.pathname);
      return fromUrl;
    }
    const key = sessionStorage.getItem(storageKey);
    return key ? parsePairingLocation(location.pathname, `#${key}`) : null;
  } catch {
    return fromUrl;
  }
}

function prettyFormat(format: string): string {
  const known: Record<string, string> = {
    qr_code: "QR",
    data_matrix: "Data Matrix",
    manual: "Manual",
  };
  return known[format] ?? format.toUpperCase().replace(/_/g, "-");
}

function run(pairing: Pairing) {
  $("scanner").hidden = false;

  const statusDot = $("status-dot");
  const statusText = $("status-text");
  const profilesEl = $("profiles");
  const historyEl = $<HTMLOListElement>("history");
  const reticle = $("reticle");
  const torchButton = $<HTMLButtonElement>("torch");
  const cameraPanel = $("camera-panel");

  let paired = false;
  let profiles: ProfileInfo[] = [];
  let activeProfile = "";
  const scans = new Map<string, ScanEntry>();

  const setStatus = (state: string, text: string) => {
    statusDot.dataset.state = state;
    statusText.textContent = text;
  };

  const onState = (state: LinkState) => {
    if (state.kind !== "online") paired = false;
    switch (state.kind) {
      case "connecting":
        return setStatus("connecting", "Connecting…");
      case "waiting":
        return setStatus("waiting", "Waiting for your computer…");
      case "online":
        return setStatus("connecting", "Pairing…");
      case "offline":
        return setStatus("offline", "Connection lost, retrying…");
    }
  };

  const renderEntry = (entry: ScanEntry) => {
    entry.el.dataset.status = entry.status;
    const label = {
      queued: "waiting to send",
      sent: "sending…",
      typed: "typed",
      failed: entry.error ? `failed: ${entry.error}` : "failed",
    }[entry.status];
    entry.el.replaceChildren(
      Object.assign(document.createElement("span"), { className: "code", textContent: entry.code }),
      Object.assign(document.createElement("span"), {
        className: "meta",
        textContent: `${prettyFormat(entry.format)} · ${label}`,
      }),
    );
  };

  const sendScan = async (entry: ScanEntry) => {
    if (!paired) return;
    const ok = await link.send({ t: "scan", id: entry.id, code: entry.code, format: entry.format });
    if (ok && entry.status === "queued") {
      entry.status = "sent";
      renderEntry(entry);
    }
  };

  const submit = (code: string, format: string) => {
    const entry: ScanEntry = {
      id: randomToken(9),
      code,
      format,
      status: "queued",
      el: document.createElement("li"),
    };
    entry.el.addEventListener("click", () => submit(entry.code, entry.format));
    entry.el.title = "Tap to send again";
    scans.set(entry.id, entry);
    historyEl.prepend(entry.el);
    while (historyEl.children.length > MAX_HISTORY) historyEl.lastElementChild?.remove();
    renderEntry(entry);
    void sendScan(entry);
  };

  const renderProfiles = () => {
    profilesEl.replaceChildren(
      ...profiles.map((profile) => {
        const button = document.createElement("button");
        button.type = "button";
        button.role = "radio";
        button.className = "chip";
        button.ariaChecked = String(profile.name === activeProfile);
        button.title = profile.pattern;
        button.textContent = profile.name;
        button.addEventListener("click", () => {
          void link.send({ t: "profile", name: profile.name });
        });
        return button;
      }),
    );
    const active = profiles.find((p) => p.name === activeProfile);
    profilesEl.dataset.pattern = active?.pattern ?? "";
  };

  const onMessage = (message: HostMessage) => {
    switch (message.t) {
      case "hello": {
        paired = true;
        profiles = message.profiles;
        activeProfile = message.active;
        renderProfiles();
        setStatus("ready", `Typing on ${message.host}`);
        // Anything scanned while disconnected goes out now. The computer ignores duplicate ids.
        for (const entry of scans.values()) {
          if (entry.status === "queued" || entry.status === "sent") void sendScan(entry);
        }
        return;
      }
      case "profile":
        activeProfile = message.active;
        return renderProfiles();
      case "ack": {
        const entry = scans.get(message.id);
        if (!entry) return;
        entry.status = message.ok ? "typed" : "failed";
        entry.error = message.error;
        if (!message.ok) beep(false);
        return renderEntry(entry);
      }
    }
  };

  const link = new Link(pairing, location.origin, { state: onState, message: onMessage });
  void link.start();

  const flash = () => {
    reticle.classList.remove("hit");
    void reticle.offsetWidth; // restart the CSS animation
    reticle.classList.add("hit");
  };

  const scanner = new CameraScanner($<HTMLVideoElement>("video"), ({ value, format }) => {
    beep();
    flash();
    submit(value, format);
  });

  const startCamera = async () => {
    cameraPanel.hidden = true;
    try {
      await scanner.start();
      torchButton.hidden = !scanner.torchSupported;
      void keepAwake();
    } catch (error) {
      $("camera-message").textContent =
        error instanceof CameraError ? error.message : `Camera failed: ${String(error)}`;
      $<HTMLButtonElement>("camera-start").hidden =
        error instanceof CameraError && error.reason === "insecure";
      cameraPanel.hidden = false;
    }
  };

  $("camera-start").addEventListener("click", () => {
    unlockAudio();
    void startCamera();
  });
  document.addEventListener("pointerdown", unlockAudio, { once: true });

  torchButton.addEventListener("click", async () => {
    const on = torchButton.ariaPressed !== "true";
    await scanner.setTorch(on).catch(() => undefined);
    torchButton.ariaPressed = String(on);
  });

  $<HTMLFormElement>("manual").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>("manual-input");
    const code = input.value.trim();
    if (!code) return;
    submit(code, "manual");
    input.value = "";
  });

  void startCamera();
}

const pairing = readPairing();
if (pairing) run(pairing);
else $("intro").hidden = false;
