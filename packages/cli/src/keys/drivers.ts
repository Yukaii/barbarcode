import { findExecutable, run } from "../exec";
import { type Action, describe, type Modifier } from "./pattern";

/**
 * Sends keystrokes to whatever window has focus.
 *
 * Every driver shells out to a tool the OS already has (or one package away), so the CLI needs no
 * native Node addon and `npx barbarcode` works on any Node version.
 */
export interface KeyDriver {
  readonly name: string;
  type(actions: Action[]): Promise<void>;
}

export class KeyDriverError extends Error {
  constructor(
    message: string,
    /** Short explanation shown on the phone. */
    readonly short = message,
  ) {
    super(message);
  }
}

export type DriverName = "auto" | "macos" | "windows" | "xdotool" | "wtype" | "print";
export const DRIVER_NAMES: DriverName[] = ["auto", "macos", "windows", "xdotool", "wtype", "print"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fKeys = (max: number, format: (n: number) => string | number) =>
  Object.fromEntries(Array.from({ length: max }, (_, i) => [`f${i + 1}`, format(i + 1)]));

// ---------------------------------------------------------------------------------------- macOS

const MAC_KEY_CODES: Record<string, number> = {
  enter: 36,
  tab: 48,
  escape: 53,
  space: 49,
  backspace: 51,
  delete: 117,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  // biome-ignore format: lookup table
  ...Object.fromEntries([122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111, 105, 107, 113, 106, 64, 79, 80, 90].map((code, i) => [`f${i + 1}`, code])),
};
const MAC_MODIFIERS: Record<Modifier, string> = {
  ctrl: "control down",
  shift: "shift down",
  alt: "option down",
  meta: "command down",
};

const appleString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function appleScriptFor(actions: Action[]): string {
  const lines = ['tell application "System Events"'];
  for (const a of actions) {
    if (a.kind === "text") lines.push(`  keystroke ${appleString(a.text)}`);
    else if (a.kind === "delay") lines.push(`  delay ${a.ms / 1000}`);
    else {
      const using = a.modifiers.length
        ? ` using {${a.modifiers.map((m) => MAC_MODIFIERS[m]).join(", ")}}`
        : "";
      const code = MAC_KEY_CODES[a.key];
      if (code !== undefined) lines.push(`  key code ${code}${using}`);
      else if (a.key.length === 1) lines.push(`  keystroke ${appleString(a.key)}${using}`);
      else throw new KeyDriverError(`macOS cannot press ${a.key.toUpperCase()}`);
    }
  }
  lines.push("end tell");
  return lines.join("\n");
}

const macos: KeyDriver = {
  name: "macOS (osascript)",
  async type(actions) {
    const { code, stderr } = await run("osascript", ["-"], appleScriptFor(actions));
    if (code === 0) return;
    if (/not allowed|assistive|1002|-25211/i.test(stderr)) {
      throw new KeyDriverError(
        "macOS blocked the keystrokes. Open System Settings → Privacy & Security → Accessibility " +
          "and enable your terminal app, then scan again.",
        "Allow Accessibility access for the terminal on your Mac",
      );
    }
    throw new KeyDriverError(`osascript failed: ${stderr.trim()}`, "Typing failed on the computer");
  },
};

// -------------------------------------------------------------------------------------- Windows

const SENDKEYS_KEYS: Record<string, string> = {
  enter: "{ENTER}",
  tab: "{TAB}",
  escape: "{ESC}",
  space: " ",
  backspace: "{BACKSPACE}",
  delete: "{DELETE}",
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
  home: "{HOME}",
  end: "{END}",
  pageup: "{PGUP}",
  pagedown: "{PGDN}",
  ...fKeys(16, (n) => `{F${n}}`),
};
const SENDKEYS_MODIFIERS: Partial<Record<Modifier, string>> = { ctrl: "^", shift: "+", alt: "%" };

/** SendKeys treats + ^ % ~ ( ) { } [ ] as syntax; wrap them in braces to type them literally. */
export const escapeSendKeys = (text: string) => text.replace(/[+^%~(){}[\]]/g, (c) => `{${c}}`);

export function powerShellFor(actions: Action[]): string {
  const lines = ["Add-Type -AssemblyName System.Windows.Forms"];
  const send = (keys: string) =>
    lines.push(`[System.Windows.Forms.SendKeys]::SendWait('${keys.replace(/'/g, "''")}')`);
  for (const a of actions) {
    if (a.kind === "text") send(escapeSendKeys(a.text));
    else if (a.kind === "delay") lines.push(`Start-Sleep -Milliseconds ${a.ms}`);
    else {
      const prefix = a.modifiers
        .map((m) => {
          const p = SENDKEYS_MODIFIERS[m];
          if (!p) throw new KeyDriverError("Windows SendKeys cannot press the Windows key");
          return p;
        })
        .join("");
      const key = SENDKEYS_KEYS[a.key] ?? (a.key.length === 1 ? escapeSendKeys(a.key) : null);
      if (!key) throw new KeyDriverError(`Windows cannot press ${a.key.toUpperCase()}`);
      send(prefix + key);
    }
  }
  return lines.join("\n");
}

const windows: KeyDriver = {
  name: "Windows (SendKeys)",
  async type(actions) {
    const script = Buffer.from(powerShellFor(actions), "utf16le").toString("base64");
    const { code, stderr } = await run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      script,
    ]);
    if (code !== 0) {
      throw new KeyDriverError(
        `PowerShell failed: ${stderr.trim()}`,
        "Typing failed on the computer",
      );
    }
  },
};

