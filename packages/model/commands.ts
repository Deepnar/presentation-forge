// @forge/model — command types. Every human and agent mutation of a scene
// goes through these, so history (undo/redo), autosave, and preservation
// share one seam. Each apply returns its inverse.
//
// These command shapes are internal compile-time contracts (hand-written:
// no schema is authoritative for them yet). When commands become agent
// tool/API inputs, the external tool input gets runtime validation;
// no schema is created purely for ceremony before then.

import { findElement, humanId } from "./scene.ts";
import type { SlideScene, SceneElement, Paragraph } from "./scene.generated.ts";

export type ElementMove = { type: "element.move"; id: string; x: number; y: number };
export type ElementResize = { type: "element.resize"; id: string; w: number; h: number };
// Atomic origin-plus-extent update for resize handles on the top and
// left edges, which move x/y as well as w/h. One command, one
// inverse, one history entry — never a move+resize pair that could
// half-land. element.resize stays for extent-only callers.
export type ElementSetGeometry = { type: "element.setGeometry"; id: string; x: number; y: number; w: number; h: number };
// Narrow shape-appearance update: fill, stroke, and stroke width are
// the owned keys. Only keys PRESENT in the command are touched, so a
// partial update never wipes an unmentioned key; an explicit null
// REMOVES the key (restoring absence). fillAlpha/strokeAlpha/form
// ride along untouched. The inverse applyCommand returns uses the
// same representation, so undo restores exact prior appearance —
// including a previously absent stroke — rather than layering over it.
export type StylePatchValue = string | null;
export type ElementSetStyle = {
  type: "element.setStyle";
  id: string;
  style: { fill?: StylePatchValue; stroke?: StylePatchValue; strokeWidth?: number | null };
};
// Narrow text-appearance update: color, size, bold, and italic over
// whole addressable runs. Targeting is paragraph-scoped
// (paragraphIndex) or whole-element (omitted) — never an arbitrary
// substring, because runs are never split here. Only keys PRESENT
// in the patch are touched; explicit null REMOVES the key
// (restoring absence, which matters: bold:false differs from an
// absent bold when weight >= 600). All other run keys (family,
// weight, tracking, line, transform, role) ride along untouched.
// The inverse restores prior paragraphs wholesale, so undo is exact
// regardless of which keys were mentioned.
export type TextStylePatch = {
  color?: string | null;
  size?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
};
export type ElementSetTextStyle = {
  type: "element.setTextStyle";
  id: string;
  paragraphIndex?: number;
  style: TextStylePatch;
};
export type ElementSetTextStyleInverse = {
  type: "element.setTextStyle";
  id: string;
  paragraphs: Paragraph[] | undefined;
};
export type ElementUpdateText = { type: "element.updateText"; id: string; paragraphs: Paragraph[] };
// An update inverse restores whatever the element held — including absent
// paragraphs — so it carries the wider shape rather than weakening the
// forward command.
export type ElementUpdateTextInverse = { type: "element.updateText"; id: string; paragraphs: Paragraph[] | undefined };
export type SceneElementInput = Partial<SceneElement> & Pick<SceneElement, "kind" | "x" | "y" | "w" | "h">;
export type ElementAdd = { type: "element.add"; element: SceneElementInput; index?: number };
export type ElementDelete = { type: "element.delete"; id: string };
export type DeckCommand = ElementMove | ElementResize | ElementSetGeometry | ElementSetStyle | ElementSetTextStyle | ElementSetTextStyleInverse | ElementUpdateText | ElementUpdateTextInverse | ElementAdd | ElementDelete;

// Detached is NOT read-only: the scene is authoritative against compiler
// reflow, but the user owns it more strongly, so manual commands still
// apply. Only locked elements reject edits here.
function assertEditable(el: SceneElement): void {
  if (el.locked) throw new Error(`element ${el.id} is locked`);
}

function markCustomized(scene: SlideScene, el: SceneElement, geometry = true): void {
  if (el.provenance === "compiler") el.provenance = "human";
  if (geometry) el.customized = true;
  if (scene.layoutState === "managed") scene.layoutState = "customized";
}

