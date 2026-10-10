// @forge/compiler — deterministic composition mechanisms (HOW).
// V2-3C planning decides WHAT strategy each slide uses; this module
// realizes the 12 selectable families as editable scene geometry from
// structured intent + plan + DesignSystem. No prose parsing, no model
// calls. V2-3E-3 emits locked chrome from an explicit adapter plan;
// content fitting stays V2-3E-1 behavior.
// Every authored block gets a primary semantic carrier; nothing is
// silently dropped. Deferred families (taper/timeline/set-overlap/
// term-glossary) are NOT implemented here.

import type { SlideIntent, ContentBlock } from "../model/intent.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";
import type { SlideScene, SceneElement } from "../model/scene.generated.ts";
import type { SlideCompositionPlan } from "./composition.ts";
import { SCENE_W, SCENE_H } from "../model/scene-constants.ts";
import { CONTENT_FOOTER_RESERVE } from "../core/chrome.ts";
import { fittedTextEl, centerSparseBox, nominalContentHeight, measureTableCells, measureLegendLines, type FitDiagnostic, type FitPolicy, type RoleParagraph, type TableCellMeasure } from "./text-fit.ts";
import { measure } from "../core/fit.ts";
import { maxColumns, splitWidths } from "../core/table.ts";
import { resolveRunStyle } from "./typography.ts";
import { emitChromeElements, type SlideChromePlan } from "./chrome.ts";
import { cardFillOf, sceneBackground, designForSurface, type SlideBackgrounds } from "./background.ts";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ParaRun {
  text: string;
  role: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

interface Para {
  runs: ParaRun[];
  align?: "left" | "center" | "right";
  bullet?: boolean;
}

function contentBox(design: DesignSystem): Box & { bottom: number } {
  const m = design.grid.margins;
  const bottom = SCENE_H - m.bottom - CONTENT_FOOTER_RESERVE;
  return {
    x: m.left,
    y: m.top,
    w: SCENE_W - m.left - m.right,
    h: bottom - m.top,
    bottom,
  };
}

function roleSize(design: DesignSystem, role: string, fallback: number): number {
  return design.roles[role]?.size ?? fallback;
}

function ink(design: DesignSystem): string {
  return design.palette.ink.hex;
}

interface FitCtx {
  design: DesignSystem;
  slideId: string;
  sink: FitDiagnostic[];
  policy?: FitPolicy;
}

function fitOf(ctx: MechanismCtx): FitCtx {
  return { design: ctx.design, slideId: ctx.slide.id, sink: ctx.sink };
}

// Single choke point for compiler text: every kind:text element is
// resolved against its DesignSystem role and fitted inside its
// allocated box. Mechanisms own geometry; the fitter owns scale.
function textEl(
  id: string,
  semanticRef: string | undefined,
  box: Box,
  paragraphs: Para[],
  z: number,
  fit: FitCtx,
): SceneElement {
  return fittedTextEl(fit.design, {
    id,
    ...(semanticRef !== undefined ? { semanticRef } : {}),
    box,
    paragraphs: paragraphs as RoleParagraph[],
    z,
    slideId: fit.slideId,
    ...(fit.policy !== undefined ? { policy: fit.policy } : {}),
    sink: fit.sink,
  });
}

function shapeEl(
  id: string,
  semanticRef: string | undefined,
  box: Box,
  form: "rect" | "roundRect" | "ellipse",
  fill: string,
  z: number,
): SceneElement {
  return {
    id, kind: "shape", x: box.x, y: box.y, w: box.w, h: box.h, z,
    provenance: "compiler", ...(semanticRef !== undefined ? { semanticRef } : {}),
    shape: { form, fill },
  };
}

// Card tiles resolve the declared cardFill (with alpha) rather than
// the flat surface: translucent themes layer over their plate instead
// of covering it. Accent rules and tone rails keep shapeEl — they are
// signal, not surface, and never translucent.
function cardEl(
  id: string,
  semanticRef: string | undefined,
  box: Box,
  form: "rect" | "roundRect" | "ellipse",
  design: DesignSystem,
  z: number,
): SceneElement {
  const card = cardFillOf(design);
  return {
    id, kind: "shape", x: box.x, y: box.y, w: box.w, h: box.h, z,
    provenance: "compiler", ...(semanticRef !== undefined ? { semanticRef } : {}),
    shape: {
      form, fill: card.hex,
      ...(card.alpha !== undefined && card.alpha < 1 ? { fillAlpha: card.alpha } : {}),
    },
  };
}

function blockParas(block: ContentBlock, design: DesignSystem): { paras: Para[]; policy: FitPolicy } {
  const inkColor = ink(design);
  const bodySize = roleSize(design, "body", 13);
  switch (block.kind) {
    case "list":
      return {
        paras: (block.items ?? []).map((item) => ({
          runs: [{ text: item, role: "body", size: bodySize, color: inkColor }],
          align: "left" as const,
          bullet: true,
        })),
        policy: "wrap",
      };
    case "stat":
      return {
        paras: [
          { runs: [{ text: block.value ?? "", role: "stat", bold: true, color: inkColor }], align: "left" as const },
          { runs: [{ text: block.label ?? "", role: "body", size: bodySize, color: inkColor }], align: "left" as const },
        ],
        policy: "stat",
      };
    case "quote":
      return {
        paras: [{ runs: [{ text: block.text ?? "", role: "body", size: bodySize, italic: true, color: inkColor }], align: "left" as const }],
        policy: "wrap",
      };
    default: {
      const paras: Para[] = [];
      if (block.label) paras.push({ runs: [{ text: block.label, role: "body", size: bodySize, bold: true, color: inkColor }], align: "left" as const });
      const body = block.text ?? (block.items ?? []).join("\n");
      if (body) paras.push({ runs: [{ text: body, role: "body", size: bodySize, color: inkColor }], align: "left" as const });
      if (!paras.length) paras.push({ runs: [{ text: "", role: "body", size: bodySize, color: inkColor }], align: "left" as const });
      return { paras, policy: "wrap" };
    }
  }
}

function primaryId(slideId: string, blockId: string): string {
  return `${slideId}:${blockId}:content`;
}

// Vertical cell padding, in inches, shared by the table layout
// contract and both projections. Small enough to keep rows compact,
// large enough that glyphs never touch row rules.
const TABLE_CELL_PAD = 0.05;

// Resolved Layer-C table presentation. Mirrors the schema-backed
// SceneElement table layout field; renderers project it verbatim.
interface TableLayout {
  rowHeights: number[];
  colWidths: number[];
  headerFill: string;
  headerColor: string;
  headerSize: number;
  headerBold: boolean;
  bodyColor: string;
  bodySize: number;
  fontFamily: string;
  padding: number;
  gridColor: string;
}

// Per-cell capacity assessment, positioned by row and column.
// Measured facts come from the fitting layer; the compiler only
// assembles row heights and emits overflow diagnostics.
interface CellAssessment extends TableCellMeasure {
  row: number;
  col: number;
}

// Deterministic table layout: authored rows + allocated region +
// DesignSystem roles/palette in, resolved Layer-C presentation out.
// Every cell is measured at its resolved column width with its
// header/body metrics, so row heights are true wrapped heights —
// the shape PowerPoint's own wrapping converges to — rather than
// one-line guesses. Short tables shrink to their content; dense
// tables keep the full region with even rows, and the per-cell
// assessment lets the caller diagnose genuine overflow instead of
// silently squeezing. Cell values are never read, rounded,
// reordered, or reformatted here — only measured, never fitted:
// table text stays nominal and overflow diagnoses.
function tableLayout(
  design: DesignSystem,
  rows: string[][],
  header: boolean,
  region: Box,
): { height: number; layout: TableLayout; cells: CellAssessment[][]; natural: number } {
  const bodySize = roleSize(design, "body", 13);
  const cols = maxColumns(rows);
  const colWidths = splitWidths(region.w, cols);
  const layout: TableLayout = {
    rowHeights: [],
    colWidths,
    headerFill: cardFillOf(design).hex,
    headerColor: design.palette.ink.hex,
    headerSize: bodySize,
    headerBold: true,
    bodyColor: design.palette.ink.hex,
    bodySize,
    fontFamily: design.roles.body?.family ?? "",
    padding: TABLE_CELL_PAD,
    gridColor: design.palette.rule.hex,
  };
  const n = rows.length;
  if (n === 0) return { height: region.h, layout, cells: [], natural: region.h };
  const measured = measureTableCells(design, rows, header, colWidths, TABLE_CELL_PAD);
  const cells = measured.map((mrow, ri) => mrow.map((m, ci) => ({ row: ri, col: ci, ...m })));
  const needRows = cells.map((cs) => Math.max(...cs.map((c) => c.needH)));
  const natural = needRows.reduce((a, b) => a + b, 0);
  if (natural <= region.h) {
    layout.rowHeights = [...needRows];
    return { height: Math.max(0.05, natural), layout, cells, natural };
  }
  const each = region.h / n;
  layout.rowHeights = rows.map(() => each);
  // Exact-sum enforcement: fp division must not leave the contract
  // claiming a total the element box does not have.
  layout.rowHeights[n - 1] += region.h - layout.rowHeights.reduce((a, b) => a + b, 0);
  return { height: region.h, layout, cells, natural };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function tableElement(
  id: string,
  semanticRef: string,
  box: Box,
  rows: string[][],
  header: boolean,
  z: number,
  design: DesignSystem,
  fit: { slideId: string; sink: FitDiagnostic[] },
): SceneElement {
  const { height, layout, cells } = tableLayout(design, rows, header, box);
  const shortToken = (t: string): string => (t.length > 32 ? `${t.slice(0, 32)}…` : t);
  for (const row of cells) {
    for (const c of row) {
      const role = c.row === 0 && header ? "header" : "body";
      // A word wider than its column breaks mid-word in PowerPoint
      // with no report from any fitter — every fragment fits. The
      // finding names the token so the author can shorten it.
      if (c.word !== null) {
        fit.sink.push({
          slideId: fit.slideId, elementId: id, semanticRef,
          role,
          kind: "table-cell-overflow",
          message: `table cell r${c.row + 1}c${c.col + 1} token "${shortToken(c.word)}" needs ${round2(c.wordW)}in in a ${round2(Math.max(0.1, layout.colWidths[c.col] - 2 * TABLE_CELL_PAD))}in column — shorten the token`,
        });
        continue;
      }
      // Height overflow fires only when the text itself exceeds
      // the row: padding squeeze is cosmetic (and PowerPoint
      // reflows wrapped rows regardless), while text past the row
      // is structural. This keeps dense-but-honest tables quiet.
      if (c.lines * c.lineH > (layout.rowHeights[c.row] ?? 0) + 1e-9) {
        fit.sink.push({
          slideId: fit.slideId, elementId: id, semanticRef,
          role,
          kind: "table-cell-overflow",
          message: `table cell r${c.row + 1}c${c.col + 1} needs ${round2(c.needH)}in for ${c.lines} lines, row has ${round2(layout.rowHeights[c.row] ?? 0)}in — cut cell copy`,
        });
      }
    }
  }
  return {
    id, kind: "table", x: box.x, y: box.y, w: box.w, h: height, z,
    provenance: "compiler", semanticRef,
    table: { rows: rows.map((r) => [...r]), header, layout },
  };
}

// Primary semantic carrier for any block in a region. Every kind maps to
// a native editable element; this is the no-silent-loss guarantee.
function renderBlockPrimary(
  ctx: MechanismCtx,
  block: ContentBlock,
  region: Box,
  z: number,
  opts?: { centerSparse?: boolean },
): SceneElement {
  const design = ctx.design;
  const slideId = ctx.slide.id;
  const id = primaryId(slideId, block.id);
  const fitBase = { design, slideId, sink: ctx.sink };
  switch (block.kind) {
    case "image":
      return {
        id, kind: "image", x: region.x, y: region.y, w: region.w, h: region.h, z,
        provenance: "compiler", semanticRef: block.id,
        image: { src: block.src ?? "", alt: block.alt ?? "" },
      };
    case "chart": {
      const labels = chartLabelStyle(design);
      assessChartCapacity(design, block, region, { slideId, elementId: id, semanticRef: block.id, sink: ctx.sink });
      return {
        id, kind: "chart", x: region.x, y: region.y, w: region.w, h: region.h, z,
        provenance: "compiler", semanticRef: block.id,
        chart: {
          chartKind: chartKindFor(block),
          categories: [...(block.categories ?? [])],
          series: (block.series ?? []).map((s) => ({ name: s.name, values: [...s.values] })),
          labels,
        },
      };
    }
    case "table": {
      return tableElement(id, block.id, region, block.rows ?? [], block.header === true, z, design, { slideId, sink: ctx.sink });
    }
    default: {
      const { paras, policy } = blockParas(block, design);
      // Sparse centering applies only to frameless running text.
      // Stats keep their tile geometry; images, charts, and tables
      // never reach this branch. Measurement lives in text-fit.ts so
      // mechanisms never do height arithmetic for layout.
      const center = opts?.centerSparse === true &&
        (block.kind === "text" || block.kind === "list" || block.kind === "quote" || block.kind === "callout");
      const box = center ? centerSparseBox(design, region, paras as RoleParagraph[]) : region;
      return textEl(id, block.id, box, paras, z, { ...fitBase, policy });
    }
  }
}

// Deterministic caveat label from the authored enum. No invented prose:
// the label IS the semantic metadata, upper-cased for badge treatment.
export function caveatLabel(uncertainty: string): string {
  return uncertainty.toUpperCase().replace(/-/g, " ");
}

function toneFor(outcomeTreatments: { blockId: string; tone: string }[], block: ContentBlock): string {
  const t = outcomeTreatments.find((o) => o.blockId === block.id);
  return t?.tone ?? "neutral";
}

// Structural tone rail: cautionary content gets a narrow rule rail at
// the region's left edge instead of accent-forward treatment. The rail
// never covers content: it occupies a 0.08in edge band outside the
// content box. No red/green semantics, no factual rewrite.
// Balanced/neutral/affirming add no rail.

// Proportional space distribution that always yields finite, positive
// heights. Content may overflow its box textually (V2-3E fit exposes
// that); the compilePlannedSlide canvas clamp keeps every footprint
// in-bounds as a last resort.
function distribute(available: number, weights: number[], floor: number): number[] {
  if (!weights.length) return [];
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const shares = weights.map((w) => Math.max(floor, (available * w) / total));
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum <= available) return shares;
  return shares.map((s) => Math.max(0.2, (s / sum) * available));
}

// Caveat band height and the gap attaching a caveat to a centered
// carrier. The gap matches inter-block rhythm; attachment never
// moves text, only chooses where the reserved band sits.
const CAVEAT_H = 0.35;
const CAVEAT_GAP = 0.1;

// Capacity planning slack, in inches, added to every measured text
// demand. The fitter remains the authority — this absorbs
// heuristic/grid fp edges so an exactly-fitting allocation seats at
// nominal scale instead of misfiring a diagnostic, mirroring the
// sparse-centering slack's reasoning. Generous is safe (trailing
// whitespace); tight is not (spurious floor-hits).
const CAPACITY_SLACK = 0.25;
// Minimum useful heights: a side card below this reads as a sliver
// whatever it holds; a support block below this cannot carry a line.
const MIN_SIDE_ROW = 0.8;
const MIN_SUPPORT = 0.4;

interface MechanismCtx {
  slide: SlideIntent;
  comp: SlideCompositionPlan;
  design: DesignSystem;
  box: Box & { bottom: number };
  sink: FitDiagnostic[];
  // Canonical top-right crest reservation for the standard content
  // title box, applied BEFORE fitting. Zero when no primary crest
  // earns reservation. Divider/full-bleed titles are untouched.
  topRightReserve: number;
}

// Places one block's primary carrier plus its semantic treatments in a
// region. The single call site for block realization keeps survival,
// tone, and caveat behavior uniform across families, including custom
// native branches (pass `render` to build a non-default primary, e.g.
// the chart-to-table fallback, while keeping shared treatments).
// Caveats own reserved space inside the region; the tone rail occupies
// a narrow edge band beside the primary carrier, never covering
// content. The rail follows the carrier's actual box, so it annotates
// centered content exactly rather than the full allocation.
function placePrimary(
  ctx: MechanismCtx,
  els: SceneElement[],
  block: ContentBlock,
  region: Box,
  takeZ: () => number,
  render?: (region: Box, z: number) => SceneElement,
  opts?: { centerSparse?: boolean },
): SceneElement {
  const needsCaveat = block.uncertainty !== undefined;
  const caveatH = needsCaveat ? CAVEAT_H : 0;
  const tone = toneFor(ctx.comp.outcomeTreatments, block);
  const railW = tone === "cautionary" ? 0.12 : 0;
  const contentRegion: Box = {
    x: region.x + railW,
    y: region.y,
    w: Math.max(0.1, region.w - railW),
    h: Math.max(0.2, region.h - (needsCaveat ? caveatH + 0.05 : 0)),
  };
  const primary = render
    ? render(contentRegion, takeZ())
    : renderBlockPrimary(ctx, block, contentRegion, takeZ(), opts);
  els.push(primary);
  if (tone === "cautionary") {
    els.push(shapeEl(`${ctx.slide.id}:${block.id}:tone`, block.id,
      { x: region.x, y: primary.y, w: 0.08, h: primary.h }, "rect",
      ctx.design.palette.rule.hex, takeZ()));
  }
  if (needsCaveat) {
    // Attached caveats follow a centered frameless carrier (carrier
    // bottom + gap); everything else keeps the historical
    // region-bottom band. Attachment is proven to fit whenever
    // centering fired, and the fallback guards fp edges and future
    // callers — so the band never leaves the region and never covers
    // the primary, the next block, takeaway reserves, or chrome.
    // Tables, charts, images, stats, custom renders, and framed
    // content always take the region-bottom band by design: native
    // table geometry plus unit-caption interplay make attachment
    // unsafe there without per-cell measurement, which is V2-3F-8's
    // boundary, not this slice's.
    const centered = !render && primary.kind === "text" &&
      (primary.y !== contentRegion.y || primary.h !== contentRegion.h);
    const attachedY = primary.y + primary.h + CAVEAT_GAP;
    const box = centered && attachedY + CAVEAT_H <= region.y + region.h + 1e-9
      ? { x: primary.x, y: attachedY, w: primary.w, h: CAVEAT_H }
      : { x: region.x, y: region.y + region.h - caveatH, w: region.w, h: caveatH };
    const el = caveatEl(ctx, block, box, takeZ());
    if (el) els.push(el);
  }
  return primary;
}

function caveatEl(
  ctx: MechanismCtx,
  block: ContentBlock,
  box: Box,
  z: number,
): SceneElement | null {
  if (block.uncertainty === undefined) return null;
  const design = ctx.design;
  return textEl(
    `${ctx.slide.id}:${block.id}:caveat`,
    block.id,
    box,
    [{ runs: [{ text: caveatLabel(block.uncertainty), role: "caption", bold: true, color: design.palette.inkMuted.hex }], align: "left" as const }],
    z,
    { design, slideId: ctx.slide.id, sink: ctx.sink },
  );
}

function titleBox(ctx: MechanismCtx, rs: { role: string; size: number }, z: number): { el: SceneElement; below: number } {
  const { slide, design, box } = ctx;
  const h = 1.0;
  // The heading narrows for the crest reservation with a positive
  // minimum; the fitter measures this narrower box, never the full
  // width. Crest-side geometry, not a redesign.
  const w = Math.max(1.0, box.w - ctx.topRightReserve);
  const el = textEl(
    `${slide.id}:title:heading`,
    undefined,
    { x: box.x, y: box.y, w, h },
    [{ runs: [{ text: slide.title ?? "", role: rs.role, size: rs.size, bold: true, color: ink(design) }], align: "left" as const }],
    z,
    { design, slideId: slide.id, sink: ctx.sink },
  );
  return { el, below: box.y + h + 0.15 };
}

function headlineSize(ctx: MechanismCtx): { role: string; size: number } {
  const density = ctx.comp.densityClass;
  if (density === "sparse") return { role: "display", size: ctx.design.roles.display?.size ?? 40 };
  if (density === "dense") return { role: "subhead", size: ctx.design.roles.subhead?.size ?? 15 };
  return { role: "heading", size: roleSize(ctx.design, "heading", 30) };
}

function takeawayReserve(ctx: MechanismCtx): number {
  if (!ctx.slide.takeaway || ctx.comp.takeawayTreatment === "none") return 0;
  if (ctx.comp.takeawayTreatment === "verdict") return 0.9;
  return 0.6;
}

function takeawayEls(ctx: MechanismCtx, titleBelow: number, contentBottom: number, z: number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  if (!slide.takeaway) return [];
  const color = ink(design);
  const bodySize = roleSize(design, "body", 13);
  const fitBase = { design, slideId: slide.id, sink: ctx.sink };
  switch (comp.takeawayTreatment) {
    case "headline":
      return [textEl(`${slide.id}:takeaway:headline`, undefined,
        { x: box.x, y: titleBelow, w: box.w, h: 0.7 },
        [{ runs: [{ text: slide.takeaway, role: "body", size: bodySize + 2, bold: true, color }], align: "left" as const }], z, fitBase)];
    case "verdict":
      return [textEl(`${slide.id}:takeaway:verdict`, undefined,
        { x: box.x, y: contentBottom - 0.8, w: box.w, h: 0.8 },
        [{ runs: [{ text: slide.takeaway, role: "body", size: bodySize, bold: true, color: design.palette.accent.hex }], align: "center" as const }], z, fitBase)];
    case "annotation":
      return [textEl(`${slide.id}:takeaway:annotation`, undefined,
        { x: box.x, y: contentBottom - 0.5, w: box.w, h: 0.5 },
        [{ runs: [{ text: slide.takeaway, role: "caption", italic: true, color: design.palette.inkMuted.hex }], align: "left" as const }], z, fitBase)];
    default:
      return [];
  }
}

function dividerScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const titleY = comp.variantKey === "divider/opening" ? box.y + 1.4
    : comp.variantKey === "divider/transition" ? box.y + 0.8
    : box.y + 0.4;
  els.push(textEl(
    `${slide.id}:title:heading`, undefined,
    { x: box.x, y: titleY, w: box.w, h: 1.4 },
    [{ runs: [{ text: slide.title ?? "", role: "display", bold: true, color: ink(design) }], align: "center" as const }],
    takeZ(),
    fitOf(ctx),
  ));
  let y = titleY + 1.6;
  const bottom = box.bottom - takeawayReserve(ctx);
  if (slide.takeaway && comp.takeawayTreatment !== "none") {
    els.push(...takeawayEls(ctx, y, bottom, takeZ()));
    y += 0.9;
  }
  const heights = distribute(Math.max(0.4, bottom - y), slide.blocks.map(() => 1), 0.4);
  slide.blocks.forEach((block, i) => {
    const h = heights[i];
    const el = placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h: Math.max(0.2, h - 0.1) }, takeZ, undefined, { centerSparse: true });
    if (el.kind === "text" && el.paragraphs) {
      for (const p of el.paragraphs) p.align = "center";
    }
    y += h;
  });
  return els;
}

function proseListScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - takeawayReserve(ctx) - (hasHeadlineTakeaway ? 0 : 0);
  void bottom;
  const contentBottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const heights = distribute(Math.max(0.4, contentBottom - y), slide.blocks.map(() => 1), 0.4);
  slide.blocks.forEach((block, i) => {
    const h = heights[i];
    if (comp.variantKey === "prose-list/evidence") {
      // The rule annotates the carrier: build the carrier first so the
      // rule follows its actual (possibly centered) geometry. The rule
      // keeps its established array position and z sequence; only its
      // y/h track the carrier instead of the full allocation.
      const ruleZ = takeZ();
      const primary = placePrimary(ctx, els, block, { x: box.x + 0.25, y, w: box.w - 0.25, h: Math.max(0.2, h - 0.15) }, takeZ, undefined, { centerSparse: true });
      els.splice(els.indexOf(primary), 0, shapeEl(`${slide.id}:${block.id}:rule`, block.id,
        { x: box.x, y: primary.y, w: 0.06, h: primary.h }, "rect", design.palette.accent.hex, ruleZ));
    } else {
      placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h: Math.max(0.2, h - 0.15) }, takeZ, undefined, { centerSparse: true });
    }
    y += h;
  });
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

function cardGridScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const primaries = slide.blocks.filter((b) => comp.emphasisTargets.includes(b.id));
  const rest = slide.blocks.filter((b) => !comp.emphasisTargets.includes(b.id));
  const gap = 0.3;
  const primaryHeights = distribute(Math.max(0.4, bottom - y) - gap * primaries.length, primaries.map(() => 1.6), 0.8);
  primaries.forEach((block, pi) => {
    const h = primaryHeights[pi];
    els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
      { x: box.x, y, w: box.w, h }, "roundRect", design, takeZ()));
    placePrimary(ctx, els, block, { x: box.x + 0.3, y: y + 0.15, w: box.w - 0.6, h: Math.max(0.2, h - 0.3) }, takeZ);
    y += h + gap;
  });
  if (rest.length) {
    const dense = comp.densityClass === "dense";
    const cols = rest.length <= 2 ? rest.length : dense ? 3 : 2;
    const rows = Math.ceil(rest.length / cols);
    const cw = (box.w - gap * (cols - 1)) / cols;
    const heights = distribute(Math.max(0.4, bottom - y) - gap * rows, rest.map(() => 1), 0.6);
    let ri = 0;
    rest.forEach((block, i) => {
      if (i % cols === 0 && i > 0) {
        y += heights[ri] + gap;
        ri++;
      }
      const ch = heights[Math.min(ri, heights.length - 1)];
      const cx = box.x + (i % cols) * (cw + gap);
      els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: cx, y, w: cw, h: ch }, "roundRect", design, takeZ()));
      placePrimary(ctx, els, block, { x: cx + 0.25, y: y + 0.15, w: cw - 0.5, h: Math.max(0.2, ch - 0.3) }, takeZ);
    });
  }
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

