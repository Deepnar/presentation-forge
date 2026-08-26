#!/usr/bin/env node
/**
 * Render one contact sheet per theme, for looking at.
 *
 * A written .pptx proves the file parsed and a passing contrast test proves a
 * number; neither tells you whether a theme looks like anything. This renders
 * chosen slide types from the specimen deck in chosen themes, rasterises them
 * and tiles them, so a theme change can be judged the only way it can be
 * judged — by looking at the slides.
 *
 *   node tools/themeaudit.mjs --themes glassmorphism,claymorphism
 *   node tools/themeaudit.mjs --themes warm-humanist --types title,section,chart
 *   node tools/themeaudit.mjs --all --types bullets            # every theme
 *
 * Output: .themeaudit/sheet-<theme>.png (gitignored scratch).
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../src/paths.js";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { listThemes } from "../src/theme.js";
import { specimenDeck } from "../src/specimens.js";

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);

const themes = process.argv.includes("--all")
  ? await listThemes()
  : list(arg("--themes")) ?? ["warm-humanist"];
const types = list(arg("--types")) ?? ["title", "section", "bullets", "big-number", "compare", "chart"];
// Branding on by default: the institutional marks sit on whatever the theme
// paints, and that interaction is exactly what needs looking at.
const branding = arg("--branding", "full");

const OUT = path.join(ROOT, ".themeaudit");
const work = path.join(OUT, "work");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await writeFile(path.join(work, "meta.yaml"), `chrome:\n  branding: ${branding}\n`, "utf8");

const deck = await specimenDeck();
const missing = types.filter((t) => !deck.slides.some((s) => s.type === t));
if (missing.length) console.error(`  unknown slide type(s): ${missing.join(", ")}`);

for (const theme of themes) {
  const themed = structuredClone(deck);
  themed.theme = theme;
  themed.title = "The shape of an argument";
  themed.subtitle = "A neutral specimen";
  themed.slides = types.map((t) => themed.slides.find((s) => s.type === t)).filter(Boolean);
  if (!themed.slides.length) continue;
  try {
    const r = await render({ deck: themed, deckDir: work, themeName: theme, out: path.join(work, `${theme}.pptx`) });
    const p = await preview(r.outFile, { dpi: 70, outDir: path.join(work, theme) });
    const w = 470, h = Math.round(w * 9 / 16);
    const panes = await Promise.all(p.pages.map((s) => sharp(s).resize(w, h, { fit: "fill" }).toBuffer()));
    const cols = Math.min(3, panes.length);
    const rows = Math.ceil(panes.length / cols);
    await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: "#999999" } })
      .composite(panes.map((input, i) => ({ input, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `sheet-${theme}.png`));
    console.log(`  ${theme.padEnd(22)} ${p.pages.length} slide(s)`);
  } catch (err) {
    console.error(`  ${theme}: ${err.message}`);
  }
}
console.log(`\nsheets -> ${path.relative(ROOT, OUT)}/`);
