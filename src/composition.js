import { hex, textStyle, applyTransform } from "./theme.js";
import { fitScale, fitOneLine, lineCount, measure } from "./fit.js";
import { CANVAS } from "./chrome.js";
import {
  resolveLayout as coreResolveLayout,
  listColumns as coreListColumns,
  hasDropcap as coreHasDropcap,
  sectionStyle as coreSectionStyle,
  titlePlacement as coreTitlePlacement,
  frameGeometry,
} from "../packages/core/layout.ts";

export { resolveLayout } from "../packages/core/layout.ts";

const resolved = new WeakMap();

export function layoutOf(theme) {
  let l = resolved.get(theme);
  if (!l) {
    l = coreResolveLayout(theme.tokens?.layout, theme.name ?? "theme");
    resolved.set(theme, l);
  }
  return l;
}

const WIDE_TYPES = new Set([
  "cards", "stacked-list", "kpi-dashboard", "data-cards", "team-grid",
  "equation", "before-after",
]);

export function frameBox(theme, base, frame = null, type = null) {
  // Legacy compatibility: the sidebar + wide-type override resolves to an
  // effective frame here, so core geometry never learns legacy type names.
  const declared = frame ?? layoutOf(theme).content.frame;
  const effective = declared === "sidebar" && WIDE_TYPES.has(type) ? "full" : declared;
  const band = theme.grid.band;
  return frameGeometry({
    base,
    frame: effective,
    band: { eyebrowY: band.eyebrow_y, titleY: band.title_y, bodyY: band.body_y },
  });
}

function labelRoom(ctx, from) {
  const head = ctx.box.head;
  return Math.max(0, head.x + head.w - from);
}

