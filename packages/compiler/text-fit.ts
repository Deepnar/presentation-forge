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

import { fitScale, fitOneLine, type FitStyle } from "../core/fit.ts";
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

// Representative style for a wrap budget: the largest nominal size is
// the pessimistic choice, so fitting against it can only overshrink,
// never overflow. Hierarchy survives because every run keeps its own
// resolved role/size — the scale is uniform, the typography is not.
function representative(paras: StyledPara[]): StyledRun | null {
  let best: StyledRun | null = null;
  for (const p of paras) {
    for (const r of p.runs) {
      if (!best || r.size > best.size) best = r;
    }
  }
  return best;
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

function wordGuardScale(
  paras: StyledPara[],
  width: number,
  sink: FitDiagnostic[],
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
): number {
  let scale = 1;
  for (const { word, style } of allWords(paras)) {
    const events: string[] = [];
    const s = fitOneLine(word, width, style, { events });
    drainEvents(sink, slideId, elementId, semanticRef, style._role ?? "text", "word-floor-hit", events);
    if (s < scale) scale = s;
  }
  return scale;
}

function fitWrap(
  paras: StyledPara[],
  box: FitBox,
  slideId: string,
  elementId: string,
  semanticRef: string | undefined,
  sink: FitDiagnostic[],
): Paragraph[] {
  if (!paras.length) return [];
  const rep = representative(paras);
  const wrapEvents: string[] = [];
  let scale: number;
  if (!rep) {
    scale = 1;
  } else {
    const text = paras.map(paraText).join("\n");
    scale = fitScale(text, box.w, box.h, rep.style, { events: wrapEvents });
    drainEvents(sink, slideId, elementId, semanticRef, rep.role, "floor-hit", wrapEvents);
  }
  const wordScale = wordGuardScale(paras, box.w, sink, slideId, elementId, semanticRef);
  return applyScale(paras, Math.min(scale, wordScale));
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
  let scale = 1;
  for (const p of paras) {
    for (const r of p.runs) {
      const events: string[] = [];
      const s = fitOneLine(r.text || " ", box.w, r.style, { events });
      drainEvents(sink, slideId, elementId, semanticRef, r.role, "word-floor-hit", events);
      if (s < scale) scale = s;
    }
  }
  // One line still owns vertical space: clamp the single line into the box.
  const rep = representative(paras);
  if (rep) {
    const lineH = (rep.size / 72) * (rep.style.line ?? 1.35);
    if (lineH > 0 && lineH * scale > box.h) {
      const clamped = Math.max(0.1, box.h / lineH);
      if (clamped < scale) {
        emitDiagnostic(sink, slideId, elementId, semanticRef, rep.role, "floor-hit",
          `${rep.role} line needs ${round1(lineH * scale)}in — box ${round1(box.h)}in (cut text, don't shrink)`);
        scale = clamped;
      }
    }
  }
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
  const valueRep = representative([valuePara]);
  const valueNominalH = valueRep ? (valueRep.size / 72) * (valueRep.style.line ?? 1) : 0.5;
  const valueH = Math.min(box.h * 0.62, valueNominalH + 0.12);
  const labelH = Math.max(0.15, box.h - valueH - 0.05);
  let valueScale = 1;
  if (valueRep) {
    for (const r of valuePara.runs) {
      const events: string[] = [];
      const s = fitOneLine(r.text || " ", box.w, r.style, { events });
      drainEvents(sink, slideId, elementId, semanticRef, r.role, "word-floor-hit", events);
      if (s < valueScale) valueScale = s;
    }
    const valueLineH = (valueRep.size / 72) * (valueRep.style.line ?? 1);
    if (valueLineH > 0 && valueLineH * valueScale > valueH) {
      const clamped = Math.max(0.1, valueH / valueLineH);
      if (clamped < valueScale) {
        emitDiagnostic(sink, slideId, elementId, semanticRef, valueRep.role, "floor-hit",
          `${valueRep.role} line needs ${round1(valueLineH * valueScale)}in — box ${round1(valueH)}in (cut text, don't shrink)`);
        valueScale = clamped;
      }
    }
  }
  const labelText = labelParas.map(paraText).join("\n");
  const labelRep = representative(labelParas);
  let labelScale = 1;
  if (labelRep && labelText) {
    const events: string[] = [];
    labelScale = fitScale(labelText, box.w, labelH, labelRep.style, { events });
    drainEvents(sink, slideId, elementId, semanticRef, labelRep.role, "floor-hit", events);
    const wordScale = wordGuardScale(labelParas, box.w, sink, slideId, elementId, semanticRef);
    labelScale = Math.min(labelScale, wordScale);
  }
  return [
    ...applyScale([valuePara], valueScale),
    ...applyScale(labelParas, labelScale),
  ];
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
  const paragraphs = policy === "stat"
    ? fitStat(styled, input.box, input.slideId, input.id, input.semanticRef, input.sink)
    : policy === "one-line"
      ? fitOneLineEl(styled, input.box, input.slideId, input.id, input.semanticRef, input.sink)
      : fitWrap(styled, input.box, input.slideId, input.id, input.semanticRef, input.sink);
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
  };
  if (input.semanticRef !== undefined) el.semanticRef = input.semanticRef;
  return el;
}

// Refit path for preserved customized geometry: shrink-only from the
// CURRENT (already fitted) sizes against the PRESERVED box. Never grows
// back toward nominal — the shrink-only contract — and never touches
// geometry. Runs without a stored role (pre-3E-1 scenes, human text)
// are left alone.
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
  const rep = representative(styled);
  if (!rep) return;
  const wrapEvents: string[] = [];
  const text = styled.map(paraText).join("\n");
  const wrapScale = fitScale(text, el.w, el.h, { ...rep.style, size: rep.size }, { events: wrapEvents });
  drainEvents(sink, slideId, el.id, el.semanticRef, rep.role, "floor-hit", wrapEvents);
  const wordScale = wordGuardScale(styled, el.w, sink, slideId, el.id, el.semanticRef);
  el.paragraphs = applyScale(styled, Math.min(wrapScale, wordScale));
}
