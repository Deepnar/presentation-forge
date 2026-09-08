#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { specimenDeck } from "../src/specimens.js";
import { atCaps } from "../src/capfit.js";
import { DECKS } from "../src/paths.js";
import { COVERING_THEMES } from "../src/coverage.js";

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);
const has = (flag) => process.argv.includes(flag);

const DEFAULT_THEMES = COVERING_THEMES;

const deck = await specimenDeck();
const types = list(arg("--types")) ?? [...new Set(deck.slides.map((s) => s.type))];
const themes = list(arg("--themes")) ?? DEFAULT_THEMES;
const scale = Number(arg("--scale", "1"));
const notes = !has("--no-notes");
const outDir = path.resolve(arg("--out", "/tmp/forge-capstress"));

const slides = [];
for (const type of types) {
  const specimen = deck.slides.find((s) => s.type === type);
  if (!specimen) { console.log(`  no specimen for ${type}`); continue; }
  const grown = await atCaps(specimen, scale);
  if (notes) grown.speaker_note = "A note the presenter reads aloud while this slide is up.";
  slides.push(grown);
}

const work = path.join(DECKS, ".specimen-cache", "__capstress__");
await mkdir(work, { recursive: true });
await writeFile(path.join(work, "meta.yaml"), "chrome:\n  branding: none\n", "utf8");
await mkdir(outDir, { recursive: true });

const byType = slides.map((s) => s.type);
let total = 0;
for (const theme of themes) {
  const one = structuredClone(deck);
  one.slides = structuredClone(slides);
  one.theme = theme;
  const r = await render({ deck: one, deckDir: work, themeName: theme, out: path.join(work, `${theme}.pptx`) });
  const p = await preview(r.outFile, { dpi: 110, outDir: path.join(outDir, theme) });
  total += r.problems.length;
  console.log(`\n  ${theme.padEnd(22)} ${p.pages.length} page(s)  ${r.problems.length} problem(s)`);
  for (const prob of r.problems) {
    const m = /^slide (\d+)\b/.exec(prob);
    console.log(`     ${(m ? byType[Number(m[1]) - 1] : "deck").padEnd(22)} ${prob.replace(/^slide \d+ \([^)]*\): /, "")}`);
  }
}

console.log(
  `\n  ${slides.length} type(s) at ${scale === 1 ? "their caps" : `${scale} of their caps`}` +
  `${notes ? " with a speaker note" : ""}, ${themes.length} theme(s), ${total} problem(s).`,
);
console.log(`  PNGs -> ${outDir}/<theme>/slide-N.png — look at them.\n`);
