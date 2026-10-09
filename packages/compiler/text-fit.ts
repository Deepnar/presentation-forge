// @forge/compiler — fit-aware Layer C text emission.
//
// Every compiler-created kind:text element passes through here (or the
// legacy-compat wrapper in compile.js, which delegates here). The
// fitter chooses font scale INSIDE mechanism-owned geometry; geometry
// never derives from heightOf/lineCount estimates (TRAPS invariant).
//
// Shrink-only, no truncation: text that cannot fit at the readable
// floor keeps its content clamped at the floor with a deterministic
// FitDiagnostic. V2-3E-2 turns diagnostics into QA policy; this slice
// only exposes them via compileDeckDetailed.

import { fitOneLine, fitStyledStack, fitLineHeight, uniformFloorBound, heightOf, type FitStyle, type StyledStackItem } from "../core/fit.ts";
import type { SceneElement, Paragraph } from "../model/scene.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";
import { resolveRunStyle } from "./typography.ts";

export interface FitDiagnostic {
  slideId: string;
  elementId: string;
  semanticRef?: string;
  role: string;
  kind: "floor-hit" | "word-floor-hit";
  message: string;
}

export interface RoleRun {
  text: string;
  role: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  family?: string;
  weight?: number;
  tracking?: number;
  line?: number;
  transform?: "upper";
}

export interface RoleParagraph {
  runs: RoleRun[];
  align?: "left" | "center" | "right";
  bullet?: boolean;
}

export interface FitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Fraction of an allocated region below which frameless text
// recenters instead of top-anchoring. Dense regions keep
// byte-identical geometry: the threshold only fires on sparse ones.
const SPARSE_CENTER_THRESHOLD = 0.5;
// Slack absorbing measurement-heuristic mismatch so a centered box
// still seats its content at nominal size with no new diagnostics.
const SPARSE_CENTER_SLACK = 0.25;

// Nominal content height of already-built paragraphs, measured with
// each paragraph's largest-nominal resolved style (conservative:
// never smaller than what the fitter sees for single-role content).
// Measurement only — fitting still owns scale. Exported for
// capacity-aware layout planning: mechanisms size regions from this
// demand, then fit inside the chosen geometry as usual.
export function nominalContentHeight(design: DesignSystem, paras: RoleParagraph[], width: number): number {
  let total = 0;
  for (const p of paras) {
    let best: { size: number; fit: FitStyle } | null = null;
    for (const r of p.runs) {
      const { run, fit } = resolveRunStyle(design, r.role, r);
      if (!best || run.size > best.size) best = { size: run.size, fit };
    }
    if (!best) continue;
    total += heightOf(p.runs.map((r) => r.text).join(""), width, best.fit, best.fit.line ?? 1.35);
  }
  return total;
}

// Center sparse frameless text vertically within its allocated
// region BEFORE fitting, so measured typography reflects the drawn
// box. The caller decides which content qualifies; caveat bands,
// tone rails, and frames are laid out around the returned region by
// the caller and never move.
export function centerSparseBox(design: DesignSystem, region: FitBox, paras: RoleParagraph[]): FitBox {
  const contentH = nominalContentHeight(design, paras, region.w);
  if (!(contentH > 0) || contentH + SPARSE_CENTER_SLACK >= SPARSE_CENTER_THRESHOLD * region.h) {
    return region;
  }
  const h = contentH + SPARSE_CENTER_SLACK;
  return { ...region, y: region.y + (region.h - h) / 2, h };
}

export type FitPolicy = "wrap" | "one-line" | "stat";

interface StyledRun {
  text: string;
  role: string;
  style: FitStyle;
  size: number;
  color: string;
  family: string;
  weight: number;
  tracking: number;
  line: number;
  transform?: "upper";
  bold?: boolean;
  italic?: boolean;
}

interface StyledPara {
  runs: StyledRun[];
  align?: "left" | "center" | "right";
  bullet?: boolean;
}

function styleRuns(
  design: DesignSystem,
  paragraphs: RoleParagraph[],
): StyledPara[] {
  return paragraphs.map((p) => ({
    runs: p.runs.map((r) => {
      const { run, fit } = resolveRunStyle(design, r.role, r);
      return {
        text: r.text,
        role: r.role,
        style: fit,
        size: run.size,
        color: run.color,
        family: run.family,
        weight: run.weight,
        tracking: run.tracking,
        line: run.line,
        ...(run.transform !== undefined ? { transform: run.transform } : {}),
        ...(run.bold !== undefined ? { bold: run.bold } : {}),
        ...(run.italic !== undefined ? { italic: run.italic } : {}),
      };
    }),
    ...(p.align !== undefined ? { align: p.align } : {}),
    ...(p.bullet !== undefined ? { bullet: p.bullet } : {}),
  }));
}

