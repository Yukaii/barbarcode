// Renders src/page.html once per locale: / (en), /zh-tw/, /ja/.
import { mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "https://barbarcode.yukai.dev";
const root = new URL("../", import.meta.url);

const escapeAttr = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function render() {
  // Bust the import cache so --watch picks up edited translations.
  const { locales } = await import(`../src/i18n.js?t=${Date.now()}`);
  const template = readFileSync(new URL("src/page.html", root), "utf8");

  const alternates = [
    ...locales.map(
      (l) => `<link rel="alternate" hreflang="${l.htmlLang}" href="${SITE}${l.path}" />`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
  ].join("\n    ");

  for (const locale of locales) {
    const langNav = locales
      .map((l) =>
        l === locale
          ? `<a href="${l.path}" lang="${l.htmlLang}" aria-current="page">${l.label}</a>`
          : `<a href="${l.path}" lang="${l.htmlLang}" hreflang="${l.htmlLang}">${l.label}</a>`,
      )
      .join("");
    const values = {
      ...locale.t,
      htmlLang: locale.htmlLang,
      ogLocale: locale.ogLocale,
      fonts: escapeAttr(locale.fonts),
      canonical: `${SITE}${locale.path}`,
      home: locale.path,
      alternates,
      langNav,
      // `<` is escaped so the JSON can't close its <script> element.
      pageData: JSON.stringify(locale.demo).replace(/</g, "\\u003c"),
    };

    const html = template.replace(/\{\{(@?)(\w+)\}\}/g, (_, attr, key) => {
      if (!(key in values)) throw new Error(`[${locale.code}] missing translation "${key}"`);
      return attr ? escapeAttr(values[key]) : values[key];
    });

    const out = fileURLToPath(new URL(`.${locale.path}index.html`, root));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
  }
  console.log(`rendered ${locales.map((l) => l.path).join(" ")}`);
}

await render();
if (process.argv.includes("--watch")) {
  watch(fileURLToPath(new URL("src/", root)), (_, file) => {
    if (file === "page.html" || file === "i18n.js") render().catch((e) => console.error(e.message));
  });
}
