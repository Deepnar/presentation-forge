// @forge/editor — sceneToSvg. The browser-consumable projection of a
// SlideScene: the same object the PPTX exporter reads, rendered as SVG for
// inspection, thumbnails, and tests. The interactive canvas (demo.html)
// binds the same elements to DOM nodes for direct manipulation.
//
// Emphasis and uppercase handling share packages/core/text-run.ts with
// the PPTX renderer, so the two projections cannot disagree on those
// semantics. Point→pixel mapping (96px per inch) is preview-only:
// V2-4 owns exact browser/PPTX visual parity.
import { runBold, visibleText } from "../core/text-run.ts";
import { measure } from "../core/fit.ts";
import { maxColumns, padTableRows } from "../core/table.ts";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const IN = 96; // svg px per scene inch

// Greedy cell-text wrap mirroring core lineCount: same word order,
// same break rule, so the preview breaks where the compiler
// counted. Widths arrive in SVG pixels; measure works in inches at
// the contract size (the 1.1 preview scale applies to rendering
// only, as with fitted text). Over-wide words keep their own line
// and visibly overflow, exactly when the word diagnostic fires.
function wrapCell(text, widthPx, style) {
  const widthIn = widthPx / IN;
  const space = measure(" ", style);
  const out = [];
  for (const segment of String(text ?? "").split("\n")) {
    const words = segment.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let cur = "";
    let curW = 0;
    for (const word of words) {
      const ww = measure(word, style);
      if (curW > 0 && curW + space + ww > widthIn) {
        out.push(cur);
        cur = word;
        curW = ww;
      } else {
        curW += (curW > 0 ? space : 0) + ww;
        cur = cur === "" ? word : `${cur} ${word}`;
      }
    }
    out.push(cur);
  }
  return out;
}

function textSvg(el) {
  const valign = el.valign ?? "top";
  const chunks = [];
  for (const p of el.paragraphs ?? []) {
    const anchor = p.align === "center" ? "middle" : p.align === "right" ? "end" : "start";
    const tx = (p.align === "center" ? el.x + el.w / 2 : p.align === "right" ? el.x + el.w : el.x) * IN;
    const words = p.runs.map((r) => visibleText(r)).join("");
    const first = p.runs[0] ?? {};
    const size = (first.size ?? 13) * 1.1;
    const attrs = [];
    if (first.family) attrs.push(` font-family="${esc(first.family)}"`);
    const bold = runBold(first);
    if (bold) attrs.push(' font-weight="bold"');
    else if (first.weight != null) attrs.push(` font-weight="${first.weight}"`);
    if (first.italic) attrs.push(' font-style="italic"');
    if (first.tracking) attrs.push(` letter-spacing="${((first.tracking * 96) / 72).toFixed(2)}"`);
    for (const chunk of words.split("\n")) {
      const prefix = p.bullet ? "• " : "";
      chunks.push({
        tx, anchor, size, attrs, text: prefix + chunk,
        color: first.color ?? "111111",
        advance: size * (first.line ?? 1.35),
      });
    }
  }
  // Top preserves historical placement exactly. Middle/bottom center
  // or ground the block in its box — enough for chrome inspection;
  // V2-4 owns exact visual parity.
  let y;
  const total = chunks.reduce((n, c) => n + c.advance, 0);
  if (valign === "middle" && chunks.length) {
    y = (el.y + el.h / 2) * IN - total / 2 + chunks[0].size * 0.35;
  } else if (valign === "bottom" && chunks.length) {
    y = (el.y + el.h) * IN - total + chunks[0].size * 0.35;
  } else {
    y = el.y * IN + 14;
  }
  const lines = chunks.map((c) => {
    const s = `<text x="${c.tx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${c.anchor}" font-size="${c.size.toFixed(1)}" fill="#${c.color}"${c.attrs.join("")}>${esc(c.text)}</text>`;
    y += c.advance;
    return s;
  });
  const opacity = el.opacity !== undefined && el.opacity < 1 ? ` opacity="${el.opacity}"` : "";
  return `<g data-el="${esc(el.id)}"${opacity}>${lines.join("")}</g>`;
}

