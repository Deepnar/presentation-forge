#!/usr/bin/env node
/**
 * Rasterise the landing page's imagery from real renders.
 *
 *   node tools/landing.mjs                       # the whole cast
 *   node tools/landing.mjs --themes bauhaus,sunset
 *   node tools/landing.mjs --width 1400          # override the switcher width
 *
 * Output: app/gallery/landing/*.webp plus a manifest, all committed.
 *
 * WHY COMMITTED. The same reasoning as app/gallery, written out in .gitignore:
 * regenerating needs LibreOffice, Poppler and the theme fonts, and takes
 * minutes. A container's first boot is the wrong place for that, and a landing
 * page whose pictures are missing on a clean checkout is worse than one with no
 * pictures at all. They render with branding off, so they carry no
 * institutional marks — only the committed themes and the committed deck.
 *
 * WHY REAL RENDERS. The page is a claim about what the renderer produces. A
 * hand-drawn HTML mockup of a slide is a claim about what someone hoped it
 * produces, and the two drift the moment a layout changes. These come out of
 * src/render.js and src/preview.js, the same path a user's deck takes.
 */
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

/**
 * The cast is chosen for RANGE, not for coverage: light and dark, classic and
 * expressive, flat and plate. Five of the eight are in COVERING_THEMES, so most
 * of what ships here is also what the fit sweeps look at — but the landing is
 * a shopfront and the covering set is picked to exercise layout branches, which
 * is a different question from which eight look best side by side.
 */
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

/**
 * The pair every theme contributes: a cover, and the slide the theme cycle
 * runs on.
 *
 * `stats` rather than `bullets`, because a page of body text is the slide on
 * which two themes look most alike — the differences that sell a theme are its
 * accent, its numerals and its display face, and a bullet list shows none of
 * them. Side by side, twelve bullet slides read as one slide twelve times.
 */
const SWITCHER_TYPES = ["title", "stats"];

/** The theme whose full sequence carries the slide-type showcase. */
const SHOWCASE_THEME = "swiss-international";

/**
 * Types held back from the showcase, with the reason. Not a taste list — a
 * type belongs here only while it renders a defect, and comes out when the
 * defect is fixed.
 *
 * `matrix` draws its y-axis labels rotated at eyebrow size, and the fitter
 * measures tracked uppercase at roughly a tenth of the letter-spacing it
 * actually renders with, so "CONTRACTED" wraps to "CONTRACT / ED" with every
 * check clean. See docs/TRAPS.md.
 */
const HELD_BACK = new Set(["matrix"]);


const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const list = (flag) => arg(flag)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

const themes = list("--themes") ?? THEMES;
// Two widths, because the two sets are seen at different sizes. A switcher pane
// is most of the viewport; a showcase tile is a third of it. Shipping both at
// the larger size roughly triples the committed weight for pixels no one sees.
const SWITCHER_W = Number(arg("--width", 1200));
const SHOWCASE_W = Number(arg("--showcase-width", 1000));
const QUALITY = Number(arg("--quality", 74));

const loaded = await loadDeck(DECK);
const baseDeck = loaded.deck ?? loaded;
const deckDir = path.dirname(DECK);
const work = path.join(ROOT, "decks", ".specimen-cache", "__landing__");
await mkdir(work, { recursive: true });
await mkdir(OUT, { recursive: true });

/** Which slide index each type sits at, so the cast names types, not offsets. */
const indexOf = new Map();
baseDeck.slides.forEach((s, i) => { if (!indexOf.has(s.type)) indexOf.set(s.type, i); });

for (const t of SWITCHER_TYPES) {
  if (!indexOf.has(t)) throw new Error(`landing deck has no "${t}" slide — the cast names types, not indices`);
}

/**
 * Emit one page as WebP and report what it cost. The full frame, never a crop:
 * a slide's composition is the thing being shown.
 */
async function emit(src, file, width) {
  const height = Math.round((width * 9) / 16);
  const resized = sharp(src).resize(width, height, { fit: "fill" });
  await resized.clone().webp({ quality: QUALITY, effort: 6 }).toFile(file);
  // Darkness is measured off the PAINTED PIXELS, never off a palette token.
  // swiss-international declares a white page and renders a near-black title
  // slide; a plate theme's ground is an image and its token says nothing about
  // it. The page needs this to know which way to shade the frame it puts
  // around the specimen, and it needs it before the image has loaded.
  const { channels } = await resized.clone().stats();
  const [r, g, b] = channels.map((c) => c.mean / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luma = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return { w: width, h: height, bytes: (await stat(file)).size, dark: luma < 0.35 };
}

// The page must not hardcode "73 slide types" — a number in marketing copy
// that nobody regenerates is a number that goes stale. It travels with the
// imagery, read from the schema that defines it.
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
  // deckDir is the committed deck's own directory so meta.yaml — which is what
  // turns branding off — is the one that applies.
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
    // The theme's own reading is its BODY slide: a cover may invert while the
    // rest of the deck does not, which is exactly what swiss-international does.
    dark: slides.find((s) => s.type === "stats")?.dark ?? false,
    slides: slides.filter((s) => SWITCHER_TYPES.includes(s.type)),
  });
  if (name === SHOWCASE_THEME) {
    manifest.showcase = { theme: name, label: theme.label ?? name, slides };
  }
  process.stdout.write(`  ${name.padEnd(24)} ${slides.length} slide(s)\n`);
}


// Sweep anything a previous cast left behind, or the directory accumulates
// images for themes no longer shipped and the manifest stops describing it.
const keep = new Set(["manifest.json", ...manifest.themes.flatMap((t) => t.slides.map((s) => s.file)),
  ...(manifest.showcase?.slides ?? []).map((s) => s.file)]);
for (const f of await readdir(OUT)) {
  if (!keep.has(f)) await rm(path.join(OUT, f));
}

await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`landing: ${path.relative(ROOT, OUT)} — ${keep.size - 1} images, ${(total / 1024 / 1024).toFixed(2)} MB`);