export function drawOpening(slide, ctx) {
  const { theme, deck, data } = ctx;
  const { heading: h } = layoutOf(theme);
  const mark = ctx.box.mark;
  const centred = h.align === "centre";
  const label = data.section != null ? deck.sections?.[data.section] : null;
  const num = data.section != null ? String(data.section + 1).padStart(2, "0") : null;

  if (h.opening === "pill") {
    if (!label) return;
    const pillW = 0.62, pillH = 0.32;
    const gap = 0.18;
    const room = labelRoom(ctx, mark.x + pillW + gap);
    const labelW = centred
      ? Math.min(room, measure(applyTransform(theme, "eyebrow", label), theme.type.eyebrow) + 0.04)
      : room;
    const x0 = centred ? mark.x + (mark.w - (pillW + gap + labelW)) / 2 : mark.x;
    slide.addShape("roundRect", {
      x: x0, y: mark.y, w: pillW, h: pillH,
      fill: { color: hex(theme.palette.accent) },
      line: { type: "none" },
      rectRadius: theme.shape?.radius?.pill ?? 0.16,
    });
    slide.addText(num, {
      x: x0, y: mark.y, w: pillW, h: pillH,
      ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
      align: "center", valign: "middle",
    });
    slide.addText(applyTransform(theme, "eyebrow", label), {
      x: x0 + pillW + gap, y: mark.y, w: labelW, h: pillH,
      ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
      valign: "middle",
    });
    return;
  }

  if (h.opening === "none") {
    if (!label) return;
    slide.addText(applyTransform(theme, "eyebrow", label), {
      x: mark.x, y: mark.y, w: mark.w, h: 0.32,
      ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
      align: centred ? "center" : "left", valign: "middle",
    });
    return;
  }

  if (h.opening === "rule") {
    if (label) {
      slide.addText(applyTransform(theme, "eyebrow", label), {
        x: mark.x, y: mark.y - 0.04, w: mark.w, h: 0.28,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: centred ? "center" : "left", valign: "middle",
      });
    }
    slide.addShape("rect", {
      x: mark.x, y: mark.y + 0.30, w: mark.w, h: 0.015,
      fill: { color: hex(theme.palette.rule ?? theme.palette.ink_muted) },
      line: { type: "none" },
    });
    return;
  }

  if (h.opening === "bar") {
    const barW = 0.9, barH = 0.1;
    const bx = centred ? mark.x + (mark.w - barW) / 2 : mark.x;
    slide.addShape("rect", {
      x: bx, y: mark.y + 0.06, w: barW, h: barH,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    if (label) {
      slide.addText(applyTransform(theme, "eyebrow", label), {
        x: centred ? mark.x : mark.x + barW + 0.22, y: mark.y,
        w: centred ? mark.w : labelRoom(ctx, mark.x + barW + 0.22), h: 0.32,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: centred ? "center" : "left",
        valign: centred ? "bottom" : "middle",
      });
    }
    return;
  }

  if (!num) return;
  const numW = Math.min(mark.w, 1.0);
  slide.addText(num, {
    x: mark.x, y: mark.y - 0.10, w: numW, h: 0.56,
    ...textStyle(theme, "display", { color: theme.palette.accent, scale: 0.55 }),
    align: centred ? "center" : "left", valign: "middle",
  });
  if (label && mark.w > numW + 0.6) {
    slide.addText(applyTransform(theme, "eyebrow", label), {
      x: mark.x + numW + 0.12, y: mark.y, w: labelRoom(ctx, mark.x + numW + 0.12), h: 0.36,
      ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
      valign: "middle",
    });
  }
}

function standfirstH(theme) {
  const st = theme.type.subhead;
  return (st.size * (st.line ?? 1.4) * 2) / 72 + 0.12;
}

export function drawHeading(slide, ctx) {
  const { theme, data, box } = ctx;
  const { heading: h } = layoutOf(theme);
  const head = box.head;
  const align = h.align === "centre" ? { align: "center" } : {};
  let y = head.y;

  if (data.headline) {
    const st = theme.type.heading;
    const longest = String(data.headline).split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
    const scale = Math.min(
      fitScale(data.headline, head.w, head.budget, st),
      fitOneLine(longest, head.w, st),
    );
    const size = st.size * scale;
    const raw = lineCount(data.headline, head.w, { ...st, size });
    const snug = raw === 1 && measure(data.headline, { ...st, size }) <= head.w * 0.95;
    const maxLines = Math.max(2, Math.floor(head.budget / ((size * (st.line ?? 1.2)) / 72)));
    const lines = snug ? 1 : Math.min(maxLines, Math.max(2, raw));
    const hgt = (size * (st.line ?? 1.2) / 72) * lines;
    slide.addText(data.headline, {
      x: head.x, y, w: head.w, h: hgt,
      ...textStyle(theme, "heading", { scale }),
      ...align, valign: "top",
    });
    y += hgt + 0.08;
  }

  if (h.rule === "under" && data.headline) {
    slide.addShape("rect", {
      x: head.x, y: y - 0.02, w: head.wide, h: 0.015,
      fill: { color: hex(theme.palette.rule ?? theme.palette.ink_muted) },
      line: { type: "none" },
    });
    y += 0.16;
  }

  if (data.standfirst) {
    const st = theme.type.subhead;
    const sfH = box.frame === "sidebar" ? 1.6 : standfirstH(theme);
    const scale = fitScale(data.standfirst, head.wide, sfH, st);
    slide.addText(data.standfirst, {
      x: head.x, y, w: head.wide, h: sfH,
      ...textStyle(theme, "subhead", { color: theme.palette.ink_muted, scale }),
      ...align, valign: "top",
    });
    y += sfH;
  }

  return box.frame === "sidebar" ? box.bodyY : Math.max(y, box.bodyY);
}

const MARKERS = {
  dot: { bullet: { characterCode: "2022" } },
  dash: { bullet: { characterCode: "2013" } },
  square: { bullet: { characterCode: "25AA" } },
  arrow: { bullet: { characterCode: "2192" } },
  none: { bullet: false },
};

export function bulletOptions(theme, index = 0) {
  const marker = layoutOf(theme).list.marker;
  if (marker === "number") return { bullet: { type: "number", startAt: index + 1 } };
  return MARKERS[marker];
}

export function listColumns(theme) {
  return coreListColumns(layoutOf(theme));
}

export function hasDropcap(theme) {
  return coreHasDropcap(layoutOf(theme));
}

export function sectionField(slide, theme, s, band) {
  const comp = layoutOf(theme).section.composition;

  if (comp === "block") {
    slide.addShape("ellipse", {
      x: 8.6, y: 3.4, w: 5.6, h: 5.6,
      fill: { color: hex(s.accent ?? theme.palette.accent) }, line: { type: "none" },
    });
    slide.addShape("triangle", {
      x: -0.6, y: -0.6, w: 3.2, h: 2.4,
      fill: { color: hex(s.ink) }, line: { type: "none" },
    });
    return s.ink;
  }

  if (comp === "band" && band) {
    slide.addShape("rect", {
      x: 0, y: band.y, w: CANVAS.w, h: band.h,
      fill: { color: hex(s.ink) }, line: { type: "none" },
    });
    return s.bg;
  }

  if (comp === "rules" && band) {
    for (const y of [band.y, band.y + band.h]) {
      slide.addShape("rect", {
        x: 0, y, w: CANVAS.w, h: 0.02,
        fill: { color: hex(s.muted) }, line: { type: "none" },
      });
    }
    return s.ink;
  }

  return s.ink;
}

export function sectionStyle(theme) {
  return coreSectionStyle(layoutOf(theme));
}

export function titlePlacement(theme) {
  return coreTitlePlacement(layoutOf(theme));
}
