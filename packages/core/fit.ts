// @forge/core — text measurement and shrink-only fitting. Canonical
// implementation; src/fit.js is a compatibility facade preserving the
// legacy process-global floor-event API. Pure: no imports, no globals —
// diagnostics go to an explicit caller-supplied sink.

const ADVANCE = {
  serif: 0.495,
  sans: 0.515,
  mono: 0.60,
  condensed: 0.44,
  display: 0.47,
};

const FAMILY_CLASS: Record<string, string> = {
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
const classOf = (family: string | undefined): string => (family && FAMILY_CLASS[family]) ?? "sans";

const FAMILY_ADVANCE: Record<string, number> = { "Archivo Black": 0.62, Syne: 0.60, Fraunces: 0.60 };

const WIDE_GLYPHS: Record<string, number> = { "%": 0.95, "‰": 1.2, "—": 1.0, "@": 0.95, "#": 0.7, "×": 0.72, "+": 0.6 };

function weightFactor(weight: number | undefined): number {
  if ((weight ?? 400) >= 900) return 1.25;
  if ((weight ?? 400) >= 700) return 1.08;
  if ((weight ?? 400) >= 600) return 1.04;
  return 1;
}

export interface FitStyle {
  family?: string;
  size: number;
  weight?: number;
  tracking?: number;
  transform?: string;
  line?: number;
  _role?: string;
}

export interface FitOptions {
  min?: number;
  step?: number;
  floor?: number | null;
  events?: string[];
}

export interface OneLineOptions {
  min?: number;
  safety?: number;
  floor?: number | null;
  events?: string[];
}

const FLOOR_PT: Record<string, number> = {
  display: 28, heading: 22, subhead: 14, body: 14, caption: 12,
  eyebrow: 10, stat: 24, mono: 14,
};

function floorPt(style: FitStyle, floor: number | null | undefined): number | null {
  if (floor != null) return floor;
  return style?._role ? (FLOOR_PT[style._role] ?? null) : null;
}

export function floorOf(style: FitStyle): number | null {
  return floorPt(style, null);
}

interface FloorRule {
  // Effective floor in pt: min(role floor, nominal), so the floor never
  // grows a theme whose own size sits below its role floor.
  floor: number | null;
  // Exact lower bound on the returned scale. When the floor (not the
  // caller's min) binds, this is the exact floor/nominal ratio —
  // returned unrounded so the emitted point size cannot slip below
  // the floor through scale rounding.
  bound: number;
  floorBinds: boolean;
}

// Single owner of floor semantics: one effective-floor calculation
// for every canonical fit entry point.
function floorRule(
  style: FitStyle,
  nominal: number,
  floorOpt: number | null | undefined,
  min: number,
): FloorRule {
  const roleFloor = floorPt(style, floorOpt);
  if (roleFloor == null) return { floor: null, bound: min, floorBinds: false };
  const eff = Math.min(roleFloor, nominal);
  if (eff / nominal >= min) return { floor: eff, bound: eff / nominal, floorBinds: true };
  return { floor: eff, bound: min, floorBinds: false };
}

// Single owner of the shrink search: the first scale on the min/step
// grid where fitsAt holds, or null when nothing on the grid fits.
function searchScale(
  min: number,
  step: number,
  fitsAt: (s: number) => boolean,
): number | null {
  for (let s = 1; s >= min; s -= step) {
    if (fitsAt(s)) return s;
  }
  return null;
}

// Single owner of clamp-and-report: applies the floor rule to a search
// result. Floor-clamped scales return the exact bound; genuine fits
// round to 2dp without ever crossing the bound (see finishScale).
function finishFit(
  style: FitStyle,
  nominal: number,
  min: number,
  rule: FloorRule,
  need: number | null,
  events: string[] | undefined,
): number {
  if (need != null) {
    if (rule.bound > need) {
      if (rule.floor != null) reportFloor(style, need * nominal, rule.bound * nominal, events);
      return rule.floorBinds ? rule.bound : Math.round(rule.bound * 100) / 100;
    }
    return finishScale(need, rule);
  }
  if (rule.floor != null) reportFloor(style, min * nominal, rule.bound * nominal, events);
  return rule.floorBinds ? rule.bound : Math.round(rule.bound * 100) / 100;
}

// Single owner of scale rounding: legacy 2dp behavior when safe, but
// rounding can never move the emitted scale below the effective
// floor/min bound. A mathematically legal raw scale is still invalid
// if quantization crosses its floor, so near-boundary raws round up.
function finishScale(raw: number, rule: FloorRule): number {
  const rounded = Math.round(raw * 100) / 100;
  if (rule.floor != null && rounded < rule.bound) {
    return Math.ceil(raw * 100) / 100;
  }
  return rounded;
}

function reportFloor(style: FitStyle, neededPt: number, floor: number, events: string[] | undefined): void {
  if (!events) return;
  const role = style?._role ?? "text";
  const msg = `${role} would need ${Math.round(neededPt * 10) / 10}pt — floor ${Math.round(floor * 10) / 10}pt (cut text, don't shrink)`;
  if (!events.includes(msg)) events.push(msg);
}

const UPPER_FACTOR = 1.18;

// Hyphen-aware word fragments for width checks. Renderers break
// words after hyphens ("2000-cycle" renders as "2000-" + "cycle"),
// so a hyphenated token measures as its fragments rather than one
// unbreakable word. Mid-word breaks without a hyphen ("Head1" +
// "0") are degraded rendering the finding must still catch, so
// only hyphen boundaries split. Observed in rasterized output;
// PowerPoint breaks identically. Other dashes unobserved: left
// whole, documented in the V2-3F-G1 calibration record.
export function wordFragments(word: string): string[] {
  return String(word ?? "").split(/(?<=-)/).filter(Boolean);
}

export function measure(
  text: string,
  { family, size, weight, tracking = 0, transform }: FitStyle = { size: 12 },
): number {
  const em = size / 72;
  const base = FAMILY_ADVANCE[family ?? ""] ?? ADVANCE[classOf(family) as keyof typeof ADVANCE] * (WIDE_SANS.has(family ?? "") ? 1.08 : 1);
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

export function lineCount(text: string, width: number, style: FitStyle): number {
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

export function heightOf(text: string, width: number, style: FitStyle, lineRatio = 1.35): number {
  return lineCount(text, width, style) * (style.size / 72) * lineRatio;
}

export function fitScale(
  text: string,
  width: number,
  height: number,
  style: FitStyle,
  { min = 0.62, step = 0.04, floor = null, events }: FitOptions = {},
): number {
  const ratio = style.line ?? 1.35;
  const nominal = style.size;
  const rule = floorRule(style, nominal, floor, min);
  const need = searchScale(min, step, (s) =>
    heightOf(text, width, { ...style, size: nominal * s }, ratio) <= height);
  return finishFit(style, nominal, min, rule, need, events);
}

// Paragraph-stack variant of fitScale: total height is the SUM of the
// per-paragraph heights, because joining paragraphs into one string
// loses their line breaks inside lineCount and under-counts
// multi-paragraph elements. Same grid, same floor rule, same events.
export function fitScaleStack(
  texts: string[],
  width: number,
  height: number,
  style: FitStyle,
  { min = 0.62, step = 0.04, floor = null, events }: FitOptions = {},
): number {
  const ratio = style.line ?? 1.35;
  const nominal = style.size;
  const rule = floorRule(style, nominal, floor, min);
  const need = searchScale(min, step, (s) =>
    texts.reduce((n, t) => n + heightOf(t, width, { ...style, size: nominal * s }, ratio), 0) <= height);
  return finishFit(style, nominal, min, rule, need, events);
}

export interface StyledStackItem {
  // One wrapping unit (a paragraph): measured with its own style.
  text: string;
  style: FitStyle;
  // Every run style inside this paragraph. The uniform floor bound
  // spans all of them, so a smaller run's floor can hold the shared
  // scale even when the measurement style is larger. Defaults to
  // [style] for single-style paragraphs.
  runStyles?: FitStyle[];
}

export interface StackFitOptions extends FitOptions {}

interface StackRule extends FloorRule {
  bindStyle: FitStyle;
  bindNominal: number;
}

// Uniform-scale lower bound across every participating run style:
// max(effectiveFloor(run) / nominalSize(run)), subject to the same
// min semantics as a single-style rule. A run already at its
// effective floor yields ratio 1 and the stack cannot shrink.
function stackFloorRule(
  items: StyledStackItem[],
  floorOpt: number | null | undefined,
  min: number,
): StackRule {
  let best: FloorRule = { floor: null, bound: min, floorBinds: false };
  let bindStyle: FitStyle = items[0]?.style ?? { size: 12 };
  let bindNominal = bindStyle.size;
  const consider = (style: FitStyle): void => {
    const r = floorRule(style, style.size, floorOpt, min);
    if (r.bound > best.bound) {
      best = { floor: r.floor, bound: r.bound, floorBinds: r.floorBinds };
      bindStyle = style;
      bindNominal = style.size;
    }
  };
  for (const item of items) {
    consider(item.style);
    for (const run of item.runStyles ?? []) consider(run);
  }
  return { ...best, bindStyle, bindNominal };
}

// Mixed-style stack fit: each paragraph is measured with the style
// actually drawn for it (family, size, weight, tracking, transform,
// line), while one uniform scale covers the element under the
// strongest floor ratio across ALL participating runs. Hierarchy is
// preserved because every run keeps its own nominal size — only the
// scale is shared. Pure: same grid, same floors, same events.
export function fitStyledStack(
  items: StyledStackItem[],
  width: number,
  height: number,
  { min = 0.62, step = 0.04, floor = null, events }: StackFitOptions = {},
): number {
  if (!items.length) return 1;
  const rule = stackFloorRule(items, floor, min);
  const need = searchScale(min, step, (s) =>
    items.reduce((n, it) => {
      const ratio = it.style.line ?? 1.35;
      const nominal = it.style.size;
      return n + heightOf(it.text, width, { ...it.style, size: nominal * s }, ratio);
    }, 0) <= height);
  return finishFit(rule.bindStyle, rule.bindNominal, min, rule, need, events);
}

// Exact uniform-scale lower bound across run styles, for callers that
// combine several canonical scales (stack + word guard + vertical)
// under one shared scale. Same bound fitStyledStack enforces.
export function uniformFloorBound(
  styles: FitStyle[],
  { min = 0.62, floor = null }: { min?: number; floor?: number | null } = {},
): number {
  let bound = min;
  for (const style of styles) {
    const r = floorRule(style, style.size, floor, min);
    if (r.bound > bound) bound = r.bound;
  }
  return bound;
}

export function fitScaleAll(
  texts: string[],
  width: number,
  height: number,
  style: FitStyle,
  opts?: FitOptions,
): number {
  return Math.min(...texts.filter(Boolean).map((t) => fitScale(t, width, height, style, opts)), 1);
}

export function fitOneLine(
  text: string,
  width: number,
  style: FitStyle,
  { min = 0.5, safety = 0.88, floor = null, events }: OneLineOptions = {},
): number {
  const nominal = style.size;
  const rule = floorRule(style, nominal, floor, min);
  const w = measure(text, style);
  if (w <= width * safety) return 1;
  const raw = (width * safety) / w;
  if (rule.floor != null && rule.bound > raw) {
    reportFloor(style, raw * nominal, rule.bound * nominal, events);
    return rule.floorBinds ? rule.bound : Math.round(rule.bound * 100) / 100;
  }
  return finishScale(Math.max(min, raw), rule);
}

export interface LineHeightOptions {
  min?: number;
  events?: string[];
}

// Vertical one-line budget: the largest scale at which a single line
// still fits inside height. Obeys the same shrink-stop semantics as
// the width fits — an insufficient box diagnoses at the effective
// floor instead of shrinking through it.
export function fitLineHeight(
  style: FitStyle,
  height: number,
  { min = 0.1, events }: LineHeightOptions = {},
): number {
  const nominal = style.size;
  const lineH = (nominal / 72) * (style.line ?? 1.35);
  if (!(lineH > 0)) return 1;
  const raw = height / lineH;
  if (raw >= 1) return 1;
  const rule = floorRule(style, nominal, null, min);
  if (rule.floor != null && rule.bound > raw) {
    reportFloor(style, raw * nominal, rule.bound * nominal, events);
    return rule.bound;
  }
  return Math.max(min, raw);
}