function elementSvg(el) {
  const x = el.x * IN;
  const y = el.y * IN;
  const w = el.w * IN;
  const h = el.h * IN;
  switch (el.kind) {
    case "text":
      return textSvg(el);
    case "shape": {
      const fill = `#${el.shape?.fill ?? "FFFFFF"}`;
      const fillOp = el.shape?.fillAlpha !== undefined && el.shape.fillAlpha < 1
        ? ` fill-opacity="${el.shape.fillAlpha}"`
        : "";
      // Strokes project verbatim: status marks rely on an ink
      // outline over a transparent fill, which needs the stroke to
      // survive projection rather than render as a filled box.
      const stroke = el.shape?.stroke ? ` stroke="#${el.shape.stroke}" stroke-width="${el.shape.strokeWidth ?? 1}"` : "";
      const strokeOp = el.shape?.strokeAlpha !== undefined && el.shape.strokeAlpha < 1
        ? ` stroke-opacity="${el.shape.strokeAlpha}"`
        : "";
      if (el.shape?.form === "ellipse") {
        return `<ellipse data-el="${esc(el.id)}" cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${fill}"${fillOp}${stroke}${strokeOp}/>`;
      }
      const rx = el.shape?.form === "roundRect" ? 10 : 0;
      return `<rect data-el="${esc(el.id)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx}" fill="${fill}"${fillOp}${stroke}${strokeOp}/>`;
    }
    case "image":
      return `<g data-el="${esc(el.id)}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#D8D8D2"/><text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2).toFixed(1)}" text-anchor="middle" font-size="16" fill="#5C5C59">${esc(el.image?.alt || "[image]")}</text></g>`;
    case "line":
      return `<line data-el="${esc(el.id)}" x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${((el.line?.x2 ?? el.x) * IN).toFixed(1)}" y2="${((el.line?.y2 ?? el.y) * IN).toFixed(1)}" stroke="#${el.line?.stroke ?? "888888"}" stroke-width="${el.line?.strokeWidth ?? 1.5}"/>`;
    case "chart": {
      // Structural preview, not a geometric one: bars keep their
      // historical series[0] treatment (per-kind chart geometry is
      // V2-4 territory), while category labels and the legend now
      // project the Layer-C label contract both renderers share —
      // same family, size, and color PowerPoint receives. Labels
      // draw in full with no clipping, so strain stays visible and
      // matches the capacity diagnostic instead of hiding behind it.
      const labels = el.chart?.labels ?? {};
      const labelSize = ((labels.size ?? 10) * 1.1).toFixed(1);
      const labelFill = `#${labels.color ?? "5C5C59"}`;
      const labelFamily = labels.family ? ` font-family="${esc(labels.family)}"` : "";
      const cats = el.chart?.categories ?? [];
      const names = (el.chart?.series ?? []).map((s) => s.name ?? "");
      const legend = [...names, ...((el.chart?.chartKind === "pie" || el.chart?.chartKind === "doughnut") && names.length <= 1 ? cats : [])];
      const catStrip = cats.length && el.chart?.chartKind !== "pie" && el.chart?.chartKind !== "doughnut" ? parseFloat(labelSize) * 1.25 + 6 : 0;
      const legendStrip = legend.length ? legend.length * (parseFloat(labelSize) * 1.25) + 6 : 0;
      const plotH = Math.max(20, h - catStrip - legendStrip);
      const vals = el.chart?.series?.[0]?.values ?? [];
      const max = Math.max(1, ...vals);
      const bw = w / Math.max(1, vals.length);
      const bars = vals.map((v, i) => {
        const bh = (v / max) * (plotH - 20);
        return `<rect x="${(x + i * bw + 2).toFixed(1)}" y="${(y + plotH - bh).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="#C05D4E"/>`;
      }).join("");
      let labelsSvg = "";
      if (catStrip > 0) {
        const sw = w / Math.max(1, cats.length);
        labelsSvg += cats.map((c, i) =>
          `<text x="${(x + i * sw + sw / 2).toFixed(1)}" y="${(y + plotH + parseFloat(labelSize)).toFixed(1)}" text-anchor="middle" font-size="${labelSize}" fill="${labelFill}"${labelFamily}>${esc(c)}</text>`).join("");
      }
      labelsSvg += legend.map((name, i) =>
        `<text x="${x.toFixed(1)}" y="${(y + plotH + catStrip + 6 + parseFloat(labelSize) * (i + 1) * 1.25).toFixed(1)}" font-size="${labelSize}" fill="${labelFill}"${labelFamily}>■ ${esc(name)}</text>`).join("");
      return `<g data-el="${esc(el.id)}">${bars}${labelsSvg}</g>`;
    }
    case "table": {
      const rows = el.table?.rows ?? [];
      const layout = el.table?.layout;
      if (!layout) {
        // Pre-contract scenes keep their historical rendering exactly.
        const rh = h / Math.max(1, rows.length);
        const cw = w / Math.max(1, rows[0]?.length ?? 1);
        const cells = rows.map((row, ri) =>
          row.map((cell, ci) => `<rect x="${(x + ci * cw).toFixed(1)}" y="${(y + ri * rh).toFixed(1)}" width="${cw.toFixed(1)}" height="${rh.toFixed(1)}" fill="none" stroke="#999"/><text x="${(x + ci * cw + 4).toFixed(1)}" y="${(y + ri * rh + 14).toFixed(1)}" font-size="12">${esc(cell)}</text>`).join(""),
        ).join("");
        return `<g data-el="${esc(el.id)}">${cells}</g>`;
      }
      const maxCols = maxColumns(rows);
      const widths = layout.colWidths?.length === maxCols
        ? layout.colWidths.map((cw) => cw * IN)
        : Array.from({ length: maxCols }, () => w / maxCols);
      const xs = [];
      {
        let cx = x;
        for (const cw of widths) {
          xs.push(cx);
          cx += cw;
        }
      }
      const padPx = (layout.padding ?? 0.05) * 96;
      const grid = `#${layout.gridColor ?? "999999"}`;
      let cy = y;
      // Ragged rows pad with empty cells at projection time (as in
      // PPTX); authored data is untouched. Cell text wraps with the
      // shared measure heuristic at the contract column width, so
      // crowded cells read crowded here exactly when the capacity
      // diagnostic fires — never silently comfortable.
      const cells = padTableRows(rows, maxCols).map((row, ri) => {
        const isHeader = !!el.table?.header && ri === 0;
        const rh = layout.rowHeights?.[ri] ?? h / Math.max(1, rows.length);
        const size = ((isHeader ? layout.headerSize : layout.bodySize) ?? 10) * 1.1;
        const fill = isHeader && layout.headerFill ? ` fill="#${layout.headerFill}"` : ` fill="none"`;
        const weight = isHeader && layout.headerBold !== false ? ' font-weight="bold"' : "";
        const family = layout.fontFamily ? ` font-family="${esc(layout.fontFamily)}"` : "";
        const color = isHeader ? (layout.headerColor ?? "000000") : (layout.bodyColor ?? "000000");
        const style = {
          family: layout.fontFamily || undefined,
          size: (isHeader ? layout.headerSize : layout.bodySize) ?? 10,
          weight: isHeader && layout.headerBold !== false ? 700 : 400,
        };
        const out = row.map((cell, ci) => {
          const cw = widths[ci] - 2 * padPx;
          const lines = wrapCell(String(cell ?? ""), Math.max(8, cw), style);
          const texts = lines.map((ln, li) =>
            `<text x="${(xs[ci] + padPx).toFixed(1)}" y="${(cy + padPx + size * (li + 1)).toFixed(1)}" font-size="${size.toFixed(1)}" fill="#${color}"${family}${weight}>${esc(ln)}</text>`).join("");
          return `<rect x="${xs[ci].toFixed(1)}" y="${cy.toFixed(1)}" width="${widths[ci].toFixed(1)}" height="${(rh * 96).toFixed(1)}"${fill} stroke="${grid}"/>${texts}`;
        }).join("");
        cy += rh * 96;
        return out;
      }).join("");
      return `<g data-el="${esc(el.id)}">${cells}</g>`;
    }
    case "group":
      return `<g data-el="${esc(el.id)}">${(el.group?.children ?? []).map((c) => elementSvg({ ...c, x: c.x + el.x, y: c.y + el.y })).join("")}</g>`;
    default:
      return "";
  }
}

