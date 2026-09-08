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

async function plateChromeBg(png) {
  try {
    const meta = await sharp(png).metadata();
    const w = meta.width, h = meta.height;
    const data = await sharp(png)
      .extract({ left: Math.floor(w * 0.84), top: 0, width: Math.floor(w * 0.16), height: Math.floor(h * 0.16) })
      .raw()
      .toBuffer();
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

  const resolveAsset = (rel) => {
    if (!rel || /^[a-z][a-z0-9+.-]*:\/\//i.test(rel)) return null;
    const abs = path.isAbsolute(rel) ? rel : path.join(dir, rel);
    return existsSync(abs) ? abs : null;
  };

  const total = deck.slides.length;
  const problems = [];
  const drawn = [];

  for (const [i, data] of deck.slides.entries()) {
    const layout = layouts[data.type];
    if (!layout && data.type !== "freeform") {
      problems.push(`slide ${i + 1}: no renderer for type "${data.type}"`);
      continue;
    }

    const slide = pres.addSlide();
    const isTitle = data.type === "title";
    const isFreeform = data.type === "freeform";
    const isFull =
      isTitle || isFreeform || ["section", "quote", "image", "chapter", "closing", "epigraph", "hero-image"].includes(data.type);
    const surface = isTitle || data.type === "closing" ? "title"
      : ["section", "chapter", "epigraph"].includes(data.type) ? "section"
      : "content";

    const bg = isTitle || data.type === "closing" ? theme.surfaces.title.bg
      : ["section", "chapter", "epigraph"].includes(data.type) ? theme.surfaces.section.bg
      : data.type === "quote" ? theme.palette.surface
      : data.type === "hero-image" ? theme.palette.ink
      : theme.palette.bg;

    const noteBar = data.speaker_note && !isFull;
    const box = content(theme, brand, { full: isFull, note: noteBar ? 0.7 : 0, identity, type: data.type });
    const ctx = { theme, deck, data, identity, box, pres, resolveAsset, index: i + 1, total, problems };

    const plate = await renderSlidePlate({ theme, surface, slide: data, box, signal });
    if (plate) {
      const b64 = (await readFile(plate.png)).toString("base64");
      slide.background = { data: b64, path: "plate.png" };
      ctx.plate = true;
    } else if (!isFull) {
      slide.background = { color: hex(theme.palette.bg) };
    }
    if (!isFull) drawBackground(slide, theme);

    try {
      resetFloorEvents();
      const watch = watchGeometry(slide);
      if (!isFreeform) layout(watch.slide, ctx);
      for (const g of watch.problems()) problems.push(`slide ${i + 1} (${data.type}): ${g}`);
      drawn.push(watch.drawn());
    } catch (err) {
      problems.push(`slide ${i + 1} (${data.type}): ${err.message}`);
    }
    for (const e of drainFloorEvents()) problems.push(`slide ${i + 1} (${data.type}): ${e}`);

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
      const plateBg = plate ? (await plateChromeBg(plate.png) ?? theme.surfaces?.[surface]?.bg ?? theme.palette.bg) : null;
      const chromeBg = plateBg ?? bg;
      applyContentChrome(slide, { brand, theme, identity, data, index: i + 1, total, bg: chromeBg });
    }

    if (data.notes) slide.addNotes(data.notes);
  }

  const outFile = out ?? path.join(dir, "out", "deck.pptx");
  await mkdir(path.dirname(outFile), { recursive: true });
  if (write) {
    const gate = placeholderGateError(deck);
    if (gate) {
      throw new Error(`${gate} (render refused)`);
    }
  }
  if (write) await pres.writeFile({ fileName: outFile });

  return { outFile, slides: total, theme: theme.label, problems, drawn };
}

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
