#!/usr/bin/env node
/**
 * Normalises whatever logo files land in brand/logos/ into render-ready assets
 * in brand/generated/. Sources are never modified.
 *
 *   crest      -> white background keyed out, auto-trimmed, PNG with alpha
 *   banner     -> trimmed, PNG
 *   watermark  -> keyed out + faded, for the report page background
 *
 * The keying matters: a crest with a baked-in white rectangle looks fine on the
 * light themes and obviously broken on the dark ones, and it is the single most
 * visible element on every slide.
 */
import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../src/paths.js";

const SRC = path.join(ROOT, "brand", "logos");
const OUT = path.join(ROOT, "brand", "generated");
const EXT = /\.(png|jpe?g|webp|tiff?|gif)$/i;

/** Find a source file by stem, whatever extension the user happened to save. */
async function findSource(stem) {
  const files = await readdir(SRC).catch(() => []);
  const hit = files.find((f) => EXT.test(f) && path.parse(f).name.toLowerCase() === stem);
  return hit ? path.join(SRC, hit) : null;
}

/**
 * Key out a white/grey background into alpha.
 *
 * Saturated pixels (the actual logo) stay fully opaque; unsaturated ones get
 * alpha proportional to how dark they are, so white -> 0 and black -> 255.
 * This preserves antialiased edges instead of producing a jagged cutout.
 */
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
    if (sat <= satFloor) {
      // Neutral pixel: treat lightness as transparency.
      data[o + 3] = Math.min(data[o + 3], 255 - min);
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png();
}

/**
 * Flatten every opaque pixel to one colour, keeping alpha — a "knockout" mark.
 * The crest's wordmark is dark navy, which disappears against the dark themes;
 * a single-colour reversed version is the standard brand-guideline answer and
 * stays legible on any background.
 */
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

async function emit(name, pipeline) {
  const file = path.join(OUT, `${name}.png`);
  const info = await pipeline.toFile(file);
  console.log(`  ${name.padEnd(10)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)}  ${(info.size / 1024).toFixed(0)}kB`);
  return file;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const [crestSrc, bannerSrc, watermarkSrc] = await Promise.all(
    ["crest", "banner", "watermark"].map(findSource),
  );

  if (!crestSrc && !bannerSrc && !watermarkSrc) {
    console.error(`No logo sources found in ${path.relative(ROOT, SRC)}/`);
    console.error(`Expected files named crest.*, banner.*, watermark.*`);
    process.exit(1);
  }

  if (crestSrc) {
    const keyed = await keyWhite(crestSrc);
    const trimmed = await sharp(await keyed.toBuffer()).trim({ threshold: 1 }).png().toBuffer();
    await emit("crest", sharp(trimmed).png({ compressionLevel: 9 }));
    // Reversed mark for dark themes.
    await emit("crest-light", await monochrome(trimmed, { r: 255, g: 255, b: 255 }));
  } else {
    console.log("  crest      — no source, skipped");
  }

  if (bannerSrc) {
    // The banner is a full-bleed strip with a rule; trim only flat margins.
    await emit("banner", sharp(bannerSrc).trim({ threshold: 12 }).png({ compressionLevel: 9 }));
  } else {
    console.log("  banner     — no source, skipped");
  }

  if (watermarkSrc) {
    const keyed = await keyWhite(watermarkSrc);
    const buf = await keyed.toBuffer();
    const { width, height } = await sharp(buf).metadata();
    // Fade to a page-safe intensity so body text stays readable over it.
    const faded = await sharp(buf)
      .trim({ threshold: 1 })
      .composite([{
        input: { create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.90 } } },
        blend: "dest-out",
      }])
      .png({ compressionLevel: 9 });
    await emit("watermark", faded);
  } else {
    console.log("  watermark  — no source, skipped");
  }

  console.log(`\nwrote -> ${path.relative(ROOT, OUT)}/`);
}

main();
