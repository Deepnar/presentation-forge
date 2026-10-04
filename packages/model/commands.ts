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
export type ElementUpdateText = { type: "element.updateText"; id: string; paragraphs: Paragraph[] };
// An update inverse restores whatever the element held — including absent
// paragraphs — so it carries the wider shape rather than weakening the
// forward command.
export type ElementUpdateTextInverse = { type: "element.updateText"; id: string; paragraphs: Paragraph[] | undefined };
export type SceneElementInput = Partial<SceneElement> & Pick<SceneElement, "kind" | "x" | "y" | "w" | "h">;
export type ElementAdd = { type: "element.add"; element: SceneElementInput };
export type ElementDelete = { type: "element.delete"; id: string };
export type DeckCommand = ElementMove | ElementResize | ElementUpdateText | ElementUpdateTextInverse | ElementAdd | ElementDelete;

function assertEditable(scene: SlideScene, el: SceneElement): void {
  if (el.locked) throw new Error(`element ${el.id} is locked`);
  if (scene.layoutState === "detached") throw new Error(`slide ${scene.id} is detached`);
}

function markCustomized(scene: SlideScene, el: SceneElement, geometry = true): void {
  if (el.provenance === "compiler") el.provenance = "human";
  if (geometry) el.customized = true;
  if (scene.layoutState === "managed") scene.layoutState = "customized";
}

export function applyCommand(scene: SlideScene, cmd: DeckCommand): DeckCommand {
  switch (cmd.type) {
    case "element.move": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      assertEditable(scene, el);
      const prev = { x: el.x, y: el.y };
      el.x = cmd.x;
      el.y = cmd.y;
      markCustomized(scene, el);
      return { type: "element.move", id: cmd.id, ...prev };
    }
    case "element.resize": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      assertEditable(scene, el);
      const prev = { w: el.w, h: el.h };
      el.w = cmd.w;
      el.h = cmd.h;
      markCustomized(scene, el);
      return { type: "element.resize", id: cmd.id, ...prev };
    }
    case "element.updateText": {
      const el = findElement(scene, cmd.id);
      if (!el) throw new Error(`unknown element ${cmd.id}`);
      if (el.kind !== "text") throw new Error(`element ${cmd.id} is not text`);
      assertEditable(scene, el);
      const prev = { paragraphs: el.paragraphs };
      el.paragraphs = cmd.paragraphs;
      markCustomized(scene, el, false);
      return { type: "element.updateText", id: cmd.id, ...prev };
    }
    case "element.add": {
      const el: SceneElement = { id: cmd.element.id ?? humanId(), provenance: "human", z: scene.elements.length, ...cmd.element };
      scene.elements.push(el);
      if (scene.layoutState === "managed") scene.layoutState = "customized";
      return { type: "element.delete", id: el.id };
    }
    case "element.delete": {
      const i = scene.elements.findIndex((e) => e.id === cmd.id);
      if (i < 0) throw new Error(`unknown element ${cmd.id}`);
      if (scene.elements[i].locked) throw new Error(`element ${cmd.id} is locked`);
      const [removed] = scene.elements.splice(i, 1);
      if (scene.layoutState === "managed") scene.layoutState = "customized";
      return { type: "element.add", element: removed };
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
