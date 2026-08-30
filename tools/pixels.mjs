#!/usr/bin/env node
/**
 * Measure contrast on the pixels that were actually painted.
 *
 *   node tools/pixels.mjs <slide.png> <ink-hex> <x0> <y0> <x1> <y1>
 *   node tools/pixels.mjs out/slide-1.png '#C9FFCE' 0.40 0.60 0.62 0.68
 *
 * The rectangle is in fractions of the image, so the same numbers work at any
 * dpi. It reports the mean colour of that region and its WCAG ratio against
 * the ink.
 *
 * Why this exists rather than reading the theme tokens: a plate theme's ground
 * is not its `palette.bg`. `retro-crt` lights the middle of its tube, and the
 * muted inks that measured 4.6:1 against the flat token measured 2.8:1 against
 * the band the text actually sits on. The token is a claim; the raster is the
 * product.
 *
 * Sample BESIDE the text, never through it — glyphs are the brightest thing in
 * a crop and will flatter the reading.
 */
import sharp from "sharp";
import { contrast } from "../src/chartpalette.js";

const [file, ink, ...rect] = process.argv.slice(2);
if (!file || !ink || rect.length !== 4) {
  console.error("usage: node tools/pixels.mjs <png> <ink-hex> <x0> <y0> <x1> <y1>   (fractions 0..1)");
  process.exit(2);
}

const [x0, y0, x1, y1] = rect.map(Number);
const { width, height } = await sharp(file).metadata();
const left = Math.round(x0 * width), top = Math.round(y0 * height);
const w = Math.max(1, Math.round((x1 - x0) * width));
const h = Math.max(1, Math.round((y1 - y0) * height));

const raw = await sharp(file).extract({ left, top, width: w, height: h }).raw().toBuffer();
let r = 0, g = 0, b = 0;
const px = raw.length / 3;
for (let i = 0; i < raw.length; i += 3) { r += raw[i]; g += raw[i + 1]; b += raw[i + 2]; }

const mean = [r / px, g / px, b / px].map((v) => Math.round(v));
const hex = "#" + mean.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const ratio = contrast(hex, ink);

console.log(`ground ${hex}   ink ${ink.toUpperCase()}   ${ratio.toFixed(2)}:1`);
// 4.5 is the floor for body-sized text, 3.0 for display; below 3 the text is
// not secondary, it is gone.
console.log(ratio >= 4.5 ? "  clears body text" : ratio >= 3 ? "  large text only" : "  FAILS — not legible at any size");