// Nominal vertical demand of one block's flowing text at a carrier
// width: measured paragraphs plus planning slack plus the caveat
// band the shared placement path reserves for uncertain blocks.
// Pure measurement — fitting verifies inside the chosen geometry.
function textDemand(design: DesignSystem, block: ContentBlock, width: number): number {
  const { paras } = blockParas(block, design);
  return nominalContentHeight(design, paras, width) + CAPACITY_SLACK
    + (block.uncertainty !== undefined ? CAVEAT_H + 0.05 : 0);
}

// Intrinsic minimum for support blocks whose content is not flowing
// text: tables resolve their real natural height through the table
// layout contract; charts and images size by aspect the compiler
// must not probe, so they plan at the card minimum and the fitter
// keeps them honest.
function supportDemand(ctx: MechanismCtx, block: ContentBlock, width: number): number {
  const caveat = block.uncertainty !== undefined ? CAVEAT_H + 0.05 : 0;
  if (block.kind === "table") {
    const { height } = tableLayout(ctx.design, block.rows ?? [], block.header === true,
      { x: 0, y: 0, w: width, h: 1e6 });
    return height + caveat;
  }
  if (block.kind === "chart" || block.kind === "image") {
    return MIN_SIDE_ROW + caveat;
  }
  return textDemand(ctx.design, block, width);
}

