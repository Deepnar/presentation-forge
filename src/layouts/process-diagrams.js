/** process-diagrams slide layouts. */

import { hex, textStyle, applyTransform } from "../theme.js";
import { fitScale, fitScaleAll, fitOneLine, lineCount, measure, floorOf } from "../fit.js";
import { CANVAS, reservedTopRight } from "../chrome.js";
import { chartSeries, ensureContrast } from "../chartpalette.js";
import { frameBox, drawOpening, drawHeading, bulletOptions, listColumns, hasDropcap, sectionField, sectionStyle, titlePlacement } from "../composition.js";
import { atDesign, atFloor, card, content, designed, eyebrow, fitAllAt, fitAt, fitLineAt, heading, lineAtFloor, linesBox, onInk, paint, widest } from "./helpers.js";

export const layouts = {
"before-after"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const gut = theme.grid.gutter;
    const arrow = 0.8;
    const cw = (box.w - gut - arrow) / 2;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const titleW = cw - pad * 2;
    const titleH = linesBox(theme, "heading", [data.before.title, data.after.title], titleW);
    const titleScale = fitScaleAll([data.before.title, data.after.title], titleW, titleH, theme.type.heading, { min: 0.55 });
    const bodyTop = pad + 0.5 + titleH + 0.1;
    const bodyH = Math.max(0.3, ch - bodyTop - pad);
    const bodyScale = fitScaleAll([data.before.body, data.after.body], cw - pad * 2, bodyH, theme.type.body);
    const pill = (x, text, filled) => {
      const pw2 = Math.min(cw - pad * 2, measure(text, theme.type.eyebrow) + 0.5);
      slide.addShape("roundRect", {
        x, y: y + pad, w: pw2, h: 0.34,
        fill: { color: hex(filled ? theme.palette.accent : theme.palette.surface) },
        line: filled ? { type: "none" } : { color: hex(theme.palette.rule), width: 1 },
        rectRadius: theme.shape?.radius?.pill ?? 0.17,
      });
      slide.addText(applyTransform(theme, "eyebrow", text), {
        x, y: y + pad, w: pw2, h: 0.34,
        ...textStyle(theme, "eyebrow", {
          color: hex(filled ? theme.palette.on_accent : theme.palette.ink_muted),
        }),
        align: "center", valign: "middle",
      });
    };
    const col = (side, x, isAfter) => {
      card(slide, theme, { x, y, w: cw, h: ch });
      pill(x + pad, isAfter ? "After" : "Before", isAfter);
      let ty = y + pad + 0.5;
      slide.addText(side.title, {
        x: x + pad, y: ty, w: titleW, h: titleH,
        ...textStyle(theme, "heading", { scale: titleScale }),
        valign: "top",
      });
      ty = y + bodyTop;
      slide.addText(side.body, {
        x: x + pad, y: ty, w: cw - pad * 2, h: bodyH,
        ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
        valign: "top",
      });
    };
    col(data.before, box.x, false);
    col(data.after, box.x + cw + gut + arrow, true);
    const ax = box.x + cw + gut / 2;
    slide.addShape("triangle", {
      x: ax + arrow / 2 - 0.15, y: y + ch / 2 - 0.15, w: 0.3, h: 0.3,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rotate: 90,
    });
  },

  
  framework(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.elements.length;
    const top = Math.max(y, 3.0);
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const ew = 1.6, eh = 0.95;
    const exAxis = 1.35, eyAxis = 0.55;
    const gap = 0.09;
    const radX = Math.max(0.5, box.w / 2 - ew / 2 - 0.4);
    const radY = Math.max(0.5, (box.bottom - top) / 2 - eh / 2 - 0.15);
    const ringClear = (() => {
      if (radX <= ew / 2 || radY <= eh / 2) return false;
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        const dx = radX * Math.cos(a), dy = radY * Math.sin(a);
        const ix = Math.max(0, Math.abs(dx) - ew / 2);
        const iy = Math.max(0, Math.abs(dy) - eh / 2);
        if ((ix / exAxis) ** 2 + (iy / eyAxis) ** 2 < 1.08) return false;
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const ai = (2 * Math.PI * i) / n - Math.PI / 2;
          const aj = (2 * Math.PI * j) / n - Math.PI / 2;
          const dx = radX * (Math.cos(ai) - Math.cos(aj));
          const dy = radY * (Math.sin(ai) - Math.sin(aj));
          if (Math.abs(dx) < ew + gap && Math.abs(dy) < eh + gap) return false;
        }
      }
      return true;
    })();

    
    const contentFits = (() => {
      const cap = theme.type.caption, sub = theme.type.subhead;
      const capLine = (cap.size * (cap.line ?? 1.35)) / 72;
      const rows = Math.max(1, Math.floor((eh - 0.62) / capLine));
      if (data.elements.some((e) => e.body && lineCount(e.body, ew - 0.24, cap) > rows)) return false;
      if (data.concept.body && lineCount(data.concept.body, (exAxis - 0.15) * 2, cap) > 2) return false;
      const need = measure(data.concept.title, sub) / ((exAxis - 0.1) * 2 * 0.88);
      const floor = floorOf(sub);
      return need <= 1 || floor == null || sub.size / need >= floor;
    })();

    if (ringClear && contentFits) {
      const conceptScale = fitOneLine(data.concept.title, exAxis * 2 - 0.3, theme.type.subhead, { min: 0.6 });
      slide.addShape("ellipse", {
        x: cx - exAxis, y: cy - eyAxis, w: exAxis * 2, h: eyAxis * 2,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(data.concept.title, {
        x: cx - (exAxis - 0.1), y: cy - 0.52, w: (exAxis - 0.1) * 2, h: 0.5,
        ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent, scale: conceptScale }),
        align: "center", valign: "middle",
      });
      if (data.concept.body) {
        const bw = (exAxis - 0.15) * 2;
        slide.addText(data.concept.body, {
          x: cx - (exAxis - 0.15), y: cy - 0.02, w: bw, h: 0.45,
          ...textStyle(theme, "caption", {
            color: theme.palette.on_accent,
            scale: fitAt(theme, "caption", 0.9, data.concept.body, bw, 0.45, { min: 0.6 }),
          }),
          align: "center", valign: "top",
        });
      }

      const titleScale = fitScaleAll(data.elements.map((e) => e.title), ew - 0.25, 0.35, theme.type.caption, { min: 0.6 });
      const elemBodyScale = fitAllAt(theme, "caption", 0.9, data.elements.map((e) => e.body), ew - 0.24, eh - 0.62, { min: 0.6 });
      data.elements.forEach((e, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const ex = cx + radX * Math.cos(angle);
        const ey = cy + radY * Math.sin(angle);
        const denom = Math.sqrt((Math.cos(angle) ** 2) / (exAxis ** 2) + (Math.sin(angle) ** 2) / (eyAxis ** 2)) || 1;
        const t = 1 / denom;
        const sx = cx + t * Math.cos(angle);
        const sy = cy + t * Math.sin(angle);
        const lx = Math.min(sx, ex), lw = Math.abs(ex - sx) || 0.02;
        const ly = Math.min(sy, ey), lh = Math.abs(ey - sy) || 0.02;
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.rule), width: 1.2 },
          flipH: ex < sx, flipV: ey < sy,
        });
        card(slide, theme, { x: ex - ew / 2, y: ey - eh / 2, w: ew, h: eh });
        slide.addText(e.title, {
          x: ex - ew / 2 + 0.12, y: ey - eh / 2 + 0.12, w: ew - 0.24, h: 0.35,
          ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
          align: "center", valign: "top",
        });
        if (e.body) {
          slide.addText(e.body, {
            x: ex - ew / 2 + 0.12, y: ey - eh / 2 + 0.5, w: ew - 0.24, h: eh - 0.62,
            ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: elemBodyScale }),
            align: "center", valign: "top",
          });
        }
      });
      return;
    }
    const conceptH = 0.85;
    const gutter = 0.18;
    const colGap = 0.24;
    const perRow = n <= 2 ? n : n === 3 ? 3 : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / perRow);
    const availH = box.bottom - top - conceptH - gutter;
    const rowGap = 0.22;
    const cardW = (box.w - colGap * (perRow - 1)) / perRow;
    const room = (availH - rowGap * (rows - 1)) / rows;
    const bodyLines = Math.max(
      1,
      ...data.elements.map((e) => (e.body ? lineCount(e.body, cardW - 0.3, atFloor(theme, "caption")) : 0)),
    );
    const cardH = Math.min(room, Math.max(1.15, 0.58 + bodyLines * lineAtFloor(theme, "caption")));
    const conceptScale = fitOneLine(data.concept.title, box.w - 0.6, theme.type.subhead, { min: 0.7 });
    const titleScale = fitScaleAll(data.elements.map((e) => e.title), cardW - 0.3, 0.35, theme.type.caption, { min: 0.6 });
    const bodyScale = fitScaleAll(data.elements.map((e) => e.body).filter(Boolean), cardW - 0.3, cardH - 0.58, theme.type.caption, { min: 0.65 });
    const blockH = conceptH + gutter + rows * cardH + rowGap * (rows - 1);
    const blockTop = top + Math.max(0, (box.bottom - top - blockH) / 3);

    card(slide, theme, { x: box.x, y: blockTop, w: box.w, h: conceptH });
    slide.addText(data.concept.title, {
      x: box.x + 0.3, y: blockTop + 0.12, w: box.w - 0.6, h: 0.45,
      ...textStyle(theme, "subhead", { bold: true, scale: conceptScale }),
      align: "left", valign: "middle",
    });
    if (data.concept.body) {
      slide.addText(data.concept.body, {
        x: box.x + 0.3, y: blockTop + 0.48, w: box.w - 0.6, h: conceptH - 0.6,
        ...textStyle(theme, "caption", {
          color: theme.palette.ink_muted,
          scale: fitAt(theme, "caption", 0.9, data.concept.body, box.w - 0.6, conceptH - 0.6, { min: 0.6 }),
        }),
        align: "left", valign: "top",
      });
    }
    data.elements.forEach((e, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = box.x + col * (cardW + colGap);
      const yTop = blockTop + conceptH + gutter + row * (cardH + rowGap);
      card(slide, theme, { x, y: yTop, w: cardW, h: cardH });
      slide.addText(e.title, {
        x: x + 0.15, y: yTop + 0.1, w: cardW - 0.3, h: 0.35,
        ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
        align: "left", valign: "top",
      });
      if (e.body) {
        slide.addText(e.body, {
          x: x + 0.15, y: yTop + 0.48, w: cardW - 0.3, h: cardH - 0.58,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          align: "left", valign: "top",
        });
      }
    });
  },

  
  matrix(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y, 2.6);
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const halfW = box.w / 2 - 0.35;
    const halfH = (box.bottom - top) / 2 - 0.25;

    slide.addShape("rect", {
      x: box.x, y: cy - 0.015, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    slide.addShape("rect", {
      x: cx - 0.015, y: top, w: 0.03, h: box.bottom - top,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });

    const spots = [
      { x: box.x, y: top },
      { x: cx, y: top },
      { x: box.x, y: cy },
      { x: cx, y: cy },
    ];
    const titleScale = fitScaleAll(data.quadrants.map((q) => q.title), halfW - 0.36, 0.4, theme.type.subhead, { min: 0.65 });
    const bodyScale = fitScaleAll(
      data.quadrants.map((q) => q.body).filter(Boolean), halfW - 0.36, halfH - 0.6, theme.type.caption,
    );
    spots.forEach((s, i) => {
      const q = data.quadrants[i] ?? {};
      if (q.title) {
        slide.addText(q.title, {
          x: s.x + 0.18, y: s.y + 0.12, w: halfW - 0.36, h: 0.4,
          ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
          valign: "top",
        });
      }
      if (q.body) {
        slide.addText(q.body, {
          x: s.x + 0.18, y: s.y + 0.5, w: halfW - 0.36, h: halfH - 0.6,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          valign: "top",
        });
      }
    });

    const ax = data.axes ?? {};
    if (ax.x) {
      slide.addText(ax.x.low ?? "", {
        x: box.x, y: cy - 0.4, w: 2.0, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "left", valign: "middle",
      });
      slide.addText(ax.x.high ?? "", {
        x: box.x + box.w - 2.0, y: cy - 0.4, w: 2.0, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle",
      });
      slide.addText(ax.x.label ?? "", {
        x: box.x, y: box.bottom - 0.42, w: box.w, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "center", valign: "middle",
      });
    }
    if (ax.y) {
      const highT = applyTransform(theme, "eyebrow", ax.y.high ?? "");
      const lowT = applyTransform(theme, "eyebrow", ax.y.low ?? "");
      const axisName = applyTransform(theme, "eyebrow", ax.y.label ?? "");
      const INSET = 0.2;
      const axisW = (t) => measure(t, theme.type.eyebrow) * 1.12 + INSET;
      const share = Math.max(0.9, (box.bottom - top - 0.2) / 2.4);
      const fit = (t, min) => Math.min(1.9, share, Math.max(min, axisW(t)));
      const highW = fit(highT, 0.9);
      const lowW = fit(lowT, 0.9);
      const nameW = fit(axisName, 0.9);
      const right = box.x + 0.45;
      const highY = top + highW / 2 - 0.15;
      const lowY = box.bottom - lowW / 2 - 0.15;
      const nameY = (top + box.bottom) / 2 - 0.15;
      slide.addText(highT, {
        x: right - highW, y: highY, w: highW, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle", rotate: 270,
      });
      slide.addText(lowT, {
        x: right - lowW, y: lowY, w: lowW, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle", rotate: 270,
      });
      slide.addText(axisName, {
        x: right - nameW, y: nameY, w: nameW, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        align: "center", valign: "middle", rotate: 270,
      });
    }
  },

  
  scorecard(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const options = data.options;
    const criteria = data.criteria;
    const nCrit = criteria.length;
    const gut = 0.14;
    const headH = 0.5;
    const labelW = 2.5;
    const totalH = 0.55;
    const rowH = (box.bottom - y - headH - totalH - 0.15 - gut * (nCrit + 1)) / nCrit;
    const colW = (box.w - labelW - gut * (options.length - 1)) / options.length;
    const headScale = fitAllAt(theme, "subhead", 0.85, options.map((o) => o.name), colW, headH, { min: 0.6 });
    const critLabel = (c) => (c.weight ? `${c.label} (${c.weight})` : c.label);
    const critScale = fitAllAt(theme, "caption", 0.95, criteria.map(critLabel), labelW, rowH, { min: 0.6 });
    options.forEach((o, i) => {
      const x = box.x + labelW + i * (colW + gut);
      slide.addText(o.name, {
        x, y, w: colW, h: headH,
        ...textStyle(theme, "subhead", { bold: true, scale: headScale }),
        align: "center", valign: "middle",
      });
    });

    const allScores = options.flatMap((o) => o.scores ?? []);
    const maxScore = Math.max(1, ...allScores);
    criteria.forEach((c, r) => {
      const ry = y + headH + r * (rowH + gut);
      slide.addText(critLabel(c), {
        x: box.x, y: ry, w: labelW, h: rowH,
        ...textStyle(theme, "caption", { scale: critScale }),
        valign: "middle",
      });
      options.forEach((o, i) => {
        const x = box.x + labelW + i * (colW + gut);
        const score = o.scores?.[r];
        if (score == null) return;
        const trackW = colW * 0.46;
        const barW = Math.max(0.03, trackW * (score / maxScore));
        const trackY = ry + rowH - 0.2;
        slide.addShape("roundRect", {
          x: x + (colW - trackW) / 2, y: trackY, w: trackW, h: 0.11,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" }, rectRadius: 0.055,
        });
        slide.addShape("roundRect", {
          x: x + (colW - trackW) / 2, y: trackY, w: barW, h: 0.11,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" }, rectRadius: 0.055,
        });
        slide.addText(String(score), {
          x, y: ry, w: colW, h: rowH - 0.24,
          ...textStyle(theme, "caption", { bold: true }),
          align: "center", valign: "middle",
        });
      });
    });

    const ty = y + headH + nCrit * (rowH + gut);
    slide.addShape("rect", {
      x: box.x, y: ty - 0.08, w: box.w, h: 0.02,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    slide.addText("Total", {
      x: box.x, y: ty, w: labelW, h: totalH,
      ...textStyle(theme, "caption", { bold: true }),
      valign: "middle",
    });
    options.forEach((o, i) => {
      const x = box.x + labelW + i * (colW + gut);
      const total = (criteria.reduce((acc, c, r) => {
        const weight = parseFloat(String(c.weight ?? "1").replace("%", "")) || 0;
        return acc + (o.scores?.[r] ?? 0) * weight;
      }, 0));
      slide.addText(String(Math.round(total * 10) / 10), {
        x, y: ty, w: colW, h: totalH,
        ...textStyle(theme, "caption", { bold: true, color: theme.palette.accent }),
        align: "center", valign: "middle",
      });
    });
  },

  
  vs(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const pillW = 1.0;
    const halfW = (box.w - pillW) / 2;
    const longest = [data.left.title, data.right.title].reduce((a, b) => (b.length > a.length ? b : a));
    const titleScale = fitOneLine(longest, halfW, theme.type.heading);
    const block = (side, body, x) => {
      slide.addText(side.title, {
        x, y: y + 0.25, w: halfW, h: 1.3,
        ...textStyle(theme, "heading", { scale: titleScale }),
        align: "center", valign: "middle",
      });
      if (body) {
        const bScale = fitScale(body, halfW - 0.4, 1.4, theme.type.body, { min: 0.75 });
        slide.addText(body, {
          x: x + 0.2, y: y + 1.75, w: halfW - 0.4, h: 1.4,
          ...textStyle(theme, "body", { scale: bScale, color: theme.palette.ink_muted }),
          align: "center", valign: "top",
        });
      }
    };
    block(data.left, data.left_body, box.x);
    block(data.right, data.right_body, box.x + halfW + pillW);
    const px = box.x + halfW;
    slide.addShape("ellipse", {
      x: px, y: y + 0.5, w: pillW, h: pillW,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    slide.addText("VS", {
      x: px, y: y + 0.5, w: pillW, h: pillW,
      ...textStyle(theme, "subhead", { bold: true, color: theme.palette.on_accent }),
      align: "center", valign: "middle",
    });
  },

  
  "side-by-side"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut) / 2;
    const ch = box.bottom - y - 0.1;
    const pad = theme.shape?.card_pad ?? 0.28;
    const titleH = 0.4;
    const hasTitle = Boolean(data.left.title || data.right.title);
    const capH = (hasTitle ? titleH + 0.04 : 0) + lineAtFloor(theme, "body") * 2;
    const imgH = Math.max(0.8, Math.min(2.0, ch - pad * 2 - 0.18 - capH));
    const capTop = pad + imgH + 0.18 + (hasTitle ? titleH + 0.04 : 0);
    const bodyH = Math.max(0.24, ch - capTop - pad);
    const titleScale = fitScaleAll(
      [data.left.title, data.right.title].filter(Boolean), cw - pad * 2, titleH, theme.type.subhead, { min: 0.65 },
    );
    const bodyScale = fitScaleAll(
      [data.left.body, data.right.body].filter(Boolean), cw - pad * 2, bodyH, theme.type.body,
    );
    const col = (side, x) => {
      card(slide, theme, { x, y, w: cw, h: ch });
      const src = resolveAsset(side.image);
      if (src) {
        slide.addImage({
          path: src, x: x + pad, y: y + pad, w: cw - pad * 2, h: imgH,
          sizing: { type: "cover", w: cw - pad * 2, h: imgH },
        });
      } else {
        slide.addShape("roundRect", {
          x: x + pad, y: y + pad, w: cw - pad * 2, h: imgH,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.card ?? 0.12,
        });
      }
      let ty = y + pad + imgH + 0.18;
      if (side.title) {
        slide.addText(side.title, {
          x: x + pad, y: ty, w: cw - pad * 2, h: titleH,
          ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
          valign: "top",
        });
        ty += titleH + 0.04;
      }
      if (side.body) {
        slide.addText(side.body, {
          x: x + pad, y: ty, w: cw - pad * 2, h: bodyH,
          ...textStyle(theme, "body", { scale: bodyScale, color: theme.palette.ink_muted }),
          valign: "top",
        });
      }
    };
    col(data.left, box.x);
    col(data.right, box.x + cw + gut);
  },

  
  funnel(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.stages.length;
    const stageH = (box.bottom - y - 0.1 - 0.22 * (n - 1)) / n;
    const stackH = n * stageH + (n - 1) * 0.22;
    const top = y + Math.max(0, (box.bottom - y - stackH) / 2);
    const num = (v) => {
      if (v == null || v === "") return NaN;
      const f = parseFloat(String(v).replace(/[^\d.]/g, ""));
      return Number.isFinite(f) ? f : NaN;
    };
    const nums = data.stages.map((s) => num(s.value));
    const real = nums.every((x) => Number.isFinite(x));
    const maxN = real ? Math.max(...nums) : 1;
    const minN = real ? Math.min(...nums) : maxN;

    const width = (i) => {
      if (!real) return box.w * 0.78;
      if (maxN === minN) return box.w * 0.78;
      return box.w * (0.85 - 0.5 * ((maxN - nums[i]) / (maxN - minN)));
    };
    const values = data.stages.map((s) => s.value).filter(Boolean);
    const narrowest = Math.min(...data.stages.map((_, i) => width(i)));
    const valueStyle = designed(theme, "stat", 0.45);
    const valueW = values.length
      ? Math.min(Math.max(1.2, measure(widest(values, valueStyle), valueStyle) / 0.88 + 0.08), narrowest * 0.42)
      : 0;
    const valueScale = fitLineAt(theme, "stat", 0.45, values, valueW, { min: 0.3 });
    const stageTextW = (i) => width(i) - 0.4 - valueW;
    const labH = 0.36, bodH = 0.3;
    const labelScale = Math.min(
      ...data.stages.map((s, i) => fitScale(s.label, stageTextW(i), s.body ? labH : 0.4, theme.type.subhead, { min: 0.5 })),
    );
    const bodyScale = Math.min(
      1,
      ...data.stages.map((s, i) => (s.body ? fitScale(s.body, stageTextW(i), bodH, theme.type.caption) : 1)),
    );
    data.stages.forEach((st, i) => {
      const w = width(i);
      const x = box.x + (box.w - w) / 2;
      const sy = top + i * (stageH + 0.22);
      const accent = i % 2 === 0;
      slide.addShape("roundRect", {
        x, y: sy, w, h: stageH,
        fill: { color: hex(accent ? theme.palette.accent : theme.palette.surface) },
        line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
      const ink = accent ? theme.palette.on_accent : theme.palette.ink;
      if (st.body) {
        const by = sy + (stageH - (labH + bodH)) / 2;
        slide.addText(st.label, {
          x: x + 0.2, y: by, w: w - 0.4 - valueW, h: labH,
          ...textStyle(theme, "subhead", { bold: true, color: ink, scale: labelScale }),
          align: "center", valign: "bottom",
        });
        slide.addText(st.body, {
          x: x + 0.2, y: by + labH, w: w - 0.4 - valueW, h: bodH,
          ...textStyle(theme, "caption", { color: ink, scale: bodyScale }),
          align: "center", valign: "top",
        });
      } else {
        slide.addText(st.label, {
          x: x + 0.2, y: sy, w: w - 0.4 - valueW, h: stageH,
          ...textStyle(theme, "subhead", { bold: true, color: ink, scale: labelScale }),
          align: "center", valign: "middle",
        });
      }
      if (st.value) {
        slide.addText(st.value, {
          x: x + w - 0.2 - valueW, y: sy, w: valueW, h: stageH,
          ...textStyle(theme, "stat", { color: hex(ink), scale: valueScale }),
          align: "right", valign: "middle",
        });
      }
    });
  },

  
  pipeline(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.stages.length;
    const cardH = 1.35;
    const gut = 0.34;
    const cw = (box.w - gut * (n - 1)) / n;
    const clusterH = cardH + 0.55 + 0.03 + 0.5;
    const top = Math.max(y + 0.15, y + (box.bottom - y - clusterH) / 2);
    const lineY = top + cardH + 0.55;
    const titleScale = fitScaleAll(data.stages.map((s) => s.title), cw - 0.3, 0.4, theme.type.subhead, { min: 0.6 });
    const bodyScale = fitScaleAll(
      data.stages.map((s) => s.body).filter(Boolean), cw - 0.3, 0.55, theme.type.caption,
    );
    slide.addShape("rect", {
      x: box.x, y: lineY, w: box.w, h: 0.03,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    data.stages.forEach((st, i) => {
      const x = box.x + i * (cw + gut);
      if (i > 0) {
        slide.addShape("rect", {
          x: x - gut, y: lineY - 0.02, w: gut, h: 0.04,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
      }
      slide.addShape("rect", {
        x: x + cw / 2 - 0.015, y: top + cardH, w: 0.03, h: lineY - top - cardH,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });
      card(slide, theme, { x, y: top, w: cw, h: cardH });
      slide.addText(st.title, {
        x: x + 0.15, y: top + 0.15, w: cw - 0.3, h: 0.4,
        ...textStyle(theme, "subhead", { bold: true, scale: titleScale }),
        valign: "top",
      });
      if (st.body) {
        slide.addText(st.body, {
          x: x + 0.15, y: top + 0.58, w: cw - 0.3, h: 0.55,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          valign: "top",
        });
      }
      if (st.gate) {
        const gW = Math.min(cw, measure(st.gate, theme.type.caption) + 0.4);
        slide.addShape("roundRect", {
          x: x + (cw - gW) / 2, y: lineY + 0.18, w: gW, h: 0.32,
          fill: { color: hex(theme.palette.ink) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.pill ?? 0.16,
        });
        slide.addText(st.gate, {
          x: x + (cw - gW) / 2, y: lineY + 0.18, w: gW, h: 0.32,
          ...textStyle(theme, "caption", {
            color: theme.palette.surface,
            scale: fitLineAt(theme, "caption", 0.85, st.gate, gW, { min: 0.6 }),
          }),
          align: "center", valign: "middle",
        });
      }
    });
  },

  
  dependencies(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const nodes = data.nodes;
    const n = nodes.length;
    const depth = Array(n).fill(0);
    for (let pass = 0; pass < n; pass++) {
      nodes.forEach((nd, i) => (nd.depends_on ?? []).forEach((d) => {
        if (d >= 0 && d < n && d !== i) depth[i] = Math.max(depth[i], depth[d] + 1);
      }));
    }
    const maxDepth = Math.max(0, ...depth);
    const layers = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((nd, i) => layers[depth[i]].push(i));
    const barycenter = (nodeIdx) => {
      const deps = (nodes[nodeIdx].depends_on ?? []).filter((d) => d >= 0 && d < n && d !== nodeIdx);
      if (!deps.length) return layers[depth[nodeIdx]].indexOf(nodeIdx);
      return deps.reduce((acc, d) => acc + layers[depth[d]].indexOf(d), 0) / deps.length;
    };
    for (let pass = 0; pass < 3; pass++) {
      for (const layer of layers) layer.sort((a, b) => barycenter(a) - barycenter(b));
    }
    const top = Math.max(y, 2.6);
    const layerH = (box.bottom - top) / (maxDepth + 1);
    const nodeW = Math.min(3.0, Math.max(2.4, (box.w - 0.35 * Math.max(0, ...layers.map((l) => l.length - 1))) / Math.max(...layers.map((l) => l.length))));
    const LAYER_GAP = 0.22;
    const nodeH = Math.max(0.62, Math.min(1.05, layerH - LAYER_GAP));
    const titleH = Math.min(0.4, nodeH * 0.42);
    const bodyH = Math.max(0.2, nodeH - titleH - 0.18);
    const titleScale = fitScaleAll(nodes.map((nd) => nd.title), nodeW - 0.2, titleH, theme.type.caption, { min: 0.6 });
    const bodyScale = fitScaleAll(
      nodes.map((nd) => nd.body).filter(Boolean), nodeW - 0.2, bodyH, theme.type.caption,
    );
    const centres = nodes.map(() => ({ x: 0, y: 0 }));
    layers.forEach((layer, li) => {
      const lx = box.x + (box.w - (nodeW * layer.length + 0.35 * (layer.length - 1))) / 2;
      layer.forEach((nodeIdx, ni) => {
        const x = lx + ni * (nodeW + 0.35);
        const nodeY = top + li * layerH + (layerH - nodeH) / 2;
        centres[nodeIdx] = { x: x + nodeW / 2, y: nodeY + nodeH / 2 };
      });
    });
    nodes.forEach((nd, i) => (nd.depends_on ?? []).forEach((d) => {
      if (d >= 0 && d < n && d !== i) {
        const from = centres[d], to = centres[i];
        const x1 = from.x, y1 = from.y + nodeH / 2;
        const x2 = to.x, y2 = to.y - nodeH / 2;
        const lx = Math.min(x1, x2), lw = Math.abs(x2 - x1) || 0.02;
        const ly = Math.min(y1, y2), lh = Math.abs(y2 - y1) || 0.02;
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.accent), width: 1.3 },
          flipH: x2 < x1, flipV: y2 < y1,
        });
      }
    }));
    layers.forEach((layer, li) => {
      layer.forEach((nodeIdx) => {
        const { x, y: nodeY } = { x: centres[nodeIdx].x - nodeW / 2, y: centres[nodeIdx].y - nodeH / 2 };
        card(slide, theme, { x, y: nodeY, w: nodeW, h: nodeH });
        slide.addText(nodes[nodeIdx].title, {
          x: x + 0.1, y: nodeY + 0.08, w: nodeW - 0.2, h: titleH,
          ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
          align: "center", valign: "top",
        });
        if (nodes[nodeIdx].body) {
          slide.addText(nodes[nodeIdx].body, {
            x: x + 0.1, y: nodeY + titleH + 0.12, w: nodeW - 0.2, h: bodyH,
            ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
            align: "center", valign: "top",
          });
        }
      });
    });
  },

  
  "branching-flow"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const decision = data.decision ?? "Decision";
    const capStyle = theme.type.caption;
    const capFloor = atFloor(theme, "caption");
    const capLine = lineAtFloor(theme, "caption");

    const pre = data.steps ?? [];
    const branches = data.branches ?? [];
    const stepW = 1.5;
    const stepGap = 0.2;
    const rows = Math.max(0, ...branches.map((b) => (b.steps ?? []).length));
    const preGap = 0.22;
    const minCard = capLine + 0.18;
    const cardRows = (pre.length ? 1 : 0) + rows;
    const pillDrop = 0.05, pillH = 0.3;
    const labelZone = pillDrop + pillH + 0.05;
    const stemGap = 0.2;
    const fixed = stemGap + labelZone + (pre.length ? preGap : 0.5) + (rows ? (rows - 1) * stepGap : 0);
    const minDiamond = Math.max(0.7, capLine * 2);
    const maxW = Math.min(3.4, box.w * 0.34);
    const wantDiamond = (() => {
      const lines = lineCount(decision, maxW / 2, capFloor);
      let h = minDiamond;
      while (lines * capLine > h / 2 && h < 2.2) h += 0.16;
      return h;
    })();
    const top = Math.max(y, Math.min(2.55, box.bottom - (fixed + wantDiamond + cardRows * minCard)));
    const stepH = cardRows
      ? Math.max(minCard, Math.min(0.7, (box.bottom - top - fixed - wantDiamond) / cardRows))
      : 0.7;
    const preBand = pre.length ? stepH + preGap : 0.5;
    const dy = top + preBand;
    const maxH = Math.max(minDiamond, box.bottom - dy - stemGap - labelZone - (rows ? rows * stepH + (rows - 1) * stepGap : 0));
    let decisionW = 1.4, decisionH = Math.min(wantDiamond, Math.max(minDiamond, maxH));
    const seats = () => lineCount(decision, decisionW / 2, capFloor) * capLine <= decisionH / 2;
    while (!seats() && decisionW < maxW) decisionW = Math.min(maxW, decisionW + 0.3);
    while (!seats() && decisionH + 0.16 <= maxH) decisionH += 0.16;
    const dx = box.x + box.w / 2 - decisionW / 2;

    slide.addShape("diamond", {
      x: dx, y: dy, w: decisionW, h: decisionH,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    const decisionScale = fitScale(decision, decisionW / 2, decisionH / 2, capStyle, { min: 0.5 });
    slide.addText(decision, {
      x: dx + decisionW / 4, y: dy + decisionH / 4, w: decisionW / 2, h: decisionH / 2,
      ...textStyle(theme, "caption", { bold: true, color: theme.palette.on_accent, scale: decisionScale }),
      align: "center", valign: "middle",
    });

    const branchTop = dy + decisionH + stemGap;
    const rowH = rows
      ? Math.min(stepH, (box.bottom - branchTop - labelZone - (rows - 1) * stepGap) / rows)
      : stepH;
    const stepTitles = [
      ...pre.map((s) => s.title),
      ...branches.flatMap((b) => (b.steps ?? []).map((s) => s.title)),
    ].filter(Boolean);
    const stepTitleScale = fitAllAt(theme, "caption", 0.95, stepTitles, stepW - 0.2, Math.min(stepH, rowH) - 0.2, { min: 0.6 });
    const stepCard = (s, x, sy, h) => {
      card(slide, theme, { x, y: sy, w: stepW, h });
      slide.addText(s.title, {
        x: x + 0.1, y: sy + 0.1, w: stepW - 0.2, h: h - 0.2,
        ...textStyle(theme, "caption", { bold: true, scale: stepTitleScale }),
        align: "center", valign: "middle",
      });
    };
    pre.forEach((s, i) => {
      const x = box.x + box.w / 2 + (i - (pre.length - 1) / 2) * (stepW + 0.3) - stepW / 2;
      const sy = dy - stepH - preGap;
      stepCard(s, x, sy, stepH);
      slide.addShape("line", {
        x: x + stepW / 2 - 0.015, y: sy + stepH, w: 0.03, h: dy - sy - stepH,
        line: { color: hex(theme.palette.rule), width: 1.1 },
      });
    });

    const nb = branches.length;
    const pillW = (t) => Math.min(1.3, measure(t, theme.type.caption) + 0.4);
    const branchLabelScale = nb
      ? Math.min(...branches.map((b) => fitLineAt(theme, "caption", 0.9, b.label, pillW(b.label), { min: 0.6 })))
      : 0.9;
    branches.forEach((b, bi) => {
      const bx = box.x + box.w * (bi + 1) / (nb + 1) - stepW / 2;
      slide.addShape("line", {
        x: dx + decisionW / 2 - 0.015, y: dy + decisionH, w: 0.03, h: branchTop - dy - decisionH,
        line: { color: hex(theme.palette.rule), width: 1.1 },
      });
      const spineX = dx + decisionW / 2 - 0.015;
      const armX = bx + stepW / 2;
      slide.addShape("line", {
        x: Math.min(spineX, armX), y: branchTop, w: Math.abs(armX - spineX), h: 0.03,
        line: { color: hex(theme.palette.rule), width: 1.1 },
      });
      const lW = pillW(b.label);
      slide.addShape("roundRect", {
        x: bx + (stepW - lW) / 2, y: branchTop + pillDrop, w: lW, h: pillH,
        fill: { color: hex(theme.palette.surface) }, line: { color: hex(theme.palette.rule), width: 1 },
        rectRadius: theme.shape?.radius?.pill ?? 0.15,
      });
      slide.addText(b.label, {
        x: bx + (stepW - lW) / 2, y: branchTop + pillDrop, w: lW, h: pillH,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: branchLabelScale }),
        align: "center", valign: "middle",
      });
      (b.steps ?? []).forEach((s, si) => {
        const sy2 = branchTop + labelZone + si * (rowH + stepGap);
        stepCard(s, bx, sy2, rowH);
      });
    });
  },

  
  "layered-architecture"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.layers.length;
    const gap = 0.09;
    const layerH = (box.bottom - y - 0.1 - gap * (n - 1)) / n;
    const labelW = Math.min(3.2, box.w * 0.28);
    const bodyX = labelW + 0.3;
    const labelScale = fitScaleAll(data.layers.map((l) => l.label), labelW, 0.4, theme.type.subhead, { min: 0.65 });
    const wanted = (t) => Math.min(2.3, measure(t, theme.type.caption) + 0.4);
    const BODY_MIN = 1.8;
    const stripOf = (l) => (l.items ?? []).reduce((a, it) => a + wanted(it) + 0.1, 0);
    const maxStrip = Math.max(0, ...data.layers.map(stripOf));
    const strip = Math.min(maxStrip, Math.max(0, box.w - bodyX - BODY_MIN));
    const squeeze = maxStrip > 0 ? Math.min(1, strip / maxStrip) : 1;
    const chipW = (t) => wanted(t) * squeeze;
    const bodyW = Math.max(BODY_MIN, box.w - bodyX - strip - 0.2);
    const bodyScale = fitScaleAll(
      data.layers.map((l) => l.body).filter(Boolean), bodyW, 0.35, theme.type.caption,
    );
    const chips = data.layers.flatMap((l) => l.items ?? []);
    const chipScale = chips.length
      ? Math.min(...chips.map((t) => fitLineAt(theme, "caption", 0.85, t, chipW(t), { min: 0.6 })))
      : 0.85;
    data.layers.forEach((l, i) => {
      const ly = y + i * (layerH + gap);
      slide.addShape("roundRect", {
        x: box.x, y: ly, w: box.w, h: layerH,
        fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
        rectRadius: theme.shape?.radius?.card ?? 0.1,
      });
      slide.addShape("rect", {
        x: box.x, y: ly, w: 0.06, h: layerH,
        fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
      });
      slide.addText(l.label, {
        x: box.x + 0.24, y: ly, w: labelW - 0.24, h: layerH,
        ...textStyle(theme, "subhead", { bold: true, scale: labelScale }),
        valign: "middle",
      });
      if (l.body) {
        slide.addText(l.body, {
          x: box.x + bodyX, y: ly, w: bodyW, h: layerH,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          valign: "middle",
        });
      }
      const items = l.items ?? [];
      let pillX = box.x + box.w - 0.18;
      for (let j = items.length - 1; j >= 0; j--) {
        const it = items[j];
        const w2 = chipW(it);
        pillX -= w2;
        slide.addShape("roundRect", {
          x: pillX, y: ly + (layerH - 0.3) / 2, w: w2, h: 0.3,
          fill: { color: hex(theme.palette.surface) }, line: { color: hex(theme.palette.rule), width: 1 },
          rectRadius: theme.shape?.radius?.pill ?? 0.15,
        });
        slide.addText(it, {
          x: pillX, y: ly + (layerH - 0.3) / 2, w: w2, h: 0.3,
          ...textStyle(theme, "caption", { color: theme.palette.ink, scale: chipScale }),
          align: "center", valign: "middle",
        });
        pillX -= 0.12;
      }
    });
  },

  
  roadmap(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const phases = data.phases;
    const timeLabels = data.time_labels ?? [];
    const labelH = timeLabels.length ? 0.34 : 0;
    const top = Math.max(y, 2.8) + labelH;
    const labelW = 1.6;
    const rowH = (box.bottom - top - 0.05) / phases.length;
    const areaX = box.x + labelW + 0.35;
    const areaW = box.w - labelW - 0.35;

    if (timeLabels.length) {
      const tw = areaW / timeLabels.length;
      timeLabels.forEach((tl, i) => {
        slide.addText(tl, {
          x: areaX + i * tw, y: top - labelH, w: tw, h: 0.3,
          ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
          align: "center", valign: "middle",
        });
      });
    }
    const cardW = (p) => Math.max(1.2, Math.min(3.4, areaW / (p.items ?? []).length - 0.18));
    const textW = Math.min(...phases.filter((p) => (p.items ?? []).length).map((p) => cardW(p) - 0.2), 3.2);
    const titleH = Math.max(0.3, rowH * 0.5 - 0.14);
    const titleScale = fitScaleAll(
      phases.flatMap((p) => p.items ?? []).map((it) => it.title), textW, titleH, theme.type.caption, { min: 0.6 },
    );
    const bodyScale = fitAllAt(
      theme, "caption", 0.88,
      phases.flatMap((p) => p.items ?? []).map((it) => it.body),
      textW, rowH * 0.42, { min: 0.6 },
    );
    phases.forEach((p, pi) => {
      const ry = top + 0.05 + pi * rowH;
      const phaseScale = fitScale(p.label, labelW - 0.1, rowH - 0.15, theme.type.subhead, { min: 0.6 });
      slide.addText(p.label, {
        x: box.x, y: ry, w: labelW, h: rowH - 0.1,
        ...textStyle(theme, "subhead", { bold: true, scale: phaseScale }),
        valign: "middle",
      });
      const items = p.items ?? [];
      const itemW = cardW(p);
      items.forEach((it, ii) => {
        const x = areaX + (ii + 0.5) * (areaW / items.length) - itemW / 2;
        card(slide, theme, { x, y: ry, w: itemW, h: rowH - 0.1 });
        slide.addText(it.title, {
          x: x + 0.1, y: ry + 0.07, w: itemW - 0.2, h: titleH,
          ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
          align: "center", valign: "top",
        });
        if (it.body) {
          slide.addText(it.body, {
            x: x + 0.1, y: ry + rowH * 0.5, w: itemW - 0.2, h: rowH * 0.42,
            ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
            align: "center", valign: "top",
          });
        }
      });
      if (pi < phases.length - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH - 0.015, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  
  journey(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const stages = data.stages;
    const n = stages.length;
    const top = Math.max(y, 2.75);
    const hasValues = stages.every((s) => typeof s.value === "number");
    const lineTop = top + (hasValues ? 0.85 : 0.4);
    const lineBot = box.bottom - 1.0;
    const mid = (lineTop + lineBot) / 2;
    const step = box.w / n;

    const yFor = (st) => {
      if (!hasValues) return mid;
      const vals = stages.map((s) => s.value);
      const vMin = Math.min(...vals), vMax = Math.max(...vals);
      const range = vMax - vMin || 1;
      return lineBot - ((st.value - vMin) / range) * (lineBot - lineTop);
    };
    const points = stages.map((st, i) => ({ x: box.x + step * i + step / 2, y: yFor(st) }));

    const labelScale = fitScaleAll(stages.map((s) => s.label), step - 0.2, 0.3, theme.type.eyebrow, { min: 0.6 });
    stages.forEach((st, i) => {
      slide.addText(st.label, {
        x: box.x + step * i + 0.1, y: top, w: step - 0.2, h: 0.3,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted, scale: labelScale }),
        align: "center", valign: "top",
      });
    });

    if (hasValues) {
      slide.addShape("rect", {
        x: box.x, y: mid - 0.015, w: box.w, h: 0.03,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });
      const valScale = fitScaleAll(
        stages.map((s) => String(s.value)), step - 0.2, 0.24, theme.type.caption, { min: 0.7 },
      );
      for (let i = 0; i < n - 1; i++) {
        const a = points[i], b = points[i + 1];
        const lx = Math.min(a.x, b.x), lw = Math.abs(b.x - a.x) || 0.02;
        const ly = Math.min(a.y, b.y), lh = Math.abs(b.y - a.y) || 0.02;
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.accent), width: 2 },
          flipH: b.x < a.x, flipV: b.y < a.y,
        });
      }
      points.forEach((p, i) => {
        slide.addText(String(stages[i].value), {
          x: box.x + step * i + 0.1, y: top + 0.32, w: step - 0.2, h: 0.24,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: valScale }),
          align: "center", valign: "top",
        });
      });
    } else {
      slide.addShape("rect", {
        x: box.x, y: mid - 0.02, w: box.w, h: 0.04,
        fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
      });
      for (let i = 0; i < n - 1; i++) {
        const a = points[i], b = points[i + 1];
        slide.addShape("line", {
          x: a.x, y: mid - 0.02, w: Math.max(0.02, b.x - a.x), h: 0.04,
          line: { color: hex(theme.palette.rule), width: 1.5 },
        });
      }
    }

    const bodyScale = fitScaleAll(
      stages.map((s) => s.body).filter(Boolean), step - 0.2, 0.8, theme.type.caption,
    );
    points.forEach((p, i) => {
      const fill = hasValues
        ? theme.palette.accent
        : stages[i].sentiment === "positive"
          ? theme.palette.accent
          : stages[i].sentiment === "negative"
            ? theme.palette.ink
            : theme.palette.ink_muted;
      slide.addShape("ellipse", {
        x: p.x - 0.11, y: p.y - 0.11, w: 0.22, h: 0.22,
        fill: { color: hex(fill) }, line: { type: "none" },
      });
      if (stages[i].body) {
        slide.addText(stages[i].body, {
          x: box.x + step * i + 0.1, y: lineBot + 0.16, w: step - 0.2, h: 0.8,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          align: "center", valign: "top",
        });
      }
    });
  },

  
  chronology(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const yearW = 1.4;
    const rowH = (box.bottom - y - 0.1) / data.events.length;
    const textW = box.w - yearW - 0.4;
    const textScale = fitScaleAll(data.events.map((e) => e.text), textW, rowH - 0.08, theme.type.body);
    slide.addShape("rect", {
      x: box.x + yearW + 0.18, y, w: 0.02, h: box.bottom - y,
      fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
    });
    data.events.forEach((e, i) => {
      const ry = y + i * rowH;
      slide.addText(e.year, {
        x: box.x, y: ry, w: yearW, h: rowH,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        align: "left", valign: "middle",
      });
      slide.addText(e.text, {
        x: box.x + yearW + 0.4, y: ry + 0.04, w: textW, h: rowH - 0.08,
        ...textStyle(theme, "body", { scale: textScale }),
        valign: "middle",
      });
    });
  },
};

