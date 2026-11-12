// Real EAN-13 encoding, so the barcodes on this page scan (try it with barbarcode).
const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const R = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).join(""));
const G = R.map((p) => [...p].reverse().join(""));
const PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

/** Appends the check digit to 12 digits. */
export function withCheckDigit(twelve) {
  const sum = [...twelve].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return twelve + ((10 - (sum % 10)) % 10);
}

function modules(code) {
  const d = [...code].map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return `${bits}101`;
}

const GUARDS = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);

/** Renders a 13-digit EAN as an SVG string with human-readable digits. */
export function ean13Svg(code) {
  const bits = modules(code);
  const left = 11; // quiet zone, in modules
  const width = left + 95 + 7;
  const bar = 56;
  const guard = 62;
  let rects = "";
  for (let i = 0; i < bits.length; ) {
    if (bits[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (bits[j] === "1") j++;
    const h = GUARDS.has(i) ? guard : bar;
    rects += `<rect x="${left + i}" y="0" width="${j - i}" height="${h}"/>`;
    i = j;
  }
  const text = (x, s, len) =>
    `<text x="${x}" y="${guard + 7}" textLength="${len}" lengthAdjust="spacingAndGlyphs">${s}</text>`;
  return `<svg viewBox="0 0 ${width} ${guard + 9}" role="img" aria-label="EAN-13 barcode ${code}">
    <g fill="currentColor">${rects}</g>
    <g class="digits">${text(2, code[0], 6)}${text(left + 4, code.slice(1, 7), 40)}${text(left + 50, code.slice(7), 40)}</g>
  </svg>`;
}
