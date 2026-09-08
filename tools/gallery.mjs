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
const OUT = path.join(ROOT, "app", "gallery");
const pick = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : null;
};
const themes = pick("--themes") ?? (await listThemes());

const deck = await specimenDeck();
const work = path.join(ROOT, "decks", ".specimen-cache", "__gallery__");
await mkdir(work, { recursive: true });
await mkdir(OUT, { recursive: true });

await writeFile(path.join(work, "meta.yaml"), "chrome:\n  branding: none\n  slide_numbers: false\n", "utf8");

for (const theme of themes) {
  const themed = structuredClone(deck);
  themed.theme = theme;
  themed.title = "The shape of an argument";
  themed.subtitle = "A neutral specimen";
  const body = themed.slides.find((s) => s.type === "bullets") ?? themed.slides[5];
  themed.slides = [themed.slides[0], body];
  try {
    const outFile = path.join(work, `${theme}.pptx`);
    const r = await render({ deck: themed, deckDir: work, themeName: theme, out: outFile });
    const p = await preview(r.outFile, { dpi: 60, outDir: path.join(work, `${theme}`) });

    const half = 480;
    const halfH = Math.round(half * 9 / 16);
    const panes = await Promise.all(
      p.pages.slice(0, 2).map((src) => sharp(src).resize(half, halfH, { fit: "fill" }).toBuffer()),
    );
    await sharp({
      create: { width: half * panes.length, height: halfH, channels: 3, background: "#ffffff" },
    })
      .composite(panes.map((input, i) => ({ input, left: i * half, top: 0 })))
      .png({ compressionLevel: 9, palette: true, quality: 82 })
      .toFile(path.join(OUT, `${theme}.png`));
    process.stdout.write(`  ${theme}\n`);
  } catch (err) {
    console.error(`  ${theme}: ${err.message}`);
  }
}
console.log(`gallery: ${path.relative(ROOT, OUT)}`);
