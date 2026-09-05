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
 *
 * Two deliberate properties bound how small text may get:
 * - `measure` is em-aware (the advance is a fraction of the em, and the em is
 *   size/72). It used to return `length * advance` without the em factor —
 *   ~5.7x wider than reality at 13pt — and every fitter consumer silently
 *   inherited that pessimism, so ordinary content "needed" far more box than it
 *   does and the fitter shrank fonts that were already readable. That is the
 *   classic "the font is usually small" report, fixed at the source.
 * - a per-role FLOOR (body ~14pt, caption ~12pt) below which the fitter will
 *   not go. A slide that genuinely cannot fit at the floor does not get a
 *   smaller font — it gets a flag in the render problems, so the density sweep
 *   or the vision critic reduces the TEXT instead. A smaller font is never the
 *   answer to too much content.
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

/**
 * Per-family advances for faces a class average gets badly wrong.
 *
 * `weightFactor` widens the estimate for heavy weights, but it reads the
 * theme's weight token — and Archivo Black declares 400, because black is the
 * only weight the family ships. So the widest display face in the gallery was
 * being measured at the narrowest display advance, and its stat figures wrapped
 * "48.2K" into "48.2 / K". Syne and Fraunces run wide at the weights the themes
 * actually use.
 */
const FAMILY_ADVANCE = { "Archivo Black": 0.62, Syne: 0.60, Fraunces: 0.60 };

/** Glyphs that are far wider than the family's letter average, in ems. */
const WIDE_GLYPHS = { "%": 0.95, "‰": 1.2, "—": 1.0, "@": 0.95, "#": 0.7, "×": 0.72, "+": 0.6 };

// Black/ExtraBold faces run far wider than the family's regular advance —
// Merriweather Black stat digits ("53 kWh") wrap at a size a 0.495 em estimate
// predicts fits one line; the real average is ~0.60 em. Weight widens the
// estimate so one-line values stay one line.
function weightFactor(weight) {
  if (weight >= 900) return 1.25;
  if (weight >= 700) return 1.08;
  if (weight >= 600) return 1.04;
  return 1;
}

/**
 * The smallest rendered point size each role is allowed to reach. The fitter
 * clamps at this size and reports "would need Xpt" instead of shrinking
 * further — less text is the fix, never a smaller font. The values are the
 * readable floor for body-ish text and scale up for display roles; the theme's
 * own nominal size always wins over the floor when it is lower (a compact mono
 * theme is deliberately small, and the floor must never grow text past the
 * theme's design). `reportFloor` states the EFFECTIVE floor for that reason —
 * the number here is the role's, not necessarily the one applied.
 */
const FLOOR_PT = {
  display: 28, heading: 22, subhead: 14, body: 14, caption: 12,
  eyebrow: 10, stat: 24, mono: 14,
};

/** The floor a style is bound by, in points, or null when unknown. */
function floorPt(style, floor) {
  if (floor != null) return floor;
  return style?._role ? (FLOOR_PT[style._role] ?? null) : null;
}

/**
 * The floor a style is bound by, for a layout that wants to ASK rather than
 * fit. A layout with a fallback composition needs to know whether the content
 * would go below the floor before it commits to the treatment that cannot
 * hold it — calling a fitter to find out would report a failure the layout is
 * about to avoid.
 */
export function floorOf(style) {
  return floorPt(style, null);
}

/**
 * A per-slide sink for floor hits. The layouts call the fit functions directly
 * (~140 call sites) and have no idea a slide-level problems[] exists, so the
 * floor events are collected here and drained by the renderer after each layout
 * runs. Safe because layouts render synchronously within render().
 */
let floorEvents = [];
export function resetFloorEvents() { floorEvents = []; }
export function drainFloorEvents() { const e = floorEvents; floorEvents = []; return e; }

/**
 * `floor` here is the EFFECTIVE floor — the size the text was actually clamped
 * at — not the role's nominal floor from FLOOR_PT.
 *
 * They differ whenever a theme's own size is already below the role floor, and
 * the fitter has always handled that correctly (`minScale` caps at 1, so a
 * compact theme keeps its design size and is never grown). Only the MESSAGE
 * was wrong: `minimal-muji` sets body at 13pt and every one of its floor
 * reports read "floor 14pt", which describes a rule that was not the one
 * applied and makes the gap look a point wider than it is. A verdict that
 * misstates its own threshold sends whoever reads it looking in the wrong
 * place.
 */
