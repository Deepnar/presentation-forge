/**
 * The categorical palette a chart's series are drawn in.
 *
 * Charts used to borrow their colours from the UI palette:
 * `[accent, accent_alt ?? ink, ink_muted, rule]`. Two of those four roles are
 * deliberately low-contrast — `ink_muted` is secondary text and `rule` is a
 * hairline — so the third series was always washed out and the fourth was very
 * close to the background. On a monochrome theme it was worse than washed out:
 * `high-contrast-mono` sets `accent: #000000` and `accent_alt: #FFFFFF`, so a
 * four-series chart drew three identical black series and one white one that
 * vanished into the page. A whole series disappearing is a data-integrity bug,
 * not a styling preference.
 *
 * A theme may now declare `tokens.chart.series` — exact values, human-authored,
 * like every other token. When it does not, this derives a palette that is at
 * least legible: hues spread around the theme's own accent for a chromatic
 * theme, a lightness ramp for a monochrome one, and every entry forced to clear
 * a contrast floor against the background it is drawn on.
 *
 * The floor is 3:1, the WCAG threshold for non-text graphics. A bar is a large
 * solid area, so 3:1 is genuinely enough; text on the same background is held
 * to a higher bar elsewhere.
 */

const CONTRAST_FLOOR = 3;

/* ------------------------------------------------------------ colour maths */

