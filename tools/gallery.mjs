#!/usr/bin/env node
/**
 * Generate the Themes-gallery thumbnails — one small PNG per theme, from the
 * theme's REAL rendered title slide, so the gallery shows the plate themes'
 * actual backgrounds instead of a synthetic token swatch.
 *
 *   node tools/gallery.mjs            # all themes
 *   node tools/gallery.mjs --themes a,b
 *
 * Output: app/gallery/<name>.png (served by /api/themes/:name/thumb.png).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { listThemes } from "../src/theme.js";
import { specimenDeck } from "../src/specimens.js";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "app", "gallery");
const pick = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const themes = pick("--themes") ?? (await listThemes());

const deck = await specimenDeck();
const work = path.join(ROOT, "decks", ".specimen-cache", "__gallery__");
await mkdir(work, { recursive: true });
await mkdir(OUT, { recursive: true });

for (const theme of themes) {
  const themed = structuredClone(deck);
  themed.theme = theme;
  // The title slide — the one surface the gallery card tries to fake, and the
  // one where plate themes carry their real background.
  themed.slides = [themed.slides[0]];
  try {
    const outFile = path.join(work, `${theme}.pptx`);
    const r = await render({ deck: themed, deckDir: work, themeName: theme, out: outFile });
    const p = await preview(r.outFile, { dpi: 40, outDir: path.join(work, `${theme}`) });
    const src = p.pages[0];
    // 16:7 crop — the card's aspect ratio. Resize to fit width, crop height.
    const meta = await sharp(src).metadata();
    const w = 560, h = Math.round(w * 7 / 16);
    const scale = w / meta.width;
    const ch = Math.round(meta.height * scale);
    const top = Math.max(0, Math.round((ch - h) / 2));
    await sharp(src).resize(w, ch).extract({ left: 0, top, width: w, height: h }).png().toFile(path.join(OUT, `${theme}.png`));
    process.stdout.write(`  ${theme}\n`);
  } catch (err) {
    console.error(`  ${theme}: ${err.message}`);
  }
}
console.log(`gallery: ${path.relative(ROOT, OUT)}`);
