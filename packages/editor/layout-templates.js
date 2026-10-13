// @forge/editor — layout-templates. The manual new-slide gallery's
// scene source: a small deterministic registry of editable slide
// skeletons over the Layer-C scene contract. Framework-free and
// DOM-free; the browser gallery, headless tests, and any future
// caller build through the same entry points.
//
// Independence is the point: this registry never imports the AI
// composition selector (`packages/compiler/composition.ts`) and the
// compiler never imports it. Both systems produce SlideScenes; the
// gallery path builds human-owned skeletons directly, while
// generation keeps planning from semantic intent. Nothing here may
// grow a second theme engine either — see the styling fallback
// below, which is deliberately narrow and documented.
//
// Styling fallback (bounded, documented): viewer scenes carry
// resolved runs but no DesignSystem, so exact theme inheritance is
// impossible at the editor seam. `layoutContextFromSibling`
// samples the neighbouring slide — background verbatim (never a
// white guess), ink from a sibling run else luminance contrast,
// accent from an opaque unlocked shape fill that is not the ground
// itself else a fixed mid blue, table/chart presentation from a
// sibling element else an explicit neutral contract. The proper
// future seam is passing a normalized DesignSystem into the
// builders; until then this sampler is the whole policy and no
// palette resolver lives in the UI.
import { SCENE_W, SCENE_H } from "../model/scene-constants.ts";

// Safe content frame: the compiler's own margins (0.7 sides, 0.6
// top, 0.6 bottom reserve) minus nothing. Template slides carry no
// chrome footer, so the full frame is content.
const FRAME = { x: 0.7, y: 0.6, w: SCENE_W - 1.4, h: SCENE_H - 1.2 };
const BOTTOM = FRAME.y + FRAME.h;

// Fallback accent: a mid blue readable on light and dark grounds.
// Reached only when the sibling offers no opaque shape fill of its
// own (blank decks, background-only slides).
const FALLBACK_ACCENT = "3B82C4";

