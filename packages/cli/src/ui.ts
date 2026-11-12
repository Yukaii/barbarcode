import { styleText } from "node:util";
import { renderUnicodeCompact } from "uqr";

type Style = Parameters<typeof styleText>[0];
const paint = (style: Style, text: string) =>
  process.stdout.isTTY ? styleText(style, text) : text;

export const dim = (t: string) => paint("dim", t);
export const bold = (t: string) => paint("bold", t);
export const green = (t: string) => paint("green", t);
export const yellow = (t: string) => paint("yellow", t);
export const red = (t: string) => paint("red", t);
export const cyan = (t: string) => paint("cyan", t);

const time = () => dim(new Date().toLocaleTimeString([], { hour12: false }));

export function log(message: string) {
  console.log(`  ${time()}  ${message}`);
}

export function printPairing(opts: {
  version: string;
  url: string;
  rows: Array<[string, string]>;
}) {
  const qr = renderUnicodeCompact(opts.url, { border: 2 })
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  const width = Math.max(...opts.rows.map(([k]) => k.length));
  console.log();
  console.log(`  ${bold("barbarcode")} ${dim(opts.version)}`);
  console.log();
  console.log(qr);
  console.log();
  console.log(`  Scan with your phone's camera, or open:`);
  console.log(`  ${cyan(opts.url)}`);
  console.log();
  for (const [key, value] of opts.rows) console.log(`  ${dim(key.padEnd(width))}  ${value}`);
  console.log();
  console.log(dim("  Waiting for a phone… (Ctrl+C to quit)"));
  console.log();
}

export function fail(message: string): never {
  console.error(`\n  ${red("✗")} ${message.replace(/\n/g, "\n    ")}\n`);
  process.exit(1);
}
