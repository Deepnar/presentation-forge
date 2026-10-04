// @forge/model — Layer C contracts: SlideScene / SceneElement.
//
// Types are generated from scene.schema.json (see scene.generated.ts);
// AJV owns runtime validation. Canonical units are inches on a
// 13.333 x 7.5 canvas (the same CANVAS src/chrome.js defines), so
// compiler geometry and pptxgenjs agree without conversion. Never store
// screen pixels here.

import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Ajv, type ValidateFunction } from "ajv";
import type { SlideScene, SceneElement } from "./scene.generated.ts";

export type { SlideScene, SceneElement, Paragraph, TextRun } from "./scene.generated.ts";

export { SCENE_W, SCENE_H } from "./scene-constants.ts";

let _validate: ValidateFunction | null = null;

async function validator(): Promise<ValidateFunction> {
  if (!_validate) {
    const url = new URL("./scene.schema.json", import.meta.url);
    const schema = JSON.parse(await readFile(url, "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    _validate = ajv.compile(schema);
  }
  return _validate;
}

export async function validateScene(scene: unknown): Promise<{ ok: boolean; errors: string[] }> {
  const validate = await validator();
  const ok = validate(scene);
  if (ok) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`),
  };
}

// Deterministic compiler ids: slide + block + role, so a recompile of
// unchanged intent yields byte-identical scenes. Human-added elements get
// random ids because they have no semantic parent.
export function compilerId(slideId: string, blockId: string, role: string): string {
  return `${slideId}:${blockId}:${role}`;
}

export function humanId(): string {
  return `h-${randomBytes(6).toString("hex")}`;
}

// Geometry invariant shared by the compiler and the editor: every element
// footprint must sit on the canvas with a positive extent. Mirrors the
// reporting in src/geometry.js without depending on pptxgenjs.
export function checkBounds(scene: SlideScene): string[] {
  const problems: string[] = [];
  const walk = (el: SceneElement, path: string): void => {
    const where = path ? `${path}/${el.id}` : el.id;
    if (!(el.w > 0) || !(el.h > 0)) problems.push(`${where}: non-positive extent ${el.w}x${el.h}`);
    const x2 = el.kind === "line" ? Math.max(el.x, el.line?.x2 ?? el.x) : el.x + el.w;
    const y2 = el.kind === "line" ? Math.max(el.y, el.line?.y2 ?? el.y) : el.y + el.h;
    const x1 = el.kind === "line" ? Math.min(el.x, el.line?.x2 ?? el.x) : el.x;
    const y1 = el.kind === "line" ? Math.min(el.y, el.line?.y2 ?? el.y) : el.y;
    if (x1 < -0.001 || y1 < -0.001 || x2 > scene.width + 0.001 || y2 > scene.height + 0.001) {
      problems.push(`${where}: footprint off canvas`);
    }
    for (const c of el.group?.children ?? []) walk(c, where);
  };
  for (const el of scene.elements) walk(el, "");
  return problems;
}

export function findElement(scene: SlideScene, id: string): SceneElement | null {
  const walk = (els: SceneElement[]): SceneElement | null => {
    for (const el of els) {
      if (el.id === id) return el;
      const found = walk(el.group?.children ?? []);
      if (found) return found;
    }
    return null;
  };
  return walk(scene.elements);
}
