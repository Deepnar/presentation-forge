#!/usr/bin/env node
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { ROOT, BRAND } from "../src/paths.js";

const SRC = path.join(BRAND, "logos");
const OUT = path.join(BRAND, "generated");
const EXT = /\.(png|jpe?g|webp|tiff?|gif)$/i;

async function findSource(srcDir, stem) {
  const files = await readdir(srcDir).catch(() => []);
  const hit = files.find((f) => EXT.test(f) && path.parse(f).name.toLowerCase() === stem);
  return hit ? path.join(srcDir, hit) : null;
}

async function keyWhite(input, { satFloor = 28 } = {}) {
  const img = sharp(input).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;

  for (let i = 0; i < px; i++) {
    const o = i * info.channels;
    const r = data[o], g = data[o + 1], b = data[o + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max - min;
    if (data[o + 3] === 0) continue; // a real cutout — keep it transparent
    data[o + 3] = sat <= satFloor ? 255 - min : 255;
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png();
}

async function monochrome(input, tint) {
  const { data, info } = await sharp(input).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * info.channels;
    data[o] = tint.r;
    data[o + 1] = tint.g;
    data[o + 2] = tint.b;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png();
}

async function emit(outDir, name, pipeline) {
  const file = path.join(outDir, `${name}.png`);
  const info = await pipeline.toFile(file);
  console.log(`  ${name.padEnd(10)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)}  ${(info.size / 1024).toFixed(0)}kB`);
  return file;
}

async function main() {
  const inv = await normalizeBrand();
  if (inv.placeholder) console.log("  placeholder marks in use");
  console.log(`\nwrote -> ${path.relative(ROOT, OUT)}/`);
}

export async function normalizeBrand({ srcDir = SRC, outDir = OUT, placeholders = true } = {}) {
  await mkdir(outDir, { recursive: true });

  const [crestSrc, bannerSrc, watermarkSrc] = await Promise.all(
    ["crest", "banner", "watermark"].map((stem) => findSource(srcDir, stem)),
  );

  let placeholder = false;
  if (!crestSrc && !bannerSrc && !watermarkSrc && placeholders) {
    console.log("  no marks in brand/logos — generating placeholders\n");
    await import("./make-placeholder-brand.mjs");
    placeholder = true;
  }
  if (crestSrc) {
    const keyed = await keyWhite(crestSrc);
    const trimmed = await sharp(await keyed.toBuffer()).trim({ threshold: 1 }).png().toBuffer();
    await emit(outDir, "crest", sharp(trimmed).png({ compressionLevel: 9 }));
    await emit(outDir, "crest-light", await monochrome(trimmed, { r: 255, g: 255, b: 255 }));
    await emit(outDir, "crest-dark", await monochrome(trimmed, { r: 20, g: 20, b: 20 }));
  } else if (!placeholder) {
    console.log("  crest      — no source, skipped");
  }

  if (bannerSrc) {
    await emit(outDir, "banner", sharp(bannerSrc).trim({ threshold: 12 }).png({ compressionLevel: 9 }));
  } else if (!placeholder) {
    console.log("  banner     — no source, skipped");
  }

  if (watermarkSrc) {
    const keyed = await keyWhite(watermarkSrc);
    const trimmed = await sharp(await keyed.toBuffer()).trim({ threshold: 1 }).png().toBuffer();
    const { width, height } = await sharp(trimmed).metadata();
    const faded = sharp(trimmed)
      .composite([{
        input: { create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.90 } } },
        blend: "dest-out",
      }])
      .png({ compressionLevel: 9 });
    await emit(outDir, "watermark", faded);
  } else if (!placeholder) {
    console.log("  watermark  — no source, skipped");
  }

  return {
    sources: {
      crest: Boolean(crestSrc), banner: Boolean(bannerSrc), watermark: Boolean(watermarkSrc),
    },
    placeholder,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
