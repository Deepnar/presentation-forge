#!/usr/bin/env node
import { readFile, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import YAML from "yaml";
import sharp from "sharp";
import { ROOT, CONFIG } from "./paths.js";
import { loadTheme, hex, textStyle } from "./theme.js";
import { loadDeck } from "./validate.js";
import { layouts, content } from "./layouts.js";
import { loadBrand, applyTitleChrome, applyContentChrome, CANVAS } from "./chrome.js";
import { renderSlidePlate } from "./plate.js";

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

/**
 * The plate's own top-right luminance, as a dark/light hex the chrome can read.
 * The theme's flat palette says nothing about a freeform plate, so the crest
 * and footer pick their legible variant from the pixels actually painted.
 */
async function plateChromeBg(png) {
  try {
    const meta = await sharp(png).metadata();
    const w = meta.width, h = meta.height;
    // The crest sits in the top-right corner; sample its footprint only, so a
    // bright element lower down cannot push a dark plate across the threshold.
    const data = await sharp(png)
      .extract({ left: Math.floor(w * 0.84), top: 0, width: Math.floor(w * 0.16), height: Math.floor(h * 0.16) })
      .raw()
      .toBuffer();
    let lum = 0;
    for (let i = 0; i < data.length; i += 3) {
      lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    return lum / (data.length / 3) < 128 ? "#000000" : "#FFFFFF";
  } catch {
    return null;
  }
}

export async function render({ deckFile, themeName, mode = "light", out, style, signal }) {
  const deckDir = path.dirname(deckFile);
  const deck = await loadDeck(deckFile);
  const identity = await loadIdentity(deckDir);
  const theme = await loadTheme(themeName ?? deck.theme ?? "warm-humanist", {
    mode,
    style: style ?? deck.style,
  });
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

  // Assets referenced by slides resolve relative to the deck folder. A URL or a
  // reference to a file that is not there returns null — every image layout
  // draws a placeholder when the source is null, so an invented `image` field
  // degrades one slide instead of crashing the whole deck at write time.
  const resolveAsset = (rel) => {
    if (!rel || /^[a-z][a-z0-9+.-]*:\/\//i.test(rel)) return null;
    const abs = path.isAbsolute(rel) ? rel : path.join(deckDir, rel);
    return existsSync(abs) ? abs : null;
  };

  const total = deck.slides.length;
  const problems = [];

  for (const [i, data] of deck.slides.entries()) {
    const layout = layouts[data.type];
    if (!layout && data.type !== "freeform") {
      problems.push(`slide ${i + 1}: no renderer for type "${data.type}"`);
      continue;
    }

    const slide = pres.addSlide();
    const isTitle = data.type === "title";
    const isFreeform = data.type === "freeform";
    // Types that paint a non-standard surface: section dividers and their
    // lighter variants (chapter, epigraph) use the section surface; the closing
    // slide borrows the title surface; quote and image are full-bleed by design.
    const isFull =
      isTitle || isFreeform || ["section", "quote", "image", "chapter", "closing", "epigraph", "hero-image"].includes(data.type);
    const surface = isTitle || data.type === "closing" ? "title"
      : ["section", "chapter", "epigraph"].includes(data.type) ? "section"
      : "content";

    // Track the background each layout actually paints, so the chrome layer can
    // pick a crest variant that stays legible against it.
    const bg = isTitle || data.type === "closing" ? theme.surfaces.title.bg
      : ["section", "chapter", "epigraph"].includes(data.type) ? theme.surfaces.section.bg
      : data.type === "quote" ? theme.palette.surface
      : data.type === "hero-image" ? theme.palette.ink
      : theme.palette.bg;

    if (!isFull) slide.background = { color: hex(theme.palette.bg) };

    // A speaker note reserves 0.7in of the content box bottom and draws a bar
    // there, so no standard layout can collide with it and the chrome footer
    // stays free. Full-bleed slides (title, section, quote, image, freeform)
    // never take one — there is no standard content box to reserve.
    const noteBar = data.speaker_note && !isFull;
    const box = content(theme, brand, { full: isFull, note: noteBar ? 0.7 : 0, identity });
    const ctx = { theme, deck, data, identity, box, pres, resolveAsset, index: i + 1, total };

    try {
      // A freeform slide has no native layout — the whole slide rasterises
      // from its html. Everything else draws natively as usual.
      if (!isFreeform) layout(slide, ctx);
    } catch (err) {
      problems.push(`slide ${i + 1} (${data.type}): ${err.message}`);
    }

    // A plate replaces the flat background: headless Chrome rasterises the
    // theme's (or the slide's) HTML and the PNG becomes the true slide
    // background, under every shape and the chrome. Text stays native. The
    // content box rides along so a template can soft-panel the content area.
    const plate = await renderSlidePlate({ theme, surface, slide: data, box, signal });
    if (plate) {
      const b64 = (await readFile(plate.png)).toString("base64");
      slide.background = { data: b64, path: "plate.png" };
    }

    // A speaker note bar above the chrome footer: a thin accent-bordered panel
    // holding the note text in italic caption, for instructions the audience
    // may read. Drawn after the layout so it always sits on top, in the space
    // the content box already reserved.
    if (noteBar) {
      const ny = box.bottom + 0.1;
      slide.addShape("roundRect", {
        x: box.x, y: ny, w: box.w, h: 0.52,
        fill: { color: hex(theme.palette.surface) },
        line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.1,
      });
      slide.addShape("rect", {
        x: box.x, y: ny, w: 0.06, h: 0.52,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(data.speaker_note, {
        x: box.x + 0.22, y: ny, w: box.w - 0.22, h: 0.52,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true }),
        valign: "middle",
      });
    }

    if (isTitle) {
      applyTitleChrome(slide, { brand, identity });
    } else {
      // Chrome picks its legible variant from what is actually painted. On a
      // plate slide the theme's flat palette no longer describes it: prefer
      // the plate's own corner luminance, falling back to the surface's bg.
      const plateBg = plate ? (await plateChromeBg(plate.png) ?? theme.surfaces?.[surface]?.bg ?? theme.palette.bg) : null;
      const chromeBg = plateBg ?? bg;
      applyContentChrome(slide, { brand, theme, identity, data, index: i + 1, total, bg: chromeBg });
    }

    if (data.notes) slide.addNotes(data.notes);
  }

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
    else if (a === "--style") args.style = argv[++i];
    else if (a === "--mode") args.mode = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--format") args.format = argv[++i];
    else rest.push(a);
  }
  args.deckFile = rest[0];
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.deckFile) {
    console.error("usage: node src/render.js <deck.yaml> [--theme name] [--style name] [--mode light|dark] [--out file.pptx] [--format pdf|markdown]");
    process.exit(2);
  }
  try {
    await access(args.deckFile);
  } catch {
    console.error(`no such deck file: ${args.deckFile}`);
    process.exit(2);
  }

  try {
    // --format pdf|markdown hands off to the export module: the PDF is the
    // rendered deck through LibreOffice, the markdown a plain-text extraction.
    if (args.format) {
      const { exportDeck } = await import("./export.js");
      const r = await exportDeck({ deckFile: args.deckFile, format: args.format, themeName: args.themeName });
      console.log(`  ${r.format} · ${path.relative(ROOT, r.outFile)}`);
    } else {
      const r = await render(args);
      console.log(`  ${r.slides} slides · ${r.theme} · ${path.relative(ROOT, r.outFile)}`);
      if (r.problems.length) {
        console.error(`\n  ${r.problems.length} problem(s):`);
        for (const p of r.problems) console.error(`    - ${p}`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