// One side card's outer height: text demand inside the carrier
// insets (matching the frame/text geometry below) plus the card
// chrome, never below the card minimum. The cautionary rail takes
// width, not height, but it narrows the carrier the demand is
// measured against.
function sideDemand(ctx: MechanismCtx, block: ContentBlock, textW: number): number {
  const railW = toneFor(ctx.comp.outcomeTreatments, block) === "cautionary" ? 0.12 : 0;
  return Math.max(MIN_SIDE_ROW, textDemand(ctx.design, block, Math.max(0.5, textW - railW)) + 0.4);
}

function comparisonScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const sides = slide.blocks.filter((b) => b.kind === "text");
  const support = slide.blocks.filter((b) => b.kind !== "text");
  const gap = 0.4;
  const cols = Math.min(Math.max(sides.length, 1), 3);
  const cw = (box.w - gap * (cols - 1)) / cols;
  const verdictReserve = comp.takeawayTreatment === "verdict" && slide.takeaway ? 0.9 : 0;
  const bottom = box.bottom - verdictReserve - (comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  // Capacity-aware allocation: measure demand before dividing the
  // region, replacing the fixed supporting-content reservation.
  // Sides are what the family is named for, so they are served
  // first; support shares whatever the sides leave. Peer cards in
  // one row share the row's maximum demand, keeping alignment.
  // Fitting runs after final geometry is chosen and diagnoses
  // genuine overflow honestly — nothing shrinks below its floor.
  const textW = cw - 0.6;
  const sideRows = Math.ceil(sides.length / cols);
  const rowDemands: number[] = [];
  for (let r = 0; r < sideRows; r++) {
    let row = MIN_SIDE_ROW;
    for (let i = r * cols; i < Math.min(sides.length, (r + 1) * cols); i++) {
      row = Math.max(row, sideDemand(ctx, sides[i], textW));
    }
    rowDemands.push(row);
  }
  const rowsH = rowDemands.reduce((a, b) => a + b, 0) + gap * sideRows;
  const supportDemands = support.map((b) => Math.max(MIN_SUPPORT, supportDemand(ctx, b, box.w)));
  const supportH = supportDemands.reduce((a, b) => a + b, 0) + 0.1 * support.length;
  const available = bottom - y;
  let rowHs: number[];
  let supHs: number[];
  if (rowsH + supportH <= available) {
    rowHs = rowDemands;
    supHs = supportDemands;
  } else {
    // Scarce space splits proportional to need: each row keeps at
    // least the card minimum, support at least one line, and
    // anything still short of demand overflows into a fit diagnostic
    // rather than shrinking below readability.
    rowHs = rowsH <= available
      ? rowDemands
      : distribute(available - gap * sideRows, rowDemands, MIN_SIDE_ROW);
    const used = rowHs.reduce((a, b) => a + b, 0) + gap * sideRows;
    const rest = available - used;
    supHs = rest - 0.1 * support.length >= supportH - 0.1 * support.length
      ? supportDemands
      : distribute(Math.max(0.4, rest - 0.1 * support.length), supportDemands, MIN_SUPPORT);
  }
  let ri = 0;
  sides.forEach((block, i) => {
    if (i % cols === 0 && i > 0) {
      y += rowHs[ri] + gap;
      ri++;
    }
    const h = rowHs[Math.min(ri, rowHs.length - 1)];
    const x = box.x + (i % cols) * (cw + gap);
    els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
      { x, y, w: cw, h }, "roundRect", design, takeZ()));
    placePrimary(ctx, els, block, { x: x + 0.3, y: y + 0.2, w: cw - 0.6, h: Math.max(0.2, h - 0.4) }, takeZ);
  });
  y += rowHs[rowHs.length - 1] + gap;
  const supportHeights = supHs;
  support.forEach((block, i) => {
    const h = supportHeights[i];
    if (block.kind === "callout" && comp.takeawayTreatment !== "verdict" && !slide.takeaway) {
      // A lone callout carries the verdict styling of this comparison.
      // Outcome and uncertainty treatments still apply orthogonally.
      placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ);
      els.push(shapeEl(`${slide.id}:${block.id}:rule`, block.id,
        { x: box.x, y, w: box.w, h: 0.06 }, "rect", design.palette.accent.hex, takeZ()));
    } else {
      placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ);
    }
    y += h + 0.1;
  });
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

function dataTableScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const heights = distribute(Math.max(0.4, bottom - y) - 0.1 * slide.blocks.length, slide.blocks.map(() => 1), 0.5);
  slide.blocks.forEach((block, i) => {
    const h = heights[i];
    if (block.kind === "table") {
      placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ);
    } else if (block.kind === "chart") {
      // Honest fallback: exact values as an editable table, never a fake chart.
      const series = block.series ?? [];
      const header = ["", ...series.map((s) => s.name)];
      const rows = (block.categories ?? []).map((c, ci) => [c, ...series.map((s) => String(s.values[ci] ?? ""))]);
      const capH = block.unit !== undefined ? 0.3 : 0;
      const tableRegion = { x: box.x, y, w: box.w, h: Math.max(0.2, h - capH) };
      placePrimary(ctx, els, block, tableRegion, takeZ, (region, z) => tableElement(
        primaryId(slide.id, block.id), block.id, region,
        [header, ...rows], true, z, design, { slideId: slide.id, sink: ctx.sink },
      ));
      if (block.unit !== undefined) {
        els.push(textEl(`${slide.id}:${block.id}:caption`, block.id,
          { x: box.x, y: y + h - capH, w: box.w, h: capH },
          [{ runs: [{ text: `Unit: ${block.unit}. Values as authored.`, role: "caption", color: design.palette.inkMuted.hex }], align: "left" as const }],
          takeZ(), fitOf(ctx)));
      }
    } else {
      placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ);
    }
    y += h + 0.1;
  });
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

function metricScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const stats = slide.blocks.filter((b) => b.kind === "stat");
  const rest = slide.blocks.filter((b) => b.kind !== "stat");
  const gap = 0.3;
  if (stats.length) {
    // Primary stats claim double width shares; tone never changes shares.
    const shares = stats.map((b) => (comp.emphasisTargets.includes(b.id) ? 2 : 1));
    const total = shares.reduce((a, b) => a + b, 0);
    const tileH = Math.max(1.2, (bottom - y - (rest.length ? 1.4 : 0)) * 0.55);
    let x = box.x;
    stats.forEach((block, i) => {
      const w = ((box.w - gap * (stats.length - 1)) * shares[i]) / total;
      els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
        { x, y, w, h: tileH }, "roundRect", design, takeZ()));
      placePrimary(ctx, els, block, { x: x + 0.3, y: y + 0.2, w: w - 0.6, h: tileH - 0.4 }, takeZ);
      x += w + gap;
    });
    y += tileH + gap;
  }
  const heights = distribute(Math.max(0.4, bottom - y) - 0.1 * rest.length, rest.map(() => 1), 0.4);
  rest.forEach((block, i) => {
    const h = heights[i];
    placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ);
    y += h + 0.1;
  });
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

const MEASURE_KIND: Record<string, "bar" | "hbar" | "line" | "pie" | "doughnut" | "area"> = {
  comparison: "bar",
  trend: "line",
  composition: "doughnut",
};

function chartKindFor(block: ContentBlock): "bar" | "hbar" | "line" | "pie" | "doughnut" | "area" {
  if (block.chartKind !== undefined) return block.chartKind;
  if (block.measure !== undefined) return MEASURE_KIND[block.measure] ?? "bar";
  return "bar";
}

// Resolved chart label typography: the caption role's family and
// nominal size in the muted ink secondary text deserves. Labels
// never shrink — the size below is the floor as well as the
// nominal, so unreadable labels diagnose instead of shrinking.
function chartLabelStyle(design: DesignSystem): { family: string; size: number; color: string } {
  const { run } = resolveRunStyle(design, "caption", { color: design.palette.inkMuted.hex });
  return { family: run.family, size: run.size, color: run.color };
}

const shortLabel = (t: string): string => (t.length > 40 ? `${t.slice(0, 40)}…` : t);

// Bounded native chart capacity assessment. PowerPoint lays out
// axes and legends by client rules the scene cannot see, so the
// compiler checks what it can prove with footprint arithmetic
// alone: no word wider than the chart itself (impossible
// everywhere), no category word wider than its slot on cartesian
// charts (collides at any size), no label line taller than its row
// on hbar charts, and no legend volume larger than the chart. Full
// sentences that merely wrap are PowerPoint's own wrapping to
// absorb — only unbreakable words and exhausted space diagnose.
function assessChartCapacity(
  design: DesignSystem,
  block: ContentBlock,
  region: Box,
  report: { slideId: string; elementId: string; semanticRef: string; sink: FitDiagnostic[] },
): void {
  const { fit } = resolveRunStyle(design, "caption", {});
  const lineH = fit.size / 72 * (fit.line ?? 1.35);
  const emit = (message: string): void => {
    report.sink.push({
      slideId: report.slideId, elementId: report.elementId, semanticRef: report.semanticRef,
      role: "caption", kind: "chart-label-overflow", message,
    });
  };
  const cats = (block.categories ?? []).map((c) => String(c ?? ""));
  const names = (block.series ?? []).map((s) => String(s.name ?? ""));
  const kind = chartKindFor(block);
  const wordsOf = (t: string): string[] => t.split(/\s+/).filter(Boolean);
  const longest = (t: string): { word: string; w: number } => {
    let word = "";
    let w = 0;
    for (const cand of wordsOf(t)) {
      const cw = measure(cand, fit);
      if (cw > w) {
        word = cand;
        w = cw;
      }
    }
    return { word, w };
  };
  const cartesian = kind === "bar" || kind === "line" || kind === "area";
  const slotW = region.w / Math.max(1, cats.length);
  for (const label of cats) {
    const { word, w } = longest(label);
    if (word === "") continue;
    if (w > Math.max(0.1, region.w)) {
      emit(`chart ${kind} label "${shortLabel(label)}" carries a ${round2(w)}in word in a ${round2(region.w)}in chart — shorten the label`);
    } else if (cartesian && w > Math.max(0.1, slotW)) {
      emit(`chart ${kind} category "${shortLabel(label)}" needs ${round2(w)}in in a ${round2(slotW)}in slot — shorten the label or widen the chart`);
    }
  }
  for (const label of names) {
    const { word, w } = longest(label);
    if (word === "") continue;
    if (w > Math.max(0.1, region.w)) {
      emit(`chart ${kind} series "${shortLabel(label)}" carries a ${round2(w)}in word in a ${round2(region.w)}in chart — shorten the name`);
    }
  }
  if (kind === "hbar") {
    const slotH = region.h / Math.max(1, cats.length);
    if (cats.length > 0 && lineH > slotH) {
      emit(`chart hbar has ${cats.length} rows in ${round2(region.h)}in — labels need ${round2(lineH)}in each; cut categories or grow the chart`);
    }
  }
  const legend = [...names, ...((kind === "pie" || kind === "doughnut") && names.length <= 1 ? cats : [])];
  const { lines: legendLines, lineH: legendLineH } = measureLegendLines(design, legend, region.w);
  if (legendLines * legendLineH > region.h) {
    emit(`chart ${kind} legend needs ${round2(legendLines * legendLineH)}in in a ${round2(region.h)}in chart — shorten series names`);
  }
}

function chartScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const charts = slide.blocks.filter((b) => b.kind === "chart");
  const rest = slide.blocks.filter((b) => b.kind !== "chart");
  const chartH = rest.length
    ? Math.max(1.5, (bottom - y) * (comp.densityClass === "sparse" ? 0.7 : 0.6))
    : Math.max(1.5, bottom - y);
  charts.forEach((block, i) => {
    const h = charts.length > 1 ? Math.max(1.0, (chartH - 0.3 * (charts.length - 1)) / charts.length) : chartH;
    const cy = y + (charts.length > 1 ? i * (h + 0.3) : 0);
    const capH = (block.unit !== undefined ? 0.3 : 0) + (block.caption ? 0.4 : 0);
    const chartRegion = { x: box.x, y: cy, w: box.w, h: Math.max(0.4, h - capH) };
    placePrimary(ctx, els, block, chartRegion, takeZ);
    let ty = cy + Math.max(0.4, h - capH);
    if (block.unit !== undefined) {
      els.push(textEl(`${slide.id}:${block.id}:unit`, block.id,
        { x: box.x, y: ty, w: box.w, h: 0.3 },
        [{ runs: [{ text: `Unit: ${block.unit}`, role: "caption", color: design.palette.inkMuted.hex }], align: "left" as const }],
        takeZ(), fitOf(ctx)));
      ty += 0.3;
    }
    if (block.caption) {
      els.push(textEl(`${slide.id}:${block.id}:caption`, block.id,
        { x: box.x, y: ty, w: box.w, h: 0.4 },
        [{ runs: [{ text: block.caption, role: "caption", color: design.palette.inkMuted.hex }], align: "center" as const }],
        takeZ(), fitOf(ctx)));
    }
  });
  let ry = y + chartH + 0.2;
  const heights = distribute(Math.max(0.4, bottom - ry) - 0.1 * rest.length, rest.map(() => 1), 0.3);
  rest.forEach((block, i) => {
    const h = heights[i];
    placePrimary(ctx, els, block, { x: box.x, y: ry, w: box.w, h }, takeZ);
    ry += h + 0.1;
  });
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, ry, box.bottom, takeZ()));
  }
  return els;
}

function sequenceScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const steps = slide.blocks.filter((b) => b.kind === "text");
  const rest = slide.blocks.filter((b) => b.kind !== "text");
  const gap = 0.3;
  if (comp.variantKey === "sequence/cycle" && steps.length >= 2) {
    // Closed arrangement on an ellipse; authored order defines cycle
    // order; numbered badges plus connectors carry direction (no
    // arrowhead primitive exists in the scene contract).
    const cx = box.x + box.w / 2;
    const cy = (y + bottom) / 2;
    const rx = Math.max(0.5, box.w / 2 - 1.2);
    const ry = Math.max(0.8, (bottom - y) / 2 - 0.8);
    const cw = 2.2;
    const ch = 1.1;
    steps.forEach((block, i) => {
      const ang = (2 * Math.PI * i) / steps.length - Math.PI / 2;
      const px = cx + rx * Math.cos(ang) - cw / 2;
      const py = cy + ry * Math.sin(ang) - ch / 2;
      els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: px, y: py, w: cw, h: ch }, "ellipse", design, takeZ()));
      placePrimary(ctx, els, block, { x: px + 0.2, y: py + 0.15, w: cw - 0.4, h: ch - 0.3 }, takeZ);
      const nx = cx + rx * Math.cos((2 * Math.PI * (i + 1)) / steps.length - Math.PI / 2);
      const ny = cy + ry * Math.sin((2 * Math.PI * (i + 1)) / steps.length - Math.PI / 2);
      els.push({
        id: `${slide.id}:${block.id}:link`, kind: "line",
        x: px + cw / 2, y: py + ch / 2, w: 0.01, h: 0.01, z: takeZ(),
        provenance: "compiler", semanticRef: block.id,
        line: { x2: nx, y2: ny, stroke: design.palette.rule.hex, strokeWidth: 1.5 },
      });
    });
    y = bottom;
  } else {
    const n = Math.max(steps.length, 1);
    const cw = (box.w - gap * (n - 1)) / n;
    const heights = distribute(Math.max(0.8, bottom - y) - (rest.length ? 1.2 : 0), steps.map(() => 1), 0.8);
    steps.forEach((block, i) => {
      const h = heights[i];
      const x = box.x + i * (cw + gap);
      els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
        { x, y, w: cw, h }, "roundRect", design, takeZ()));
      els.push(textEl(`${slide.id}:${block.id}:badge`, block.id,
        { x: x + 0.2, y: y + 0.15, w: 0.4, h: 0.4 },
        [{ runs: [{ text: String(i + 1), role: "subhead", bold: true, color: design.palette.accent.hex }], align: "left" as const }],
        takeZ(), { ...fitOf(ctx), policy: "one-line" }));
      placePrimary(ctx, els, block, { x: x + 0.2, y: y + 0.6, w: cw - 0.4, h: Math.max(0.2, h - 0.8) }, takeZ);
      if (comp.variantKey === "sequence/cause-effect" && i < steps.length - 1) {
        els.push({
          id: `${slide.id}:${block.id}:link`, kind: "line",
          x: x + cw, y: y + h / 2, w: 0.01, h: 0.01, z: takeZ(),
          provenance: "compiler", semanticRef: block.id,
          line: { x2: x + cw + gap, y2: y + h / 2, stroke: design.palette.accent.hex, strokeWidth: 2 },
        });
      }
    });
    y += heights[heights.length - 1] + gap;
    const restHeights = distribute(Math.max(0.4, bottom - y) - 0.1 * rest.length, rest.map(() => 1), 0.3);
    rest.forEach((block, i) => {
      const h = restHeights[i];
      placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ);
      y += h + 0.1;
    });
  }
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

function hierarchyScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const gap = 0.4;
  if (!slide.blocks.length) return els;
  // Conservative tiers from authored order only: first block is the
  // parent tier, the rest share the child tier. No invented edges.
  const parentH = Math.max(1.0, (bottom - y) * 0.32);
  const parent = slide.blocks[0];
  els.push(cardEl(`${slide.id}:${parent.id}:frame`, parent.id,
    { x: box.x, y, w: box.w, h: parentH }, "roundRect", design, takeZ()));
  placePrimary(ctx, els, parent, { x: box.x + 0.3, y: y + 0.15, w: box.w - 0.6, h: Math.max(0.2, parentH - 0.3) }, takeZ);
  y += parentH + gap;
  const children = slide.blocks.slice(1);
  if (children.length) {
    const cols = Math.min(children.length, 3);
    const rows = Math.ceil(children.length / cols);
    const cw = (box.w - gap * (cols - 1)) / cols;
    const heights = distribute(Math.max(0.6, bottom - y) - gap * rows, children.map(() => 1), 0.6);
    let ri = 0;
    children.forEach((block, i) => {
      if (i % cols === 0 && i > 0) {
        y += heights[ri] + gap;
        ri++;
      }
      const ch = heights[Math.min(ri, heights.length - 1)];
      const cx = box.x + (i % cols) * (cw + gap);
      els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: cx, y, w: cw, h: ch }, "roundRect", design, takeZ()));
      placePrimary(ctx, els, block, { x: cx + 0.25, y: y + 0.15, w: cw - 0.5, h: Math.max(0.2, ch - 0.3) }, takeZ);
    });
  }
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

function mediaLedScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const images = slide.blocks.filter((b) => b.kind === "image");
  const rest = slide.blocks.filter((b) => b.kind !== "image");
  const gap = 0.5;
  const share = comp.mediaTreatment === "dominant" ? 0.65
    : comp.mediaTreatment === "subordinate" ? 0.3
    : 0.45;
  const mediaW = images.length ? (box.w - gap) * share : 0;
  const textW = images.length ? box.w - mediaW - gap : box.w;
  const mediaX = box.x;
  const textX = box.x + mediaW + gap;
  const h = Math.max(0.5, bottom - y);
  const imageHeights = distribute(h - 0.2 * images.length, images.map(() => 1), 0.5);
  let my = y;
  images.forEach((block, i) => {
    const ih = imageHeights[i];
    placePrimary(ctx, els, block, { x: mediaX, y: my, w: mediaW, h: ih }, takeZ);
    if (comp.variantKey === "media-led/evidence" && block.alt) {
      els.push(textEl(`${slide.id}:${block.id}:caption`, block.id,
        { x: mediaX, y: my + ih - 0.35, w: mediaW, h: 0.35 },
        [{ runs: [{ text: block.alt, role: "caption", color: design.palette.inkMuted.hex }], align: "left" as const }],
        takeZ(), fitOf(ctx)));
    }
    my += ih + 0.2;
  });
  const restHeights = distribute(h - 0.1 * rest.length, rest.map(() => 1), 0.3);
  let ry = y;
  rest.forEach((block, i) => {
    const rh = restHeights[i];
    placePrimary(ctx, els, block, { x: textX, y: ry, w: textW, h: rh }, takeZ);
    ry += rh + 0.1;
  });
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

function framedProseScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, design, box, comp } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const heights = distribute(Math.max(0.6, bottom - y) - 0.2 * slide.blocks.length, slide.blocks.map(() => 1.2), 0.6);
  slide.blocks.forEach((block, i) => {
    const h = heights[i];
    if (comp.variantKey === "framed-prose/limitation") {
      // Bordered card: rule-border frame plus inset content.
      els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: box.x, y, w: box.w, h }, "roundRect", design, takeZ()));
      placePrimary(ctx, els, block, { x: box.x + 0.4, y: y + 0.2, w: box.w - 0.8, h: Math.max(0.2, h - 0.4) }, takeZ);
    } else if (comp.variantKey === "framed-prose/recommendation" || comp.variantKey === "framed-prose/conclusion") {
      // Filled card with an accent top rule.
      els.push(cardEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: box.x, y, w: box.w, h }, "roundRect", design, takeZ()));
      els.push(shapeEl(`${slide.id}:${block.id}:rule`, block.id,
        { x: box.x, y, w: box.w, h: 0.08 }, "rect", design.palette.accent.hex, takeZ()));
      placePrimary(ctx, els, block, { x: box.x + 0.4, y: y + 0.3, w: box.w - 0.8, h: Math.max(0.2, h - 0.5) }, takeZ);
    } else {
      placePrimary(ctx, els, block, { x: box.x + 0.6, y, w: box.w - 1.2, h }, takeZ, undefined, { centerSparse: true });
    }
    y += h + 0.2;
  });
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

function escapeScene(ctx: MechanismCtx, takeZ: () => number): SceneElement[] {
  const { slide, box } = ctx;
  const els: SceneElement[] = [];
  const { el: title, below } = titleBox(ctx, headlineSize(ctx), takeZ());
  els.push(title);
  const hasHeadlineTakeaway = slide.takeaway !== undefined && ctx.comp.takeawayTreatment === "headline";
  let y = hasHeadlineTakeaway ? below + 0.7 : below;
  if (hasHeadlineTakeaway) els.push(...takeawayEls(ctx, below, box.bottom, takeZ()));
  const bottom = box.bottom - (ctx.comp.takeawayTreatment === "verdict" || ctx.comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const heights = distribute(Math.max(0.4, bottom - y) - 0.1 * slide.blocks.length, slide.blocks.map(() => 1), 0.3);
  slide.blocks.forEach((block, i) => {
    const h = heights[i];
    placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ, undefined, { centerSparse: true });
    y += h + 0.1;
  });
  if (ctx.comp.takeawayTreatment === "verdict" || ctx.comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
}

export function compilePlannedSlide(
  slide: SlideIntent,
  comp: SlideCompositionPlan,
  design: DesignSystem,
  sink: FitDiagnostic[] = [],
  chrome: SlideChromePlan | null = null,
  backgrounds: SlideBackgrounds | null = null,
): SlideScene {
  const grounded = designForSurface(design, comp, backgrounds);
  const box = contentBox(grounded);
  const ctx: MechanismCtx = { slide, comp, design: grounded, box, sink, topRightReserve: chrome?.topRightReserve ?? 0 };
  let z = 0;
  const takeZ = (): number => (z += 10);
  let elements: SceneElement[];
  switch (comp.family) {
    case "divider": elements = dividerScene({ ...ctx }, takeZ); break;
    case "prose-list": elements = proseListScene({ ...ctx }, takeZ); break;
    case "card-grid": elements = cardGridScene({ ...ctx }, takeZ); break;
    case "comparison": elements = comparisonScene({ ...ctx }, takeZ); break;
    case "data-table": elements = dataTableScene({ ...ctx }, takeZ); break;
    case "metric": elements = metricScene({ ...ctx }, takeZ); break;
    case "chart": elements = chartScene({ ...ctx }, takeZ); break;
    case "sequence": elements = sequenceScene({ ...ctx }, takeZ); break;
    case "hierarchy": elements = hierarchyScene({ ...ctx }, takeZ); break;
    case "media-led": elements = mediaLedScene({ ...ctx }, takeZ); break;
    case "framed-prose": elements = framedProseScene({ ...ctx }, takeZ); break;
    case "escape": elements = escapeScene({ ...ctx }, takeZ); break;
    default: elements = escapeScene({ ...ctx }, takeZ); break;
  }
  void takeZ;
  if (chrome) {
    // Chrome renders above ordinary content on the continuing z
    // sequence: deterministic for identical inputs, stable across
    // recompiles, never derived from array length.
    elements.push(...emitChromeElements(chrome, takeZ));
  }
  return {
    id: slide.id,
    width: SCENE_W,
    height: SCENE_H,
    background: sceneBackground(design, comp, backgrounds),
    elements: clampScene(elements),
    layoutState: "managed",
    recipeId: comp.family,
  };
}

// Last-resort canvas clamp: representative fixtures never trigger it
// (their geometry is honestly budgeted above); pathological density
// cannot produce off-canvas or degenerate boxes because of it.
function clampScene(elements: SceneElement[]): SceneElement[] {
  const clampBox = (x: number, y: number, w: number, h: number): [number, number, number, number] => {
    const cx = Math.min(Math.max(x, 0), SCENE_W - 0.05);
    const cy = Math.min(Math.max(y, 0), SCENE_H - 0.05);
    return [cx, cy, Math.max(0.05, Math.min(w, SCENE_W - cx)), Math.max(0.05, Math.min(h, SCENE_H - cy))];
  };
  const walk = (els: SceneElement[]): SceneElement[] => els.map((el) => {
    const [x, y, w, h] = clampBox(el.x, el.y, el.w, el.h);
    const out = { ...el, x, y, w, h };
    if (el.kind === "line" && el.line) {
      out.line = {
        ...el.line,
        x2: Math.min(Math.max(el.line.x2, 0), SCENE_W),
        y2: Math.min(Math.max(el.line.y2, 0), SCENE_H),
      };
    }
    if (el.group?.children) out.group = { children: walk(el.group.children) };
    return out;
  });
  return walk(elements);
}
