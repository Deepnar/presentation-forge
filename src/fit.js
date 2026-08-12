/**
 * Text fitting.
 *
 * OOXML has no "shrink text to fit" that renderers honour consistently, and
 * PowerPoint's own autofit is not applied until a human opens the file — so a
 * generated deck can look fine in LibreOffice and overflow on the projector.
 * We therefore estimate up front and bake in a smaller size.
 *
 * This is a heuristic, not real font metrics: average glyph advance as a
 * fraction of em, tuned per family class. It is intentionally slightly
 * pessimistic — a hair too small never loses marks, overflow does. The vision
 * critic pass catches whatever this misses.
 */

const ADVANCE = {
  serif: 0.495,
  sans: 0.515,
  mono: 0.60,
  condensed: 0.44,
  display: 0.47,
};

const FAMILY_CLASS = {
  Merriweather: "serif", Lora: "serif", "Libre Baskerville": "serif",
  "Source Serif 4": "serif", "Playfair Display": "display", "Bodoni Moda": "display",
  "Cormorant Garamond": "serif", Fraunces: "serif", "Instrument Serif": "display",
  "IBM Plex Mono": "mono", "JetBrainsMono NF": "mono",
  "Bebas Neue": "condensed", Oswald: "condensed", Anton: "condensed",
  "Archivo Black": "display",
  // Wider geometric sans (the newer theme gallery). Slightly pessimistic
  // advances: these run wide, and an underestimated width wraps a one-line
  // title straight into the element below it.
  Manrope: "sans", "Space Grotesk": "sans", Poppins: "sans", Outfit: "sans",
  "DM Sans": "sans", "IBM Plex Sans": "sans",
};

const WIDE_SANS = new Set(["Inter", "Manrope", "Poppins", "Outfit", "Space Grotesk", "DM Sans", "IBM Plex Sans"]);
const classOf = (family) => FAMILY_CLASS[family] ?? "sans";

/** Estimated rendered width, in inches, of a single line. */
export function measure(text, { family, size, tracking = 0 }) {
  const em = size / 72;
  const adv = ADVANCE[classOf(family)] * (WIDE_SANS.has(family) ? 1.08 : 1);
  const track = (tracking / 100) * em;
  return String(text).length * (adv + track);
}

/** Estimated wrapped line count for `text` inside `width` inches. */
export function lineCount(text, width, style) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return 0;

  let lines = 1;
  let cur = 0;
  const space = measure(" ", style);
  for (const word of words) {
    const w = measure(word, style);
    if (cur > 0 && cur + space + w > width) {
      lines++;
      cur = w;
    } else {
      cur += (cur > 0 ? space : 0) + w;
    }
  }
  return lines;
}

/** Height in inches that `text` needs at this style. */
export function heightOf(text, width, style, lineRatio = 1.35) {
  return lineCount(text, width, style) * (style.size / 72) * lineRatio;
}

/**
 * Largest scale in [min, 1] at which `text` fits `width` x `height`.
 * Returns 1 when it already fits — the fitter shrinks, never grows, because
 * growing would break the theme's vertical rhythm.
 */
export function fitScale(text, width, height, style, { min = 0.62, step = 0.04 } = {}) {
  const ratio = style.line ?? 1.35;
  for (let s = 1; s >= min; s -= step) {
    const h = heightOf(text, width, { ...style, size: style.size * s }, ratio);
    if (h <= height) return Math.round(s * 100) / 100;
  }
  return min;
}

/** Same, applied to the longest member of a set (so siblings stay uniform). */
export function fitScaleAll(texts, width, height, style, opts) {
  return Math.min(...texts.filter(Boolean).map((t) => fitScale(t, width, height, style, opts)), 1);
}

/**
 * Shrink to fit exactly ONE rendered line.
 *
 * fitScale is height-driven and trusts the width heuristic; for wide Black
 * weights (stat digits in Merriweather) the heuristic is optimistic, so a value
 * can still wrap where the real renderer measures it wider — the fitter says
 * one line, LibreOffice draws two. Scaling off the measured width with a
 * pessimistic safety factor makes one line a guarantee, not an estimate.
 */
export function fitOneLine(text, width, style, { min = 0.5, safety = 0.88 } = {}) {
  const w = measure(text, style);
  if (w <= width * safety) return 1;
  return Math.max(min, Math.round(((width * safety) / w) * 100) / 100);
}
