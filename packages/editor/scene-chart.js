// @forge/editor — scene-chart. Deterministic Layer-C chart to SVG.
//
// Pure input-to-SVG transformation: (chart contract, pixel box,
// label style) -> inner SVG fragment. No DOM, no network, no AI,
// no scene mutation, no randomness. The shared string projection
// (scene-svg.js) wraps the output in the element's identity group
// (`data-el`, locked, semantic ref, opacity), so a chart stays one
// selectable scene element; bars and points are never independent
// editor elements. PowerPoint charts stay native — this module is
// the browser projector only, and never feeds back into Layer C.
//
// Scale honesty: cartesian domains always include the zero
// baseline; ticks are deterministic "nice" annotations of the
// real data range, never fabricated values. Geometry is
// containment-by-construction (every coordinate maps inside the
// plot box), so no clip paths are needed and none are emitted.
import { measure } from "../core/fit.ts";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Interim categorical ramp for multi-series distinction. The scene
// carries no series colors today and PPTX assigns Office defaults,
// so neither projector can claim theme parity here — but the
// design layer already owns the answer: themes may declare
// `chart.series` (see high-contrast-mono.yaml) and
// `chartSeries()` in packages/core/chartpalette.ts resolves
// declared palettes (contrast-enforced) or generates contrast-safe
// ramps. The tracked follow-up carries those resolved colors into
// the scene (`series[].color`) for verbatim projection by both
// renderers. Until then: first entry preserves the historical
// single-series accent (existing decks unchanged); the rest are
// mutually distinguishable on light and dark grounds; legend
// swatches keep the mapping exact in both projections.
export const INTERIM_SERIES_COLORS = ["C05D4E", "2F6F8F", "6A9E5F", "D97706", "7C5CBF", "8A8A86"];

const fin = (v) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const has = (v) => Number.isFinite(v);

function seriesColor(i) {
  return INTERIM_SERIES_COLORS[i % INTERIM_SERIES_COLORS.length];
}

