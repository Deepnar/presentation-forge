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
 * Saturated pixels (the actual logo) become fully opaque; unsaturated ones get
 * alpha proportional to how dark they are, so white -> 0 and black -> 255.
 * This preserves antialiased edges instead of producing a jagged cutout.
 *
 * The source's own alpha channel is deliberately rebuilt from RGB, not trusted.
 * Supplied logos are frequently "transparent" JPEG-like PNGs whose alpha is
 * meaningless (one real crest shipped with every pixel at 14/255 — a ghost on
 * any slide, and keying could not fix it because saturated pixels kept the
 * broken alpha). The colour data is the truth; the alpha channel is not.
 *
 * A pixel that is fully transparent in the source stays transparent — that is
 * a real cutout, not a broken alpha. Everything with any alpha at all is
 * content: saturated pixels become opaque, neutral ones are keyed by lightness
 * (white -> 0, grey -> partial), which is what preserves antialiased edges.
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
    if (data[o + 3] === 0) continue; // a real cutout — keep it transparent
    // Neutral pixel: treat lightness as transparency. Saturated pixel: opaque.
    data[o + 3] = sat <= satFloor ? 255 - min : 255;
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
    // A fresh clone has no marks — real ones are trademarks and stay out of the
    // repository. Generate neutral stand-ins so the renderer works immediately
    // rather than failing on a missing asset.
    console.log("  no marks in brand/logos — generating placeholders\n");
    await import("./make-placeholder-brand.mjs");
    return main();
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
    // Trim BEFORE measuring: the fade overlay must match the trimmed canvas, and
    // sharp rejects a composite larger than its base. A source with no white
    // margin trims to nothing, which hides this.
    const trimmed = await sharp(await keyed.toBuffer()).trim({ threshold: 1 }).png().toBuffer();
    const { width, height } = await sharp(trimmed).metadata();
    // Fade to a page-safe intensity so body text stays readable over it.
    const faded = sharp(trimmed)
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
