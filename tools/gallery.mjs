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

// A theme card must show the THEME, never an institution. The card previously
// carried whatever crest and banner the local install happened to have, which
// is why the thumbnails were switched off and every card fell back to a plain
// block of colour — leaving two themes with the same title background looking
// identical. Rendering the specimen with branding off gives back a real slide
// with none of that, and lets the thumbnails be committed: they are derived
// from committed themes and contain nothing local.
await writeFile(path.join(work, "meta.yaml"), "chrome:\n  branding: none\n  slide_numbers: false\n", "utf8");

for (const theme of themes) {
  const themed = structuredClone(deck);
  themed.theme = theme;
  // The shared specimen deck carries no title, so the title slide rendered
  // blank and half of every card was an empty colour field. A neutral phrase
  // shows the display face at size without putting anyone's deck on the card.
  themed.title = "The shape of an argument";
  themed.subtitle = "A neutral specimen";
  // Two surfaces, side by side: the title, where plate themes carry their real
  // background, and a body slide, where the type hierarchy, accent and card
  // treatment actually differ. One cropped title slide was mostly empty
  // background — which is how the cards ended up looking interchangeable.
  const body = themed.slides.find((s) => s.type === "bullets") ?? themed.slides[5];
  themed.slides = [themed.slides[0], body];
  try {
    const outFile = path.join(work, `${theme}.pptx`);
    const r = await render({ deck: themed, deckDir: work, themeName: theme, out: outFile });
    const p = await preview(r.outFile, { dpi: 60, outDir: path.join(work, `${theme}`) });

    // Full frames, never a crop: a slide's composition is the thing being shown.
    const half = 480;
    const halfH = Math.round(half * 9 / 16);
    const panes = await Promise.all(
      p.pages.slice(0, 2).map((src) => sharp(src).resize(half, halfH, { fit: "fill" }).toBuffer()),
    );
    await sharp({
      create: { width: half * panes.length, height: halfH, channels: 3, background: "#ffffff" },
    })
      .composite(panes.map((input, i) => ({ input, left: i * half, top: 0 })))
      // Quantised: these are committed so the picker works on a fresh clone and
      // in the container, where LibreOffice is present but regenerating 38
      // themes at boot would cost minutes. A plate theme's mesh gradient is
      // 198 kB as truecolour and 41 kB quantised, with no visible difference at
      // card size.
      .png({ compressionLevel: 9, palette: true, quality: 82 })
      .toFile(path.join(OUT, `${theme}.png`));
    process.stdout.write(`  ${theme}\n`);
  } catch (err) {
    console.error(`  ${theme}: ${err.message}`);
  }
}
console.log(`gallery: ${path.relative(ROOT, OUT)}`);
