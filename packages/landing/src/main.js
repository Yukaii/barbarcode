import "./style.css";
import { ean13Svg, withCheckDigit } from "./ean13.js";

const ITEMS = [
  { name: "Graphite pencil, HB", price: "1.20", code: withCheckDigit("400638133393") },
  { name: "Dotted notebook, A5", price: "6.50", code: withCheckDigit("590123412345") },
  { name: "Design Patterns (book)", price: "54.99", code: withCheckDigit("978020163361") },
];
const MAX_ROWS = 4;

const $ = (id) => document.getElementById(id);
const tag = $("tag");
const rows = $("rows");
const keyCode = $("key-code");
const keys = Object.fromEntries(
  [...document.querySelectorAll(".keystrip [data-key]")].map((k) => [k.dataset.key, k]),
);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// ----------------------------------------------------------------------------- copy command
$("copy").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText($("command-text").textContent);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Select and copy";
  }
  setTimeout(() => {
    button.textContent = "Copy";
  }, 1600);
});

// ------------------------------------------------------------------------------- demo
function showItem(item) {
  $("tag-name").textContent = item.name;
  $("tag-price").textContent = item.price;
  $("tag-barcode").innerHTML = ean13Svg(item.code);
  keyCode.textContent = item.code;
}

// The sheet always shows MAX_ROWS rows, so its height never changes.
for (let i = 0; i < MAX_ROWS; i++)
  rows.insertAdjacentHTML("beforeend", "<tr><td></td><td></td></tr>");

/** Returns the cells of the first empty row, scrolling the sheet up when it's full. */
function addRow() {
  let tr = [...rows.children].find((row) => !row.firstElementChild.textContent);
  if (!tr) {
    rows.firstElementChild.remove();
    rows.insertAdjacentHTML("beforeend", "<tr><td></td><td></td></tr>");
    tr = rows.lastElementChild;
  }
  return [...tr.children];
}

// Only animate while the demo is on screen and the tab is visible.
let visible = true;
let wake = () => {};
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (visible) wake();
}).observe(document.querySelector(".stage"));
document.addEventListener("visibilitychange", () => wake());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(ms) {
  await sleep(ms);
  while (!visible || document.hidden) await new Promise((r) => (wake = r));
}

async function press(name, ms = 180) {
  keys[name].classList.add("down");
  await step(ms);
  keys[name].classList.remove("down");
}

async function typeInto(cell, text, key) {
  cell.classList.add("caret");
  keys[key].classList.add("down");
  for (const ch of text) {
    cell.textContent += ch;
    await step(38);
  }
  keys[key].classList.remove("down");
  cell.classList.remove("caret");
}

async function scan(item) {
  showItem(item);
  await step(700);
  tag.classList.add("scanning");
  await step(650);
  tag.classList.remove("scanning");
  tag.classList.add("read");
  const [sku, qty] = addRow();
  await typeInto(sku, item.code, "text");
  tag.classList.remove("read");
  await press("tab");
  await typeInto(qty, "1", "one");
  await press("enter");
  await step(1100);
}

async function run() {
  if (reducedMotion.matches) {
    showItem(ITEMS[0]);
    const [sku, qty] = addRow();
    sku.textContent = ITEMS[0].code;
    qty.textContent = "1";
    return;
  }
  for (let i = 0; ; i = (i + 1) % ITEMS.length) await scan(ITEMS[i]);
}

showItem(ITEMS[0]);
run();