function reportFloor(style, neededPt, floor) {
  const role = style?._role ?? "text";
  const msg = `${role} would need ${Math.round(neededPt * 10) / 10}pt — floor ${Math.round(floor * 10) / 10}pt (cut text, don't shrink)`;
  // fitScaleAll re-fits every member; only the first identical miss matters.
  if (!floorEvents.includes(msg)) floorEvents.push(msg);
}

/**
 * The uppercase penalty.
 *
 * ADVANCE is a lowercase average and `eyebrow` sets `transform: upper`, so
 * every letter of a tracked all-caps label was counted at the width of a
 * lowercase one. Caps run roughly a fifth wider than the mixed-case average in
 * the faces this gallery uses.
 */
const UPPER_FACTOR = 1.18;

/** Estimated rendered width, in inches, of a single line. */
export function measure(text, { family, size, weight, tracking = 0, transform } = {}) {
  const em = size / 72;
  const base = FAMILY_ADVANCE[family] ?? ADVANCE[classOf(family)] * (WIDE_SANS.has(family) ? 1.08 : 1);
  const adv = base * weightFactor(weight) * (transform === "upper" ? UPPER_FACTOR : 1);
  // `tracking` is POINTS. It reaches the renderer as pptxgenjs `charSpacing`,
  // which OOXML specifies in points, and this read it as a percentage of the em
  // — wrong by a factor of 100/size, so the error was worst exactly where
  // tracking is heaviest. A 10pt eyebrow at tracking 1.6 was measured with a
  // tenth of the letter-spacing it renders with, which is how `matrix`'s
  // rotated axis label came out as "CONTRACT / ED" with themematrix clean:
  // the sweep asks the same measure the layout did.
  const track = tracking / 72;
  const s = String(text);
  // ADVANCE is a lowercase average, and a stat value is not lowercase. Lining
  // figures sit near 0.58 em in most faces, and a percent sign is one of the
  // widest glyphs there is — near a full em. Measuring either at the letter
  // average is what wrapped "48.2K" into "48.2 / K" and "99.9%" into
  // "99.9 / %" across a third of the gallery: the fitter believed the value
  // fitted one line, and on a fixed-height box the second line landed on the
  // label underneath it.
  let excess = 0;
  for (const ch of s) {
    const wide = /\d/.test(ch) ? 0.58 : WIDE_GLYPHS[ch];
    if (wide) excess += Math.max(0, wide * weightFactor(weight) - adv);
  }
  return s.length * (adv * em + track) + excess * em;
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
 *
 * A role floor caps the shrink: when the fit needs a rendered size below the
 * floor the scale clamps at the floor (or the theme nominal, whichever is
 * smaller) and a floor event is reported, so the renderer can flag the slide
 * for density reduction instead of shipping a tiny font.
 */
export function fitScale(text, width, height, style, { min = 0.62, step = 0.04, floor = null } = {}) {
  const ratio = style.line ?? 1.35;
  const nominal = style.size;
  const floor_ = floorPt(style, floor);
  // The floor is a shrink stop, never a grow: min scale = floor/nominal, but a
  // theme whose nominal is already below the floor keeps its design size.
  const minScale = floor_ == null ? min : Math.min(1, Math.max(min, floor_ / nominal));

  let need = null;
  for (let s = 1; s >= min; s -= step) {
    const h = heightOf(text, width, { ...style, size: nominal * s }, ratio);
    if (h <= height) { need = s; break; }
  }

  if (need != null) {
    if (minScale > need) {
      if (floor_ != null) reportFloor(style, need * nominal, minScale * nominal);
      return Math.round(minScale * 100) / 100;
    }
    return Math.round(need * 100) / 100;
  }

  // Nothing fits even at `min` — overflow at any size. The floor cannot fix
  // that; report it and clamp rather than pretending a smaller font would.
  if (floor_ != null) reportFloor(style, min * nominal, minScale * nominal);
  return Math.round(minScale * 100) / 100;
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
export function fitOneLine(text, width, style, { min = 0.5, safety = 0.88, floor = null } = {}) {
  const nominal = style.size;
  const floor_ = floorPt(style, floor);
  const w = measure(text, style);
  if (w <= width * safety) return 1;
  const raw = (width * safety) / w;
  const need = Math.max(min, raw);
  if (floor_ != null) {
    const minScale = Math.min(1, Math.max(min, floor_ / nominal));
    if (minScale > raw) {
      reportFloor(style, raw * nominal, minScale * nominal);
      return Math.round(minScale * 100) / 100;
    }
  }
  return Math.round(need * 100) / 100;
}