// Placeholder sizes. Floors from the compiler contract (body 14,
// caption 12) are respected so skeletons never open below the
// readable floor a real slide would be held to.
const SIZE = { display: 36, heading: 28, subhead: 18, body: 16, caption: 12, stat: 34, chartLabel: 11 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const bare = (hex) => String(hex ?? "").replace(/^#/, "");

function isHex6(v) {
  return /^[0-9A-Fa-f]{6}$/.test(String(v ?? ""));
}

// Luminance ink: white below the threshold, near-black above.
// Same rule and threshold as scene-text.js contrastInk; kept local
// so this module imports nothing with DOM or validator weight.
export function layoutInk(bgFill) {
  const hex = bare(bgFill || "FFFFFF");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.45 ? "FFFFFF" : "1A1A1A";
}

// Relative luminance and contrast ratio (WCAG definition), kept
// local so this module stays dependency-free. The sampler below
// uses them as a legibility guard, never as a design tool.
function luminance(bareHex) {
  const f = (c) => {
    const v = (parseInt(c, 16) || 0) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const hex = String(bareHex || "FFFFFF");
  return 0.2126 * f(hex.slice(0, 2)) + 0.7152 * f(hex.slice(2, 4)) + 0.0722 * f(hex.slice(4, 6));
}

function contrastRatio(a, b) {
  const l1 = luminance(bare(a));
  const l2 = luminance(bare(b));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Ink with the stronger contrast of the two readable poles —
// strictly safer than a luminance threshold on mid-grey grounds.
function bestInk(bgFill) {
  const bg = bare(bgFill || "FFFFFF");
  return contrastRatio("FFFFFF", bg) >= contrastRatio("1A1A1A", bg) ? "FFFFFF" : "1A1A1A";
}

function walkElements(els, visit) {
  for (const el of els ?? []) {
    visit(el);
    walkElements(el?.group?.children, visit);
  }
}

function siblingRuns(sibling) {
  const runs = [];
  walkElements(sibling?.elements, (el) => {
    if (el?.kind !== "text") return;
    for (const p of el.paragraphs ?? []) {
      for (const r of p?.runs ?? []) runs.push(r);
    }
  });
  return runs;
}

// Accent sampling: first opaque fill on an unlocked shape (or line
// stroke) that is not the slide ground itself. Translucent card
// tints and ground-matching fills are skipped — they would paint
// rules and dots in a wash. Locked chrome is never sampled: its
// colours belong to the institution, not the deck.
function sampleAccent(sibling, bgFill) {
  const ground = bare(bgFill).toUpperCase();
  let found = null;
  walkElements(sibling?.elements, (el) => {
    if (found || el?.locked === true) return;
    if (el?.kind === "shape" && isHex6(el.shape?.fill)) {
      const alpha = el.shape?.fillAlpha;
      if ((alpha === undefined || alpha >= 0.99) && bare(el.shape.fill).toUpperCase() !== ground) {
        found = bare(el.shape.fill).toUpperCase();
      }
    } else if (el?.kind === "line" && isHex6(el.line?.stroke)) {
      found = bare(el.line.stroke).toUpperCase();
    }
  });
  return found ?? FALLBACK_ACCENT;
}

function sampleTableLayout(sibling) {
  let found = null;
  walkElements(sibling?.elements, (el) => {
    if (!found && el?.kind === "table" && el.table?.layout) found = el.table.layout;
  });
  return found;
}

function sampleChartLabels(sibling) {
  let found = null;
  walkElements(sibling?.elements, (el) => {
    if (!found && el?.kind === "chart" && el.chart?.labels) found = el.chart.labels;
  });
  return found;
}

// Style context sampled from the sibling slide. Every field is a
// resolved value — nothing here names a theme, reads a token, or
// reaches the filesystem.
export function layoutContextFromSibling(sibling) {
  const background = structuredClone(sibling?.background ?? { fill: "FFFFFF" });
  const bgFill = bare(background.fill || "FFFFFF").toUpperCase();
  const runs = siblingRuns(sibling);
  const headingRun = runs.find((r) => (r?.size ?? 0) >= 22 && (r?.text ?? "").trim() !== "") ?? null;
  const bodyRun = runs.find((r) => (r?.size ?? 0) < 22 && (r?.text ?? "").trim() !== "") ?? headingRun;
  // A sampled run may sit on a light card rather than the ground —
  // dark text sampled off a card is unreadable on a dark slide.
  // Below a 3:1 ratio against the ground the sample is discarded
  // for the higher-contrast pole, so placeholders stay visible on
  // light, dark, and high-contrast grounds alike.
  let ink = isHex6(bodyRun?.color) ? bare(bodyRun.color).toUpperCase()
    : isHex6(headingRun?.color) ? bare(headingRun.color).toUpperCase()
    : layoutInk(bgFill);
  if (contrastRatio(ink, bgFill) < 3) ink = bestInk(bgFill);
  const accent = sampleAccent(sibling, bgFill);
  const family = bodyRun?.family ?? headingRun?.family;
  const style = {
    ink,
    accent,
    onAccent: bestInk(accent),
    family: typeof family === "string" && family !== "" ? family : undefined,
    displaySize: headingRun?.size ? clamp(Math.round(headingRun.size * 1.25), 30, 44) : SIZE.display,
    headingSize: headingRun?.size ? clamp(Math.round(headingRun.size), 24, 40) : SIZE.heading,
    subheadSize: SIZE.subhead,
    bodySize: bodyRun?.size ? clamp(Math.round(bodyRun.size), 14, 20) : SIZE.body,
    captionSize: SIZE.caption,
    statSize: SIZE.stat,
    headingWeight: headingRun?.weight ?? 700,
    bodyWeight: bodyRun?.weight ?? 400,
  };
  const tableLayout = sampleTableLayout(sibling);
  const chartLabels = sampleChartLabels(sibling);
  return { background, style, tableLayout, chartLabels };
}

// One committed text element: single-run paragraphs only, so every
// placeholder stays directly editable and format-panel friendly.
// Roles feed Layers labels (heading/subhead/text) and any future
// refit; `wrap` is the only honest policy for authored copy.
function textEl(newId, hint, box, paras, style = {}) {
  const paragraphs = paras.map((p) => {
    const run = { text: p.text };
    if (p.size !== undefined) run.size = p.size;
    if (p.color !== undefined) run.color = bare(p.color).toUpperCase();
    if (p.role !== undefined) run.role = p.role;
    if (p.bold !== undefined) run.bold = p.bold;
    if (p.weight !== undefined) run.weight = p.weight;
    if (p.italic !== undefined) run.italic = p.italic;
    if (style.family !== undefined) run.family = style.family;
    run.line = 1.25;
    const para = { runs: [run] };
    if (p.align !== undefined) para.align = p.align;
    if (p.bullet !== undefined) para.bullet = p.bullet;
    return para;
  });
  return {
    id: newId(hint),
    kind: "text",
    ...box,
    valign: "top",
    z: 0,
    provenance: "human",
    fitPolicy: "wrap",
    paragraphs,
  };
}

function shapeEl(newId, hint, box, shape) {
  const out = { id: newId(hint), kind: "shape", ...box, z: 0, provenance: "human", shape: { ...shape } };
  if (out.shape.fill !== undefined) out.shape.fill = bare(out.shape.fill).toUpperCase();
  if (out.shape.stroke !== undefined) out.shape.stroke = bare(out.shape.stroke).toUpperCase();
  return out;
}

function lineEl(newId, hint, x, y, x2, y2, stroke) {
  const w = Math.abs(x2 - x) || 0.02;
  const h = Math.abs(y2 - y) || 0.02;
  return {
    id: newId(hint), kind: "line", x: Math.min(x, x2), y: Math.min(y, y2), w, h,
    z: 0, provenance: "human",
    line: { x2, y2, stroke: bare(stroke).toUpperCase(), strokeWidth: 1.5 },
  };
}

function chartEl(newId, hint, box, chartKind, categories, series, labels) {
  return {
    id: newId(hint), kind: "chart", ...box, z: 0, provenance: "human",
    chart: { chartKind, categories: [...categories], series: series.map((s) => ({ name: s.name, values: [...s.values] })), labels: { ...labels } },
  };
}

// Table presentation is resolved once here and projected verbatim
// by both renderers (the V2-3F-4 lesson): even column widths over
// the element box, even row heights, header treatment from the
// sampled accent with legible header ink. A sibling compiler table
// lends its typography/grid verbatim — but never its colWidths or
// rowHeights, which sum to a different element box and would split
// measurement from projection.
function tableEl(newId, hint, box, rows, ctx, { header = true } = {}) {
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const colW = box.w / cols;
  const rowH = box.h / rows.length;
  const sib = ctx.tableLayout ?? {};
  return {
    id: newId(hint), kind: "table", ...box, z: 0, provenance: "human",
    table: {
      rows: rows.map((r) => [...r]),
      header,
      layout: {
        colWidths: Array.from({ length: cols }, () => Math.round(colW * 1000) / 1000),
        rowHeights: Array.from({ length: rows.length }, () => Math.round(rowH * 1000) / 1000),
        headerFill: bare(sib.headerFill ?? ctx.style.accent).toUpperCase(),
        headerColor: bare(sib.headerColor ?? ctx.style.onAccent).toUpperCase(),
        headerSize: sib.headerSize ?? 12,
        headerBold: sib.headerBold ?? true,
        bodyColor: bare(sib.bodyColor ?? ctx.style.ink).toUpperCase(),
        bodySize: sib.bodySize ?? 12,
        ...(sib.fontFamily || ctx.style.family ? { fontFamily: sib.fontFamily ?? ctx.style.family } : {}),
        padding: sib.padding ?? 0.06,
        ...(sib.gridColor ? { gridColor: bare(sib.gridColor).toUpperCase() } : {}),
      },
    },
  };
}

function chartLabelsFor(ctx) {
  if (ctx.chartLabels) return { ...ctx.chartLabels };
  // Schema requires a label family; with no sibling chart and no
  // sampled face this names the pipeline's neutral body sans
  // (bundled for the viewer by V2-4D, present in every theme
  // manifest check). Documented fallback, not a theme decision.
  const labels = { family: ctx.style.family ?? "Inter", size: SIZE.chartLabel, color: ctx.style.ink };
  return labels;
}

// Heading band shared by content skeletons.
function headingBox() {
  return { x: FRAME.x, y: FRAME.y, w: FRAME.w, h: 0.9 };
}

function H(newId, ctx, text) {
  const st = ctx.style;
  return textEl(newId, "heading", headingBox(), [
    { text, size: st.headingSize, color: st.ink, role: "heading", weight: st.headingWeight },
  ]);
}

function cardFill(ctx) {
  return { fill: ctx.style.accent, fillAlpha: 0.12 };
}

// Assigns z ranks in array order (z is the rank both projections
// sort by; array order mirrors it — the V2-5J contract). Shapes
// are emitted before the text they carry by construction order.
function rank(elements) {
  elements.forEach((el, i) => { el.z = i; });
  return elements;
}

const builders = {
  title(ctx, newId) {
    const st = ctx.style;
    const cx = SCENE_W / 2;
    return rank([
      textEl(newId, "title", { x: 1.33, y: 2.1, w: SCENE_W - 2.66, h: 1.4 },
        [{ text: "Presentation title", size: st.displaySize, color: st.ink, role: "display", weight: st.headingWeight, align: "center" }]),
      shapeEl(newId, "rule", { x: cx - 0.6, y: 3.65, w: 1.2, h: 0.035 }, { form: "rect", fill: st.accent }),
      textEl(newId, "subtitle", { x: 2.33, y: 3.85, w: SCENE_W - 4.66, h: 0.9 },
        [{ text: "Add your subtitle", size: st.bodySize + 2, color: st.ink, role: "subhead", align: "center" }]),
    ]);
  },

  section(ctx, newId) {
    const st = ctx.style;
    return rank([
      textEl(newId, "label", { x: FRAME.x, y: 2.4, w: FRAME.w, h: 0.5 },
        [{ text: "Section label", size: 15, color: st.accent, role: "subhead", bold: true }]),
      textEl(newId, "title", { x: FRAME.x, y: 3.0, w: FRAME.w, h: 1.3 },
        [{ text: "Section title", size: st.displaySize, color: st.ink, role: "display", weight: st.headingWeight }]),
      shapeEl(newId, "rule", { x: FRAME.x, y: 4.5, w: 1.6, h: 0.05 }, { form: "rect", fill: st.accent }),
    ]);
  },

  "title-body"(ctx, newId) {
    const st = ctx.style;
    return rank([
      H(newId, ctx, "Slide title"),
      textEl(newId, "body", { x: FRAME.x, y: 1.7, w: FRAME.w, h: 4.6 }, [
        { text: "First key point", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        { text: "Second key point", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        { text: "Third key point", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        { text: "Fourth key point", size: st.bodySize, color: st.ink, role: "body", bullet: true },
      ]),
    ]);
  },

  "two-column"(ctx, newId) {
    const st = ctx.style;
    const colW = (FRAME.w - 0.5) / 2;
    const mid = FRAME.x + colW + 0.25;
    return rank([
      H(newId, ctx, "Slide title"),
      lineEl(newId, "divider", mid, 1.7, mid, 5.9, st.accent),
      textEl(newId, "left-head", { x: FRAME.x, y: 1.7, w: colW, h: 0.6 },
        [{ text: "Category A", size: st.subheadSize, color: st.ink, role: "subhead", bold: true }]),
      textEl(newId, "left-body", { x: FRAME.x, y: 2.4, w: colW, h: 3.2 }, [
        { text: "Point one about A", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        { text: "Point two about A", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        { text: "Point three about A", size: st.bodySize, color: st.ink, role: "body", bullet: true },
      ]),
      textEl(newId, "right-head", { x: mid + 0.25, y: 1.7, w: colW, h: 0.6 },
        [{ text: "Category B", size: st.subheadSize, color: st.ink, role: "subhead", bold: true }]),
      textEl(newId, "right-body", { x: mid + 0.25, y: 2.4, w: colW, h: 3.2 }, [
        { text: "Point one about B", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        { text: "Point two about B", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        { text: "Point three about B", size: st.bodySize, color: st.ink, role: "body", bullet: true },
      ]),
    ]);
  },

  closing(ctx, newId) {
    const st = ctx.style;
    return rank([
      textEl(newId, "thanks", { x: 1.33, y: 2.6, w: SCENE_W - 2.66, h: 1.2 },
        [{ text: "Thank you", size: st.displaySize, color: st.ink, role: "display", weight: st.headingWeight, align: "center" }]),
      textEl(newId, "support", { x: 2.33, y: 3.9, w: SCENE_W - 4.66, h: 0.7 },
        [{ text: "Questions and discussion", size: st.bodySize + 2, color: st.ink, role: "subhead", align: "center" }]),
    ]);
  },

  "compare-2col"(ctx, newId) {
    const st = ctx.style;
    const cardW = (FRAME.w - 0.5) / 2;
    const col = (i, label, points) => {
      const x = FRAME.x + i * (cardW + 0.5);
      return [
        shapeEl(newId, `card-${i}`, { x, y: 1.7, w: cardW, h: 4.4 }, { form: "roundRect", ...cardFill(ctx) }),
        textEl(newId, `label-${i}`, { x: x + 0.3, y: 2.0, w: cardW - 0.6, h: 0.6 },
          [{ text: label, size: st.subheadSize, color: st.ink, role: "subhead", bold: true }]),
        textEl(newId, `points-${i}`, { x: x + 0.3, y: 2.7, w: cardW - 0.6, h: 2.9 },
          points.map((text) => ({ text, size: st.bodySize, color: st.ink, role: "body", bullet: true }))),
      ];
    };
    return rank([
      H(newId, ctx, "Comparison title"),
      ...col(0, "Option A", ["Point about A", "Another point", "A third point"]),
      ...col(1, "Option B", ["Point about B", "Another point", "A third point"]),
    ]);
  },

  "pros-cons"(ctx, newId) {
    const st = ctx.style;
    const cardW = (FRAME.w - 0.5) / 2;
    const col = (i, label, points, solid) => {
      const x = FRAME.x + i * (cardW + 0.5);
      const band = solid
        ? { form: "roundRect", fill: st.accent }
        : { form: "roundRect", ...cardFill(ctx) };
      const labelColor = solid ? st.onAccent : st.ink;
      return [
        shapeEl(newId, `band-${i}`, { x, y: 1.7, w: cardW, h: 0.7 }, band),
        textEl(newId, `band-label-${i}`, { x: x + 0.3, y: 1.7, w: cardW - 0.6, h: 0.7 },
          [{ text: label, size: st.subheadSize, color: labelColor, role: "subhead", bold: true, align: "center" }]),
        textEl(newId, `points-${i}`, { x, y: 2.6, w: cardW, h: 3.4 },
          points.map((text) => ({ text, size: st.bodySize, color: st.ink, role: "body", bullet: true }))),
      ];
    };
    return rank([
      H(newId, ctx, "Decision title"),
      ...col(0, "Pros", ["Benefit one", "Benefit two", "Benefit three"], true),
      ...col(1, "Cons", ["Cost one", "Cost two", "Cost three"], false),
    ]);
  },

  "compare-3col"(ctx, newId) {
    const st = ctx.style;
    const cardW = (FRAME.w - 0.8) / 3;
    const cards = ["Choice A", "Choice B", "Choice C"].map((label, i) => {
      const x = FRAME.x + i * (cardW + 0.4);
      return [
        shapeEl(newId, `card-${i}`, { x, y: 1.7, w: cardW, h: 4.4 }, { form: "roundRect", ...cardFill(ctx) }),
        textEl(newId, `label-${i}`, { x: x + 0.3, y: 2.0, w: cardW - 0.6, h: 0.6 },
          [{ text: label, size: st.subheadSize, color: st.ink, role: "subhead", bold: true }]),
        textEl(newId, `points-${i}`, { x: x + 0.3, y: 2.7, w: cardW - 0.6, h: 2.9 }, [
          { text: "First point", size: st.bodySize, color: st.ink, role: "body", bullet: true },
          { text: "Second point", size: st.bodySize, color: st.ink, role: "body", bullet: true },
        ]),
      ];
    });
    return rank([H(newId, ctx, "Comparison title"), ...cards.flat()]);
  },

  "process-3step"(ctx, newId) {
    const st = ctx.style;
    const colW = (FRAME.w - 0.8) / 3;
    const steps = ["First step", "Second step", "Third step"];
    const parts = steps.map((label, i) => {
      const x = FRAME.x + i * (colW + 0.4);
      const cx = x + colW / 2;
      return [
        shapeEl(newId, `node-${i}`, { x: cx - 0.35, y: 2.0, w: 0.7, h: 0.7 }, { form: "ellipse", fill: st.accent }),
        textEl(newId, `num-${i}`, { x: cx - 0.35, y: 2.0, w: 0.7, h: 0.7 },
          [{ text: String(i + 1), size: st.subheadSize, color: st.onAccent, role: "subhead", bold: true, align: "center" }]),
        textEl(newId, `step-${i}`, { x, y: 2.9, w: colW, h: 0.6 },
          [{ text: label, size: st.subheadSize, color: st.ink, role: "subhead", bold: true, align: "center" }]),
        textEl(newId, `desc-${i}`, { x, y: 3.6, w: colW, h: 2.0 },
          [{ text: "Describe this step", size: st.bodySize, color: st.ink, role: "body", align: "center" }]),
      ];
    });
    const cxOf = (i) => FRAME.x + i * (colW + 0.4) + colW / 2;
    const links = [0, 1].map((i) =>
      lineEl(newId, `link-${i}`, cxOf(i) + 0.6, 2.35, cxOf(i + 1) - 0.6, 2.35, st.accent));
    return rank([H(newId, ctx, "Process title"), ...parts.flat(), ...links]);
  },

  timeline(ctx, newId) {
    const st = ctx.style;
    const n = 4;
    const seg = FRAME.w / n;
    const spineY = 3.6;
    const nodes = Array.from({ length: n }, (_, i) => {
      const cx = FRAME.x + (i + 0.5) * seg;
      return [
        shapeEl(newId, `dot-${i}`, { x: cx - 0.14, y: spineY - 0.14, w: 0.28, h: 0.28 }, { form: "ellipse", fill: st.accent }),
        textEl(newId, `phase-${i}`, { x: cx - seg / 2 + 0.15, y: 2.5, w: seg - 0.3, h: 0.5 },
          [{ text: `Phase ${i + 1}`, size: st.bodySize, color: st.ink, role: "subhead", bold: true, align: "center" }]),
        textEl(newId, `note-${i}`, { x: cx - seg / 2 + 0.15, y: 3.95, w: seg - 0.3, h: 0.9 },
          [{ text: "What happens here", size: st.captionSize, color: st.ink, role: "caption", align: "center" }]),
      ];
    });
    return rank([
      H(newId, ctx, "Timeline title"),
      lineEl(newId, "spine", FRAME.x, spineY, FRAME.x + FRAME.w, spineY, st.accent),
      ...nodes.flat(),
    ]);
  },

  hierarchy(ctx, newId) {
    const st = ctx.style;
    const cx = SCENE_W / 2;
    const cardW = (FRAME.w - 0.8) / 3;
    const kids = ["Team A", "Team B", "Team C"];
    const busY = 3.1;
    const childTops = kids.map((label, i) => {
      const x = FRAME.x + i * (cardW + 0.4);
      const kcx = x + cardW / 2;
      return { x, kcx, label };
    });
    return rank([
      H(newId, ctx, "Organization title"),
      shapeEl(newId, "parent-card", { x: cx - 2.0, y: 1.7, w: 4.0, h: 1.0 }, { form: "roundRect", fill: st.accent, fillAlpha: 0.25 }),
      textEl(newId, "parent", { x: cx - 2.0, y: 1.7, w: 4.0, h: 1.0 },
        [{ text: "Department head", size: st.subheadSize, color: st.ink, role: "subhead", bold: true, align: "center" }]),
      lineEl(newId, "drop", cx, 2.7, cx, busY, st.accent),
      lineEl(newId, "bus", childTops[0].kcx, busY, childTops[2].kcx, busY, st.accent),
      ...childTops.flatMap((k, i) => [
        lineEl(newId, `leg-${i}`, k.kcx, busY, k.kcx, 3.5, st.accent),
        shapeEl(newId, `child-card-${i}`, { x: k.x, y: 3.5, w: cardW, h: 2.2 }, { form: "roundRect", ...cardFill(ctx) }),
        textEl(newId, `child-${i}`, { x: k.x + 0.3, y: 3.8, w: cardW - 0.6, h: 0.6 },
          [{ text: k.label, size: st.subheadSize, color: st.ink, role: "subhead", bold: true, align: "center" }]),
        textEl(newId, `role-${i}`, { x: k.x + 0.3, y: 4.5, w: cardW - 0.6, h: 0.9 },
          [{ text: "Role or focus", size: st.bodySize, color: st.ink, role: "body", align: "center" }]),
      ]),
    ]);
  },

  "metrics-3up"(ctx, newId) {
    const st = ctx.style;
    const cardW = (FRAME.w - 0.8) / 3;
    const stats = [
      { value: "128", label: "Sample metric A" },
      { value: "72%", label: "Sample metric B" },
      { value: "36", label: "Sample metric C" },
    ];
    return rank([
      H(newId, ctx, "Metrics title"),
      ...stats.flatMap((s, i) => {
        const x = FRAME.x + i * (cardW + 0.4);
        return [
          textEl(newId, `value-${i}`, { x, y: 2.2, w: cardW, h: 1.2 },
            [{ text: s.value, size: st.statSize, color: st.ink, role: "stat", bold: true, align: "center" }]),
          textEl(newId, `metric-${i}`, { x, y: 3.5, w: cardW, h: 0.7 },
            [{ text: s.label, size: st.bodySize, color: st.ink, role: "body", align: "center" }]),
        ];
      }),
      textEl(newId, "caveat", { x: FRAME.x, y: 5.2, w: FRAME.w, h: 0.6 },
        [{ text: "Sample figures — replace with your own.", size: st.captionSize, color: st.ink, role: "caption", align: "center" }]),
    ]);
  },

  "chart-insight"(ctx, newId) {
    const st = ctx.style;
    // Single-series bar: the only starter shape that survives every
    // export boundary (multi-series pie/doughnut are refused by the
    // command validator, the adapter, and preflight alike).
    const chart = chartEl(newId, "chart", { x: FRAME.x, y: 1.7, w: 7.0, h: 4.4 }, "bar",
      ["Example A", "Example B", "Example C", "Example D"],
      [{ name: "Example values", values: [12, 19, 8, 15] }],
      chartLabelsFor(ctx));
    return rank([
      H(newId, ctx, "Chart title"),
      chart,
      textEl(newId, "insight-head", { x: 8.1, y: 1.7, w: FRAME.w - 7.4, h: 0.6 },
        [{ text: "What this shows", size: st.subheadSize, color: st.ink, role: "subhead", bold: true }]),
      textEl(newId, "insight", { x: 8.1, y: 2.4, w: FRAME.w - 7.4, h: 2.0 },
        [{ text: "Replace this chart with your data. These figures are placeholders.", size: st.bodySize, color: st.ink, role: "body" }]),
      textEl(newId, "source", { x: 8.1, y: 4.6, w: FRAME.w - 7.4, h: 0.6 },
        [{ text: "Source: your dataset", size: st.captionSize, color: st.ink, role: "caption" }]),
    ]);
  },

  "data-table"(ctx, newId) {
    const st = ctx.style;
    // Explicitly sample data: short neutral cells, header flagged,
    // and a caption naming the content as placeholders so example
    // figures can never read as genuine user data.
    const table = tableEl(newId, "table", { x: FRAME.x, y: 1.7, w: FRAME.w, h: 4.0 }, [
      ["Item", "Example A", "Example B", "Note"],
      ["Row 1", "12", "8", "sample"],
      ["Row 2", "17", "5", "sample"],
      ["Row 3", "9", "11", "sample"],
      ["Row 4", "14", "6", "sample"],
    ], ctx, { header: true });
    return rank([
      H(newId, ctx, "Table title"),
      table,
      textEl(newId, "caveat", { x: FRAME.x, y: 5.9, w: FRAME.w, h: 0.6 },
        [{ text: "Sample figures — replace with your own data.", size: st.captionSize, color: st.ink, role: "caption" }]),
    ]);
  },

  "key-findings"(ctx, newId) {
    const st = ctx.style;
    const rows = ["Key finding one", "Key finding two", "Key finding three"];
    return rank([
      H(newId, ctx, "Findings title"),
      ...rows.flatMap((lead, i) => {
        const y = 1.9 + i * 1.5;
        return [
          shapeEl(newId, `rail-${i}`, { x: FRAME.x, y, w: 0.12, h: 1.3 }, { form: "rect", fill: st.accent }),
          textEl(newId, `finding-${i}`, { x: FRAME.x + 0.4, y, w: FRAME.w - 0.4, h: 1.3 }, [
            { text: lead, size: st.bodySize, color: st.ink, role: "subhead", bold: true },
            { text: "What it means in one line", size: st.bodySize, color: st.ink, role: "body" },
          ]),
        ];
      }),
    ]);
  },
};

export const LAYOUT_CATEGORIES = [
  { id: "essentials", name: "Essentials", blurb: "Openers, structure, and closers" },
  { id: "comparison", name: "Comparison", blurb: "Options weighed side by side" },
  { id: "process", name: "Process & structure", blurb: "Steps, time, and hierarchy" },
  { id: "data", name: "Data & research", blurb: "Figures, charts, and findings" },
];

const CATEGORY_IDS = new Set(LAYOUT_CATEGORIES.map((c) => c.id));

function entry(id, name, category, description, useCase, legacyAliases) {
  if (!builders[id]) throw new Error(`layout-templates: no builder for ${id}`);
  if (!CATEGORY_IDS.has(category)) throw new Error(`layout-templates: unknown category ${category}`);
  return { id, name, category, description, useCase, legacyAliases: [...legacyAliases], supported: true, build: builders[id] };
}

// The curated catalog: 15 skeletons in 4 categories. IDs are stable
// across sessions (tests pin them); names and copy are UI strings.
// `legacyAliases` preserves the old 74-type vocabulary as
// discoverable metadata for the gallery search.
export const LAYOUT_TEMPLATES = [
  entry("title", "Title slide", "essentials",
    "A centered title with a subtitle line.",
    "Open a deck or a major part of one.",
    ["title"]),
  entry("section", "Section divider", "essentials",
    "A label, a large section title, and an accent rule.",
    "Announce the next part of the talk.",
    ["section", "chapter", "epigraph"]),
  entry("title-body", "Title and body", "essentials",
    "A heading with four bullet points.",
    "Make one point with supporting detail.",
    ["bullets", "numbered-list", "definition", "contact"]),
  entry("two-column", "Two columns", "essentials",
    "A heading with two headed text columns.",
    "Define two categories or positions.",
    ["glossary"]),
  entry("closing", "Closing slide", "essentials",
    "A centered thank-you with a support line.",
    "Close the deck and invite questions.",
    ["closing"]),
  entry("compare-2col", "Side-by-side comparison", "comparison",
    "Two cards with labels and bullet points.",
    "Compare two options point for point.",
    ["compare", "before-after", "vs", "side-by-side"]),
  entry("pros-cons", "Pros and cons", "comparison",
    "Two columns under solid and tinted bands.",
    "Weigh the wins and costs of one option.",
    ["pros-cons", "metric-comparison"]),
  entry("compare-3col", "Three-card comparison", "comparison",
    "Three cards with labels and short points.",
    "Compare three choices or team members.",
    ["cards", "feature-grid", "grid-items", "team-grid"]),
  entry("process-3step", "Three-step process", "process",
    "Three numbered steps joined by connectors.",
    "Explain how something is built or done.",
    ["flow", "pipeline", "agenda"]),
  entry("timeline", "Timeline", "process",
    "Four phases along a horizontal spine.",
    "Show events or phases in time order.",
    ["timeline", "milestone", "chronology", "roadmap", "journey"]),
  entry("hierarchy", "Hierarchy", "process",
    "A parent card over three child cards with connectors.",
    "Show a tree of parents and children.",
    ["hierarchy", "layered-architecture"]),
  entry("metrics-3up", "Metric overview", "data",
    "Three large figures with labels.",
    "Report headline numbers at a glance.",
    ["stats", "big-number", "kpi-dashboard", "data-cards"]),
  entry("chart-insight", "Chart with insight", "data",
    "A bar chart beside an insight panel.",
    "Present one chart and say what it shows.",
    ["chart"]),
  entry("data-table", "Data table", "data",
    "A headed table with sample rows.",
    "Lay figures out in rows and columns.",
    ["table", "data-table", "decision-matrix", "scorecard"]),
  entry("key-findings", "Key findings", "data",
    "Three findings with accent rails.",
    "Land the takeaways of research.",
    ["takeaway", "callout", "tip", "stacked-list", "faq", "emphasis"]),
];

const BY_ID = new Map(LAYOUT_TEMPLATES.map((t) => [t.id, t]));

export function getLayoutTemplate(id) {
  return BY_ID.get(id) ?? null;
}

export function listLayoutTemplates() {
  return [...LAYOUT_TEMPLATES];
}

// Every identity on one scene, for deck-domain collision checks.
export function collectSceneIds(scene) {
  const out = [scene?.id].filter(Boolean);
  walkElements(scene?.elements, (el) => { if (el?.id) out.push(el.id); });
  return out;
}

// Full scene from a template: sibling-sampled theme baseline,
// human provenance on every element, `customized` state, and a
// namespaced recipeId that can never collide with a compiler
// family name. `newId` is injected so tests run deterministic
// counters while the UI mints random human ids.
export function buildLayoutScene(templateId, sibling, opts = {}) {
  const template = getLayoutTemplate(templateId);
  if (!template) throw new Error(`layout-templates: unknown template ${templateId}`);
  const ctx = layoutContextFromSibling(sibling);
  const newId = opts.newId ?? ((hint) => `${hint ?? "el"}-${Math.random().toString(16).slice(2, 10)}`);
  const elements = template.build(ctx, newId);
  // Sampled family applies centrally so builders stay geometry-only:
  // runs name the theme's typeface without any builder repeating it.
  if (ctx.style.family !== undefined) {
    for (const el of elements) {
      if (el?.kind !== "text") continue;
      for (const p of el.paragraphs ?? []) {
        for (const r of p?.runs ?? []) {
          if (r.family === undefined) r.family = ctx.style.family;
        }
      }
    }
  }
  return {
    id: opts.slideId ?? `layout-${templateId}`,
    width: SCENE_W,
    height: SCENE_H,
    background: ctx.background,
    elements,
    layoutState: "customized",
    recipeId: `layout:${templateId}`,
  };
}
