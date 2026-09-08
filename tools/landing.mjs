#!/usr/bin/env node
import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/render.js";
import { preview } from "../src/preview.js";
import { loadTheme } from "../src/theme.js";
import { loadDeck } from "../src/validate.js";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "app", "gallery", "landing");
const DECK = path.join(ROOT, "decks", "_public", "landing", "deck.yaml");

const THEMES = [
  "swiss-international",
  "editorial-serif-light",
  "editorial-magazine",
  "linear-dark",
  "sci-fi-hud",
  "isometric-dark",
  "bauhaus",
  "neubrutalism",
  "risograph",
  "art-deco",
  "memphis-postmodern",
  "glassmorphism",
];

const SWITCHER_TYPES = ["title", "stats"];

const SHOWCASE_THEME = "swiss-international";

const MANUAL_ASSETS = new Set([
  "theme-system.gif",
  "theme-system.mp4",
  "app-workflow.gif",
  "app-workflow.mp4",
  "briefing-workflow.gif",
  "briefing-workflow.mp4",
]);

const HELD_BACK = new Set();

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (flag) => arg(flag)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

const themes = list("--themes") ?? THEMES;
const SWITCHER_W = Number(arg("--width", 1200));
const SHOWCASE_W = Number(arg("--showcase-width", 1000));
const QUALITY = Number(arg("--quality", 74));

const loaded = await loadDeck(DECK);
const baseDeck = loaded.deck ?? loaded;
const deckDir = path.dirname(DECK);
const work = path.join(ROOT, "decks", ".specimen-cache", "__landing__");
await mkdir(work, { recursive: true });
await mkdir(OUT, { recursive: true });

const indexOf = new Map();
baseDeck.slides.forEach((s, i) => { if (!indexOf.has(s.type)) indexOf.set(s.type, i); });

for (const t of SWITCHER_TYPES) {
  if (!indexOf.has(t)) throw new Error(`landing deck has no "${t}" slide — the cast names types, not indices`);
}

async function emit(src, file, width) {
  const height = Math.round((width * 9) / 16);
  const resized = sharp(src).resize(width, height, { fit: "fill" });
  await resized.clone().webp({ quality: QUALITY, effort: 6 }).toFile(file);
  const { channels } = await resized.clone().stats();
  const [r, g, b] = channels.map((c) => c.mean / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luma = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return { w: width, h: height, bytes: (await stat(file)).size, dark: luma < 0.35 };
}

const schema = JSON.parse(await readFile(path.join(ROOT, "schema", "deck.schema.json"), "utf8"));
const manifest = {
  deck: path.relative(ROOT, DECK),
  vocabulary: { types: schema.definitions.slide.properties.type.enum.length },
  themes: [],
  showcase: null,
};
let total = 0;

for (const name of themes) {
  const theme = await loadTheme(name);
  const themed = structuredClone(baseDeck);
  themed.theme = name;

  const outFile = path.join(work, `${name}.pptx`);
  const r = await render({ deck: themed, deckDir, themeName: name, out: outFile });
  const p = await preview(r.outFile, { dpi: 150, outDir: path.join(work, name) });

  const wanted = name === SHOWCASE_THEME
    ? baseDeck.slides.map((s, i) => ({ type: s.type, i })).filter(({ type }) => !HELD_BACK.has(type))
    : SWITCHER_TYPES.map((t) => ({ type: t, i: indexOf.get(t) }));

  const slides = [];
  for (const { type, i } of wanted) {
    const src = p.pages[i];
    if (!src) {
      console.error(`  ${name}: no page ${i + 1} for ${type}`);
      continue;
    }
    const inSwitcher = SWITCHER_TYPES.includes(type);
    const width = inSwitcher ? SWITCHER_W : SHOWCASE_W;
    const file = path.join(OUT, `${name}--${type}.webp`);
    const m = await emit(src, file, width);
    total += m.bytes;
    slides.push({ type, file: `${name}--${type}.webp`, ...m });
  }

  manifest.themes.push({
    name,
    label: theme.label ?? name,
    dark: slides.find((s) => s.type === "stats")?.dark ?? false,
    slides: slides.filter((s) => SWITCHER_TYPES.includes(s.type)),
  });
  if (name === SHOWCASE_THEME) {
    manifest.showcase = { theme: name, label: theme.label ?? name, slides };
  }
  process.stdout.write(`  ${name.padEnd(24)} ${slides.length} slide(s)\n`);
}

const keep = new Set(["manifest.json", ...MANUAL_ASSETS, ...manifest.themes.flatMap((t) => t.slides.map((s) => s.file)),
  ...(manifest.showcase?.slides ?? []).map((s) => s.file)]);
for (const f of await readdir(OUT)) {
  if (!keep.has(f)) await rm(path.join(OUT, f));
}

await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`landing: ${path.relative(ROOT, OUT)} — ${keep.size - 1} images, ${(total / 1024 / 1024).toFixed(2)} MB`);
