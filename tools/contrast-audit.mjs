#!/usr/bin/env node
/**
 * Contrast audit across every theme — renders one deck carrying the
 * geometry-ish slide types (vs, compare, cards, framework, diagram, flow,
 * checklist, roadmap, chart, layered-architecture) in EVERY theme and writes
 * one contact sheet per slide type, each cell labelled with its theme, so a
 * vision model can flag any cell with invisible or low-contrast text.
 *
 *   node tools/contrast-audit.mjs [--themes a,b] [--types a,b] [--out dir]
 *
 * A cell must be big enough to actually read text — this is a contrast check,
 * not the distinctness check, so cells are ~4 per row at preview resolution
 * rather than thumbnails.
 */
import { mkdir, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { listThemes } from "../src/theme.js";
import { specimenDeck } from "../src/specimens.js";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pick = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const outDir = pick("--out")?.[0] ?? path.join(ROOT, "decks", ".specimen-cache", "contrast-audit");
const themes = pick("--themes") ?? (await listThemes());

// The geometry-ish types from the user's report: these draw text on or near
// painted surfaces, so a theme whose token pairs clash shows up here. Any
// other type can be asked for by name — one sheet per type across every theme
// is also how a composition change is judged, not only a colour one.
const DEFAULT_TYPES = [
  "vs", "compare", "cards", "framework", "diagram", "flow",
  "checklist", "roadmap", "chart", "layered-architecture",
];
const TYPES = pick("--types") ?? DEFAULT_TYPES;

const specimen = await specimenDeck();
const byType = new Map(specimen.slides.map((s) => [s.type, s]));
const work = path.join(ROOT, "decks", ".specimen-cache", "__contrast__");
await mkdir(work, { recursive: true });
await mkdir(outDir, { recursive: true });

// Render the chosen types once per theme.
const cells = {}; // type -> [{theme, file}]
for (const type of TYPES) cells[type] = [];

for (const theme of themes) {
  const themed = {
    title: "Contrast audit",
    sections: ["Specimens"],
    theme,
    slides: TYPES.map((t) => byType.get(t)).filter(Boolean),
  };
  const deckFile = path.join(work, `${theme}.yaml`);
  await writeFile(deckFile, JSON.stringify(themed));
  try {
    const outFile = path.join(work, `${theme}.pptx`);
    const r = await render({ deck: themed, deckDir: work, themeName: theme, out: outFile });
    const p = await preview(r.outFile, { dpi: 110, outDir: path.join(work, `${theme}`) });
    TYPES.forEach((type, i) => {
      if (p.pages[i]) cells[type].push({ theme, file: p.pages[i] });
    });
    process.stderr.write(`  ${theme} ✓\n`);
  } catch (err) {
    process.stderr.write(`  ${theme} ✗ ${err.message.slice(0, 120)}\n`);
  }
}

// One contact sheet per type: ~4 cells per row at preview resolution.
const cols = 4;
const cellW = 700, cellH = Math.round(cellW * (9 / 16));
const pad = 6, labelH = 24;

for (const type of TYPES) {
  const list = cells[type];
  if (!list.length) continue;
  const rows = Math.ceil(list.length / cols);
  const W = cols * (cellW + pad) + pad;
  const H = rows * (cellH + labelH + pad) + pad;
  const sheet = sharp({ create: { width: W, height: H, channels: 3, background: "#E8E8E4" } });
  const comps = [];
  for (let i = 0; i < list.length; i++) {
    const { theme, file } = list[i];
    const col = i % cols, row = Math.floor(i / cols);
    const x = pad + col * (cellW + pad);
    const y = pad + row * (cellH + labelH + pad);
    const cell = await sharp(file).resize(cellW, cellH, { fit: "fill" }).png().toBuffer();
    comps.push({ input: cell, left: x, top: y + labelH });
    const label = await sharp(Buffer.from(
      `<svg width="${cellW}" height="${labelH}"><rect width="100%" height="100%" fill="#E8E8E4"/>` +
      `<text x="4" y="16" font-size="14" font-family="sans-serif" fill="#222">${theme}</text></svg>`,
    )).resize(cellW, labelH).png().toBuffer();
    comps.push({ input: label, left: x, top: y });
  }
  const out = path.join(outDir, `${type}.png`);
  await sheet.composite(comps).png().toFile(out);
  process.stdout.write(`${type}: ${list.length} themes -> ${path.relative(ROOT, out)}\n`);
}

// Clean the per-theme intermediate renders.
await rm(work, { recursive: true, force: true });
