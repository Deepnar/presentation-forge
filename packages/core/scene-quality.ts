// @forge/core — deterministic scene quality primitives. L1 findings are
// correctness/integrity violations (defects); L2 findings are advisory
// heuristics (potentially undesirable, not incorrect). No weights, no
// aggregate score — stable codes let benchmark history compare runs.
// Pure: no imports at all; callers supply validated structures.

import type { SlideScene, SceneElement } from "../model/scene.generated.ts";

export type FindingLayer = "L1" | "L2";

export interface QualityFinding {
  layer: FindingLayer;
  code: string;
  message: string;
  slideId?: string;
  elementIds?: string[];
  blockIds?: string[];
  evidence?: Record<string, string | number | boolean | string[]>;
}

export interface SemanticElement {
  id: string;
  kind: SceneElement["kind"];
  semanticRef?: string;
  text?: string[];
  chart?: { chartKind: string; categories: string[]; series: { name: string; values: number[] }[] };
  table?: { rows: string[][]; header?: boolean };
  image?: { src: string; alt?: string };
  children?: SemanticElement[];
}

export interface SemanticProjection {
  recipeId?: string;
  elements: SemanticElement[];
}

// Meaning-preserving projection of a scene: what the compiler emitted,
// minus all styling and geometry. Proves only structural equivalence,
// never equal communicative quality.
export function semanticProjection(scene: SlideScene): SemanticProjection {
  const project = (el: SceneElement): SemanticElement => {
    const out: SemanticElement = { id: el.id, kind: el.kind };
    if (el.semanticRef !== undefined) out.semanticRef = el.semanticRef;
    if (el.kind === "text") {
      out.text = (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join(""));
    } else if (el.kind === "chart" && el.chart) {
      out.chart = {
        chartKind: el.chart.chartKind,
        categories: [...(el.chart.categories ?? [])],
        series: (el.chart.series ?? []).map((s) => ({ name: s.name, values: [...s.values] })),
      };
    } else if (el.kind === "table" && el.table) {
      out.table = { rows: (el.table.rows ?? []).map((r) => [...r]) };
      if (el.table.header !== undefined) out.table.header = el.table.header;
    } else if (el.kind === "image" && el.image) {
      out.image = { src: el.image.src ?? "", alt: el.image.alt ?? "" };
    } else if (el.kind === "group") {
      out.children = (el.group?.children ?? []).map(project);
    }
    return out;
  };
  const elements = [...scene.elements]
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(project);
  const projection: SemanticProjection = { elements };
  if (scene.recipeId !== undefined) projection.recipeId = scene.recipeId;
  return projection;
}

const EPS = 1e-9;

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

// Geometry validity over canonical scene bounds. Groups recurse with the
// parent offset applied. Deliberately no generic overlap rule: overlap
// can be intentional and V2 lacks the semantics to classify it.
export function checkSceneGeometry(
  scene: SlideScene,
  bounds: { w: number; h: number } = { w: scene.width, h: scene.height },
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const walk = (el: SceneElement, dx: number, dy: number, path: string): void => {
    const where = path ? `${path}/${el.id}` : el.id;
    const x = el.x + dx;
    const y = el.y + dy;
    if (![x, y, el.w, el.h].every(finite)) {
      findings.push({
        layer: "L1", code: "non-finite-geometry",
        message: `${where} has non-finite coordinates or dimensions`,
        slideId: scene.id, elementIds: [el.id],
      });
      return;
    }
    if (!(el.w > 0) || !(el.h > 0)) {
      findings.push({
        layer: "L1", code: "non-positive-extent",
        message: `${where} has non-positive extent ${el.w}x${el.h}`,
        slideId: scene.id, elementIds: [el.id],
      });
      return;
    }
    if (x < -EPS || y < -EPS || x + el.w > bounds.w + EPS || y + el.h > bounds.h + EPS) {
      findings.push({
        layer: "L1", code: "off-canvas",
        message: `${where} footprint leaves the ${bounds.w}x${bounds.h} canvas`,
        slideId: scene.id, elementIds: [el.id],
      });
    }
    for (const c of el.group?.children ?? []) walk(c, x, y, where);
  };
  for (const el of scene.elements) walk(el, 0, 0, "");
  return findings;
}

// Duplicate element identity, including nested group content.
export function checkElementIds(scene: SlideScene): QualityFinding[] {
  const seen = new Map<string, number>();
  const walk = (els: SceneElement[]): void => {
    for (const el of els) {
      seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      walk(el.group?.children ?? []);
    }
  };
  walk(scene.elements);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (!dupes.length) return [];
  return [{
    layer: "L1", code: "duplicate-element-id",
    message: `duplicate scene element ids: ${dupes.join(", ")}`,
    slideId: scene.id, elementIds: dupes,
  }];
}

// Deck-level composition monotony over consecutive recipe repetition.
// Conservative by design: a streak of 4 identical recipes, or one recipe
// owning 60%+ of content slides (minimum 4 slides), is worth a look —
// never a defect, because intentional repetition exists.
export function checkRecipeMonotony(scenes: readonly SlideScene[]): QualityFinding[] {
  const ids = scenes.map((s) => s.id);
  const recipes = scenes.map((s) => s.recipeId ?? "unknown");
  const findings: QualityFinding[] = [];
  let run = 1;
  const flush = (end: number): void => {
    if (run >= 4) {
      findings.push({
        layer: "L2", code: "recipe-streak",
        message: `${run} consecutive "${recipes[end - 1]}" slides — vary composition`,
        slideId: ids[end - 1], elementIds: [],
      });
    }
    run = 1;
  };
  for (let i = 1; i <= recipes.length; i++) {
    if (i < recipes.length && recipes[i] === recipes[i - 1]) run++;
    else flush(i);
  }
  const counts = new Map<string, { n: number; at: number }>();
  recipes.forEach((r, i) => {
    const e = counts.get(r) ?? { n: 0, at: i };
    e.n++;
    counts.set(r, e);
  });
  for (const [r, { n, at }] of counts) {
    if (n >= 4 && n > scenes.length * 0.6) {
      findings.push({
        layer: "L2", code: "recipe-dominance",
        message: `"${r}" owns ${n}/${scenes.length} slides (>60%) — mix families`,
        slideId: ids[at], elementIds: [],
      });
    }
  }
  return findings.sort((a, b) => (a.message < b.message ? -1 : a.message > b.message ? 1 : 0));
}
