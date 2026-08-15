#!/usr/bin/env node
/**
 * Slide-type QA pass — render every slide type from the specimen deck in a set
 * of themes, rasterise, and emit:
 *
 *   1. `problems.json`  — the renderer's own per-slide problems (fit-floor
 *      flags, placeholders) so a broken type is flagged before any vision pass.
 *   2. `per-slide/<theme>/NN-<type>.png` — one full-size PNG per type per theme.
 *   3. `sheets/<theme>-<chunk>.png` — labelled contact sheets, chunked so each
 *      cell stays readable for a vision model (cells at ~360px, ~20 per sheet).
 *
 *   node tools/slideqa.mjs [--themes warm-humanist,swiss-international,dark-neon] [--out /tmp/slideqa]
 *
 * The sheets are the deliverable the vision pass reads; the full-size PNGs let
 * it zoom a suspect type. problems.json is the deterministic half of the audit.
 */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { specimenDeck, specimenIndex } from "../src/specimens.js";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_THEMES = ["warm-humanist", "swiss-international", "dark-neon"];

const pick = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const themes = pick("--themes") ?? DEFAULT_THEMES;
const outDir = path.resolve(pick("--out")?.[0] ?? "/tmp/opencode/slideqa");
const perSlide = path.join(outDir, "per-slide");
const sheetsDir = path.join(outDir, "sheets");
const work = path.join(ROOT, "decks", ".specimen-cache", "__slideqa__");
await mkdir(work, { recursive: true });
await mkdir(perSlide, { recursive: true });
await mkdir(sheetsDir, { recursive: true });

const deck = await specimenDeck();
const index = await specimenIndex();
const byIndex = deck.slides.map((s) => s.type);
const deckFile = path.join(work, "deck.yaml");

// The renderer's own verdict per slide: fit-floor flags, placeholder issues,
// layout errors. This is the deterministic half of the audit — the vision pass
// reads the sheets for the structural half.
const problemsByType = {};
const allProblems = [];

for (const theme of themes) {
  const themed = structuredClone(deck);
  themed.theme = theme;
  themed.slides.forEach((s) => { delete s.presenter; });
  await writeFile(deckFile, JSON.stringify(themed));
  const out = path.join(work, `${theme}.pptx`);
  const r = await render({ deckFile, themeName: theme, out });
  const p = await preview(r.outFile, { dpi: 80, outDir: path.join(work, `${theme}`) });

  // Map render problems to their slide's type via the "slide N" prefix.
  for (const prob of r.problems) {
    const m = prob.match(/^slide (\d+)[:)]/);
    const type = m ? byIndex[Number(m[1]) - 1] : "deck";
    if (!problemsByType[type]) problemsByType[type] = [];
    problemsByType[type].push(prob);
    allProblems.push({ theme, type, slide: m ? Number(m[1]) : null, problem: prob });
  }

  // Full-size per-type PNGs, named by type so a suspect is easy to find.
  for (let i = 0; i < p.pages.length; i++) {
    await copyFile(p.pages[i], path.join(perSlide, `${theme}-${String(i + 1).padStart(2, "0")}-${byIndex[i]}.png`));
  }
}

await writeFile(path.join(outDir, "problems.json"), JSON.stringify({ themes, problemsByType, allProblems }, null, 2));

// Contact sheets, chunked ~20 per sheet so each cell stays readable. Each cell
// is labelled with its slide number and type.
const CELL_W = 360;
const CELL_H = Math.round(CELL_W * (9 / 16));
const COLS = 5;
const CHUNK = 20;
const PAD = 6;
const LABEL_H = 22;

for (const theme of themes) {
  const slides = deck.slides.length;
  for (let start = 0; start < slides; start += CHUNK) {
    const slice = byIndex.slice(start, start + CHUNK);
    const rows = Math.ceil(slice.length / COLS);
    const width = COLS * (CELL_W + PAD) + PAD;
    const height = rows * (CELL_H + LABEL_H + PAD) + PAD;
    const comps = [];
    for (let i = 0; i < slice.length; i++) {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = PAD + col * (CELL_W + PAD);
      const y = PAD + row * (CELL_H + LABEL_H + PAD);
      const num = start + i + 1;
      const img = await sharp(path.join(perSlide, `${theme}-${String(num).padStart(2, "0")}-${slice[i]}.png`))
        .resize(CELL_W, CELL_H, { fit: "fill" }).png().toBuffer();
      comps.push({ input: img, left: x, top: y + LABEL_H });
      const label = await sharp(Buffer.from(
        `<svg width="${CELL_W}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#1a1a1a"/>` +
        `<text x="8" y="16" font-size="14" font-family="sans-serif" fill="#eee">${String(num).padStart(2, "0")} ${slice[i]}</text></svg>`,
      )).resize(CELL_W, LABEL_H).png().toBuffer();
      comps.push({ input: label, left: x, top: y });
    }
    const sheet = sharp({ create: { width, height, channels: 3, background: "#E8E8E4" } });
    await sheet.composite(comps).png().toFile(path.join(sheetsDir, `${theme}-${Math.floor(start / CHUNK) + 1}.png`));
  }
}

const byType = await specimenIndex();
console.log(`slideqa: ${themes.join(", ")} → ${outDir}`);
console.log(`  ${byType && Object.keys(problemsByType).length} type(s) with renderer problems:`);
for (const [type, probs] of Object.entries(problemsByType)) {
  console.log(`  ${type}: ${probs.length} problem(s)`);
  for (const p of probs) console.log(`      ${p}`);
}
console.log(`  sheets: ${themes.length * Math.ceil(deck.slides.length / CHUNK)} contact sheets in ${path.relative(ROOT, sheetsDir)}`);
