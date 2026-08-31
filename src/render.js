#!/usr/bin/env node
import { readFile, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import YAML from "yaml";
import sharp from "sharp";
import { ROOT } from "./paths.js";
import { loadTheme, hex, textStyle } from "./theme.js";
import { loadDeck } from "./validate.js";
import { layouts, content } from "./layouts.js";
import { loadBrand, applyTitleChrome, applyContentChrome, CANVAS } from "./chrome.js";
import { renderSlidePlate } from "./plate.js";
import { placeholderGateError } from "./placeholders.js";
import { resetFloorEvents, drainFloorEvents } from "./fit.js";
import { watchGeometry } from "./geometry.js";
import { loadIdentity } from "./ai/identity.js";

/**
 * Draw the theme's decorative background layer — a faint wash, panel or hairline
 * grid of native shapes sitting behind every content slide. Theme-owned tokens
 * only (`tokens.background.decor`), never reachable from deck.yaml. A single
 * transparent oversized shape is the "good bg" that makes two pale themes stop
 * looking identical while every text element stays native and editable.
 */
function drawBackground(slide, theme) {
  const decor = theme.tokens?.background?.decor;
  if (!Array.isArray(decor)) return;
  const map = { ellipse: "ellipse", rect: "rect", roundRect: "roundRect", triangle: "triangle" };
  for (const d of decor) {
    const shape = map[d.shape];
    if (!shape) continue;
    slide.addShape(shape, {
      x: d.x, y: d.y, w: d.w, h: d.h,
      fill: {
        color: hex(d.fill) ?? "FFFFFF",
        ...(d.transparency != null ? { transparency: d.transparency } : {}),
      },
      line: { type: "none" },
      ...(d.rotation ? { rotation: d.rotation } : {}),
    });
  }
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
    // Return the colour that was actually painted, not a verdict about it.
    // Collapsing the sample to pure black or white threw away the hue, so every
    // plate theme reported a neutral ground: a salmon divider came back as
    // #FFFFFF and the chrome then chose its mark for white paper.
    let r = 0, g = 0, b = 0;
    const px = data.length / 3;
    for (let i = 0; i < data.length; i += 3) {
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    const mean = [r / px, g / px, b / px]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("");
    return `#${mean.toUpperCase()}`;
  } catch {
    return null;
  }
}

export async function render({
  deckFile, deck: givenDeck, themeName, mode = "light", out, style, signal, deckDir, write = true,
}) {
  // A caller may hand a deck object in directly (the content-trim loop audits
  // in-memory) instead of a path; `deckDir` still names where identity, meta
  // and relative assets resolve from.
  const dir = deckDir ?? (deckFile ? path.dirname(deckFile) : process.cwd());
  const deck = givenDeck ?? await loadDeck(deckFile);
  const identity = await loadIdentity(dir);
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
    const abs = path.isAbsolute(rel) ? rel : path.join(dir, rel);
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

    // A speaker note reserves 0.7in of the content box bottom and draws a bar
    // there, so no standard layout can collide with it and the chrome footer
    // stays free. Full-bleed slides (title, section, quote, image, freeform)
    // never take one — there is no standard content box to reserve.
    const noteBar = data.speaker_note && !isFull;
    const box = content(theme, brand, { full: isFull, note: noteBar ? 0.7 : 0, identity, type: data.type });
    const ctx = { theme, deck, data, identity, box, pres, resolveAsset, index: i + 1, total };

    // A plate replaces the flat background: headless Chrome rasterises the
    // theme's (or the slide's) HTML and the PNG becomes the true slide
    // background, under every shape and the chrome. Text stays native. The
    // content box rides along so a template can soft-panel the content area.
    //
    // It is placed BEFORE the layout draws. pptxgenjs numbers a background
    // image's relationship without counting chart relationships, so a
    // background assigned after addChart is written as a second rId1 and the
    // reader resolves the blip to the chart part — every chart slide in every
    // plate theme lost its background and rasterised white, with near-white
    // ink on it. The layouts paint through `paint()`, which stands aside when
    // a plate is already there.
    const plate = await renderSlidePlate({ theme, surface, slide: data, box, signal });
    if (plate) {
      const b64 = (await readFile(plate.png)).toString("base64");
      slide.background = { data: b64, path: "plate.png" };
      ctx.plate = true;
    } else if (!isFull) {
      slide.background = { color: hex(theme.palette.bg) };
    }
    // The decorative background layer paints before any layout, so cards and
    // text sit on top of it. Theme-owned tokens only — see drawBackground.
    if (!isFull) drawBackground(slide, theme);

    try {
      // A freeform slide has no native layout — the whole slide rasterises
      // from its html. Everything else draws natively as usual.
      // The fitter reports its floor hits into a per-slide sink; drain it after
      // so a slide that would need text below the readable floor is flagged
      // rather than silently shipping a tiny font.
      resetFloorEvents();
      // The layout draws through a watcher, so a box that cannot be right —
      // a negative height, a shape off the canvas — is reported rather than
      // written. The fitter can only speak for text inside a box it was given.
      const watch = watchGeometry(slide);
      if (!isFreeform) layout(watch.slide, ctx);
      for (const g of watch.problems()) problems.push(`slide ${i + 1} (${data.type}): ${g}`);
    } catch (err) {
      problems.push(`slide ${i + 1} (${data.type}): ${err.message}`);
    }
    for (const e of drainFloorEvents()) problems.push(`slide ${i + 1} (${data.type}): ${e}`);

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

  const outFile = out ?? path.join(dir, "out", "deck.pptx");
  await mkdir(path.dirname(outFile), { recursive: true });
  // The render gate: a deck with placeholder slides must not ship. The trim
  // loop and preview pass render in-memory (write:false) so they may audit;
  // a real render of placeholder content is refused — the user must regenerate
  // the failed slides first. This is the "no placeholders may ship" boundary.
  if (write) {
    const gate = placeholderGateError(deck);
    if (gate) {
      throw new Error(`${gate} (render refused)`);
    }
  }
  if (write) await pres.writeFile({ fileName: outFile });

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
