/** special slide layouts. */

import { hex, textStyle, applyTransform } from "../theme.js";
import { fitScale, fitScaleAll, fitOneLine, lineCount, measure, floorOf } from "../fit.js";
import { CANVAS, reservedTopRight } from "../chrome.js";
import { chartSeries, ensureContrast } from "../chartpalette.js";
import { frameBox, drawOpening, drawHeading, bulletOptions, listColumns, hasDropcap, sectionField, sectionStyle, titlePlacement } from "../composition.js";
import { atDesign, atFloor, card, content, designed, eyebrow, fitAllAt, fitAt, fitLineAt, heading, lineAtFloor, linesBox, onInk, paint, widest } from "./helpers.js";

export const layouts = {
testimonial(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const img = data.image ? resolveAsset(data.image) : null;
    const hasImg = Boolean(img);
    const qx = hasImg ? box.x + 2.6 : box.x;
    const qw = hasImg ? box.w - 2.6 : box.w;
    const top = Math.max(y, 2.5);
    const quoteScale = fitScale(data.quote, qw, hasImg ? 2.0 : 2.6, theme.type.heading, { min: 0.55 });
    slide.addText(`“${data.quote}”`, {
      x: qx, y: top, w: qw, h: hasImg ? 2.0 : 2.6,
      ...textStyle(theme, "heading", { scale: quoteScale, italic: true }),
      align: hasImg ? "left" : "center", valign: "middle",
    });
    if (hasImg) {
      const imgSize = 1.8;
      slide.addImage({
        path: img, x: box.x + 0.1, y: top + 0.4, w: imgSize, h: imgSize,
        rounding: true, sizing: { type: "cover", w: imgSize, h: imgSize },
      });
    }
    if (data.name) {
      const ny = hasImg ? top + 2.15 : top + 2.75;
      slide.addText(data.name, {
        x: qx, y: ny, w: qw, h: 0.4,
        ...textStyle(theme, "subhead", { bold: true }),
        align: hasImg ? "left" : "center", valign: "middle",
      });
      if (data.role) {
        slide.addText(data.role, {
          x: qx, y: ny + 0.42, w: qw, h: 0.35,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          align: hasImg ? "left" : "center", valign: "middle",
        });
      }
    }
  },

  
  "pull-quote"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y + 0.5, 3.1);
    slide.addShape("rect", {
      x: box.x, y: top, w: 0.08, h: 1.3,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    const quoteScale = fitScale(data.quote, box.w - 0.55, 1.3, theme.type.heading, { min: 0.55 });
    slide.addText(`“${data.quote}”`, {
      x: box.x + 0.32, y: top, w: box.w - 0.32, h: 1.3,
      ...textStyle(theme, "heading", { scale: quoteScale, italic: true }),
      align: "left", valign: "middle",
    });
    if (data.attribution) {
      slide.addText(`— ${data.attribution}`, {
        x: box.x + 0.32, y: top + 1.45, w: box.w - 0.32, h: 0.4,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        align: "left", valign: "middle",
      });
    }
  },

  
  epigraph(slide, ctx) {
    const { theme, data } = ctx;
    const s = theme.surfaces.section;
    paint(slide, ctx, s.bg);
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const quoteScale = fitScale(data.quote, w * 0.78, 3.0, theme.type.heading, { min: 0.55 });
    slide.addText(`“${data.quote}”`, {
      x: (CANVAS.w - w * 0.78) / 2, y: 1.7, w: w * 0.78, h: 3.0,
      ...textStyle(theme, "heading", { color: s.ink, scale: quoteScale, italic: true }),
      align: "center", valign: "middle",
    });
    if (data.attribution) {
      slide.addText(`— ${data.attribution}`, {
        x: m.left, y: 4.85, w, h: 0.4,
        ...textStyle(theme, "subhead", { color: s.muted }),
        align: "center", valign: "middle",
      });
    }
    if (data.source) {
      slide.addText(data.source, {
        x: m.left, y: 5.32, w, h: 0.35,
        ...textStyle(theme, "caption", { color: s.muted, italic: true }),
        align: "center", valign: "middle",
      });
    }
  },

  
  warning(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const ph = 2.0;
    const py = Math.max(y, 3.0);
    const warn = theme.palette.accent_alt ?? theme.palette.accent;
    slide.addShape("roundRect", {
      x: box.x, y: py, w: box.w, h: ph,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    slide.addShape("rect", {
      x: box.x, y: py, w: box.w, h: 0.06,
      fill: { color: hex(warn) }, line: { type: "none" },
    });
    slide.addShape("rect", {
      x: box.x, y: py, w: 0.06, h: ph,
      fill: { color: hex(warn) }, line: { type: "none" },
    });
    const pad = 0.5;
    slide.addText(data.label ?? "⚠️", {
      x: box.x + pad, y: py + 0.3, w: box.w - pad * 2, h: 0.4,
      ...textStyle(theme, "eyebrow", { color: warn }),
      valign: "middle",
    });
    slide.addText(data.body, {
      x: box.x + pad, y: py + 0.78, w: box.w - pad * 2, h: ph - 0.9,
      ...textStyle(theme, "body", { scale: fitScale(data.body, box.w - pad * 2, ph - 0.9, theme.type.body) }),
      valign: "top",
    });
  },

  
  tip(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const ph = 1.9;
    const py = Math.max(y, 3.0);
    slide.addShape("roundRect", {
      x: box.x, y: py, w: box.w, h: ph,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    slide.addShape("rect", {
      x: box.x, y: py, w: 0.08, h: ph,
      fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
    });
    const pad = 0.5;
    slide.addText(data.label ?? "Tip", {
      x: box.x + pad, y: py + 0.32, w: box.w - pad * 2, h: 0.4,
      ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
      valign: "middle",
    });
    slide.addText(data.body, {
      x: box.x + pad, y: py + 0.8, w: box.w - pad * 2, h: ph - 0.95,
      ...textStyle(theme, "body", { scale: fitScale(data.body, box.w - pad * 2, ph - 0.95, theme.type.body) }),
      valign: "top",
    });
  },

  
  takeaway(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const promoted = !data.headline && data.label ? data.label : null;
    const y = heading(slide, promoted ? { ...ctx, data: { ...data, headline: promoted } } : ctx);
    const hasPoints = Array.isArray(data.points) && data.points.length > 0;
    const labelH = promoted ? 0.44 : 0;
    const pointsTop = 1.5 - labelH;
    const ph = hasPoints
      ? pointsTop + 0.36 * data.points.length + 0.16
      : 1.6 - labelH;
    const py = y + Math.max(0, (box.bottom - y - ph) / 3);
    slide.addShape("roundRect", {
      x: box.x, y: py, w: box.w, h: ph,
      fill: { color: hex(theme.palette.ink) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    const pad = 0.5;
    if (!promoted) {
      slide.addText(data.label ?? "Key takeaway", {
        x: box.x + pad, y: py + 0.26, w: box.w - pad * 2, h: 0.4,
        ...textStyle(theme, "eyebrow", { color: onInk(theme) }),
        valign: "middle",
      });
    }
    const bodyH = hasPoints ? 0.75 : ph - 0.85 + labelH;
    slide.addText(data.body, {
      x: box.x + pad, y: py + 0.7 - labelH, w: box.w - pad * 2, h: bodyH,
      ...textStyle(theme, "body", {
        color: theme.palette.surface,
        scale: fitScale(data.body, box.w - pad * 2, bodyH, theme.type.body),
      }),
      valign: "top",
    });
    if (hasPoints) {
      const pointScale = fitScaleAll(data.points, box.w - pad * 2 - 0.32, 0.32, theme.type.caption);
      data.points.forEach((p, i) => {
        const py2 = py + pointsTop + i * 0.36;
        slide.addText("•", {
          x: box.x + pad + 0.1, y: py2, w: 0.2, h: 0.32,
          ...textStyle(theme, "caption", { color: onInk(theme, 3.0) }),
          valign: "middle",
        });
        slide.addText(p, {
          x: box.x + pad + 0.32, y: py2, w: box.w - pad * 2 - 0.32, h: 0.32,
          ...textStyle(theme, "caption", { color: theme.palette.surface, scale: pointScale }),
          valign: "middle",
        });
      });
    }
  },

  
  "image-grid"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.images.length;
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const capH = 0.34;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const imgH = ch - capH;
    const capScale = fitScaleAll(
      data.images.map((i) => i.caption).filter(Boolean), cw, capH - 0.04, theme.type.caption,
    );
    data.images.forEach((im, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      const src = resolveAsset(im.src);
      if (src) {
        slide.addImage({ path: src, x, y: ry, w: cw, h: imgH, sizing: { type: "cover", w: cw, h: imgH } });
      } else {
        slide.addShape("roundRect", {
          x, y: ry, w: cw, h: imgH,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
          rectRadius: theme.shape?.radius?.card ?? 0.12,
        });
      }
      if (im.caption) {
        slide.addText(im.caption, {
          x, y: ry + imgH + 0.04, w: cw, h: capH,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true, scale: capScale }),
          align: "center", valign: "top",
        });
      }
    });
  },

  
  "hero-image"(slide, ctx) {
    const { theme, data, resolveAsset } = ctx;
    const src = resolveAsset(data.image);
    if (src) {
      slide.addImage({
        path: src, x: 0, y: 0, w: CANVAS.w, h: CANVAS.h,
        sizing: { type: "cover", w: CANVAS.w, h: CANVAS.h },
      });
    } else {
      paint(slide, ctx, theme.palette.ink);
    }
    const ovH = 2.6;
    slide.addShape("rect", {
      x: 0, y: CANVAS.h - ovH, w: CANVAS.w, h: ovH,
      fill: { color: hex(theme.palette.ink), transparency: 45 }, line: { type: "none" },
    });
    const m = theme.grid.margin;
    const w = CANVAS.w - m.left - m.right;
    const scale = fitScale(data.headline, w, 1.2, theme.type.display, { min: 0.6 });
    slide.addText(data.headline, {
      x: m.left, y: CANVAS.h - ovH + 0.4, w, h: 1.2,
      ...textStyle(theme, "display", { color: theme.palette.surface, scale }),
      valign: "top",
    });
    const sub = data.subtitle?.trim() || data.standfirst?.trim();
    if (sub) {
      const subH = ovH - 1.62 - 0.2;
      const sScale = fitScale(sub, w, subH, theme.type.subhead, { min: 0.75 });
      slide.addText(sub, {
        x: m.left, y: CANVAS.h - ovH + 1.62, w, h: subH,
        ...textStyle(theme, "subhead", { color: theme.palette.surface, scale: sScale }),
        valign: "top",
      });
    }
  },

  
  "split-screen"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const capH = data.left_caption || data.right_caption ? 0.34 : 0;
    const imgH = box.bottom - y - capH - 0.05;
    const gut = theme.grid.gutter;
    const halfW = (box.w - gut) / 2;
    const img = (src, x, caption) => {
      const abs = resolveAsset(src);
      if (abs) {
        slide.addImage({
          path: abs, x, y, w: halfW, h: imgH,
          sizing: { type: "cover", w: halfW, h: imgH },
        });
      } else {
        slide.addShape("roundRect", {
          x, y, w: halfW, h: imgH,
          fill: { color: hex(theme.palette.surface) },
          line: { color: hex(theme.palette.rule), width: 1 },
          rectRadius: theme.shape?.radius?.card ?? 0.1,
        });
      }
      if (caption) {
        slide.addText(caption, {
          x, y: y + imgH + 0.04, w: halfW, h: 0.3,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true }),
          align: "center", valign: "top",
        });
      }
    };
    img(data.left, box.x, data.left_caption);
    img(data.right, box.x + halfW + gut, data.right_caption);
  },

  
  "data-table"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const cols = data.columns;
    const rows = data.rows;
    const rowLabels = data.row_labels ?? [];
    const hasLabels = rowLabels.length > 0;
    const cellOf = (label, { bold = false, color, fill, align = "left" }) => ({
      text: label,
      options: {
        bold,
        align,
        color: hex(color),
        fill: { color: hex(fill) },
        fontFace: theme.type.caption.family,
        fontSize: Math.max(9, theme.type.caption.size),
      },
    });
    const head = [
      ...(hasLabels ? [cellOf("", { bold: true, color: theme.palette.on_accent, fill: theme.palette.accent })] : []),
      ...cols.map((c) => cellOf(c.label, {
        bold: true, color: theme.palette.on_accent, fill: theme.palette.accent, align: c.align ?? "left",
      })),
    ];
    const body = rows.map((r, ri) => {
      const cells = Array.isArray(r.text) ? r.text : [r.text];
      const fillBase = ri % 2 ? theme.palette.bg : theme.palette.surface;
      return [
        ...(hasLabels ? [cellOf(rowLabels[ri] ?? "", { bold: true, color: theme.palette.ink, fill: fillBase })] : []),
        ...cols.map((c, ci) => cellOf(cells[ci] ?? "", {
          color: theme.palette.ink, fill: fillBase, align: c.align ?? "left",
        })),
      ];
    });
    slide.addTable([head, ...body], {
      x: box.x, y, w: box.w,
      border: { type: "solid", pt: 0.5, color: hex(theme.palette.rule) },
      rowH: Math.min(0.5, Math.max(0.32, (box.bottom - y - 0.1) / (rows.length + 1))),
      valign: "middle",
      margin: 0.08,
      autoPage: false,
    });
    const rowH = Math.min(0.5, Math.max(0.32, (box.bottom - y - 0.1) / (rows.length + 1)));
    rows.forEach((r, ri) => {
      if (r.highlight) {
        slide.addShape("rect", {
          x: box.x, y: y + rowH + ri * rowH + 0.02, w: 0.06, h: rowH - 0.04,
          fill: { color: hex(theme.palette.accent) }, line: { type: "none" },
        });
      }
    });
  },

  
  "decision-matrix"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const criteria = data.criteria;
    const options = data.options;
    const nCrit = criteria.length;
    const totalH = 0.55;
    const rowH = (box.bottom - y - totalH - 0.1) / (nCrit + 1);
    const labelW = 3.0;
    const gut = theme.grid.gutter;
    const colW = (box.w - labelW - gut * (options.length - 1)) / options.length;
    const cellOpts = (text, { bold = false, color = theme.palette.ink, fill = null, align = "center" }) => ({
      text,
      options: {
        bold, align,
        color: hex(color),
        ...(fill ? { fill: { color: hex(fill) } } : {}),
        fontFace: theme.type.caption.family,
        fontSize: Math.max(9, theme.type.caption.size),
      },
    });
    const head = [
      cellOpts("", { align: "left" }),
      ...options.map((o) => cellOpts(o.name, { bold: true, color: theme.palette.on_accent, fill: theme.palette.accent })),
    ];
    const body = criteria.map((c, r) => {
      const best = Math.max(...options.map((o) => o.scores?.[r] ?? 0));
      const cells = [
        cellOpts(`${c.label} (w ${String(c.weight ?? "")})`, { bold: true, align: "left" }),
        ...options.map((o) => {
          const score = o.scores?.[r];
          const isBest = score != null && score === best;
          return cellOpts(score == null ? "–" : String(score), {
            bold: isBest, color: isBest ? theme.palette.accent : theme.palette.ink,
            fill: r % 2 ? theme.palette.bg : theme.palette.surface,
          });
        }),
      ];
      return cells;
    });
    const totals = options.map((o) => {
      const total = criteria.reduce((acc, c, r) => acc + (o.scores?.[r] ?? 0) * (c.weight ?? 0), 0);
      return Math.round(total * 10) / 10;
    });
    const bestTotal = Math.max(...totals);
    const table = [
      head,
      ...body,
      [
        cellOpts("Total", { bold: true, align: "left" }),
        ...options.map((o, i) => cellOpts(String(totals[i]), {
          bold: totals[i] === bestTotal,
          color: totals[i] === bestTotal ? theme.palette.accent : theme.palette.ink,
        })),
      ],
    ];
    slide.addTable(table, {
      x: box.x, y, w: box.w,
      border: { type: "solid", pt: 0.5, color: hex(theme.palette.rule) },
      rowH: Math.min(0.5, Math.max(0.32, (box.bottom - y - 0.1) / (nCrit + 2))),
      valign: "middle",
      margin: 0.08,
      autoPage: false,
    });
  },

  
  diagram(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const nodes = data.nodes;
    const n = nodes.length;
    const edges = data.edges ?? [];
    const idIdx = new Map(nodes.map((nd, i) => [nd.id, i]));
    const layout = data.layout ?? "vertical";
    const top = Math.max(y, 2.6);
    const depth = Array(n).fill(0);
    for (let pass = 0; pass < n; pass++) {
      edges.forEach((e) => {
        const f = idIdx.get(e.from), t = idIdx.get(e.to);
        if (f != null && t != null && f !== t) depth[t] = Math.max(depth[t], depth[f] + 1);
      });
    }
    const maxDepth = Math.max(0, ...depth);
    const layers = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((nd, i) => layers[depth[i]].push(i));
    const vertical = layout !== "horizontal" && (box.bottom - top) / (maxDepth + 1) >= 0.85;
    const across = vertical ? box.bottom - top : box.w;
    const along = vertical ? box.w : box.bottom - top;
    const vSpacing = across / (maxDepth + 1);
    const hSpacing = along / Math.max(...layers.map((l) => l.length));
    const layerSpaceX = vertical ? hSpacing : vSpacing;
    const layerSpaceY = vertical ? vSpacing : hSpacing;
    const nodeW = Math.min(2.2, Math.max(1.4, layerSpaceX - 0.35));
    const nodeH = Math.max(0.5, Math.min(1.0, layerSpaceY - 0.2));
    const dense = nodeH < 0.72;
    const titleH = dense ? nodeH - 0.12 : 0.3;
    const titleScale = fitScaleAll(nodes.map((nd) => nd.label), nodeW - 0.2, titleH, theme.type.caption, { min: 0.6 });
    const bodyScale = dense
      ? 1
      : fitScaleAll(nodes.map((nd) => nd.body).filter(Boolean), nodeW - 0.2, nodeH - 0.46, theme.type.caption);
    const node = (i, x, y2) => {
      card(slide, theme, { x: x - nodeW / 2, y: y2 - nodeH / 2, w: nodeW, h: nodeH });
      slide.addText(nodes[i].label, {
        x: x - nodeW / 2 + 0.1, y: y2 - nodeH / 2 + 0.06, w: nodeW - 0.2, h: titleH,
        ...textStyle(theme, "caption", { bold: true, scale: titleScale }),
        align: "center", valign: "middle",
      });
      if (nodes[i].body && !dense) {
        slide.addText(nodes[i].body, {
          x: x - nodeW / 2 + 0.1, y: y2 - nodeH / 2 + 0.38, w: nodeW - 0.2, h: nodeH - 0.46,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: bodyScale }),
          align: "center", valign: "top",
        });
      }
    };
    const line = (ax, ay, bx, by) => {
      const lx = Math.min(ax, bx), lw = Math.abs(bx - ax) || 0.02;
      const ly = Math.min(ay, by), lh = Math.abs(by - ay) || 0.02;
      slide.addShape("line", {
        x: lx, y: ly, w: lw, h: lh,
        line: { color: hex(theme.palette.rule), width: 1.1 },
        flipH: bx < ax, flipV: by < ay,
      });
    };
    const centres = new Array(n);

    if (layout === "radial") {
      const cx = box.x + box.w / 2;
      const cy = (top + box.bottom) / 2;
      const radius = Math.max(1.2, Math.min(box.w / 2 - nodeW / 2 - 0.5, (box.bottom - top) / 2 - nodeH / 2 - 0.4));
      centres[0] = { x: cx, y: cy };
      nodes.slice(1).forEach((nd, i) => {
        const angle = (2 * Math.PI * i) / Math.max(1, n - 1) - Math.PI / 2;
        const idx = nodes.indexOf(nd);
        centres[idx] = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      });
    } else {
      const barycenter = (nodeIdx) => {
        const ins = edges
          .filter((e) => idIdx.get(e.to) === nodeIdx && idIdx.get(e.from) != null && idIdx.get(e.from) !== nodeIdx)
          .map((e) => idIdx.get(e.from));
        if (!ins.length) return layers[depth[nodeIdx]].indexOf(nodeIdx);
        return ins.reduce((acc, d) => acc + layers[depth[d]].indexOf(d), 0) / ins.length;
      };
      for (let pass = 0; pass < 3; pass++) {
        for (const layer of layers) layer.sort((a, b) => barycenter(a) - barycenter(b));
      }
      layers.forEach((layer, li) => {
        const per = along / layer.length;
        layer.forEach((nodeIdx, ni) => {
          const a = per * (ni + 0.5);
          const c = across * (li + 0.5) / (maxDepth + 1);
          centres[nodeIdx] = vertical
            ? { x: box.x + a, y: top + c }
            : { x: box.x + c, y: top + a };
        });
      });
    }
    const clipToBox = (p, q) => {
      const dx = q.x - p.x, dy = q.y - p.y;
      let t = 1;
      if (dx !== 0) t = Math.min(t, nodeW / 2 / Math.abs(dx));
      if (dy !== 0) t = Math.min(t, nodeH / 2 / Math.abs(dy));
      return { x: p.x + dx * t, y: p.y + dy * t };
    };
    const labels = edges.map((e) => e.label).filter(Boolean);
    const edgeLine = lineAtFloor(theme, "caption");
    const edgeMax = Math.min(1.5, nodeW);
    const edgeScale = fitLineAt(theme, "caption", 0.8, labels, edgeMax, { min: 0.6 });
    const edgeStyle = designed(theme, "caption", edgeScale);
    const edgeInset = 0.05;
    const edgeChip = (t) => Math.min(edgeMax, measure(t, edgeStyle) / 0.88 + edgeInset * 2 + 0.1);
    const marks = [];

    edges.forEach((e) => {
      const f = idIdx.get(e.from), t = idIdx.get(e.to);
      if (f == null || t == null || f === t) return;
      const a = centres[f], b = centres[t];
      const s = clipToBox(a, b);
      const e2 = clipToBox(b, a);
      line(s.x, s.y, e2.x, e2.y);
      if (e.label) marks.push({ label: e.label, x: (s.x + e2.x) / 2, y: (s.y + e2.y) / 2 });
    });
    centres.forEach((c, i) => node(i, c.x, c.y));
    for (const m of marks) {
      const lw = edgeChip(m.label);
      slide.addShape("rect", {
        x: m.x - lw / 2, y: m.y - edgeLine / 2, w: lw, h: edgeLine,
        fill: { color: hex(theme.palette.bg) }, line: { type: "none" },
      });
      slide.addText(m.label, {
        x: m.x - lw / 2, y: m.y - edgeLine / 2, w: lw, h: edgeLine,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: edgeScale }),
        align: "center", valign: "middle", margin: edgeInset,
      });
    }
  },

  
  pyramid(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const levels = data.levels;
    const n = levels.length;
    const gap = 0.12;
    const levelH = (box.bottom - y - 0.1 - gap * (n - 1)) / n;
    const maxW = box.w;
    const minW = box.w * 0.4;
    const labelScale = fitScaleAll(levels.map((l) => l.label), maxW - 0.7, 0.4, theme.type.subhead, { min: 0.5 });
    const bodyScale = fitScaleAll(
      levels.map((l) => l.body).filter(Boolean), maxW - 0.7, 0.3, theme.type.caption,
    );
    levels.forEach((l, i) => {
      const w = maxW - (maxW - minW) * (i / (n - 1));
      const x = box.x + (box.w - w) / 2;
      const sy = y + i * (levelH + gap);
      const accent = i % 2 === 0;
      slide.addShape("roundRect", {
        x, y: sy, w, h: levelH,
        fill: { color: hex(accent ? theme.palette.accent : theme.palette.surface) },
        line: { type: "none" }, rectRadius: theme.shape?.radius?.card ?? 0.12,
      });
      const ink = accent ? theme.palette.on_accent : theme.palette.ink;
      slide.addText(l.label, {
        x: x + 0.35, y: sy, w: w - 0.7, h: levelH * 0.5,
        ...textStyle(theme, "subhead", { bold: true, color: ink, scale: labelScale }),
        align: "center", valign: "middle",
      });
      if (l.body) {
        slide.addText(l.body, {
          x: x + 0.35, y: sy + levelH * 0.52, w: w - 0.7, h: levelH * 0.42,
          ...textStyle(theme, "caption", { color: ink, scale: bodyScale }),
          align: "center", valign: "top",
        });
      }
    });
  },

  
  venn(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const sets = data.sets;
    const n = sets.length;
    const top = Math.max(y, 2.6);
    const cx = box.x + box.w / 2;
    const cy = (top + box.bottom) / 2;
    const transparency = 62;
    const colours = [theme.palette.accent, theme.palette.accent_alt ?? theme.palette.ink, theme.palette.ink_muted, theme.palette.rule];
    const UNIT = {
      2: [{ x: -0.28, y: 0 }, { x: 0.28, y: 0 }],
      3: [{ x: 0, y: -0.255 }, { x: -0.391, y: 0.17 }, { x: 0.391, y: 0.17 }],
      4: [{ x: -0.32, y: -0.272 }, { x: 0.32, y: -0.272 }, { x: -0.32, y: 0.272 }, { x: 0.32, y: 0.272 }],
    };
    const unit = UNIT[Math.min(4, Math.max(2, n))];
    const LABEL = 0.42;
    const above = unit.map((u) => u.y <= 0);
    const bands = (above.some(Boolean) ? LABEL : 0) + (above.some((a) => !a) ? LABEL : 0);
    const spanUp = Math.max(...unit.map((u) => -u.y + 0.5));
    const spanDown = Math.max(...unit.map((u) => u.y + 0.5));
    const d = Math.max(
      1.0,
      Math.min(3.2, box.w / 3.4, (box.bottom - top - bands) / (spanUp + spanDown)),
    );
    const centres = unit.map((u) => ({ x: cx + u.x * d, y: cy + u.y * d }));
    const roomFor = (i, limit) => {
      const me = centres[i];
      const row = centres.filter((o, j) => j !== i && Math.abs(o.y - me.y) < 0.2);
      if (!row.length) return limit;
      return Math.max(0.9, Math.min(limit, Math.min(...row.map((o) => Math.abs(o.x - me.x))) - 0.12));
    };
    const vRoom = (i) => {
      const me = centres[i];
      const others = centres.filter((o, j) => j !== i && Math.abs(o.y - me.y) >= 0.2);
      if (!others.length) return d;
      return Math.max(0.3, Math.min(...others.map((o) => Math.abs(o.y - me.y))) - 0.1);
    };
    const STEP = 0.32;
    const steps = sets.map((s, i) => {
      const rows = (s.items ?? []).length;
      return rows ? Math.min(STEP, vRoom(i) / rows) : STEP;
    });
    const labelW = sets.map((_, i) => roomFor(i, 2.4));
    const itemW = sets.map((_, i) => roomFor(i, 2.2));
    const labelScale = Math.min(
      ...sets.map((s, i) => fitScale(s.label, labelW[i], 0.35, theme.type.caption, { min: 0.7 })),
      1,
    );
    const itemScale = Math.min(
      ...sets.flatMap((s, i) => (s.items ?? []).map((it) => fitScale(it, itemW[i], 0.3, theme.type.caption))),
      ...steps.map((st) => st / STEP),
      1,
    );
    sets.forEach((s, i) => {
      const c = centres[i];
      slide.addShape("ellipse", {
        x: c.x - d / 2, y: c.y - d / 2, w: d, h: d,
        fill: { color: hex(colours[i % colours.length]), transparency },
        line: { type: "none" },
      });
      slide.addText(s.label, {
        x: c.x - labelW[i] / 2, w: labelW[i], h: 0.35,
        y: above[i] ? c.y - d / 2 - LABEL : c.y + d / 2 + 0.07,
        ...textStyle(theme, "caption", { bold: true, scale: labelScale }),
        align: "center", valign: "middle",
      });
      const items = s.items ?? [];
      const step = steps[i];
      const top0 = c.y - (items.length * step) / 2;
      items.forEach((it, j) => {
        slide.addText(it, {
          x: c.x - itemW[i] / 2, y: top0 + j * step, w: itemW[i], h: Math.min(0.3, step),
          ...textStyle(theme, "caption", { scale: itemScale }),
          align: "center", valign: "middle",
        });
      });
    });
  },

  
  hierarchy(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const top = Math.max(y, 2.5);
    const nodeW = 1.9, nodeH = 0.6;
    const tree = [];
    const build = (label, children, depth) => {
      const idx = tree.length;
      tree.push({ label, children: [], depth });
      tree[idx].children = (children ?? []).map((c) => build(c.label, c.children, depth + 1));
      return idx;
    };
    const rootIdx = build(data.root.label, data.children, 0);
    let totalLeaves = 0;
    const countLeaves = (i) => {
      if (!tree[i].children.length) totalLeaves++;
      else tree[i].children.forEach(countLeaves);
    };
    countLeaves(rootIdx);
    const leafW = box.w / Math.max(1, totalLeaves);
    const xs = new Array(tree.length);
    let leaf = 0;
    const place = (i) => {
      if (!tree[i].children.length) {
        xs[i] = box.x + leafW * (leaf++ + 0.5);
        return xs[i];
      }
      const childXs = tree[i].children.map(place);
      xs[i] = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      return xs[i];
    };
    place(rootIdx);
    const maxDepth = Math.max(...tree.map((nd) => nd.depth));
    const levelH = maxDepth ? (box.bottom - top - 0.1) / (maxDepth + 1) : 0;
    const labelScale = fitScaleAll(tree.map((nd) => nd.label), nodeW - 0.2, 0.4, theme.type.caption, { min: 0.6 });
    tree.forEach((nd, i) => {
      const nx = xs[i] - nodeW / 2;
      const ny = top + nd.depth * levelH + 0.05;
      nd.children.forEach((ci) => {
        const fromY = ny + nodeH;
        const toY = top + tree[ci].depth * levelH + 0.05;
        const lx = Math.min(xs[i], xs[ci]), lw = Math.abs(xs[ci] - xs[i]) || 0.02;
        const ly = Math.min(fromY, toY), lh = Math.abs(toY - fromY) || 0.02;
        slide.addShape("line", {
          x: lx, y: ly, w: lw, h: lh,
          line: { color: hex(theme.palette.rule), width: 1.1 },
          flipH: xs[ci] < xs[i], flipV: toY < fromY,
        });
      });
      card(slide, theme, { x: nx, y: ny, w: nodeW, h: nodeH });
      slide.addText(nd.label, {
        x: nx + 0.1, y: ny, w: nodeW - 0.2, h: nodeH,
        ...textStyle(theme, "caption", { bold: true, scale: labelScale }),
        align: "center", valign: "middle",
      });
    });
  },

  
  glossary(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const termW = 3.2;
    const rowH = (box.bottom - y - 0.1) / data.entries.length;
    const defScale = fitScaleAll(
      data.entries.map((e) => e.definition), box.w - termW - 0.5, rowH * 0.8, theme.type.body,
    );
    const termScale = fitScaleAll(data.entries.map((e) => e.term), termW, rowH * 0.8, theme.type.subhead, { min: 0.65 });
    data.entries.forEach((e, i) => {
      const ry = y + i * rowH;
      slide.addText(e.term, {
        x: box.x, y: ry, w: termW, h: rowH,
        ...textStyle(theme, "subhead", { bold: true, color: theme.palette.accent, scale: termScale }),
        valign: "middle",
      });
      slide.addText(e.definition, {
        x: box.x + termW + 0.5, y: ry, w: box.w - termW - 0.5, h: rowH,
        ...textStyle(theme, "body", { scale: defScale }),
        valign: "middle",
      });
      if (i < data.entries.length - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH - 0.015, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  
  faq(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.items.length;
    const rowH = (box.bottom - y - 0.1 - 0.12 * (n - 1)) / n;
    const qScale = fitScaleAll(data.items.map((i) => i.question), box.w - 0.45, rowH * 0.42, theme.type.subhead, { min: 0.7 });
    const aScale = fitScaleAll(data.items.map((i) => i.answer), box.w - 0.45, rowH * 0.45, theme.type.body);
    data.items.forEach((it, i) => {
      const ry = y + i * (rowH + 0.12);
      slide.addText("Q", {
        x: box.x, y: ry, w: 0.4, h: rowH * 0.45,
        ...textStyle(theme, "eyebrow", { color: theme.palette.accent }),
        valign: "top",
      });
      slide.addText(it.question, {
        x: box.x + 0.45, y: ry, w: box.w - 0.45, h: rowH * 0.45,
        ...textStyle(theme, "subhead", { bold: true, scale: qScale }),
        valign: "top",
      });
      slide.addText("A", {
        x: box.x, y: ry + rowH * 0.52, w: 0.4, h: rowH * 0.42,
        ...textStyle(theme, "eyebrow", { color: theme.palette.ink_muted }),
        valign: "top",
      });
      slide.addText(it.answer, {
        x: box.x + 0.45, y: ry + rowH * 0.52, w: box.w - 0.45, h: rowH * 0.42,
        ...textStyle(theme, "body", { scale: aScale, color: theme.palette.ink_muted }),
        valign: "top",
      });
      if (i < n - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH + 0.06, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },

  
  "team-grid"(slide, ctx) {
    const { theme, data, box, resolveAsset } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.members.length;
    const cols = n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const pad = theme.shape?.card_pad ?? 0.24;
    const imgSize = 0.95;
    const tx = (x) => x + pad + imgSize + 0.25;
    const tw = (cw) => cw - pad * 2 - imgSize - 0.25;
    const nameH = linesBox(theme, "subhead", data.members.map((m) => m.name), tw(cw));
    const roleH = linesBox(theme, "caption", data.members.map((m) => m.role), tw(cw));
    const blockH = nameH + roleH;
    const nameScale = fitScaleAll(data.members.map((m) => m.name), tw(cw), nameH, theme.type.subhead, { min: 0.65 });
    const roleScale = fitScaleAll(data.members.map((m) => m.role), tw(cw), roleH, theme.type.caption);
    data.members.forEach((m, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      card(slide, theme, { x, y: ry, w: cw, h: ch });
      const cy = ry + ch / 2;
      const src = resolveAsset(m.image);
      if (src) {
        slide.addImage({
          path: src, x: x + pad, y: cy - imgSize / 2, w: imgSize, h: imgSize,
          rounding: true, sizing: { type: "cover", w: imgSize, h: imgSize },
        });
      } else {
        slide.addShape("ellipse", {
          x: x + pad, y: cy - imgSize / 2, w: imgSize, h: imgSize,
          fill: { color: hex(theme.palette.surface) }, line: { color: hex(theme.palette.rule), width: 1 },
        });
        slide.addText(String(i + 1), {
          x: x + pad, y: cy - imgSize / 2, w: imgSize, h: imgSize,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
          align: "center", valign: "middle",
        });
      }
      const ty = cy - blockH / 2;
      slide.addText(m.name, {
        x: tx(x), y: ty, w: tw(cw), h: nameH,
        ...textStyle(theme, "subhead", { bold: true, scale: nameScale }),
        valign: "top",
      });
      slide.addText(m.role, {
        x: tx(x), y: ty + nameH, w: tw(cw), h: roleH,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: roleScale }),
        valign: "top",
      });
    });
  },

  
  attribution(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const cols = data.items.length >= 6 ? 3 : 2;
    const rows = Math.ceil(data.items.length / cols);
    const gut = theme.grid.gutter;
    const cw = (box.w - gut * (cols - 1)) / cols;
    const ch = (box.bottom - y - 0.1 - gut * (rows - 1)) / rows;
    const nameScale = fitScaleAll(data.items.map((i) => i.name), cw - 0.2, 0.45, theme.type.subhead, { min: 0.7 });
    const contribScale = fitScaleAll(
      data.items.map((i) => i.contribution).filter(Boolean), cw - 0.2, 0.4, theme.type.caption,
    );
    data.items.forEach((it, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = box.x + c * (cw + gut);
      const ry = y + r * (ch + gut);
      slide.addText(it.name, {
        x, y: ry, w: cw, h: 0.5,
        ...textStyle(theme, "subhead", { bold: true, scale: nameScale }),
        valign: "top",
      });
      if (it.contribution) {
        slide.addText(it.contribution, {
          x, y: ry + 0.52, w: cw, h: 0.4,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: contribScale }),
          valign: "top",
        });
      }
    });
  },

  
  contact(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const cardW = Math.min(9.4, box.w * 0.85);
    const cx = box.x + (box.w - cardW) / 2;
    const cardTop = y + 0.25;
    const cardBot = box.bottom - 0.35;
    const cardH = cardBot - cardTop;
    const rowH = (cardH - 0.5) / data.items.length;
    slide.addShape("roundRect", {
      x: cx, y: cardTop, w: cardW, h: cardH,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    const valueScale = fitScaleAll(data.items.map((i) => i.value), cardW - 3.1, Math.min(0.55, rowH - 0.1), theme.type.subhead, { min: 0.7 });
    data.items.forEach((it, i) => {
      const ry = cardTop + 0.25 + i * rowH + (rowH - 0.5) / 2;
      slide.addText(it.label, {
        x: cx + 0.5, y: ry, w: 1.9, h: 0.5,
        ...textStyle(theme, "caption", { color: theme.palette.ink_muted }),
        align: "right", valign: "middle",
      });
      slide.addText(it.value, {
        x: cx + 2.6, y: ry, w: cardW - 3.1, h: 0.5,
        ...textStyle(theme, "subhead", { bold: true, scale: valueScale }),
        valign: "middle",
      });
    });
  },

  
  equation(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const mono = theme.type.mono?.family ?? theme.type.body.family;
    const top = Math.max(y, 2.7);
    const fH = 1.25;
    slide.addShape("roundRect", {
      x: box.x, y: top, w: box.w, h: fH,
      fill: { color: hex(theme.palette.surface) }, line: { type: "none" },
      rectRadius: theme.shape?.radius?.card ?? 0.12,
    });
    const fStyle = { family: mono, size: theme.type.heading.size, weight: 700 };
    const fScale = fitOneLine(data.formula, box.w - 1.2, fStyle, { min: 0.5 });
    slide.addText(data.formula, {
      x: box.x + 0.6, y: top, w: box.w - 1.2, h: fH,
      fontFace: mono, fontSize: Math.round(fStyle.size * fScale),
      bold: true, color: hex(theme.palette.accent),
      align: "center", valign: "middle",
      charSpacing: theme.type.heading.tracking ?? 0,
    });
    const bodyTop = top + fH + 0.3;
    const hasVars = Array.isArray(data.variables) && data.variables.length > 0;
    const bodyBudget = hasVars ? 0.95 : box.bottom - bodyTop - 0.1;
    slide.addText(data.body, {
      x: box.x, y: bodyTop, w: box.w, h: bodyBudget,
      ...textStyle(theme, "body", {
        scale: fitScale(data.body, box.w, bodyBudget, theme.type.body, { min: 0.75 }),
        color: theme.palette.ink_muted,
      }),
      valign: "top",
    });
    if (hasVars) {
      const vars = data.variables;
      const cols = vars.length > 3 ? 3 : vars.length;
      const rows = Math.ceil(vars.length / cols);
      const gut = theme.grid.gutter;
      const cw = (box.w - gut * (cols - 1)) / cols;
      const vTop = bodyTop + 1.05;
      const ch = (box.bottom - vTop - 0.1 - gut * (rows - 1)) / rows;
      const meaningScale = fitScaleAll(vars.map((v) => v.meaning), cw - 1.5, 0.4, theme.type.caption);
      vars.forEach((v, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = box.x + c * (cw + gut);
        const ry = vTop + r * (ch + gut);
        const symStyle = { family: mono, size: theme.type.subhead.size * 0.85 };
        const symScale = fitOneLine(
          vars.map((x) => x.symbol).reduce((a, b) => (b.length > a.length ? b : a)),
          1.4,
          symStyle,
          { min: 0.5 },
        );
        slide.addText(v.symbol, {
          x, y: ry, w: 1.4, h: ch,
          fontFace: mono, fontSize: Math.round(symStyle.size * symScale),
          bold: true, color: hex(theme.palette.accent),
          align: "left", valign: "middle",
        });
        slide.addText(v.meaning, {
          x: x + 1.5, y: ry, w: cw - 1.5, h: ch,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: meaningScale }),
          valign: "middle",
        });
      });
    }
  },

  
  bibliography(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.entries.length;
    const rowH = (box.bottom - y - 0.1 - 0.1 * (n - 1)) / n;
    const citations = data.entries.map((e) => e.citation);
    const annotations = data.entries.map((e) => e.annotation).filter(Boolean);
    const citeNeed = linesBox(theme, "body", citations, box.w - 0.3);
    const annNeed = annotations.length ? linesBox(theme, "caption", annotations, box.w - 0.3) : 0;
    const annH = annotations.length
      ? Math.min(Math.max(annNeed, lineAtFloor(theme, "caption")), rowH - lineAtFloor(theme, "body"))
      : 0;
    const citeH = rowH - annH;
    const citeScale = fitScaleAll(citations, box.w - 0.3, citeH, theme.type.body);
    const annScale = fitScaleAll(annotations, box.w - 0.3, annH, theme.type.caption);
    data.entries.forEach((e, i) => {
      const ry = y + i * (rowH + 0.1);
      slide.addText(e.citation, {
        x: box.x, y: ry, w: box.w, h: citeH,
        ...textStyle(theme, "body", { scale: citeScale }),
        valign: "top",
      });
      if (e.annotation) {
        slide.addText(e.annotation, {
          x: box.x, y: ry + citeH, w: box.w, h: annH,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, italic: true, scale: annScale }),
          valign: "top",
        });
      }
    });
  },

  
  "data-source"(slide, ctx) {
    const { theme, data, box } = ctx;
    eyebrow(slide, ctx);
    const y = heading(slide, ctx);
    const n = data.sources.length;
    const rowH = (box.bottom - y - 0.1 - 0.12 * (n - 1)) / n;
    const nameScale = fitScaleAll(data.sources.map((s) => s.name), box.w - 0.2, rowH * 0.4, theme.type.subhead, { min: 0.7 });
    const descScale = fitScaleAll(
      data.sources.map((s) => s.description).filter(Boolean), box.w - 0.2, rowH * 0.28, theme.type.caption,
    );
    const urlScale = fitAllAt(theme, "caption", 0.85, data.sources.map((s) => s.url), box.w - 0.2, rowH * 0.26);
    data.sources.forEach((s, i) => {
      const ry = y + i * (rowH + 0.12);
      slide.addText(s.name, {
        x: box.x, y: ry, w: box.w, h: rowH * 0.4,
        ...textStyle(theme, "subhead", { bold: true, scale: nameScale }),
        valign: "top",
      });
      if (s.url) {
        slide.addText(s.url, {
          x: box.x, y: ry + rowH * 0.42, w: box.w, h: rowH * 0.26,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: urlScale }),
          valign: "top",
        });
      }
      if (s.description) {
        slide.addText(s.description, {
          x: box.x, y: ry + rowH * 0.7, w: box.w, h: rowH * 0.26,
          ...textStyle(theme, "caption", { color: theme.palette.ink_muted, scale: descScale }),
          valign: "top",
        });
      }
      if (i < n - 1) {
        slide.addShape("rect", {
          x: box.x, y: ry + rowH + 0.06, w: box.w, h: 0.015,
          fill: { color: hex(theme.palette.rule) }, line: { type: "none" },
        });
      }
    });
  },
};