function paraText(p: StyledPara): string {
  return p.runs.map((r) => r.text).join("");
}

function allWords(paras: StyledPara[]): { word: string; style: FitStyle }[] {
  const out: { word: string; style: FitStyle }[] = [];
  for (const p of paras) {
    for (const r of p.runs) {
      for (const word of r.text.split(/\s+/).filter(Boolean)) {
        out.push({ word, style: r.style });
      }
    }
  }
  return out;
}

function emitDiagnostic(
  sink: FitDiagnostic[],
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
  role: string,
  kind: FitDiagnostic["kind"],
  message: string,
): void {
  const diag: FitDiagnostic = { slideId, elementId, role, kind, message };
  if (semanticRef !== undefined) diag.semanticRef = semanticRef;
  if (!sink.some((d) => d.elementId === elementId && d.kind === kind && d.message === message)) {
    sink.push(diag);
  }
}

function drainEvents(
  sink: FitDiagnostic[],
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
  role: string,
  kind: FitDiagnostic["kind"],
  events: string[],
): void {
  for (const message of events) emitDiagnostic(sink, slideId, elementId, semanticRef, role, kind, message);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

// Intra-paragraph measurement boundary: compiler paragraphs are
// single-run in practice, so each paragraph is measured with its own
// run's style. A multi-run paragraph is measured with its
// largest-nominal run's style — a documented approximation, not a
// shaper. Floor protection never approximates: the uniform bound
// spans every run (see uniformFloorBound below).
function paraStyle(p: StyledPara): StyledRun | null {
  let best: StyledRun | null = null;
  for (const r of p.runs) {
    if (!best || r.size > best.size) best = r;
  }
  return best;
}

function stackItems(paras: StyledPara[]): StyledStackItem[] {
  const items: StyledStackItem[] = [];
  for (const p of paras) {
    const rep = paraStyle(p);
    if (!rep) continue;
    items.push({
      text: paraText(p),
      style: rep.style,
      runStyles: p.runs.map((r) => r.style),
    });
  }
  return items;
}

function runStylesOf(paras: StyledPara[]): FitStyle[] {
  return paras.flatMap((p) => p.runs.map((r) => r.style));
}

interface ScalePart {
  scale: number;
  role: string;
  // Deterministic overflow label, e.g. word "budget…".
  label: string;
}

// Combine independently fitted components (stack, word guard,
// vertical) under one shared scale that cannot cross the element
// floor bound. Components the bound overrules overflow by
// construction, so each one diagnoses instead of failing silently.
function resolveUniformScale(
  bound: number,
  parts: ScalePart[],
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
  sink: FitDiagnostic[],
): number {
  let scale = 1;
  for (const p of parts) scale = Math.min(scale, p.scale);
  scale = Math.max(bound, scale);
  for (const p of parts) {
    if (p.scale < scale - 1e-9) {
      emitDiagnostic(sink, slideId, elementId, semanticRef, p.role, "floor-hit",
        `${p.role} ${p.label} overflows at the uniform floor scale (kept readable, not shrunk)`);
    }
  }
  return scale;
}

function shortWord(word: string): string {
  return word.length > 32 ? `${word.slice(0, 32)}…` : word;
}

function applyScale(paras: StyledPara[], scale: number): Paragraph[] {
  return paras.map((p) => ({
    runs: p.runs.map((r) => {
      const out: Paragraph["runs"][number] = {
        text: r.text,
        size: round1(r.size * scale),
        color: r.color,
        role: r.role,
        family: r.family,
        weight: r.weight,
        tracking: r.tracking,
        line: r.line,
      };
      if (r.transform !== undefined) out.transform = r.transform;
      if (r.bold !== undefined) out.bold = r.bold;
      if (r.italic !== undefined) out.italic = r.italic;
      return out;
    }),
    ...(p.align !== undefined ? { align: p.align } : {}),
    ...(p.bullet !== undefined ? { bullet: p.bullet } : {}),
  }));
}

interface WordPart extends ScalePart {
  word: string;
}

function wordGuardParts(
  paras: StyledPara[],
  width: number,
  sink: FitDiagnostic[],
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
): WordPart[] {
  const parts: WordPart[] = [];
  for (const { word, style } of allWords(paras)) {
    const events: string[] = [];
    const s = fitOneLine(word, width, style, { events });
    drainEvents(sink, slideId, elementId, semanticRef, style._role ?? "text", "word-floor-hit", events);
    parts.push({ scale: s, role: style._role ?? "text", label: `word "${shortWord(word)}"`, word });
  }
  return parts;
}

// Paragraph-aware wrap fit: every paragraph measured with the style
// actually drawn for it (fitStyledStack), longest-word guard per
// word style, one uniform scale under the strongest floor ratio
// across every run. No floor/step/min arithmetic lives here.
function fitWrap(
  paras: StyledPara[],
  box: FitBox,
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
  sink: FitDiagnostic[],
): Paragraph[] {
  if (!paras.length) return [];
  const items = stackItems(paras);
  const bound = uniformFloorBound(runStylesOf(paras));
  const parts: ScalePart[] = [];
  if (items.length) {
    const wrapEvents: string[] = [];
    const stackScale = fitStyledStack(items, box.w, box.h, { events: wrapEvents });
    const firstPara = paras.find((p) => p.runs.length > 0);
    const repRole = (firstPara && paraStyle(firstPara)?.role) ?? "text";
    drainEvents(sink, slideId, elementId, semanticRef, repRole, "floor-hit", wrapEvents);
    parts.push({ scale: stackScale, role: repRole, label: "paragraph stack" });
  }
  for (const w of wordGuardParts(paras, box.w, sink, slideId, elementId, semanticRef)) {
    parts.push(w);
  }
  if (!parts.length) return applyScale(paras, 1);
  const scale = resolveUniformScale(bound, parts, slideId, elementId, semanticRef, sink);
  return applyScale(paras, scale);
}

function fitOneLineEl(
  paras: StyledPara[],
  box: FitBox,
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
  sink: FitDiagnostic[],
): Paragraph[] {
  if (!paras.length) return [];
  const bound = uniformFloorBound(runStylesOf(paras), { min: 0.5 });
  const parts: ScalePart[] = [];
  for (const p of paras) {
    for (const r of p.runs) {
      const events: string[] = [];
      const s = fitOneLine(r.text || " ", box.w, r.style, { events });
      drainEvents(sink, slideId, elementId, semanticRef, r.role, "word-floor-hit", events);
      parts.push({ scale: s, role: r.role, label: `run "${shortWord(r.text || " ")}"` });
    }
  }
  // One line still owns vertical space: every run's line must fit
  // the box height under the same shrink-stop semantics as the width
  // fit. The tightest vertical budget wins, floor-safe like the rest.
  for (const p of paras) {
    for (const r of p.runs) {
      const vEvents: string[] = [];
      const vScale = fitLineHeight(r.style, box.h, { events: vEvents });
      drainEvents(sink, slideId, elementId, semanticRef, r.role, "floor-hit", vEvents);
      parts.push({ scale: vScale, role: r.role, label: "line height" });
    }
  }
  if (!parts.length) return applyScale(paras, 1);
  const scale = resolveUniformScale(bound, parts, slideId, elementId, semanticRef, sink);
  return applyScale(paras, scale);
}

// Stat elements carry two typographic hierarchies: the value (stat
// role, one line) and the label (body/caption role, may wrap). A long
// label must not force the numeric value down to body size, so each
// fits inside its own deterministic sub-budget of the element box.
function fitStat(
  paras: StyledPara[],
  box: FitBox,
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
  sink: FitDiagnostic[],
): Paragraph[] {
  if (paras.length < 2) return fitWrap(paras, box, slideId, elementId, semanticRef, sink);
  const [valuePara, ...labelParas] = paras;
  const valueRep = paraStyle(valuePara);
  const valueNominalH = valueRep ? (valueRep.size / 72) * (valueRep.style.line ?? 1) : 0.5;
  const valueH = Math.min(box.h * 0.62, valueNominalH + 0.12);
  const labelH = Math.max(0.15, box.h - valueH - 0.05);
  const valueBound = uniformFloorBound(valuePara.runs.map((r) => r.style), { min: 0.5 });
  const valueParts: ScalePart[] = [];
  for (const r of valuePara.runs) {
    const events: string[] = [];
    const s = fitOneLine(r.text || " ", box.w, r.style, { events });
    drainEvents(sink, slideId, elementId, semanticRef, r.role, "word-floor-hit", events);
    valueParts.push({ scale: s, role: r.role, label: `run "${shortWord(r.text || " ")}"` });
  }
  for (const r of valuePara.runs) {
    const vEvents: string[] = [];
    const vScale = fitLineHeight(r.style, valueH, { events: vEvents });
    drainEvents(sink, slideId, elementId, semanticRef, r.role, "floor-hit", vEvents);
    valueParts.push({ scale: vScale, role: r.role, label: "line height" });
  }
  const valueScale = valuePara.runs.length
    ? resolveUniformScale(valueBound, valueParts, slideId, elementId, semanticRef, sink)
    : 1;
  const labelBound = uniformFloorBound(runStylesOf(labelParas));
  const labelParts: ScalePart[] = [];
  const labelItems = stackItems(labelParas);
  if (labelItems.length && labelParas.some((p) => paraText(p).trim())) {
    const wrapEvents: string[] = [];
    const stackScale = fitStyledStack(labelItems, box.w, labelH, { events: wrapEvents });
    const firstLabel = labelParas.find((p) => p.runs.length > 0);
    const labelRepRole = (firstLabel && paraStyle(firstLabel)?.role) ?? "text";
    drainEvents(sink, slideId, elementId, semanticRef, labelRepRole, "floor-hit", wrapEvents);
    labelParts.push({ scale: stackScale, role: labelRepRole, label: "paragraph stack" });
  }
  for (const w of wordGuardParts(labelParas, box.w, sink, slideId, elementId, semanticRef)) {
    labelParts.push(w);
  }
  const labelScale = labelParts.length
    ? resolveUniformScale(labelBound, labelParts, slideId, elementId, semanticRef, sink)
    : 1;
  return [
    ...applyScale([valuePara], valueScale),
    ...applyScale(labelParas, labelScale),
  ];
}

interface FitCtxArgs {
  slideId: string;
  elementId: string;
  semanticRef: string | undefined;
  sink: FitDiagnostic[];
}

// One dispatch for every fit, fresh or refit: the stored/emitted
// policy decides the semantics, never IDs, text, sizes, or roles.
function fitWithPolicy(
  styled: StyledPara[],
  box: FitBox,
  policy: FitPolicy,
  ctx: FitCtxArgs,
): Paragraph[] {
  if (policy === "stat") {
    return fitStat(styled, box, ctx.slideId, ctx.elementId, ctx.semanticRef, ctx.sink);
  }
  if (policy === "one-line") {
    return fitOneLineEl(styled, box, ctx.slideId, ctx.elementId, ctx.semanticRef, ctx.sink);
  }
  return fitWrap(styled, box, ctx.slideId, ctx.elementId, ctx.semanticRef, ctx.sink);
}

export interface FittedTextInput {
  id: string;
  semanticRef?: string;
  box: FitBox;
  paragraphs: RoleParagraph[];
  z: number;
  slideId: string;
  policy?: FitPolicy;
  sink: FitDiagnostic[];
}

export function fittedTextEl(
  design: DesignSystem,
  input: FittedTextInput,
): SceneElement {
  const styled = styleRuns(design, input.paragraphs);
  const policy = input.policy ?? "wrap";
  const paragraphs = fitWithPolicy(styled, input.box, policy, {
    slideId: input.slideId, elementId: input.id, semanticRef: input.semanticRef, sink: input.sink,
  });
  const el: SceneElement = {
    id: input.id,
    kind: "text",
    x: input.box.x,
    y: input.box.y,
    w: input.box.w,
    h: input.box.h,
    z: input.z,
    provenance: "compiler",
    paragraphs,
    // Compiler/render metadata, not Layer-A intent: lets customized
    // recompilation refit with the same policy the fresh compile used.
    // Renderers ignore it.
    fitPolicy: policy,
  };
  if (input.semanticRef !== undefined) el.semanticRef = input.semanticRef;
  return el;
}

// Refit path for preserved customized geometry: shrink-only from the
// CURRENT (already fitted) sizes against the PRESERVED box. Never grows
// back toward nominal — the shrink-only contract — and never touches
// geometry. Refits with the element's stored compiler policy, so a
// customized stat stays stat-aware and a one-line element stays
// one-line-aware. Runs without a stored role (pre-3E-1 scenes, human
// text) are left alone.
export function refitTextEl(
  design: DesignSystem,
  el: SceneElement,
  slideId: string,
  sink: FitDiagnostic[],
): void {
  if (el.kind !== "text" || !el.paragraphs?.length) return;
  const styled: StyledPara[] = [];
  for (const p of el.paragraphs) {
    const runs: StyledRun[] = [];
    for (const r of p.runs) {
      if (!r.role) return;
      const { fit } = resolveRunStyle(design, r.role, {
        family: r.family,
        weight: r.weight,
        size: r.size ?? 12,
        tracking: r.tracking,
        line: r.line,
        transform: r.transform,
      });
      runs.push({
        text: r.text,
        role: r.role,
        style: fit,
        size: r.size ?? 12,
        color: (r.color ?? "111111").replace(/^#/, ""),
        family: r.family ?? "",
        weight: r.weight ?? 400,
        tracking: r.tracking ?? 0,
        line: r.line ?? 1.35,
        ...(r.transform !== undefined ? { transform: r.transform } : {}),
        ...(r.bold !== undefined ? { bold: r.bold } : {}),
        ...(r.italic !== undefined ? { italic: r.italic } : {}),
      });
    }
    styled.push({
      runs,
      ...(p.align !== undefined ? { align: p.align } : {}),
      ...(p.bullet !== undefined ? { bullet: p.bullet } : {}),
    });
  }
  el.paragraphs = fitWithPolicy(styled, { x: el.x, y: el.y, w: el.w, h: el.h }, el.fitPolicy ?? "wrap", {
    slideId, elementId: el.id, semanticRef: el.semanticRef, sink,
  });
}
