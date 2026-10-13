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

// Collision-safe slide ids in the same shape. Uniqueness against
// the live deck is enforced by the engine (duplicate slide ids
// reject); callers retry with a fresh mint on the rare collision.
export function mintSlideId() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return `s-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// A genuinely blank editable slide: valid dimensions, the sibling
// slide's background as the theme baseline (never a white guess),
// zero elements, managed layout state. No placeholder title, no
// copied chrome — locked institutional marks belong to compiler
// emission, and freezing stale marks into a human slide would lie
// about what regeneration owns. The renderer draws background-only
// slides and the preflight accepts them; an empty elements array
// is an intentional blank, not a malformed scene (which would be
// missing required fields and fail validation).
export function blankSlide(sibling) {
  return {
    id: mintSlideId(),
    width: SCENE_W,
    height: SCENE_H,
    background: structuredClone(sibling?.background ?? { fill: "FFFFFF" }),
    elements: [],
    layoutState: "managed",
  };
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

// Editable iff every paragraph holds exactly one run (one or more
// paragraphs). Single-paragraph elements keep working exactly as
// before; multi-paragraph single-run bodies (lists, comparisons,
// process steps — the measured 46/129 fixture case) become
// editable with per-paragraph styling. Anything with a multi-run
// (or zero-run) paragraph stays structured and refused: formatting
// addresses whole runs only, never substrings.
export function isEditableText(paragraphs) {
  return (
    Array.isArray(paragraphs) &&
    paragraphs.length > 0 &&
    paragraphs.every((p) => Array.isArray(p?.runs) && p.runs.length === 1)
  );
}

export function describeStructure(paragraphs) {
  const ps = Array.isArray(paragraphs) ? paragraphs : [];
  const runs = ps.reduce((n, p) => n + (Array.isArray(p?.runs) ? p.runs.length : 0), 0);
  const multiRun = ps.some((p) => !Array.isArray(p?.runs) || p.runs.length !== 1);
  return { simple: isSimpleText(paragraphs), editable: isEditableText(paragraphs), paragraphs: ps.length, runs, multiRun };
}

// Draft text for the editing surface: each paragraph's runs joined,
// paragraphs joined by newlines. For simple text this is the run text.
export function paragraphsToDraft(paragraphs) {
  return (paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? "").join("")).join("\n");
}

// Build the committed paragraphs from an edited draft WITHOUT
// touching per-paragraph styling: each draft line takes the style,
// alignment, and bullet of its template SLOT (same index), and only
// the text changes. Styles stick to slots, never to words:
//
// - Same line count: wording-only edit, each line keeps its style.
// - Appended lines: clone the LAST slot's style (adding a bullet
//   copies the bullet style — the common list case, always right
//   for uniformly styled bodies).
// - Inserted lines: the new line takes the pushed-down slot's
//   style; following lines keep their slots by index.
// - Removed lines: their slots vanish with their style; the rest
//   keep theirs by index.
// - Empty lines: empty-text runs (schema-valid); trailing newlines
//   round-trip back to trailing empty paragraphs.
//
// The rule is deterministic, order-preserving, and undo-exact —
// but it IS positional: for mixed-style bodies a mid-list insert
// reassigns which words sit in which styled slot. Uniform bodies
// (the measured majority) cannot observe any difference. Callers
// gate on isEditableText first; multi-run input stays refused.
export function buildUpdatedParagraphs(template, draftText) {
  const lines = String(draftText ?? "").split("\n");
  return lines.map((line, i) => {
    const src = template[Math.min(i, template.length - 1)] ?? { runs: [{ text: "" }] };
    const style = { ...(src.runs[0] ?? { text: "" }) };
    const para = { runs: [{ ...style, text: line }] };
    if (src.align !== undefined) para.align = src.align;
    if (src.bullet !== undefined) para.bullet = src.bullet;
    return para;
  });
}

// True when paragraphs carry visibly different styling — the
// inspector's cue to show per-paragraph rows instead of a false
// uniform display. Compares the appearance keys a user can change
// plus the structural ones they can see.
export function paragraphStylesDiffer(paragraphs) {
  const ps = Array.isArray(paragraphs) ? paragraphs : [];
  if (ps.length < 2) return false;
  const sig = (p) => {
    const r = p?.runs?.[0] ?? {};
    return JSON.stringify({
      align: p?.align ?? null,
      bullet: p?.bullet ?? null,
      color: r.color ?? null,
      size: r.size ?? null,
      bold: r.bold ?? null,
      italic: r.italic ?? null,
      family: r.family ?? null,
      weight: r.weight ?? null,
    });
  };
  return new Set(ps.map(sig)).size > 1;
}

// Readable layer labels. Text leads with its role and opening
// words; shapes name their form; charts name their first series;
// tables name their dimensions; groups count their objects.
// Unnamed content degrades to its kind, never to a blank row.
export function elementLabel(el) {
  const kids = el?.group?.children ?? [];
  switch (el?.kind) {
    case "text": {
      const runs = el.paragraphs ?? [];
      const first = runs[0]?.runs?.[0] ?? {};
      const words = runs.map((p) => (p.runs ?? []).map((r) => r.text ?? "").join("")).join(" ").trim().replace(/\s+/g, " ");
      const role = first.role ?? "";
      const kind = role === "heading" || role === "display" ? "Heading" : role === "subhead" ? "Subhead" : "Text";
      return words ? `${kind} — ${words.slice(0, 32)}${words.length > 32 ? "…" : ""}` : kind;
    }
    case "shape": {
      const form = el.shape?.form ?? "rect";
      return form === "roundRect" ? "Rounded rectangle" : form === "ellipse" ? "Ellipse" : "Rectangle";
    }
    case "chart":
      return `${el.chart?.series?.[0]?.name ?? "Chart"} chart`;
    case "table": {
      const rows = el.table?.rows ?? [];
      const cols = rows.reduce((n, r) => Math.max(n, (r ?? []).length), 0);
      return `Table ${cols}×${rows.length}`;
    }
    case "image":
      return el.image?.alt ? `Image — ${String(el.image.alt).slice(0, 28)}` : "Image";
    case "line":
      return "Line";
    case "group":
      return `Group — ${kids.length} object${kids.length === 1 ? "" : "s"}`;
    default:
      return el?.kind ?? "Object";
  }
}

// Visible-row filter over flattened layers: drops every row with
// a collapsed ancestor. Pure, so the collapse contract is
// unit-testable without a browser; the panel only holds the id
// set. Collapsed groups themselves stay visible.
export function applyCollapse(rows, collapsed) {
  const hidden = new Set(Array.isArray(collapsed) ? collapsed : [...(collapsed ?? [])]);
  return (rows ?? []).filter((row) => {
    let p = row.parentId;
    while (p) {
      if (hidden.has(p)) return false;
      p = (rows ?? []).find((r) => r.id === p)?.parentId ?? null;
    }
    return true;
  });
}
// Flat layer rows for the panel, parents before children, in draw
// order (z rank). Each row carries its depth and parent id; the
// panel renders indentation and expand/collapse from that. No
// parallel ids — every row IS the authoritative element id.
export function flattenLayers(elements, depth = 0, parentId = null, out = []) {
  const ordered = [...(elements ?? [])].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const el of ordered) {
    out.push({ id: el.id, kind: el.kind, depth, parentId, locked: el.locked === true, hidden: el.hidden === true, label: elementLabel(el) });
    if (el.kind === "group") flattenLayers(el.group?.children, depth + 1, el.id, out);
  }
  return out;
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

// Honest density visibility for tables WITHOUT a layout engine:
// reuse the compiler's own lineCount heuristic against the
// element's resolved column widths and row heights. Advisory only
// — authored rows are always kept; geometry never changes here.
// Column widths and row heights resolve exactly like both
// renderers (declared layout entry, else even split), so the
// estimate agrees with what the projections draw.
export function tableOverflowEstimate(el) {
  const table = el?.table;
  if (!el || el.kind !== "table" || !table) return null;
  const rows = table.rows ?? [];
  if (rows.length === 0) return null;
  const layout = table.layout ?? {};
  const cols = rows.reduce((n, r) => Math.max(n, (r ?? []).length), 0);
  if (cols === 0) return null;
  const colWidths = layout.colWidths?.length === cols
    ? layout.colWidths
    : Array.from({ length: cols }, () => el.w / cols);
  const pad = layout.padding ?? 0.05;
  const header = table.header === true;
  const messages = [];
  rows.forEach((row, ri) => {
    const isHeader = header && ri === 0;
    const size = isHeader ? (layout.headerSize ?? 10) : (layout.bodySize ?? 10);
    const style = {
      family: layout.fontFamily || undefined,
      size,
      weight: isHeader && layout.headerBold !== false ? 700 : 400,
    };
    const rowH = layout.rowHeights?.[ri] ?? el.h / rows.length;
    (row ?? []).forEach((cell, ci) => {
      const cw = Math.max(0.1, (colWidths[ci] ?? el.w / cols) - 2 * pad);
      let lines = 0;
      for (const segment of String(cell ?? "").split("\n")) {
        lines += Math.max(1, lineCount(segment, cw, style));
      }
      const needH = lines * ((size / 72) * 1.35) + 2 * pad;
      if (needH > rowH + 1e-9) {
        messages.push(`row ${ri + 1} needs ~${needH.toFixed(2)}in, has ${rowH.toFixed(2)}in — widen the table or cut cell copy (geometry unchanged)`);
      }
    });
  });
  return {
    fits: messages.length === 0,
    rows: rows.length,
    cols,
    message: messages.length === 0 ? null : messages[0] + (messages.length > 1 ? ` (+${messages.length - 1} more)` : ""),
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
