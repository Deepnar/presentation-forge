#!/usr/bin/env node
/**
 * Render one deck across every theme × style combination and write an HTML
 * contact sheet so the look can be compared side by side before choosing.
 *
 *   node tools/compare.mjs decks/<slug>/deck.yaml [--themes a,b] [--styles a,b]
 *
 * Output: decks/<slug>/out/compare/index.html (+ per-combo .pptx + previews).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { listThemes, listStyles } from "../src/theme.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseFlags(args) {
  const pick = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
  };
  return { themes: pick("--themes"), styles: pick("--styles") };
}

async function main() {
  const deckFile = process.argv[2];
  if (!deckFile) {
    console.error("usage: node tools/compare.mjs decks/<slug>/deck.yaml [--themes a,b] [--styles a,b]");
    process.exit(2);
  }

  const { themes: onlyThemes, styles: onlyStyles } = parseFlags(process.argv.slice(3));
  const themes = onlyThemes ?? (await listThemes());
  // "" is the theme's own default; each named style is a cross-cutting variant.
  const styles = onlyStyles ?? ["", ...(await listStyles())];

  const deckDir = path.dirname(path.resolve(deckFile));
  const slug = path.basename(deckDir);
  const outRoot = path.join(deckDir, "out", "compare");
  const combos = [];

  for (const theme of themes) {
    for (const style of styles) {
      const label = style || "default";
      process.stdout.write(`  ${theme} × ${label}\n`);
      try {
        const r = await render({
          deckFile, themeName: theme, style: style || undefined,
          out: path.join(outRoot, theme, label, "deck.pptx"),
        });
        const p = await preview(r.outFile, { dpi: 110 });
        combos.push({
          theme, style: label,
          thumbs: p.thumbs.map((f) => path.relative(outRoot, f)),
          slides: r.slides,
          problems: r.problems,
        });
      } catch (err) {
        combos.push({ theme, style: label, thumbs: [], error: err.message });
      }
    }
  }

  const html = buildHtml(combos, slug);
  await writeFile(path.join(outRoot, "index.html"), html);
  console.log(`\ncompare sheet: ${path.relative(ROOT, path.join(outRoot, "index.html"))}`);
}

function buildHtml(combos, slug) {
  const cells = combos.map((c) => {
    const thumbs = c.thumbs.length
      ? c.thumbs.slice(0, 4).map((t) => `<img loading="lazy" src="${t}">`).join("")
      : `<div class="err">${c.error ?? "no render"}</div>`;
    return (
      `<div class="cell">` +
      `<div class="label">${c.theme} × ${c.style}</div>` +
      `<div class="thumbs">${thumbs}</div>` +
      `</div>`
    );
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${slug} — compare</title>
<style>
  body{margin:0;background:#f2f2ee;font:13px/1.4 system-ui,sans-serif;color:#222;padding:24px}
  h1{font-size:18px;margin:0 0 4px} p{margin:0 0 16px;color:#555}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
  .cell{background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px}
  .label{font-weight:600;margin-bottom:8px}
  .thumbs img{width:100%;display:block;border-radius:6px;margin-bottom:6px;border:1px solid #eee}
  .err{color:#a33;padding:8px}
</style></head><body>
<h1>${slug}</h1><p>theme × style matrix — ${combos.length} combinations</p>
<div class="grid">${cells}</div>
</body></html>`;
}

await main();
