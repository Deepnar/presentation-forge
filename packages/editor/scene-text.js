// @forge/editor — scene-text. Framework-free, DOM-free text-editing
// and element-insertion helpers for V2-5D. Pure functions over the
// Layer-C Paragraph/TextRun contract; the interaction adapter
// (scene-edit.js) owns sessions and the engine owns commits.
//
// The critical correctness rule lives here: editing must never
// silently discard authored structure. Only SIMPLE text — exactly
// one paragraph holding exactly one run — is directly editable.
// Anything richer (multiple paragraphs, multiple runs) is reported
// as structured and blocked from plain-text editing until rich-run
// editing exists. Plain-text flattening is never presented as a
// fidelity-preserving transformation.
import { lineCount } from "../core/fit.ts";
import { SCENE_W, SCENE_H } from "../model/scene-constants.ts";

// Default geometry for human-inserted elements, in scene inches.
// Text default is a comfortable single-line body box; shape default
// is a modest card. Both sit well inside the 13.333x7.5 canvas.
export const NEW_TEXT_W = 4;
export const NEW_TEXT_H = 1;
export const NEW_SHAPE_W = 2;
export const NEW_SHAPE_H = 1.2;

export function mintHumanId() {
  // Same `h-` + 12 hex shape as model/scene.ts humanId, re-implemented
  // here so the browser edit path mints ids without importing the
  // AJV validator (which the engine already bundles separately).
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `h-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// Editable iff one paragraph with one run. Zero-run paragraphs,
// multi-run paragraphs, and multi-paragraph elements are all
// structured: an honest boundary, not a flattening.
export function isSimpleText(paragraphs) {
  return (
    Array.isArray(paragraphs) &&
    paragraphs.length === 1 &&
    Array.isArray(paragraphs[0]?.runs) &&
    paragraphs[0].runs.length === 1
  );
}

export function describeStructure(paragraphs) {
  const ps = Array.isArray(paragraphs) ? paragraphs : [];
  const runs = ps.reduce((n, p) => n + (Array.isArray(p?.runs) ? p.runs.length : 0), 0);
  return { simple: isSimpleText(paragraphs), paragraphs: ps.length, runs };
}

// Draft text for the editing surface: each paragraph's runs joined,
// paragraphs joined by newlines. For simple text this is the run text.
export function paragraphsToDraft(paragraphs) {
  return (paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? "").join("")).join("\n");
}

// Build the committed paragraphs from an edited draft WITHOUT
// touching the template's styling: the run's family/size/weight/
// color/role/tracking/line/transform/bold/italic and the
// paragraph's align/bullet carry over verbatim; only text changes.
// Newlines in the draft become paragraph boundaries, each carrying
// the template paragraph's alignment. Never called on structured
// input — callers gate on isSimpleText first.
export function buildUpdatedParagraphs(template, draftText) {
  const src = template[0];
  const style = { ...(src.runs[0] ?? { text: "" }) };
  const { align, bullet } = src;
  return String(draftText ?? "").split("\n").map((line) => {
    const para = { runs: [{ ...style, text: line }] };
    if (align !== undefined) para.align = align;
    if (bullet !== undefined) para.bullet = bullet;
    return para;
  });
}

// Draft colors for inserted text sampled from the slide when a
// sibling text run exists, else contrasted against the slide ground.
// Gap (documented in V2-5D-EVAL): scenes carry resolved runs but no
// design system, so there is no exact theme default to reuse — this
// narrow deterministic fallback (sibling style, else ink by
// luminance) is the whole policy, and no second theme resolver or
// text-fitting compiler lives in the UI.
export function contrastInk(bgFill) {
  const hex = String(bgFill ?? "FFFFFF").replace(/^#/, "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.45 ? "FFFFFF" : "1A1A1A";
}

function sampleRun(slide) {
  const walk = (els) => {
    for (const el of els ?? []) {
      if (el.kind === "text") {
        const run = el.paragraphs?.[0]?.runs?.[0];
        if (run) return run;
      }
      const kid = walk(el.group?.children);
      if (kid) return kid;
    }
    return null;
  };
  return walk(slide?.elements);
}

function sampleShapeFill(slide) {
  const walk = (els) => {
    for (const el of els ?? []) {
      if (el.kind === "shape" && el.shape?.fill) return el.shape.fill;
      const kid = walk(el.group?.children);
      if (kid) return kid;
    }
    return null;
  };
  return walk(slide?.elements);
}

function centerBox(w, h) {
  const x = Math.round(((SCENE_W - w) / 2) * 1000) / 1000;
  const y = Math.round(((SCENE_H - h) / 2) * 1000) / 1000;
  return { x, y, w, h };
}

export function defaultTextBox() {
  return centerBox(NEW_TEXT_W, NEW_TEXT_H);
}

export function defaultShapeBox() {
  return centerBox(NEW_SHAPE_W, NEW_SHAPE_H);
}

// Deterministic bounded cascade for repeated inserts (V2-5E): the
// nth human element on a slide steps 0.4in right and down from
// center, cycling every 6, clamped back on-canvas. Scene inches,
// zoom-independent, no composition planner — and undo/redo preserve
// the exact committed geometry, so the cascade never fights history.
export const CASCADE_STEP = 0.4;
export const CASCADE_CYCLE = 6;

export function cascadeBox(box, n) {
  const k = ((Math.floor(n) % CASCADE_CYCLE) + CASCADE_CYCLE) % CASCADE_CYCLE;
  let x = box.x + CASCADE_STEP * k;
  let y = box.y + CASCADE_STEP * k;
  if (x + box.w > SCENE_W) x = Math.max(0, SCENE_W - box.w);
  if (y + box.h > SCENE_H) y = Math.max(0, SCENE_H - box.h);
  return {
    x: Math.round(x * 1000) / 1000,
    y: Math.round(y * 1000) / 1000,
    w: box.w,
    h: box.h,
  };
}

// Cascade index derived from content, not session state: the count
// of human-provenance top-level elements on the slide. Stable across
// zoom, reload, and Edit toggles; deletions may reuse a step, which
// is harmless (positions are suggestions, identity is exact).
export function cascadeIndex(slide) {
  return (slide?.elements ?? []).filter((e) => e.provenance === "human").length;
}

// Canonical text-element input for `element.add`: kind text,
// valid geometry, human provenance (the engine stamps provenance
// and z), wrap policy, and theme-aware-by-sampling styling.
export function defaultTextElement(slide, opts = {}) {
  // Explicit boxes win; default placement cascades so repeated
  // inserts stop stacking directly atop each other (§9).
  const box = opts.box ?? cascadeBox(defaultTextBox(), cascadeIndex(slide));
  const run = sampleRun(slide);
  const bg = slide?.background?.fill;
  const first = {
    text: opts.text ?? "New text",
    role: run?.role ?? "body",
    size: run?.size ?? 18,
    color: (run?.color ?? contrastInk(bg)).replace(/^#/, ""),
  };
  if (run?.family !== undefined) first.family = run.family;
  if (run?.weight !== undefined) first.weight = run.weight;
  if (run?.italic !== undefined) first.italic = run.italic;
  if (run?.bold !== undefined) first.bold = run.bold;
  if (run?.tracking !== undefined) first.tracking = run.tracking;
  if (run?.line !== undefined) first.line = run.line;
  return {
    id: opts.id ?? mintHumanId(),
    kind: "text",
    ...box,
    valign: "top",
    provenance: "human",
    fitPolicy: "wrap",
    paragraphs: [{ runs: [first], align: "left" }],
  };
}

// Canonical shape-element input for `element.add`, restricted to the
// forms the Layer-C contract defines (rect, roundRect, ellipse).
// Fill samples a sibling shape when one exists, else a deterministic
// mid blue readable on light and dark grounds.
export function defaultShapeElement(slide, form = "rect", opts = {}) {
  if (!["rect", "roundRect", "ellipse"].includes(form)) {
    throw new Error(`scene-text: unsupported shape form ${form}`);
  }
  const box = opts.box ?? cascadeBox(defaultShapeBox(), cascadeIndex(slide));
  return {
    id: opts.id ?? mintHumanId(),
    kind: "shape",
    ...box,
    provenance: "human",
    shape: { form, fill: (opts.fill ?? sampleShapeFill(slide) ?? "3B82C4").replace(/^#/, "") },
  };
}

// Honest overflow visibility WITHOUT a new layout planner: reuse the
// compiler's own lineCount heuristic against the element's box to
// estimate whether committed paragraphs still fit. Advisory only —
// geometry is never changed, fonts never shrunk, text never
// truncated. A schema-valid scene that fails here is still committed;
// the caller surfaces the message.
export function overflowEstimate(el, paragraphs = el?.paragraphs) {
  if (!el || el.kind !== "text" || !Array.isArray(paragraphs) || !el.w || !el.h) return null;
  let lines = 0;
  let size = 12;
  let line = 1.35;
  for (const p of paragraphs) {
    let best = null;
    for (const r of p.runs ?? []) {
      if (!best || (r.size ?? 0) > (best.size ?? 0)) best = r;
    }
    if (!best) continue;
    size = Math.max(size, best.size ?? size);
    line = best.line ?? line;
    const style = {
      family: best.family || undefined,
      size: best.size ?? 12,
      weight: best.weight ?? 400,
      tracking: best.tracking ?? 0,
      ...(best.transform ? { transform: best.transform } : {}),
    };
    for (const segment of (p.runs ?? []).map((r) => r.text ?? "").join("").split("\n")) {
      lines += Math.max(1, lineCount(segment, Math.max(0.1, el.w), style));
    }
  }
  if (lines === 0) return { lines: 0, capacity: 0, fits: true, message: null };
  const capacity = Math.max(1, Math.floor(el.h / ((size / 72) * line)));
  const fits = lines <= capacity;
  return {
    lines,
    capacity,
    fits,
    message: fits ? null : `text needs ~${lines} lines in a box seating ~${capacity} — shorten the text (geometry unchanged)`,
  };
}