export function parseHex(c) {
  const s = String(c ?? "").replace(/^#/, "");
  if (s.length < 6) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

const toHex = ({ r, g, b }) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** WCAG relative luminance. */
export function luminance(c) {
  const rgb = parseHex(c);
  if (!rgb) return 1;
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl(c) {
  const rgb = parseHex(c);
  if (!rgb) return { h: 0, s: 0, l: 0 };
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToHex({ h, s, l }) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) {
    const v = Math.round(l * 255);
    return toHex({ r: v, g: v, b: v });
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return toHex({ r: channel(h + 1 / 3) * 255, g: channel(h) * 255, b: channel(h - 1 / 3) * 255 });
}

/**
 * Push a colour's lightness away from the background until it clears the
 * contrast floor, keeping its hue and saturation. Which direction depends on
 * the background: on a dark page a series has to get lighter, on a light page
 * darker. If neither direction can reach the floor the extreme is returned —
 * that only happens for a mid-grey background, where the contract test is the
 * right place to complain rather than the renderer.
 */
export function ensureContrast(color, bg, floor = CONTRAST_FLOOR) {
  if (contrast(color, bg) >= floor) return color;
  const { h, s } = rgbToHsl(color);
  const bgLight = luminance(bg) > 0.4;
  // A near-neutral has no hue to preserve, so the minimal adjustment is the
  // wrong one: an ink-black series on a dark page became mid-grey, sitting at
  // the same value as the coloured series beside it. Neutrals invert instead,
  // which is what "ink" means on a dark ground.
  if (s < 0.12) {
    const inverted = hslToHex({ h: 0, s: 0, l: bgLight ? 0.07 : 0.95 });
    if (contrast(inverted, bg) >= floor) return inverted;
  }
  let best = color;
  let bestRatio = contrast(color, bg);
  for (let i = 1; i <= 100; i++) {
    const l = bgLight ? 0.5 - i * 0.005 : 0.5 + i * 0.005;
    const candidate = hslToHex({ h, s, l });
    const ratio = contrast(candidate, bg);
    if (ratio > bestRatio) { best = candidate; bestRatio = ratio; }
    if (ratio >= floor) return candidate;
  }
  return best;
}

/* ------------------------------------------------------------- the palette */

/** A theme whose accent carries essentially no hue is monochrome by intent. */
export function isMonochrome(palette) {
  const accent = rgbToHsl(palette.accent);
  const alt = rgbToHsl(palette.accent_alt ?? palette.accent);
  return accent.s < 0.12 && alt.s < 0.12;
}

/**
 * A lightness ramp for a monochrome theme. Injecting hue would break a design
 * that is deliberately colourless, so series are separated by value instead —
 * which is how a monochrome print chart has always done it. Steps are spaced
 * far enough apart to stay distinguishable after rasterisation.
 */
function monoRamp(palette, count) {
  const bgLight = luminance(palette.bg) > 0.4;
  // End the ramp exactly where the contrast floor is. Spreading past it and
  // letting ensureContrast pull the last steps back bunches them together —
  // the two palest greys came out one shade apart and read as one series.
  const limit = greyLimit(palette.bg, bgLight);
  const near = bgLight ? 0.08 : 0.95;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    out.push(hslToHex({ h: 0, s: 0, l: near + (limit - near) * t }));
  }
  return out;
}

/** The furthest a neutral grey can travel towards the background and still clear the floor. */
function greyLimit(bg, bgLight, floor = CONTRAST_FLOOR) {
  let lo = bgLight ? 0.08 : 0.5;
  let hi = bgLight ? 0.5 : 0.95;
  // Binary search the boundary; contrast is monotonic in lightness either side.
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const ok = contrast(hslToHex({ h: 0, s: 0, l: mid }), bg) >= floor;
    if (bgLight) { if (ok) lo = mid; else hi = mid; }
    else { if (ok) hi = mid; else lo = mid; }
  }
  return bgLight ? lo : hi;
}

/**
 * CIE L*a*b*, and the CIE76 distance between two colours.
 *
 * Hue gap alone is the wrong objective for a categorical palette: two colours
 * can sit 20 degrees apart and be told apart instantly, or 20 degrees apart at
 * the same lightness and read as one colour. Roughly, dE below 2.3 is the
 * just-noticeable difference and below 10 is "similar" — so this is the number
 * the picker should be maximising, not hue.
 */
export function lab(color) {
  const c = parseHex(color);
  if (!c) return [0, 0, 0];
  const lin = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [lin(c.r), lin(c.g), lin(c.b)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

export function deltaE(a, b) {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Shortest distance between two hues on the wheel, 0..180. */
function hueGap(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
}

/**
 * Hues spread around the theme's own accent. The accent leads so a chart still
 * reads as belonging to its theme; each further slot takes the hue that is
 * furthest from every hue already chosen.
 *
 * A fixed rotation table was the obvious approach and it collided: once the
 * theme's own accent_alt occupied slot two, the next fixed rotation could land
 * a few degrees away from it, and two series came out the same colour. Choosing
 * greedily against what is already on the chart cannot do that.
 *
 * Saturation and lightness are inherited from the accent, so a muted theme gets
 * a muted palette rather than a set of primaries.
 */
function hueRamp(palette, count) {
  const accent = rgbToHsl(palette.accent);
  const alt = palette.accent_alt ? rgbToHsl(palette.accent_alt) : null;
  const s = Math.max(0.32, Math.min(0.78, accent.s));
  const l = Math.max(0.28, Math.min(0.62, accent.l));

  const chosen = [ensureContrast(palette.accent, palette.bg)];
  const hues = [accent.h];

  // The theme's declared second colour is kept only when it is a genuinely
  // different hue. A near-neighbour like red beside orange is a fine pairing in
  // the UI, where the two never touch, and a poor one on adjacent bars. A theme
  // that wants its exact pairing on a chart says so with tokens.chart.series.
  if (count > 1 && alt && alt.s > 0.15 && hueGap(alt.h, accent.h) > 35) {
    chosen.push(ensureContrast(palette.accent_alt, palette.bg));
    hues.push(alt.h);
  }

  // Each further slot is the candidate furthest from everything already on the
  // chart, measured perceptually. Searching lightness as well as hue is what
  // fixes a crowded pie: past about eight slices the hue circle is full, and
  // the only room left is in value — which is also the axis that survives
  // greyscale printing and the common colour-vision deficiencies.
  //
  // It used to maximise hue gap alone and alternate lightness by index parity,
  // so two entries an even number apart could land in the same hue region at
  // identical lightness: a twelve-slice pie drew two greens at dE 6.
  const lights = [l, l - 0.10, l + 0.10, l - 0.19];
  while (chosen.length < count) {
    let best = null;
    let bestScore = -1;
    for (let h = 0; h < 360; h += 4) {
      for (const li of lights) {
        const cand = ensureContrast(hslToHex({ h, s, l: Math.max(0.12, Math.min(0.88, li)) }), palette.bg);
        const score = Math.min(...chosen.map((c) => deltaE(cand, c)));
        if (score > bestScore) { bestScore = score; best = { cand, h }; }
      }
    }
    chosen.push(best.cand);
    hues.push(best.h);
  }
  return chosen;
}

/**
 * One more turn round a palette that has run out, without repeating it.
 *
 * A declared palette used to be cycled with `declared[i % len]`, which is fine
 * for series — the schema caps those at four — and wrong for a pie, whose
 * colours come from its CATEGORIES and which the schema does not cap at all.
 * `high-contrast-mono` declares six, so an eight-slice pie drew slices 7 and 8
 * in exactly the colours of slices 1 and 2. Two slices the same colour is the
 * same class of defect as a series that vanishes: the reader is told two
 * different things are one thing.
 *
 * Each wrap moves the base colour a step in lightness, away from the
 * background first so the variant stays legible. The hue is untouched, because
 * the hue is the part the theme's author chose.
 */
function shade(base, wrap, bg) {
  const hsl = rgbToHsl(base);
  if (!hsl) return base;
  const bgLight = luminance(bg) > 0.4;
  // Alternate the direction so a long run does not walk off either end, and
  // grow the step so the third wrap is not a hair from the first.
  const dir = wrap % 2 === 1 ? (bgLight ? 1 : -1) : (bgLight ? -1 : 1);
  const step = 0.13 * Math.ceil(wrap / 2);
  const l = Math.max(0.06, Math.min(0.94, hsl.l + dir * step));
  return hslToHex({ ...hsl, l });
}

/**
 * The series colours for a theme, in order. `tokens.chart.series` wins when the
 * theme declares one — that is the human-authored path, and the renderer never
 * second-guesses it beyond the contrast floor that keeps a series visible and
 * the rule that no two entries may come out identical.
 */
export function chartSeries(theme, count = 6) {
  const palette = theme.palette ?? theme.tokens?.palette ?? {};
  const declared = theme.tokens?.chart?.series;
  if (Array.isArray(declared) && declared.length) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const wrap = Math.floor(i / declared.length);
      const base = declared[i % declared.length];
      out.push(ensureContrast(wrap === 0 ? base : shade(base, wrap, palette.bg), palette.bg));
    }
    return out;
  }
  return isMonochrome(palette) ? monoRamp(palette, count) : hueRamp(palette, count);
}