function backgroundSvg(scene) {
  // Canonical background layering, shared with the PPTX renderer:
  // flat fallback fill, then the plate asset, then native decor in
  // declared order. Decor sits above the image on both projections so
  // a scene carrying both can never hide its dressing in one of them.
  const parts = [`<rect width="100%" height="100%" fill="#${scene.background.fill}"/>`];
  // Adapter-resolved plate asset above the flat ground (which stays
  // as the paint for transparent pixels and for viewers that cannot
  // load the image) and below decor and content.
  if (scene.background.image) {
    parts.push(`<image x="0" y="0" width="${(scene.width * IN).toFixed(0)}" height="${(scene.height * IN).toFixed(0)}" preserveAspectRatio="xMidYMid slice" href="${esc(scene.background.image.src)}"/>`);
  }
  for (const d of scene.background.decor ?? []) {
    const fill = `#${d.fill}`;
    const op = d.fillAlpha !== undefined && d.fillAlpha < 1 ? ` fill-opacity="${d.fillAlpha}"` : "";
    const x = d.x * IN;
    const y = d.y * IN;
    const w = d.w * IN;
    const h = d.h * IN;
    if (d.shape === "ellipse") {
      parts.push(`<ellipse cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2).toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="${fill}"${op}/>`);
    } else {
      parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"${op}/>`);
    }
  }
  return parts.join("");
}

export function sceneToSvg(scene) {
  const els = [...scene.elements].sort((a, b) => a.z - b.z).map(elementSvg).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(scene.width * IN).toFixed(0)}" height="${(scene.height * IN).toFixed(0)}" viewBox="0 0 ${(scene.width * IN).toFixed(0)} ${(scene.height * IN).toFixed(0)}">${backgroundSvg(scene)}${els}</svg>`;
}