// Value domain over every finite series entry, always spanning
// zero so the baseline is real. All-equal-zero degrades to
// [0, 1]; a dataset with no finite values renders an empty plot
// with honest axes rather than NaN geometry.
export function chartDomain(series) {
  let lo = 0;
  let hi = 0;
  for (const s of series ?? []) {
    for (const v of s.values ?? []) {
      if (!has(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo === hi) hi = lo + 1;
  return { lo, hi };
}

// Deterministic nice ticks: step from {1, 2, 2.5, 5, 10} x 10^n,
// lattice-anchored so zero (always in domain) always lands on a
// tick. Count adapts to plot size via the target.
export function niceTicks(lo, hi, target) {
  const t = Math.min(8, Math.max(2, Math.round(target) || 4));
  const span = Math.max(hi - lo, 1e-12);
  const raw = span / t;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const pick = norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2.5 : norm > 0.5 ? 2 : 1;
  const step = pick * mag;
  const ticks = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    if (ticks.length > 12) break;
  }
  return { ticks, step };
}

export function fmtTick(step, v) {
  // Decimals follow the step itself (2.5 -> "2.5", 2 -> "2"): the
  // label must name its gridline value, never a rounding of it.
  const frac = (step.toString().split(".")[1] || "").replace(/e.*$/, "");
  const dec = Math.min(4, frac.length);
  return Number(v.toFixed(dec)).toString();
}

function text(x, y, anchor, sizePx, fill, family, str) {
  const fam = family ? ` font-family="${esc(family)}"` : "";
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${sizePx.toFixed(1)}" fill="#${fill}"${fam}>${esc(str)}</text>`;
}

function legendEntries(series) {
  return (series ?? []).map((s) => s.name ?? "");
}

function legendSvg(entries, colors, x, yTop, fs, fill, family) {
  const lh = fs * 1.25;
  return entries.map((name, i) =>
    `<text x="${x.toFixed(1)}" y="${(yTop + lh * (i + 1)).toFixed(1)}" font-size="${fs.toFixed(1)}" fill="#${fill}"${family ? ` font-family="${esc(family)}"` : ""}><tspan fill="#${colors[i]}">■ </tspan>${esc(name)}</text>`).join("");
}

function cartesianFrame(box, cats, series, style, transpose) {
  // Plot reservation: value-axis labels, category labels, legend.
  // Everything derives from the contract label size; nothing
  // shrinks below it — cramped charts overflow visibly (honest)
  // exactly when the capacity diagnostic fires.
  const fs = style.sizePx;
  const { lo, hi } = chartDomain(series);
  const catsSafe = cats ?? [];
  const entries = legendEntries(series);
  const legendStrip = entries.length ? entries.length * fs * 1.25 + 6 : 0;
  if (!transpose) {
    const meas = { family: style.family || undefined, size: style.sizePt, weight: 400 };
    const { ticks, step } = niceTicks(lo, hi, 5);
    const tickW = ticks.reduce((m, v) => Math.max(m, measure(fmtTick(step, v), meas)), 0);
    const axisW = tickW + 10;
    const catStrip = catsSafe.length ? fs * 1.25 + 6 : 0;
    const plot = {
      x: box.x + axisW, y: box.y,
      w: Math.max(20, box.w - axisW), h: Math.max(20, box.h - catStrip - legendStrip),
    };
    return { lo, hi, ticks, step, entries, legendStrip, plot, catStrip, axisW };
  }
  const meas = { family: style.family || undefined, size: style.sizePt, weight: 400 };
  const labelCol = catsSafe.reduce((m, c) => Math.max(m, measure(c, meas)), 0) + 12;
  const { ticks, step } = niceTicks(lo, hi, 5);
  const tickStrip = fs * 1.25 + 6;
  const plot = {
    x: box.x + Math.min(labelCol, Math.max(24, box.w * 0.45)), y: box.y,
    w: 0, h: Math.max(20, box.h - tickStrip - legendStrip),
  };
  plot.w = Math.max(20, box.x + box.w - plot.x);
  return { lo, hi, ticks, step, entries, legendStrip, plot, tickStrip, labelCol: plot.x - box.x };
}

function gridSvg(frame, style, transpose) {
  const { plot, ticks, step, lo, hi } = frame;
  const fs = style.sizePx;
  let out = "";
  if (!transpose) {
    const yOf = (v) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
    for (const t of ticks) {
      const y = yOf(t);
      const zero = t === 0;
      out += `<line x1="${plot.x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(plot.x + plot.w).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#${style.color}" stroke-opacity="${zero ? 0.6 : 0.35}" stroke-width="1"/>`;
      out += text(plot.x - 6, y + fs * 0.35, "end", fs, style.color, style.family, fmtTick(step, t));
    }
    out += `<line x1="${plot.x.toFixed(1)}" y1="${plot.y.toFixed(1)}" x2="${plot.x.toFixed(1)}" y2="${(plot.y + plot.h).toFixed(1)}" stroke="#${style.color}" stroke-opacity="0.6" stroke-width="1"/>`;
  } else {
    const xOf = (v) => plot.x + ((v - lo) / (hi - lo)) * plot.w;
    const base = plot.y + plot.h;
    for (const t of ticks) {
      const x = xOf(t);
      const zero = t === 0;
      out += `<line x1="${x.toFixed(1)}" y1="${plot.y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${base.toFixed(1)}" stroke="#${style.color}" stroke-opacity="${zero ? 0.6 : 0.35}" stroke-width="1"/>`;
      out += text(x, base + fs, "middle", fs, style.color, style.family, fmtTick(step, t));
    }
  }
  return out;
}

function barSvg(box, cats, series, style) {
  const catsSafe = cats ?? [];
  const f = cartesianFrame(box, catsSafe, series, style, false);
  const { plot, lo, hi } = f;
  const n = Math.max(1, catsSafe.length);
  const slotW = plot.w / n;
  const groupW = slotW * 0.7;
  const ns = Math.max(1, (series ?? []).length);
  const bw = groupW / ns;
  const yOf = (v) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
  let out = gridSvg(f, style, false);
  (series ?? []).forEach((s, si) => {
    (s.values ?? []).forEach((raw, ci) => {
      const v = fin(raw);
      if (!has(v) || ci >= n) return;
      const bx = plot.x + ci * slotW + (slotW - groupW) / 2 + si * bw + 0.5;
      const top = yOf(Math.max(v, 0));
      const bot = yOf(Math.min(v, 0));
      out += `<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(0.5, bw - 1).toFixed(1)}" height="${Math.max(0, bot - top).toFixed(1)}" fill="#${seriesColor(si)}"/>`;
    });
  });
  const fs = style.sizePx;
  catsSafe.forEach((c, i) => {
    out += text(plot.x + i * slotW + slotW / 2, plot.y + plot.h + fs, "middle", fs, style.color, style.family, c);
  });
  out += legendSvg(f.entries, f.entries.map((_, i) => seriesColor(i)), box.x, plot.y + plot.h + f.catStrip + 6, fs, style.color, style.family);
  return out;
}

function hbarSvg(box, cats, series, style) {
  const catsSafe = cats ?? [];
  const f = cartesianFrame(box, catsSafe, series, style, true);
  const { plot, lo, hi } = f;
  const n = Math.max(1, catsSafe.length);
  const slotH = plot.h / n;
  const groupH = slotH * 0.7;
  const ns = Math.max(1, (series ?? []).length);
  const bh = groupH / ns;
  const xOf = (v) => plot.x + ((v - lo) / (hi - lo)) * plot.w;
  const fs = style.sizePx;
  let out = gridSvg(f, style, true);
  (series ?? []).forEach((s, si) => {
    (s.values ?? []).forEach((raw, ci) => {
      const v = fin(raw);
      if (!has(v) || ci >= n) return;
      const by = plot.y + ci * slotH + (slotH - groupH) / 2 + si * bh + 0.5;
      const left = xOf(Math.min(v, 0));
      const right = xOf(Math.max(v, 0));
      out += `<rect x="${left.toFixed(1)}" y="${by.toFixed(1)}" width="${Math.max(0, right - left).toFixed(1)}" height="${Math.max(0.5, bh - 1).toFixed(1)}" fill="#${seriesColor(si)}"/>`;
    });
  });
  catsSafe.forEach((c, i) => {
    out += text(box.x + f.labelCol - 6, plot.y + i * slotH + slotH / 2 + fs * 0.35, "end", fs, style.color, style.family, c);
  });
  out += legendSvg(f.entries, f.entries.map((_, i) => seriesColor(i)), box.x, plot.y + plot.h + f.tickStrip + 6, fs, style.color, style.family);
  return out;
}

const MARKERS = ["circle", "square", "diamond", "triangle"];

function marker(si, cx, cy, color) {
  const r = 3.2;
  switch (MARKERS[si % MARKERS.length]) {
    case "square":
      return `<rect x="${(cx - r).toFixed(1)}" y="${(cy - r).toFixed(1)}" width="${(2 * r).toFixed(1)}" height="${(2 * r).toFixed(1)}" fill="#${color}"/>`;
    case "diamond":
      return `<polygon points="${cx.toFixed(1)},${(cy - r - 1).toFixed(1)} ${(cx + r + 1).toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${(cy + r + 1).toFixed(1)} ${(cx - r - 1).toFixed(1)},${cy.toFixed(1)}" fill="#${color}"/>`;
    case "triangle":
      return `<polygon points="${cx.toFixed(1)},${(cy - r - 1).toFixed(1)} ${(cx + r + 1).toFixed(1)},${(cy + r + 1).toFixed(1)} ${(cx - r - 1).toFixed(1)},${(cy + r + 1).toFixed(1)}" fill="#${color}"/>`;
    default:
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#${color}"/>`;
  }
}

function lineAreaSvg(box, cats, series, style, area) {
  const catsSafe = cats ?? [];
  const f = cartesianFrame(box, catsSafe, series, style, false);
  const { plot, lo, hi } = f;
  const n = Math.max(1, catsSafe.length);
  const slotW = plot.w / n;
  const cx = (i) => plot.x + i * slotW + slotW / 2;
  const yOf = (v) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h;
  const yZero = yOf(0);
  const fs = style.sizePx;
  let out = gridSvg(f, style, false);
  (series ?? []).forEach((s, si) => {
    const color = seriesColor(si);
    let run = [];
    const flush = () => {
      if (run.length === 1) {
        out += marker(si, run[0][0], run[0][1], color);
      } else if (run.length > 1) {
        const d = run.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
        if (area) {
          const [fx, fy] = run[0];
          const [lx] = run[run.length - 1];
          out += `<path d="${d}L${lx.toFixed(1)},${yZero.toFixed(1)}L${fx.toFixed(1)},${yZero.toFixed(1)}Z" fill="#${color}" fill-opacity="0.35" stroke="none"/>`;
        }
        out += `<path d="${d}" fill="none" stroke="#${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        for (const [x, y] of run) out += marker(si, x, y, color);
      }
      run = [];
    };
    (s.values ?? []).forEach((raw, ci) => {
      const v = fin(raw);
      // Missing observations break the run: no interpolation
      // across gaps unless the contract ever defines it.
      if (!has(v) || ci >= n) {
        flush();
        return;
      }
      run.push([cx(ci), yOf(v)]);
    });
    flush();
  });
  catsSafe.forEach((c, i) => {
    out += text(cx(i), plot.y + plot.h + fs, "middle", fs, style.color, style.family, c);
  });
  out += legendSvg(f.entries, f.entries.map((_, i) => seriesColor(i)), box.x, plot.y + plot.h + f.catStrip + 6, fs, style.color, style.family);
  return out;
}

function pieSvg(box, cats, series, style, hole) {
  const catsSafe = cats ?? [];
  const vals = ((series ?? [])[0]?.values ?? []).map(fin);
  // Slice i belongs to category i; non-positive values take zero
  // sweep but stay legend-listed — pie cannot honestly show
  // negatives, and inventing absolute-value normalization would
  // mislead. Multiple series are outside the supported contract:
  // series[0] renders (as PowerPoint does), the rest stay in the
  // data the native export carries.
  const shares = vals.map((v, i) => ({ i, v: has(v) && v > 0 ? v : 0 }));
  const total = shares.reduce((n, s) => n + s.v, 0);
  const names = (series ?? []).map((s) => s.name ?? "");
  const entries = [...names, ...(names.length <= 1 ? catsSafe : [])];
  const fs = style.sizePx;
  const legendStrip = entries.length ? entries.length * fs * 1.25 + 6 : 0;
  const side = Math.max(20, Math.min(box.w, box.h - legendStrip));
  const cx = box.x + box.w / 2;
  const cy = box.y + (box.h - legendStrip) / 2;
  const r = side / 2 - 2;
  const holeR = hole ? r * 0.55 : 0;
  let out = "";
  if (total > 0) {
    let a = -Math.PI / 2;
    const only = shares.filter((s) => s.v > 0);
    for (const s of shares) {
      if (s.v <= 0) continue;
      const sweep = (s.v / total) * Math.PI * 2;
      const color = seriesColor(s.i);
      if (only.length === 1) {
        out += hole
          ? `<path d="${circlePath(cx, cy, r)}${circlePath(cx, cy, holeR)}" fill-rule="evenodd" fill="#${color}"/>`
          : `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#${color}"/>`;
      } else {
        out += slicePath(cx, cy, r, holeR, a, a + sweep, color);
      }
      a += sweep;
    }
  } else {
    // All-zero (or empty) dataset: an honest empty ring, never a
    // fabricated distribution.
    out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#${style.color}" stroke-opacity="0.5" stroke-width="1.5"/>`;
    if (hole) {
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${holeR.toFixed(1)}" fill="none" stroke="#${style.color}" stroke-opacity="0.5" stroke-width="1"/>`;
    }
  }
  // Swatch colors: series-name entries map to their series color;
  // category entries map to their slice color. Both stay exact.
  const colors = entries.map((e, i) =>
    i < names.length ? seriesColor(i) : seriesColor(Math.max(0, catsSafe.indexOf(e))));
  out += legendSvg(entries, colors, box.x, box.y + (box.h - legendStrip) + 6, fs, style.color, style.family);
  return out;
}

function circlePath(cx, cy, r) {
  return `M${(cx - r).toFixed(1)},${cy.toFixed(1)}A${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(cx + r).toFixed(1)},${cy.toFixed(1)}A${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(cx - r).toFixed(1)},${cy.toFixed(1)}Z`;
}

function slicePath(cx, cy, r, holeR, a0, a1, color) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  let d = `M${cx.toFixed(1)},${cy.toFixed(1)}L${x0.toFixed(1)},${y0.toFixed(1)}A${r.toFixed(1)},${r.toFixed(1)} 0 ${large},1 ${x1.toFixed(1)},${y1.toFixed(1)}Z`;
  if (holeR > 0) {
    const ix0 = cx + holeR * Math.cos(a0);
    const iy0 = cy + holeR * Math.sin(a0);
    const ix1 = cx + holeR * Math.cos(a1);
    const iy1 = cy + holeR * Math.sin(a1);
    d += `M${cx.toFixed(1)},${cy.toFixed(1)}L${ix0.toFixed(1)},${iy0.toFixed(1)}A${holeR.toFixed(1)},${holeR.toFixed(1)} 0 ${large},1 ${ix1.toFixed(1)},${iy1.toFixed(1)}Z`;
  }
  // Even-odd ring keeps the doughnut hole transparent over any
  // background (plates included) without knowing the paint below.
  return `<path d="${d}" fill-rule="evenodd" fill="#${color}"/>`;
}

// Chart entry: the element, its pixel box, and the resolved label
// style ({family, sizePt, sizePx, color}). Unknown kinds fall back
// to bars — the schema closes the set, so this is unreachable
// except for forward tolerance, and bars preserve the data.
export function chartInner(el, box, style) {
  const c = el.chart;
  if (!c || !(c.series ?? []).length) return "";
  switch (c.chartKind) {
    case "hbar":
      return hbarSvg(box, c.categories, c.series, style);
    case "line":
      return lineAreaSvg(box, c.categories, c.series, style, false);
    case "area":
      return lineAreaSvg(box, c.categories, c.series, style, true);
    case "pie":
      return pieSvg(box, c.categories, c.series, style, false);
    case "doughnut":
      return pieSvg(box, c.categories, c.series, style, true);
    case "bar":
    default:
      return barSvg(box, c.categories, c.series, style);
  }
}
