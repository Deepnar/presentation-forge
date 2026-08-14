#!/usr/bin/env node
/**
 * Contact sheet for theme distinctness — one slide (the content slide) from
 * every theme side by side, so a vision model or a human can judge whether the
 * themes actually look different. The sheet is a single PNG, written so it can
 * be handed straight to a vision subagent.
 *
 *   node tools/themesheet.mjs [--themes a,b] [--out sheets/themes.png]
 *
 * Uses the committed specimen deck's first content slide so every theme renders
 * the SAME content — the point is to compare the theme, not the deck.
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
const OUT = path.join(ROOT, "app", "gallery", "themesheet.png");

const pick = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const outFlag = pick("--out");
const themes = pick("--themes") ?? (await listThemes());

const deck = await specimenDeck();
// Use the first non-full-bleed content slide so the wash is visible on a
// standard page (title/section/quote are full-bleed and skip the background
// layer entirely), and give it a card so the layout has structure to read.
const FULL = new Set(["title", "freeform", "section", "quote", "image", "chapter", "closing", "epigraph", "hero-image"]);
const idx = deck.slides.findIndex((s) => !FULL.has(s.type));
const contentSlide = deck.slides[Math.max(0, idx)];
const work = path.join(ROOT, "decks", ".specimen-cache", "__themesheet__");
await mkdir(work, { recursive: true });
const deckFile = path.join(work, "deck.yaml");

const rendered = [];
for (const theme of themes) {
  const themed = structuredClone(deck);
  themed.theme = theme;
  // Render ONLY the chosen content slide — a full specimen deck would put the
  // dark title slide first and the sheet would compare title screens, not the
  // background washes on standard pages.
  themed.slides = [contentSlide];
  await writeFile(deckFile, JSON.stringify(themed));
  try {
    const outFile = path.join(work, `${theme}.pptx`);
    const r = await render({ deck: themed, deckDir: work, themeName: theme, out: outFile });
    const p = await preview(r.outFile, { dpi: 55, outDir: path.join(work, `${theme}`) });
    const full = p.pages[0];
    rendered.push({ theme, file: full });
  } catch (err) {
    rendered.push({ theme, file: null, error: err.message });
  }
}

// Grid: up to 6 per row, cells scaled to a uniform thumbnail height.
const cols = 6;
const rows = Math.ceil(rendered.length / cols);
const cellH = 220;
const cellW = Math.round(cellH * (16 / 9));
const pad = 4;
const labelH = 20;

const sheet = sharp({
  create: { width: cols * (cellW + pad) + pad, height: rows * (cellH + labelH + pad) + pad, channels: 3, background: "#E8E8E4" },
});

const comps = [];
for (let i = 0; i < rendered.length; i++) {
  const { theme, file, error } = rendered[i];
  const col = i % cols, row = Math.floor(i / cols);
  const x = pad + col * (cellW + pad);
  const y = pad + row * (cellH + labelH + pad);
  if (file) {
    const cell = await sharp(file).resize(cellW, cellH, { fit: "fill" }).png().toBuffer();
    comps.push({ input: cell, left: x, top: y + labelH });
  } else {
    const buf = await sharp(Buffer.from(`<svg width="${cellW}" height="${cellH}"><rect width="100%" height="100%" fill="#fff"/><text x="10" y="20" font-size="14" fill="#900">${error}</text></svg>`))
      .resize(cellW, cellH).png().toBuffer();
    comps.push({ input: buf, left: x, top: y + labelH });
  }
  const label = await sharp(Buffer.from(`<svg width="${cellW}" height="${labelH}"><rect width="100%" height="100%" fill="#E8E8E4"/><text x="4" y="15" font-size="13" font-family="sans-serif" fill="#222">${theme}</text></svg>`))
    .resize(cellW, labelH).png().toBuffer();
  comps.push({ input: label, left: x, top: y });
}

await sheet.composite(comps).png().toFile(outFlag ?? OUT);
console.log(`themesheet: ${path.relative(ROOT, outFlag ?? OUT)} (${rendered.length} themes)`);
