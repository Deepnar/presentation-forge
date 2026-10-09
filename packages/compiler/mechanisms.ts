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
import { fittedTextEl, type FitDiagnostic, type FitPolicy, type RoleParagraph } from "./text-fit.ts";
import { emitChromeElements, type SlideChromePlan } from "./chrome.ts";

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

// Primary semantic carrier for any block in a region. Every kind maps to
// a native editable element; this is the no-silent-loss guarantee.
function renderBlockPrimary(
  ctx: MechanismCtx,
  block: ContentBlock,
  region: Box,
  z: number,
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
    case "chart":
      return {
        id, kind: "chart", x: region.x, y: region.y, w: region.w, h: region.h, z,
        provenance: "compiler", semanticRef: block.id,
        chart: {
          chartKind: chartKindFor(block),
          categories: [...(block.categories ?? [])],
          series: (block.series ?? []).map((s) => ({ name: s.name, values: [...s.values] })),
        },
      };
    case "table": {
      return {
        id, kind: "table", x: region.x, y: region.y, w: region.w, h: region.h, z,
        provenance: "compiler", semanticRef: block.id,
        table: { rows: (block.rows ?? []).map((r) => [...r]), header: block.header === true },
      };
    }
    default: {
      const { paras, policy } = blockParas(block, design);
      return textEl(id, block.id, region, paras, z, { ...fitBase, policy });
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
// a narrow edge band outside the content box, never covering content.
function placePrimary(
  ctx: MechanismCtx,
  els: SceneElement[],
  block: ContentBlock,
  region: Box,
  takeZ: () => number,
  render?: (region: Box, z: number) => SceneElement,
): SceneElement {
  const needsCaveat = block.uncertainty !== undefined;
  const caveatH = needsCaveat ? 0.35 : 0;
  const tone = toneFor(ctx.comp.outcomeTreatments, block);
  const railW = tone === "cautionary" ? 0.12 : 0;
  const contentRegion: Box = {
    x: region.x + railW,
    y: region.y,
    w: Math.max(0.1, region.w - railW),
    h: Math.max(0.2, region.h - (needsCaveat ? caveatH + 0.05 : 0)),
  };
  if (tone === "cautionary") {
    els.push(shapeEl(`${ctx.slide.id}:${block.id}:tone`, block.id,
      { x: region.x, y: region.y, w: 0.08, h: region.h }, "rect",
      ctx.design.palette.rule.hex, takeZ()));
  }
  const primary = render
    ? render(contentRegion, takeZ())
    : renderBlockPrimary(ctx, block, contentRegion, takeZ());
  els.push(primary);
  if (needsCaveat) {
    const el = caveatEl(ctx, block,
      { x: region.x, y: region.y + region.h - caveatH, w: region.w, h: caveatH },
      takeZ());
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
    const el = placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h: Math.max(0.2, h - 0.1) }, takeZ);
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
      els.push(shapeEl(`${slide.id}:${block.id}:rule`, block.id,
        { x: box.x, y, w: 0.06, h: Math.max(0.2, h - 0.15) }, "rect", design.palette.accent.hex, takeZ()));
      placePrimary(ctx, els, block, { x: box.x + 0.25, y, w: box.w - 0.25, h: Math.max(0.2, h - 0.15) }, takeZ);
    } else {
      placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h: Math.max(0.2, h - 0.15) }, takeZ);
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
    els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
      { x: box.x, y, w: box.w, h }, "roundRect", design.palette.surface.hex, takeZ()));
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
      els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: cx, y, w: cw, h: ch }, "roundRect", design.palette.surface.hex, takeZ()));
      placePrimary(ctx, els, block, { x: cx + 0.25, y: y + 0.15, w: cw - 0.5, h: Math.max(0.2, ch - 0.3) }, takeZ);
    });
  }
  if (comp.takeawayTreatment === "verdict" || comp.takeawayTreatment === "annotation") {
    els.push(...takeawayEls(ctx, y, box.bottom, takeZ()));
  }
  return els;
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
  const supportReserve = support.length ? 1.2 : 0;
  const bottom = box.bottom - verdictReserve - (comp.takeawayTreatment === "annotation" ? 0.6 : 0);
  const gridH = Math.max(0.8, bottom - y - supportReserve - gap);
  const sideRows = Math.ceil(sides.length / cols);
  const heights = distribute(gridH - gap * sideRows, sides.map(() => 1), 0.8);
  let ri = 0;
  sides.forEach((block, i) => {
    if (i % cols === 0 && i > 0) {
      y += heights[ri] + gap;
      ri++;
    }
    const h = heights[Math.min(ri, heights.length - 1)];
    const x = box.x + (i % cols) * (cw + gap);
    els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
      { x, y, w: cw, h }, "roundRect", design.palette.surface.hex, takeZ()));
    placePrimary(ctx, els, block, { x: x + 0.3, y: y + 0.2, w: cw - 0.6, h: Math.max(0.2, h - 0.4) }, takeZ);
  });
  y += heights[heights.length - 1] + gap;
  const supportHeights = distribute(Math.max(0.4, bottom - y) - 0.1 * support.length, support.map(() => 1), 0.4);
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
      placePrimary(ctx, els, block, tableRegion, takeZ, (region, z) => ({
        id: primaryId(slide.id, block.id), kind: "table",
        x: region.x, y: region.y, w: region.w, h: region.h, z,
        provenance: "compiler", semanticRef: block.id,
        table: { rows: [header, ...rows], header: true },
      } as SceneElement));
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
      els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
        { x, y, w, h: tileH }, "roundRect", design.palette.surface.hex, takeZ()));
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
      els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: px, y: py, w: cw, h: ch }, "ellipse", design.palette.surface.hex, takeZ()));
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
      els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
        { x, y, w: cw, h }, "roundRect", design.palette.surface.hex, takeZ()));
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
  els.push(shapeEl(`${slide.id}:${parent.id}:frame`, parent.id,
    { x: box.x, y, w: box.w, h: parentH }, "roundRect", design.palette.surface.hex, takeZ()));
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
      els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: cx, y, w: cw, h: ch }, "roundRect", design.palette.surface.hex, takeZ()));
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
      els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: box.x, y, w: box.w, h }, "roundRect", design.palette.surface.hex, takeZ()));
      placePrimary(ctx, els, block, { x: box.x + 0.4, y: y + 0.2, w: box.w - 0.8, h: Math.max(0.2, h - 0.4) }, takeZ);
    } else if (comp.variantKey === "framed-prose/recommendation" || comp.variantKey === "framed-prose/conclusion") {
      // Filled card with an accent top rule.
      els.push(shapeEl(`${slide.id}:${block.id}:frame`, block.id,
        { x: box.x, y, w: box.w, h }, "roundRect", design.palette.surface.hex, takeZ()));
      els.push(shapeEl(`${slide.id}:${block.id}:rule`, block.id,
        { x: box.x, y, w: box.w, h: 0.08 }, "rect", design.palette.accent.hex, takeZ()));
      placePrimary(ctx, els, block, { x: box.x + 0.4, y: y + 0.3, w: box.w - 0.8, h: Math.max(0.2, h - 0.5) }, takeZ);
    } else {
      placePrimary(ctx, els, block, { x: box.x + 0.6, y, w: box.w - 1.2, h }, takeZ);
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
    placePrimary(ctx, els, block, { x: box.x, y, w: box.w, h }, takeZ);
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
): SlideScene {
  const box = contentBox(design);
  const ctx: MechanismCtx = { slide, comp, design, box, sink, topRightReserve: chrome?.topRightReserve ?? 0 };
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
    background: { fill: design.palette.bg.hex },
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