// Text ownership is recorded separately from geometry: a moved
// element keeps compiler-refreshed text on regeneration, while a
// rewritten element keeps its human paragraphs (see recompileSlide
// and docs/V2-5A-EDITOR-ARCHITECTURE.md §10). One boolean, set only
// here, is the whole extension — no field-level CRDT.
function markContentCustomized(scene: SlideScene, el: SceneElement): void {
  if (el.provenance === "compiler") el.provenance = "human";
  el.contentCustomized = true;
  if (scene.layoutState === "managed") scene.layoutState = "customized";
}

// Text-appearance ownership is recorded separately from wording:
// a recolored heading keeps compiler-refreshed wording on
// regeneration while keeping its human paint, and rewritten wording
// keeps flowing through the content rule. One boolean, set only
// here — the narrow formatCustomized extension, mirroring style.
function markFormatCustomized(scene: SlideScene, el: SceneElement): void {
  if (el.provenance === "compiler") el.provenance = "human";
  el.formatCustomized = true;
  if (scene.layoutState === "managed") scene.layoutState = "customized";
}

// Appearance ownership is recorded separately from geometry and
// text for the same reason content is: a resized compiler shape
// must keep its theme fill on regeneration, while a restyled one
// keeps its human fill (see recompileSlide). One boolean, set only
// here — the narrow styleCustomized extension.
function markStyleCustomized(scene: SlideScene, el: SceneElement): void {
  if (el.provenance === "compiler") el.provenance = "human";
  el.styleCustomized = true;
  if (scene.layoutState === "managed") scene.layoutState = "customized";
}

