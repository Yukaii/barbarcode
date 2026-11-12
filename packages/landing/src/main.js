import "./style.css";
import { ean13Svg, withCheckDigit } from "./ean13.js";

// Localized demo data and button labels, written into the page by scripts/render.mjs.
const PAGE = JSON.parse(document.getElementById("page-data").textContent);
const ITEMS = PAGE.items.map((item) => ({ ...item, code: withCheckDigit(item.code) }));
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
const copyButton = $("copy");
const copyLabel = copyButton.textContent;
let copyReset;
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("command-text").textContent);
    copyButton.textContent = PAGE.copied;
  } catch {
    copyButton.textContent = PAGE.copyFailed;
  }
  clearTimeout(copyReset);
  copyReset = setTimeout(() => {
    copyButton.textContent = copyLabel;
  }, 1600);
});

// ------------------------------------------------------------------------------ install tabs
const tabs = [...document.querySelectorAll('.install-tabs [role="tab"]')];

function selectTab(tab) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
  }
  const command = $("command-text");
  command.textContent = tab.dataset.command;
  command.dataset.prompt = tab.dataset.prompt;
  command.scrollLeft = 0;
  $("install-panel").setAttribute("aria-labelledby", tab.id);
  for (const note of document.querySelectorAll(".install .fineprint")) {
    note.hidden = note.dataset.for !== tab.id;
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  // Arrow keys move between tabs (the standard tablist keyboard pattern).
  tab.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
    selectTab(next);
    next.focus();
  });
}

// ------------------------------------------------------------------------------- demo
function showItem(item) {
  $("tag-name").textContent = item.name;
  const currency = Object.assign(document.createElement("span"), {
    className: "currency",
    textContent: item.currency,
  });
  $("tag-price").replaceChildren(currency, item.price);
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
