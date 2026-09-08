#!/usr/bin/env node
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
const outFlag = pick("--out")?.[0] ?? OUT;
const themes = pick("--themes") ?? (await listThemes());

const deck = await specimenDeck();
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

if (process.argv.includes("--score")) {
  const SIZE = 48;
  const thumbs = {};
  for (const { theme, file } of rendered) {
    if (!file) continue;
    const meta = await sharp(file).metadata();
    const { data, info } = await sharp(file).resize(SIZE, Math.round(SIZE * meta.height / meta.width))
      .raw().toBuffer({ resolveWithObject: true });
    thumbs[theme] = { data, w: info.width, h: info.height };
  }
  const names = Object.keys(thumbs);
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = thumbs[names[i]], b = thumbs[names[j]];
      const n = Math.min(a.h, b.h) * Math.min(a.w, b.w);
      let diff = 0;
      for (let p = 0; p < n * 3; p += 3) {
        diff += Math.abs(a.data[p] - b.data[p]) + Math.abs(a.data[p + 1] - b.data[p + 1]) + Math.abs(a.data[p + 2] - b.data[p + 2]);
      }
      const mean = diff / (n * 3);
      pairs.push({ a: names[i], b: names[j], mean });
    }
  }
  pairs.sort((x, y) => x.mean - y.mean);
  console.log(`\nclosest theme pairs (mean abs pixel diff / 255, lower = more alike):`);
  for (const p of pairs.slice(0, 12)) {
    console.log(`  ${p.mean.toFixed(3)}  ${p.a} × ${p.b}`);
  }
  process.exit(0);
}

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

await sheet.composite(comps).png().toFile(outFlag);
console.log(`themesheet: ${path.relative(ROOT, outFlag ?? OUT)} (${rendered.length} themes)`);
