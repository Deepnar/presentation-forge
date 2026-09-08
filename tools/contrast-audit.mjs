#!/usr/bin/env node
import { mkdir, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { listThemes } from "../src/theme.js";
import { specimenDeck } from "../src/specimens.js";
import { loadDeck } from "../src/validate.js";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pick = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const outDir = pick("--out")?.[0] ?? path.join(ROOT, "decks", ".specimen-cache", "contrast-audit");
const themes = pick("--themes") ?? (await listThemes());

const DEFAULT_TYPES = [
  "vs", "compare", "cards", "framework", "diagram", "flow",
  "checklist", "roadmap", "chart", "layered-architecture",
];
const TYPES = pick("--types") ?? DEFAULT_TYPES;

const deckArg = pick("--deck")?.[0];
const specimen = deckArg ? await loadDeck(deckArg) : await specimenDeck();
const byType = new Map(specimen.slides.map((s) => [s.type, s]));
const work = path.join(ROOT, "decks", ".specimen-cache", "__contrast__");
await mkdir(work, { recursive: true });
await mkdir(outDir, { recursive: true });

const SHEETS = deckArg
  ? specimen.slides.map((s, i) => `${String(i + 1).padStart(2, "0")}-${s.type}`)
  : TYPES;
const cells = {}; // sheet key -> [{theme, file}]
for (const key of SHEETS) cells[key] = [];

for (const theme of themes) {
  const themed = deckArg
    ? { ...structuredClone(specimen), theme }
    : {
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
    SHEETS.forEach((key, i) => {
      if (p.pages[i]) cells[key].push({ theme, file: p.pages[i] });
    });
    process.stderr.write(`  ${theme} ✓\n`);
  } catch (err) {
    process.stderr.write(`  ${theme} ✗ ${err.message.slice(0, 120)}\n`);
  }
}

const cols = 4;
const cellW = 700, cellH = Math.round(cellW * (9 / 16));
const pad = 6, labelH = 24;

for (const type of SHEETS) {
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

await rm(work, { recursive: true, force: true });
