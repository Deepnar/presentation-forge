
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
  Manrope: "sans", "Space Grotesk": "sans", Poppins: "sans", Outfit: "sans",
  "DM Sans": "sans", "IBM Plex Sans": "sans",
};

const WIDE_SANS = new Set(["Inter", "Manrope", "Poppins", "Outfit", "Space Grotesk", "DM Sans", "IBM Plex Sans"]);
const classOf = (family) => FAMILY_CLASS[family] ?? "sans";

const FAMILY_ADVANCE = { "Archivo Black": 0.62, Syne: 0.60, Fraunces: 0.60 };

const WIDE_GLYPHS = { "%": 0.95, "‰": 1.2, "—": 1.0, "@": 0.95, "#": 0.7, "×": 0.72, "+": 0.6 };

function weightFactor(weight) {
  if (weight >= 900) return 1.25;
  if (weight >= 700) return 1.08;
  if (weight >= 600) return 1.04;
  return 1;
}

const FLOOR_PT = {
  display: 28, heading: 22, subhead: 14, body: 14, caption: 12,
  eyebrow: 10, stat: 24, mono: 14,
};

function floorPt(style, floor) {
  if (floor != null) return floor;
  return style?._role ? (FLOOR_PT[style._role] ?? null) : null;
}

export function floorOf(style) {
  return floorPt(style, null);
}

let floorEvents = [];
export function resetFloorEvents() { floorEvents = []; }
export function drainFloorEvents() { const e = floorEvents; floorEvents = []; return e; }

function reportFloor(style, neededPt, floor) {
  const role = style?._role ?? "text";
  const msg = `${role} would need ${Math.round(neededPt * 10) / 10}pt — floor ${Math.round(floor * 10) / 10}pt (cut text, don't shrink)`;
  if (!floorEvents.includes(msg)) floorEvents.push(msg);
}

const UPPER_FACTOR = 1.18;

export function measure(text, { family, size, weight, tracking = 0, transform } = {}) {
  const em = size / 72;
  const base = FAMILY_ADVANCE[family] ?? ADVANCE[classOf(family)] * (WIDE_SANS.has(family) ? 1.08 : 1);
  const adv = base * weightFactor(weight) * (transform === "upper" ? UPPER_FACTOR : 1);
  const track = tracking / 72;
  const s = String(text);
  let excess = 0;
  for (const ch of s) {
    const wide = /\d/.test(ch) ? 0.58 : WIDE_GLYPHS[ch];
    if (wide) excess += Math.max(0, wide * weightFactor(weight) - adv);
  }
  return s.length * (adv * em + track) + excess * em;
}

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

export function heightOf(text, width, style, lineRatio = 1.35) {
  return lineCount(text, width, style) * (style.size / 72) * lineRatio;
}

export function fitScale(text, width, height, style, { min = 0.62, step = 0.04, floor = null } = {}) {
  const ratio = style.line ?? 1.35;
  const nominal = style.size;
  const floor_ = floorPt(style, floor);
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

  if (floor_ != null) reportFloor(style, min * nominal, minScale * nominal);
  return Math.round(minScale * 100) / 100;
}

export function fitScaleAll(texts, width, height, style, opts) {
  return Math.min(...texts.filter(Boolean).map((t) => fitScale(t, width, height, style, opts)), 1);
}

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
