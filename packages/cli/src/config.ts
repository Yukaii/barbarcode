import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import { compilePattern, PatternError, type Step } from "./keys/pattern";

export interface Profile {
  name: string;
  pattern: string;
  steps: Step[];
}

export interface Config {
  /** null when running on built-in defaults. */
  path: string | null;
  profiles: Profile[];
  defaultProfile: string;
}

export class ConfigError extends Error {}

const BUILTIN_PROFILES: Record<string, string> = {
  enter: "{barcode}{enter}",
  tab: "{barcode}{tab}",
  plain: "{barcode}",
};

export const CONFIG_TEMPLATE = `# barbarcode keystroke profiles.
# Pick one with \`barbarcode -s <name>\`, or switch live from the phone.

# Profile used when -s is not given (defaults to the first one below).
default = "inventory"

[profiles]
# Type the barcode, then press Enter.
inventory = "{barcode}{enter}"

# Press F4, type the barcode, press Enter.
price_check = "{f4}{barcode}{enter}"

# Fill a two-field form.
data_entry = "SKU:{barcode}{tab}Quantity:"

# Wait 500 ms, press F5, type the barcode, Tab, 1, Enter.
complex_input = "{delay:500}{f5}{barcode}{tab}1{enter}"

# Paste into a search box: focus it with Cmd/Ctrl+K, type, submit.
search = "{cmd+k}{delay:150}{barcode}{enter}"

# Syntax
#   {barcode}             the scanned value (always typed literally)
#   {enter} {tab} {esc} {space} {backspace} {delete}
#   {up} {down} {left} {right} {home} {end} {pageup} {pagedown} {f1}…{f24}
#   {ctrl+s} {cmd+shift+z} {alt+tab}   modifiers: ctrl shift alt/option cmd/meta/win
#   {key:F4}              same as {f4} (0.1 syntax)
#   {delay:250}           wait, in milliseconds
#   {{ and }}             literal braces
`;

function configCandidates(): string[] {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return [
    path.resolve("barbarcode.toml"),
    path.resolve("config.toml"), // 0.1 location
    path.join(xdg, "barbarcode", "config.toml"),
  ];
}

export async function loadConfig(explicitPath?: string): Promise<Config> {
  const file = explicitPath ? path.resolve(explicitPath) : configCandidates().find(existsSync);
  if (explicitPath && !existsSync(file as string)) {
    throw new ConfigError(`Config file not found: ${file}`);
  }
  if (!file) return buildConfig(null, BUILTIN_PROFILES, "enter");

  let data: Record<string, unknown>;
  try {
    data = parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new ConfigError(`Could not parse ${file}: ${(error as Error).message}`);
  }
  // `[sessions]` is the 0.1 name for `[profiles]`.
  const table = { ...asTable(data.sessions), ...asTable(data.profiles) };
  const raw: Record<string, string> = {};
  for (const [name, value] of Object.entries(table)) {
    if (typeof value !== "string")
      throw new ConfigError(`${file}: profile "${name}" must be a string`);
    raw[name] = value;
  }
  if (Object.keys(raw).length === 0) {
    throw new ConfigError(
      `${file}: no profiles found. Add a [profiles] table (see \`barbarcode init\`).`,
    );
  }
  const fallback = Object.keys(raw)[0] as string;
  const preferred = typeof data.default === "string" ? data.default : fallback;
  return buildConfig(file, raw, preferred);
}

function asTable(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildConfig(file: string | null, raw: Record<string, string>, preferred: string): Config {
  const profiles = Object.entries(raw).map(([name, pattern]) => {
    try {
      return { name, pattern, steps: compilePattern(pattern) };
    } catch (error) {
      if (error instanceof PatternError) {
        throw new ConfigError(`${file ?? "built-in"}: profile "${name}": ${error.message}`);
      }
      throw error;
    }
  });
  if (!raw[preferred]) {
    throw new ConfigError(`${file}: default profile "${preferred}" is not defined`);
  }
  return { path: file, profiles, defaultProfile: preferred };
}

export async function writeConfigTemplate(target = "barbarcode.toml"): Promise<string> {
  const file = path.resolve(target);
  if (existsSync(file)) throw new ConfigError(`${file} already exists; not overwriting it.`);
  await writeFile(file, CONFIG_TEMPLATE, "utf8");
  return file;
}
