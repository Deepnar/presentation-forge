/** Shared geometry, fitting, and drawing primitives for slide layouts. */

import { hex, textStyle, applyTransform } from "../theme.js";
import { fitScale, fitScaleAll, fitOneLine, lineCount, measure, floorOf } from "../fit.js";
import { CANVAS, reservedTopRight } from "../chrome.js";
import { chartSeries, ensureContrast } from "../chartpalette.js";
import {
  frameBox, drawOpening, drawHeading, bulletOptions, listColumns, hasDropcap,
  sectionField, sectionStyle, titlePlacement,
} from "../composition.js";




/* ------------------------------------------------------------------ utils */


export function onInk(theme, floor = 4.5) {
  return ensureContrast(theme.palette.accent_alt ?? theme.palette.accent, theme.palette.ink, floor);
}



export function linesBox(theme, token, texts, width) {
  const st = theme.type[token];
  const lineH = (st.size * (st.line ?? 1.3)) / 72;
  const lines = Math.max(
    1,
    ...texts.filter(Boolean).map((t) => lineCount(String(t), width, { ...st, size: st.size })),
  );
  return Math.round((lines * lineH + 0.06) * 100) / 100;
}

export function content(theme, brand, { full = false, note = 0, identity, type = null } = {}) {
  const m = theme.grid.margin;
  const reserve = full ? 0 : reservedTopRight(brand, identity);
  const bottom = CANVAS.h - m.bottom - note;
  const base = {
    x: m.left,
    y: m.top,
    w: CANVAS.w - m.left - m.right,
    right: CANVAS.w - m.right,
    bottom,
    titleW: CANVAS.w - m.left - m.right - reserve,
  };
  return frameBox(theme, base, full ? "full" : null, type);
}

export function card(slide, theme, { x, y, w, h }) {
  const sh = theme.shape ?? {};
  const fill = sh.card_fill ?? { color: theme.palette.surface };
  const opts = {
    x, y, w, h,
    fill: {
      color: hex(fill.color),
      ...(fill.transparency != null ? { transparency: fill.transparency } : {}),
    },
    line: (sh.border?.width ?? 0) > 0
      ? { color: hex(sh.border.color), width: sh.border.width }
      : { type: "none" },
    rectRadius: sh.radius?.card ?? 0,
  };
  if (theme.shadow?.card) {
    const s = theme.shadow.card;
    opts.shadow = {
      type: s.type ?? "outer",
      blur: s.blur ?? 12,
      offset: s.offset ?? 3,
      angle: s.angle ?? 90,
      color: hex(s.color) ?? "000000",
      opacity: s.opacity ?? 0.1,
    };
  }
  slide.addShape("roundRect", opts);
}


export function eyebrow(slide, ctx) {
  drawOpening(slide, ctx);
}


export function heading(slide, ctx) {
  return drawHeading(slide, ctx);
}


export function lineAtFloor(theme, role, fallbackRatio = 1.35) {
  const st = atFloor(theme, role);
  return ((st.size * (st.line ?? fallbackRatio)) / 72) * 1.05;
}


export function atFloor(theme, role) {
  const style = theme.type[role];
  return { ...style, size: Math.min(style.size, Math.max(style.size * 0.62, floorOf(style) ?? style.size)) };
}


export function designed(theme, role, design) {
  const st = theme.type[role];
  return { ...st, size: st.size * design };
}
export const atDesign = (design, s) => Math.round(design * s * 100) / 100;


export function fitAt(theme, role, design, text, w, h, opts) {
  return atDesign(design, fitScale(text, w, h, designed(theme, role, design), opts));
}


export function fitAllAt(theme, role, design, texts, w, h, opts) {
  const set = texts.filter(Boolean);
  return set.length ? atDesign(design, fitScaleAll(set, w, h, designed(theme, role, design), opts)) : design;
}


export function fitLineAt(theme, role, design, texts, w, opts) {
  const set = (Array.isArray(texts) ? texts : [texts]).filter(Boolean);
  if (!set.length) return design;
  const st = designed(theme, role, design);
  return atDesign(design, fitOneLine(widest(set, st), w, st, opts));
}


export function widest(texts, style) {
  return texts.reduce((a, b) => (measure(b, style) > measure(a, style) ? b : a));
}


export function paint(slide, ctx, color) {
  if (ctx.plate) return;
  slide.background = { color: hex(color) };
}

/* ---------------------------------------------------------------- layouts */