export function applyCommand(scene: SlideScene, cmd: DeckCommand): DeckCommand {
  switch (cmd.type) {
    case "element.move": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      assertEditable(el);
      const prev = { x: el.x, y: el.y };
      el.x = cmd.x;
      el.y = cmd.y;
      markCustomized(scene, el);
      return { type: "element.move", id: cmd.id, ...prev };
    }
    case "element.resize": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      assertEditable(el);
      const prev = { w: el.w, h: el.h };
      el.w = cmd.w;
      el.h = cmd.h;
      markCustomized(scene, el);
      return { type: "element.resize", id: cmd.id, ...prev };
    }
    case "element.setGeometry": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      assertEditable(el);
      const prev = { x: el.x, y: el.y, w: el.w, h: el.h };
      el.x = cmd.x;
      el.y = cmd.y;
      el.w = cmd.w;
      el.h = cmd.h;
      markCustomized(scene, el);
      return { type: "element.setGeometry", id: cmd.id, ...prev };
    }
    case "element.setStyle": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      if (el.kind !== "shape") throw new Error(`element ${cmd.id} is not a shape`);
      assertEditable(el);
      const prev: { fill?: StylePatchValue; stroke?: StylePatchValue; strokeWidth?: number | null } = {};
      const curShape = el.shape ?? {};
      const next: Record<string, string | number> = { ...curShape };
      // Unmentioned keys ride along untouched (LIFO undo needs no
      // pin: nothing can change them between forward and inverse).
      if (cmd.style.fill !== undefined) {
        prev.fill = curShape.fill ?? null;
        if (cmd.style.fill === null) delete next.fill;
        else next.fill = cmd.style.fill;
      }
      if (cmd.style.stroke !== undefined) {
        prev.stroke = curShape.stroke ?? null;
        if (cmd.style.stroke === null) delete next.stroke;
        else next.stroke = cmd.style.stroke;
      }
      if (cmd.style.strokeWidth !== undefined) {
        prev.strokeWidth = curShape.strokeWidth ?? null;
        if (cmd.style.strokeWidth === null) delete next.strokeWidth;
        else next.strokeWidth = cmd.style.strokeWidth;
      }
      el.shape = next;
      markStyleCustomized(scene, el);
      return { type: "element.setStyle", id: cmd.id, style: prev };
    }
    case "element.setTextStyle": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      if (el.kind !== "text") throw new Error(`element ${cmd.id} is not text`);
      assertEditable(el);
      // Restore path (the inverse): wholesale prior paragraphs.
      if ("paragraphs" in cmd) {
        const before = el.paragraphs;
        el.paragraphs = (cmd as ElementSetTextStyleInverse).paragraphs;
        markFormatCustomized(scene, el);
        return { type: "element.setTextStyle", id: cmd.id, paragraphs: before };
      }
      const forward = cmd as ElementSetTextStyle;
      const paras = el.paragraphs ?? [];
      const idxs = forward.paragraphIndex !== undefined ? [forward.paragraphIndex] : paras.map((_, i) => i);
      if (forward.paragraphIndex !== undefined && (idxs[0] < 0 || idxs[0] >= paras.length)) {
        throw new Error(`paragraph ${forward.paragraphIndex} out of range for element ${cmd.id}`);
      }
      const prev = el.paragraphs;
      el.paragraphs = paras.map((p, i) => {
        if (!idxs.includes(i)) return p;
        // Formatting addresses whole runs only: a multi-run
        // paragraph is refused rather than partially rewritten.
        if (!Array.isArray(p.runs) || p.runs.length !== 1) {
          throw new Error(`paragraph ${i} of element ${cmd.id} is not a single run`);
        }
        const run = { ...(p.runs[0] ?? {}) };
        for (const k of ["color", "size", "bold", "italic"] as const) {
          const v = forward.style[k];
          if (v === undefined) continue;
          if (v === null) delete run[k];
          else (run[k] as unknown) = v;
        }
        return { ...p, runs: [run] };
      });
      markFormatCustomized(scene, el);
      return { type: "element.setTextStyle", id: cmd.id, paragraphs: prev };
    }
    case "element.updateText": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      if (el.kind !== "text") throw new Error(`element ${cmd.id} is not text`);
      assertEditable(el);
      const prev = { paragraphs: el.paragraphs };
      el.paragraphs = cmd.paragraphs;
      markContentCustomized(scene, el);
      return { type: "element.updateText", id: cmd.id, ...prev };
    }
    case "element.add": {
      const el: SceneElement = { id: cmd.element.id ?? humanId(), provenance: "human", z: scene.elements.length, ...cmd.element };
      // Explicit index restores exact position on undo-delete; the
      // default appends. Out-of-range indices clamp to the end.
      const at = cmd.index === undefined ? scene.elements.length : Math.max(0, Math.min(cmd.index, scene.elements.length));
      scene.elements.splice(at, 0, el);
      if (scene.layoutState === "managed") scene.layoutState = "customized";
      return { type: "element.delete", id: el.id };
    }
    case "element.delete": {
      const i = scene.elements.findIndex((e) => e.id === cmd.id);
      if (i < 0) throw new Error(`unknown element ${cmd.id}`);
      if (scene.elements[i].locked) throw new Error(`element ${cmd.id} is locked`);
      const [removed] = scene.elements.splice(i, 1);
      if (scene.layoutState === "managed") scene.layoutState = "customized";
      return { type: "element.add", element: removed, index: i };
    }
  }
}

// Deck-level ops shared with slide add/delete/duplicate/reorder. These are
// pure functions over a scenes array so the UI and the agent use one path.
export function insertScene(scenes: SlideScene[], scene: SlideScene, index: number = scenes.length): SlideScene[] {
  const next = [...scenes];
  next.splice(index, 0, scene);
  return next;
}

export function deleteScene(scenes: SlideScene[], id: string): SlideScene[] {
  if (scenes.length <= 1) throw new Error("a deck must keep at least one slide");
  return scenes.filter((s) => s.id !== id);
}

export function duplicateScene(scenes: SlideScene[], id: string): SlideScene[] {
  const i = scenes.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`unknown slide ${id}`);
  const copy: SlideScene = JSON.parse(JSON.stringify(scenes[i]));
  copy.id = `${id}-copy`;
  copy.elements = copy.elements.map((e) => ({ ...e, id: `${e.id}-copy` }));
  const next = [...scenes];
  next.splice(i + 1, 0, copy);
  return next;
}

export function reorderScene(scenes: SlideScene[], id: string, toIndex: number): SlideScene[] {
  const from = scenes.findIndex((s) => s.id === id);
  if (from < 0) throw new Error(`unknown slide ${id}`);
  const next = scenes.filter((s) => s.id !== id);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, scenes[from]);
  return next;
}