// ---------------------------------------------------------------------------------------- Linux

const X_KEYSYMS: Record<string, string> = {
  enter: "Return",
  tab: "Tab",
  escape: "Escape",
  space: "space",
  backspace: "BackSpace",
  delete: "Delete",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "Prior",
  pagedown: "Next",
  ...fKeys(24, (n) => `F${n}`),
};

type Invocation = string[] | { sleep: number };

export function xdotoolPlan(actions: Action[]): Invocation[] {
  const mods: Record<Modifier, string> = {
    ctrl: "ctrl",
    shift: "shift",
    alt: "alt",
    meta: "super",
  };
  return actions.map((a) => {
    if (a.kind === "delay") return { sleep: a.ms };
    if (a.kind === "text") return ["type", "--clearmodifiers", "--delay", "2", "--", a.text];
    const keysym = X_KEYSYMS[a.key] ?? a.key;
    return ["key", "--clearmodifiers", [...a.modifiers.map((m) => mods[m]), keysym].join("+")];
  });
}

export function wtypePlan(actions: Action[]): Invocation[] {
  const mods: Record<Modifier, string> = { ctrl: "ctrl", shift: "shift", alt: "alt", meta: "logo" };
  return actions.map((a) => {
    if (a.kind === "delay") return { sleep: a.ms };
    if (a.kind === "text") return ["--", a.text];
    const names = a.modifiers.map((m) => mods[m]);
    return [
      ...names.flatMap((m) => ["-M", m]),
      "-k",
      X_KEYSYMS[a.key] ?? a.key,
      ...names.reverse().flatMap((m) => ["-m", m]),
    ];
  });
}

function planDriver(name: string, bin: string, plan: (a: Action[]) => Invocation[]): KeyDriver {
  return {
    name,
    async type(actions) {
      for (const step of plan(actions)) {
        if (!Array.isArray(step)) {
          await sleep(step.sleep);
          continue;
        }
        const { code, stderr } = await run(bin, step);
        if (code !== 0) {
          throw new KeyDriverError(
            `${name} failed: ${stderr.trim()}`,
            "Typing failed on the computer",
          );
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------------------- Print

export function printDriver(log: (line: string) => void): KeyDriver {
  return {
    name: "dry run (prints instead of typing)",
    async type(actions) {
      log(describe(actions));
    },
  };
}

// --------------------------------------------------------------------------------------- Select

export async function createDriver(
  name: DriverName,
  log: (line: string) => void,
): Promise<KeyDriver> {
  const linux = async (bin: "xdotool" | "wtype") => {
    const path = await findExecutable(bin);
    if (!path) {
      throw new KeyDriverError(
        bin === "wtype"
          ? "wtype not found. Install it (e.g. `sudo apt install wtype`) for Wayland sessions."
          : "xdotool not found. Install it (e.g. `sudo apt install xdotool`) for X11 sessions.",
      );
    }
    return bin === "wtype"
      ? planDriver("wtype (Wayland)", path, wtypePlan)
      : planDriver("xdotool (X11)", path, xdotoolPlan);
  };

  switch (name) {
    case "print":
      return printDriver(log);
    case "macos":
      return macos;
    case "windows":
      return windows;
    case "xdotool":
    case "wtype":
      return linux(name);
    case "auto":
      if (process.platform === "darwin") return macos;
      if (process.platform === "win32") return windows;
      if (process.env.WAYLAND_DISPLAY && (await findExecutable("wtype"))) return linux("wtype");
      if (await findExecutable("xdotool")) return linux("xdotool");
      if (process.env.WAYLAND_DISPLAY) return linux("wtype");
      return linux("xdotool");
  }
}
