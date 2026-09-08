
import { hex, textStyle, applyTransform } from "../theme.js";
import { fitScale, fitScaleAll, fitOneLine, lineCount, measure, floorOf } from "../fit.js";
import { CANVAS, reservedTopRight } from "../chrome.js";
import { chartSeries, ensureContrast } from "../chartpalette.js";
import { frameBox, drawOpening, drawHeading, bulletOptions, listColumns, hasDropcap, sectionField, sectionStyle, titlePlacement } from "../composition.js";
import { atDesign, atFloor, card, content, designed, eyebrow, fitAllAt, fitAt, fitLineAt, heading, lineAtFloor, linesBox, onInk, paint, widest } from "./helpers.js";

export const layouts = {
chapter(slide, ctx) {
    const { theme, data } = ctx;
    const s = theme.surfaces.section;
    paint(slide, ctx, s.bg);
    const ink = sectionField(slide, theme, s, { y: 2.2, h: 2.1 });
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const scale = fitScale(data.headline, w, 1.8, theme.type.display, { min: 0.55 });
    slide.addText(data.headline, {
      x: m.left, y: 2.35, w, h: 1.8,
      ...textStyle(theme, "display", { color: ink, scale }),
      align: "center", valign: "middle",
    });
    if (data.standfirst) {
      const sfScale = fitScale(data.standfirst, w * 0.66, 0.9, theme.type.subhead, { min: 0.7 });
      slide.addText(data.standfirst, {
        x: (CANVAS.w - w * 0.66) / 2, y: 4.35, w: w * 0.66, h: 0.9,
        ...textStyle(theme, "subhead", { color: s.muted, scale: sfScale }),
        align: "center", valign: "top",
      });
    }
  },

  
  closing(slide, ctx) {
    const { theme, data } = ctx;
    const s = theme.surfaces.title;
    paint(slide, ctx, s.bg);
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const headH = data.standfirst ? 1.7 : 2.2;
    const scale = fitScale(data.headline, w, headH, theme.type.display, { min: 0.55 });
    slide.addText(data.headline, {
      x: m.left, y: 1.85, w, h: headH,
      ...textStyle(theme, "display", { color: s.ink, scale }),
      align: "center", valign: "middle",
    });
    let y = 1.85 + headH + 0.15;
    if (data.standfirst) {
      const sw = w * 0.72;
      const sh = linesBox(theme, "subhead", [data.standfirst], sw);
      const sScale = fitScale(data.standfirst, sw, sh, theme.type.subhead, { min: 0.75 });
      slide.addText(data.standfirst, {
        x: (CANVAS.w - sw) / 2, y, w: sw, h: sh,
        ...textStyle(theme, "subhead", { color: s.muted, scale: sScale }),
        align: "center", valign: "top",
      });
      y += sh + 0.12;
    }
    if (data.body) {
      const bodyH = data.standfirst ? 1.3 : 1.2;
      const bScale = fitScale(data.body, w * 0.72, bodyH, theme.type.body, { min: 0.75 });
      slide.addText(data.body, {
        x: (CANVAS.w - w * 0.72) / 2, y, w: w * 0.72, h: bodyH,
        ...textStyle(theme, "body", { color: s.muted, scale: bScale }),
        align: "center", valign: "top",
      });
      y += bodyH + 0.2;
    }
    if (data.cta) {
      const ctaW = Math.min(w * 0.62, measure(data.cta, theme.type.subhead) + 1.3);
      const ctaH = Math.max(0.6, linesBox(theme, "subhead", [data.cta], ctaW - 0.5) + 0.22);
      const cx = (CANVAS.w - ctaW) / 2;
      const cy = Math.max(y + 0.2, Math.min(5.75, CANVAS.h - m.bottom - 0.45 - ctaH));
      slide.addShape("roundRect", {
        x: cx, y: cy, w: ctaW, h: ctaH,
        fill: { color: hex(s.accent ?? theme.palette.accent) },
        line: { type: "none" },
        rectRadius: theme.shape?.radius?.pill ?? 0.3,
      });
      slide.addText(data.cta, {
        x: cx + 0.25, y: cy, w: ctaW - 0.5, h: ctaH,
        ...textStyle(theme, "subhead", { color: theme.palette.on_accent }),
        align: "center", valign: "middle",
      });
    }
  },

  
  "numbered-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const cw = 0.5;
    const tw = box.w - cw - 0.35;
    const scale = fitScaleAll(data.items, tw, rowH * 0.85, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * rowH;
      const cy = ry + rowH / 2;
      slide.addShape("ellipse", {
        x: box.x, y: cy - 0.25, w: cw, h: 0.5,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(String(i + 1), {
        x: box.x, y: cy - 0.25, w: cw, h: 0.5,
        ...textStyle(theme, "eyebrow", { color: theme.palette.on_accent }),
        align: "center", valign: "middle",
      });
      slide.addText(it, {
        x: box.x + cw + 0.35, y: ry, w: tw, h: rowH,
        ...textStyle(theme, "body", { scale }),
        valign: "middle",
      });
    });
  },

  
  checklist(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const cw = 0.45;
    const tw = box.w - cw - 0.35;
    const scale = fitScaleAll(data.items.map((i) => i.text), tw, rowH, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * rowH;
      const cy = ry + rowH / 2;
      const s = 0.34;
      slide.addShape("roundRect", {
        x: box.x, y: cy - s / 2, w: s, h: s,
        fill: { color: hex(it.checked ? theme.palette.accent : theme.palette.surface) },
        line: it.checked ? { type: "none" } : { color: hex(theme.palette.rule), width: 1.5 },
        rectRadius: 0.06,
      });
      if (it.checked) {
        slide.addText("✓", {
          x: box.x, y: cy - s / 2, w: s, h: s,
          ...textStyle(theme, "body", { color: theme.palette.on_accent, scale: 0.8 }),
          align: "center", valign: "middle",
        });
      }
      slide.addText(it.text, {
        x: box.x + cw + 0.35, y: ry, w: tw, h: rowH,
        ...textStyle(theme, "body", { scale, color: it.checked ? theme.palette.ink : theme.palette.ink_muted }),
        valign: "middle",
      });
    });
  },

  
  "feature-grid"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const pad = theme.shape?.card_pad ?? 0.28;
    const titleH = Math.max(0.32, lineAtFloor(theme, "subhead", 1.3));
    const titleScale = fitScaleAll(data.items.map((i) => i.title), cw - pad * 2, titleH, theme.type.subhead, { min: 0.6 });
    const bodyNeed = lineAtFloor(theme, "body") * 2;
    const iconH = data.items.some((i) => i.icon) && (ch - pad * 2 - titleH - 0.44) >= bodyNeed ? 0.44 : 0;
    const bodyTop = pad + iconH + titleH;
    const bodyH = Math.max(lineAtFloor(theme, "body"), ch - bodyTop - pad);
    const bodyScale = fitScaleAll(
      data.items.map((i) => i.body).filter(Boolean), cw - pad * 2, bodyH, theme.type.body,
    );
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      card(slide, theme, { x, y: ry, w: cw, h: ch });
      if (it.icon && iconH) {
        slide.addText(it.icon, {
          x: x + pad, y: ry + pad, w: cw - pad * 2, h: 0.42,
          fontSize: Math.round(theme.type.heading.size * 0.85),
          align: "left", valign: "top",
        });
      }
      slide.addText(it.title, {
        x: x + pad, y: ry + pad + iconH, w: cw - pad * 2, h: titleH,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      if (it.body) {
        slide.addText(it.body, {
          x: x + pad, y: ry + bodyTop, w: cw - pad * 2, h: bodyH,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  
  "grid-items"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    slide.addShape("rect", {
      x: box.x, y, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    const top = y + 0.18;
    const n = data.items.length;
    const cols = n >= 8 ? 4 : 3;
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - top - 0.1 - gut * (rows - 1)) / rows;
    const valueScale = fitScaleAll(data.items.map((i) => i.value), cw, ch * 0.5, theme.type.subhead, { min: 0.6 });
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = top + r * (ch + gut);
      slide.addText(it.label, {
        x, y: ry, w: cw, h: ch * 0.42,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        valign: "top",
      });
      slide.addText(it.value, {
        x, y: ry + ch * 0.45, w: cw, h: ch * 0.5,
        ...textStyle(theme, "subhead", { bold: true, scale: valueScale }),
        valign: "top",
      });
    });
  },

  
  "icon-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const iw = 0.7;
    const tw = box.w - iw - 0.3;
    const scale = fitScaleAll(data.items.map((i) => i.text), tw, rowH * 0.85, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * rowH;
      slide.addText(it.icon ?? "•", {
        x: box.x, y: ry, w: iw, h: rowH,
        fontSize: Math.round(theme.type.heading.size * 0.9),
        align: "left", valign: "middle",
      });
      slide.addText(it.text, {
        x: box.x + iw + 0.3, y: ry, w: tw, h: rowH,
        ...textStyle(theme, "body", { scale }),
        valign: "middle",
      });
    });
  },

  
  "stacked-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const gut = 0.32;
    const cw = (box.w - gut * (n - 1)) / n;
    const ch = Math.min(3.2, box.bottom - y - 0.2);
    const pad = theme.shape?.card_pad ?? 0.28;
    const titleScale = fitScaleAll(data.items.map((i) => i.title), cw - pad * 2, 0.4, theme.type.subhead, { min: 0.6 });
    const bodyScale = fitScaleAll(
      data.items.map((i) => i.body).filter(Boolean), cw - pad * 2, ch - 1.5, theme.type.body,
    );
    for (let i = 0; i < n - 1; i++) {
      slide.addShape("rect", {
        x: box.x + i * (cw + gut) + cw, y: y + ch / 2 - 0.02, w: gut, h: 0.04,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
    }
    data.items.forEach((it, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });
      let ty = y + pad;
      if (it.tag) {
        const tw2 = Math.min(cw - pad * 2, measure(it.tag, theme.type.caption) + 0.42);
        slide.addShape("roundRect", {
          x: x + pad, y: ty, w: tw2, h: 0.32,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.pill ?? 0.16,
        });
        slide.addText(it.tag, {
          x: x + pad, y: ty, w: tw2, h: 0.32,
          ...textStyle(theme, "caption", {
            color: theme.palette.on_accent,
            scale: fitLineAt(theme, "caption", 0.85, it.tag, tw2, { min: 0.6 }),
          }),
          align: "center", valign: "middle",
        });
        ty += 0.42;
      }
      slide.addText(it.title, {
        x: x + pad, y: ty, w: cw - pad * 2, h: 0.4,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      ty += 0.44;
      if (it.body) {
        slide.addText(it.body, {
          x: x + pad, y: ty, w: cw - pad * 2, h: ch - (ty - y) - pad,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  
  "kpi-dashboard"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.kpis.length;
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (n - 1)) / n;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const valueScale = fitOneLine(
      data.kpis.map((k) => k.value).reduce((a, b) => (b.length > a.length ? b : a)),
      cw - pad * 2,
      theme.type.stat,
    );
    const labelH = linesBox(theme, "caption", data.kpis.map((k) => k.label), cw - pad * 2);
    const labelScale = fitScaleAll(data.kpis.map((k) => k.label), cw - pad * 2, labelH, theme.type.caption);
    data.kpis.forEach((k, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });
      slide.addText(k.label, {
        x: x + pad, y: y + pad, w: cw - pad * 2, h: labelH,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: labelScale }),
        valign: "top",
      });
      slide.addText(k.value, {
        x: x + pad, y: y + pad + labelH + 0.06, w: cw - pad * 2, h: 0.7,
        ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valueScale }),
        valign: "top",
      });
      const ty = y + ch - 0.6;
      if (k.trend === "flat") {
        slide.addShape("rect", {
          x: x + pad, y: ty + 0.13, w: 0.26, h: 0.06,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
      } else {
        slide.addShape("triangle", {
          x: x + pad, y: ty, w: 0.22, h: 0.22,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
          rotate: k.trend === "down" ? 180 : 0,
        });
      }
      if (k.change) {
        slide.addText(k.change, {
          x: x + pad + 0.34, y: ty, w: cw - pad * 2 - 0.34, h: 0.24,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          valign: "middle",
        });
      }
    });
  },

  
  "data-cards"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.cards.length;
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (n - 1)) / n;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const valueScale = fitOneLine(
      data.cards.map((x) => x.value).reduce((a, b) => (b.length > a.length ? b : a)),
      cw - pad * 2,
      theme.type.stat,
    );
    const stat = theme.type.stat;
    const statLine = (stat.size * valueScale * (stat.line ?? 1.0)) / 72;
    const valueLines = Math.max(...data.cards.map((c) =>
      lineCount(c.value, cw - pad * 2, { ...stat, size: stat.size * valueScale })));
    const valueH = Math.max(0.85, valueLines * statLine + 0.1);
    const labelH = linesBox(theme, "subhead", data.cards.map((c) => c.label), cw - pad * 2);
    const labelScale = fitScaleAll(data.cards.map((c) => c.label), cw - pad * 2, labelH, theme.type.subhead);
    const bodyTop = valueH + 0.05 + labelH + 0.04;
    const bodyH = Math.max(lineAtFloor(theme, "body"), ch - pad * 2 - bodyTop);
    const bodyScale = fitScaleAll(data.cards.map((c) => c.body).filter(Boolean), cw - pad * 2, bodyH, theme.type.body);
    data.cards.forEach((c, i) => {
      const x = box.x + i * (cw + gut);
      card(slide, theme, { x, y, w: cw, h: ch });
      slide.addText(c.value, {
        x: x + pad, y: y + pad, w: cw - pad * 2, h: valueH,
        ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valueScale }),
        valign: "top",
      });
      slide.addText(c.label, {
        x: x + pad, y: y + pad + valueH + 0.05, w: cw - pad * 2, h: labelH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "top",
      });
      if (c.body) {
        slide.addText(c.body, {
          x: x + pad, y: y + pad + bodyTop, w: cw - pad * 2, h: bodyH,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    });
  },

  
  "progress-bars"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.bars.length;
    const rowH = (box.bottom - y - 0.1) / n;
    const labelW = 2.2;
    const barX = box.x + labelW + 0.4;
    const barW = box.w - labelW - 0.4 - 1.3;
    const barH = 0.22;
    const labelScale = fitScaleAll(data.bars.map((b) => b.label), labelW, 0.4, theme.type.subhead, { min: 0.65 });
    data.bars.forEach((b, i) => {
      const ry = y + i * rowH;
      const cy = ry + rowH / 2;
      slide.addText(b.label, {
        x: box.x, y: ry, w: labelW, h: rowH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "middle",
      });
      slide.addShape("roundRect", {
        x: barX, y: cy - barH / 2, w: barW, h: barH,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        rectRadius: barH / 2,
      });
      const fillW = Math.max(0.05, barW * (b.value / 100));
      slide.addShape("roundRect", {
        x: barX, y: cy - barH / 2, w: fillW, h: barH,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        rectRadius: barH / 2,
      });
      if (b.target != null) {
        slide.addShape("rect", {
          x: barX + barW * (b.target / 100) - 0.02, y: cy - 0.19, w: 0.04, h: 0.38,
          fill: { color: hex(theme.palette.ink) }, line: { type: "none" },
        });
      }
      slide.addText(`${Math.round(b.value)}%`, {
        x: barX + barW + 0.15, y: ry, w: 1.15, h: rowH,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        align: "right", valign: "middle",
      });
    });
  },

  
  "ranking-list"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1 - 0.03 * (n - 1)) / n;
    const vw = 1.6;
    const tw = box.w - 0.55 - vw - 0.3;
    const labelScale = fitScaleAll(data.items.map((i) => i.label), tw, rowH * 0.55, theme.type.subhead, { min: 0.65 });
    const detailScale = fitScaleAll(
      data.items.map((i) => i.detail).filter(Boolean), tw, rowH * 0.4, theme.type.caption,
    );
    const valueScale = fitLineAt(theme, "subhead", 0.95, data.items.map((i) => i.value), vw, { min: 0.6 });
    data.items.forEach((it, i) => {
      const ry = y + i * (rowH + 0.03);
      const cy = ry + rowH / 2;
      const rank = it.rank ?? i + 1;
      const top = rank <= 3;
      slide.addShape("ellipse", {
        x: box.x, y: cy - 0.19, w: 0.38, h: 0.38,
        fill: { color: hex(top ? theme.palette.accent : theme.palette.surface) },
        line: top ? { type: "none" } : { color: hex(theme.palette.rule), width: 1 },
      });
      slide.addText(String(rank), {
        x: box.x, y: cy - 0.19, w: 0.38, h: 0.38,
        ...textStyle(theme, "caption", { color: hex(top ? theme.palette.on_accent : theme.palette.ink_muted), bold: true }),
        align: "center", valign: "middle",
      });
      slide.addText(it.label, {
        x: box.x + 0.55, y: ry, w: tw, h: rowH * 0.55,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "top",
      });
      if (it.detail) {
        slide.addText(it.detail, {
          x: box.x + 0.55, y: ry + rowH * 0.55 + 0.02, w: tw, h: rowH * 0.4,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: detailScale }),
          valign: "top",
        });
      }
      if (it.value) {
        slide.addText(it.value, {
          x: box.x + 0.55 + tw, y: ry, w: vw, h: rowH,
          ...textStyle(theme, "subhead", { bold: true, scale: valueScale }),
          align: "right", valign: "middle",
        });
      }
      if (i < n - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH + 0.015, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  
  "metric-comparison"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const dW = Math.min(2.3, Math.max(1.3, measure(data.delta, theme.type.subhead) + 0.34));
    const halfW = (box.w - dW) / 2;
    const valScale = fitOneLine(
      [data.left.value, data.right.value].reduce((a, b) => (b.length > a.length ? b : a)),
      halfW,
      theme.type.stat,
    );
    const labelH = linesBox(theme, "subhead", [data.left.label, data.right.label], halfW);
    const labelScale = fitScaleAll([data.left.label, data.right.label], halfW, labelH, theme.type.subhead);
    const block = (side, x) => {
      slide.addText(side.value, {
        x, y: y + 0.1, w: halfW, h: 1.2,
        ...textStyle(theme, "stat", { color: theme.palette.accent, scale: valScale }),
        align: "center", valign: "middle",
      });
      slide.addText(side.label, {
        x, y: y + 1.35, w: halfW, h: labelH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        align: "center", valign: "top",
      });
    };
    block(data.left, box.x);
    block(data.right, box.x + halfW + dW);
    const dx = box.x + halfW;
    slide.addShape("roundRect", {
      x: dx, y: y + 0.35, w: dW, h: 0.62,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.pill ?? 0.3,
    });
    const deltaScale = fitOneLine(data.delta, dW - 0.2, theme.type.subhead, { min: 0.55 });
    slide.addText(data.delta, {
      x: dx, y: y + 0.35, w: dW, h: 0.62,
      ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent, scale: deltaScale }),
      align: "center", valign: "middle",
    });
    if (data.body) {
      const bodyY = y + 1.35 + labelH + 0.18;
      const bScale = fitScale(data.body, box.w, 0.9, theme.type.body, { min: 0.75 });
      slide.addText(data.body, {
        x: box.x, y: bodyY, w: box.w, h: 0.9,
        ...textStyle(theme, "body", { scale: bScale, color: theme.palette.ink_muted }),
        align: "center", valign: "top",
      });
    }
  },

  
  sparklines(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(n))));
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const pad = theme.shape?.card_pad ?? 0.26;
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      card(slide, theme, { x, y: ry, w: cw, h: ch });
      slide.addText(it.label, {
        x: x + pad, y: ry + pad, w: cw - pad * 2, h: 0.32,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        valign: "top",
      });
      if (it.value) {
        slide.addText(it.value, {
          x: x + pad, y: ry + pad, w: cw - pad * 2, h: 0.32,
          ...textStyle(theme, "subhead", { bold: true }),
          align: "right", valign: "top",
        });
      }
      const cw2 = cw - pad * 2;
      const chartH = Math.min(1.1, ch - pad * 2 - 0.45);
      slide.addChart("line", [{ name: it.label, labels: it.values.map((_, j) => String(j + 1)), values: it.values }], {
        x: x + pad, y: ry + pad + 0.42, w: cw2, h: chartH,
        chartColors: [hex(ensureContrast(theme.palette.accent, theme.palette.bg))],
        showLegend: false,
        showTitle: false,
        showValue: false,
        catAxisHidden: true,
        valAxisHidden: true,
        catGridLine: { style: "none" },
        valGridLine: { style: "none" },
        lineSmooth: true,
        lineSize: 2,
      });
    });
  },
};
