#!/usr/bin/env node
import { readFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import YAML from "yaml";
import { ROOT, CONFIG } from "./paths.js";
import { loadTheme, hex } from "./theme.js";
import { loadDeck } from "./validate.js";
import { layouts, content } from "./layouts.js";
import { loadBrand, applyTitleChrome, applyContentChrome, CANVAS } from "./chrome.js";

async function loadIdentity(deckDir) {
  // identity.yaml carries real personal and institutional details and is
  // gitignored, so a fresh clone falls back to the committed template.
  let raw;
  try {
    raw = await readFile(path.join(CONFIG, "identity.yaml"), "utf8");
  } catch {
    raw = await readFile(path.join(CONFIG, "identity.example.yaml"), "utf8");
  }
  const base = YAML.parse(raw);
  // Per-deck meta.yaml wins over the standing defaults, key by key.
  try {
    const over = YAML.parse(await readFile(path.join(deckDir, "meta.yaml"), "utf8")) ?? {};
    return deepMerge(base, over);
  } catch {
    return base;
  }
}

function deepMerge(a, b) {
  if (Array.isArray(b)) return b;               // arrays replace, never merge
  if (b && typeof b === "object" && a && typeof a === "object") {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(a[k], v);
    return out;
  }
  return b === undefined ? a : b;
}

export async function render({ deckFile, themeName, mode = "light", out }) {
  const deckDir = path.dirname(deckFile);
  const deck = await loadDeck(deckFile);
  const identity = await loadIdentity(deckDir);
  const theme = await loadTheme(themeName ?? deck.theme ?? "warm-humanist", { mode });
  const brand = await loadBrand(identity);

  if (brand.missing.length) {
    console.warn(
      `  ! brand asset(s) not found, chrome degraded:\n` +
      brand.missing.map((m) => `      ${m}`).join("\n"),
    );
  }

  const pres = new PptxGenJS();
  pres.defineLayout({ name: "W16x9", width: CANVAS.w, height: CANVAS.h });
  pres.layout = "W16x9";
  pres.author = (identity.team?.members ?? []).map((m) => m.name).join(", ");
  pres.company = identity.institution?.short ?? "";
  pres.title = deck.title;

  // Assets referenced by slides resolve relative to the deck folder.
  const resolveAsset = (rel) => {
    if (!rel) return null;
    return path.isAbsolute(rel) ? rel : path.join(deckDir, rel);
  };

  const total = deck.slides.length;
  const problems = [];

  deck.slides.forEach((data, i) => {
    const layout = layouts[data.type];
    if (!layout) {
      problems.push(`slide ${i + 1}: no renderer for type "${data.type}"`);
      return;
    }

    const slide = pres.addSlide();
    const isTitle = data.type === "title";
    const isFull = isTitle || data.type === "section" || data.type === "quote" || data.type === "image";

    // Track the background each layout actually paints, so the chrome layer can
    // pick a crest variant that stays legible against it.
    const bg = isTitle ? theme.palette.bg
      : data.type === "section" ? theme.palette.accent
      : data.type === "quote" ? theme.palette.surface
      : theme.palette.bg;

    if (!isFull) slide.background = { color: hex(theme.palette.bg) };

    const box = content(theme, brand, { full: isFull });
    const ctx = { theme, deck, data, identity, box, pres, resolveAsset, index: i + 1, total };

    try {
      layout(slide, ctx);
    } catch (err) {
      problems.push(`slide ${i + 1} (${data.type}): ${err.message}`);
    }

    if (isTitle) {
      applyTitleChrome(slide, { brand });
    } else {
      applyContentChrome(slide, { brand, theme, identity, index: i + 1, total, bg });
    }

    if (data.notes) slide.addNotes(data.notes);
  });

  const outFile = out ?? path.join(deckDir, "out", "deck.pptx");
  await mkdir(path.dirname(outFile), { recursive: true });
  await pres.writeFile({ fileName: outFile });

  return { outFile, slides: total, theme: theme.label, problems };
}

/* ------------------------------------------------------------------- CLI */

function parseArgs(argv) {
  const args = { mode: "light" };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--theme") args.themeName = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else rest.push(a);
  }
  args.deckFile = rest[0];
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.deckFile) {
    console.error("usage: node src/render.js <deck.yaml> [--theme name] [--mode light|dark] [--out file.pptx]");
    process.exit(2);
  }
  try {
    await access(args.deckFile);
  } catch {
    console.error(`no such deck file: ${args.deckFile}`);
    process.exit(2);
  }

  try {
    const r = await render(args);
    console.log(`  ${r.slides} slides · ${r.theme} · ${path.relative(ROOT, r.outFile)}`);
    if (r.problems.length) {
      console.error(`\n  ${r.problems.length} problem(s):`);
      for (const p of r.problems) console.error(`    - ${p}`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
