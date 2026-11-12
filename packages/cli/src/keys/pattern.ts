/**
 * Keystroke patterns, e.g. `{key:F4}{barcode}{enter}`.
 *
 * A pattern is compiled once at startup (so typos fail fast) into steps. The scanned barcode is
 * substituted *after* compilation and always as literal text: a barcode containing
 * `{key:cmd+q}` types those characters, it never presses the shortcut.
 */

export type Modifier = "ctrl" | "shift" | "alt" | "meta";

/** Normalised key names. Single characters (e.g. "s") are also valid keys. */
export const NAMED_KEYS = [
  "enter",
  "tab",
  "escape",
  "space",
  "backspace",
  "delete",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
] as const;

export type Action =
  | { kind: "text"; text: string }
  | { kind: "key"; key: string; modifiers: Modifier[] }
  | { kind: "delay"; ms: number };

export type Step = Action | { kind: "barcode" };

export class PatternError extends Error {}

const KEY_ALIASES: Record<string, string> = {
  return: "enter",
  esc: "escape",
  bksp: "backspace",
  del: "delete",
  pgup: "pageup",
  pgdn: "pagedown",
  ...Object.fromEntries(NAMED_KEYS.map((k) => [k, k])),
};

const MODIFIER_ALIASES: Record<string, Modifier> = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  opt: "alt",
  option: "alt",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  super: "meta",
  win: "meta",
};

const MAX_DELAY_MS = 60_000;

export function compilePattern(pattern: string): Step[] {
  const steps: Step[] = [];
  let text = "";
  const flush = () => {
    if (text) steps.push({ kind: "text", text });
    text = "";
  };

  for (let i = 0; i < pattern.length; ) {
    const ch = pattern[i] as string;
    const next = pattern[i + 1];
    if ((ch === "{" && next === "{") || (ch === "}" && next === "}")) {
      text += ch; // `{{` and `}}` are literal braces
      i += 2;
    } else if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end < 0) throw new PatternError(`Unclosed "{" at position ${i + 1}`);
      flush();
      steps.push(parseToken(pattern.slice(i + 1, end).trim()));
      i = end + 1;
    } else {
      text += ch;
      i += 1;
    }
  }
  flush();
  return steps;
}

function parseToken(token: string): Step {
  const lower = token.toLowerCase();
  if (lower === "barcode") return { kind: "barcode" };
  if (lower.startsWith("delay:")) {
    const ms = Number(token.slice("delay:".length));
    if (!Number.isInteger(ms) || ms < 0 || ms > MAX_DELAY_MS) {
      throw new PatternError(
        `{${token}}: delay must be a whole number of ms up to ${MAX_DELAY_MS}`,
      );
    }
    return { kind: "delay", ms };
  }
  // `{key:ctrl+s}` and the shorthand `{ctrl+s}` / `{f5}` are equivalent.
  const combo = lower.startsWith("key:") ? token.slice("key:".length) : token;
  try {
    return parseCombo(combo);
  } catch (error) {
    throw new PatternError(`{${token}}: ${(error as Error).message}`);
  }
}

function parseCombo(combo: string): Action {
  // A trailing "+" is the plus key itself, e.g. `ctrl++`.
  const parts = combo.endsWith("++") ? [...combo.slice(0, -2).split("+"), "+"] : combo.split("+");
  const rawKey = (parts.pop() ?? "").trim();
  const modifiers: Modifier[] = [];
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part.trim().toLowerCase()];
    if (!modifier) throw new Error(`unknown modifier "${part}"`);
    if (!modifiers.includes(modifier)) modifiers.push(modifier);
  }
  return { kind: "key", key: normalizeKey(rawKey), modifiers };
}

function normalizeKey(key: string): string {
  const lower = key.toLowerCase();
  const named = KEY_ALIASES[lower];
  if (named) return named;
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower;
  if ([...key].length === 1) return key;
  throw new Error(`unknown key "${key}"`);
}

/** Strips control characters (newlines, GS separators, …) so a barcode can't press keys. */
export function sanitizeBarcode(code: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  return code.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

/** Fills in the barcode and merges adjacent text, producing what a key driver executes. */
export function render(steps: Step[], barcode: string): Action[] {
  const code = sanitizeBarcode(barcode);
  const actions: Action[] = [];
  for (const step of steps) {
    const action: Action = step.kind === "barcode" ? { kind: "text", text: code } : step;
    const last = actions.at(-1);
    if (action.kind === "text") {
      if (!action.text) continue;
      if (last?.kind === "text") {
        actions[actions.length - 1] = { kind: "text", text: last.text + action.text };
        continue;
      }
    }
    actions.push(action);
  }
  return actions;
}

const SYMBOLS: Record<string, string> = {
  enter: "⏎",
  tab: "⇥",
  escape: "⎋",
  backspace: "⌫",
  delete: "⌦",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  space: "␣",
};
const MODIFIER_SYMBOLS: Record<Modifier, string> = { ctrl: "⌃", shift: "⇧", alt: "⌥", meta: "⌘" };

/** Human-readable preview, e.g. `F4 "123" ⏎`. */
export function describe(actions: Action[]): string {
  return actions
    .map((a) => {
      if (a.kind === "text") return JSON.stringify(a.text);
      if (a.kind === "delay") return `(${a.ms}ms)`;
      const key = SYMBOLS[a.key] ?? (a.key.length > 1 ? a.key.toUpperCase() : a.key);
      return a.modifiers.map((m) => MODIFIER_SYMBOLS[m]).join("") + key;
    })
    .join(" ");
}
