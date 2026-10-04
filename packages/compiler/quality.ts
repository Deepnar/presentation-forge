// @forge/compiler — deterministic deck quality harness. Measures what
// the compiler emitted without changing it: schema validity, geometry,
// identity, authored-block representation, chart fidelity, fit/floor
// overflow (from compiler evidence, never re-measured), takeaway
// realization, and composition monotony. Findings are ordered
// deterministically. Pure apart from the model validators it delegates
// schema checks to (their schemas load from package data, never user
// disk). QA observes compilation; it never mutates it.
import { compileDeckDetailed } from "./compile.js";
import type { DeckIntent, SlideIntent } from "../model/intent.generated.ts";
import type { SlideScene } from "../model/scene.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";
import type { SlideCompositionPlan } from "./composition.ts";
import type { FitDiagnostic } from "./text-fit.ts";
import { validateDeckIntent } from "../model/intent.ts";
import { validateScene } from "../model/scene.ts";
import {
  semanticProjection,
  checkSceneGeometry,
  checkElementIds,
  checkRecipeMonotony,
  type QualityFinding,
} from "../core/scene-quality.ts";

export type { QualityFinding };

function order(findings: QualityFinding[]): QualityFinding[] {
  const key = (f: QualityFinding): string =>
    [f.slideId ?? "", f.layer, f.code, (f.elementIds ?? []).join(","), (f.blockIds ?? []).join(","), f.message].join("\u0000");
  return [...findings].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

function semanticRefs(scene: SlideScene): Set<string> {
  const refs = new Set<string>();
  const walk = (els: SlideScene["elements"]): void => {
    for (const el of els) {
      if (el.semanticRef !== undefined) refs.add(el.semanticRef);
      walk(el.group?.children ?? []);
    }
  };
  walk(scene.elements);
  return refs;
}

// Every authored content block must be visibly represented or compilation
// must explicitly refuse it. This exposes silent loss; it never fixes it.
export function checkBlockRepresentation(slide: SlideIntent, scene: SlideScene): QualityFinding[] {
  const refs = semanticRefs(scene);
  return slide.blocks
    .filter((b) => !refs.has(b.id))
    .map((b) => ({
      layer: "L1" as const,
      code: "unrepresented-block",
      message: `block ${b.id} (${b.kind}) has no scene element`,
      slideId: slide.id,
      blockIds: [b.id],
    }));
}

export function checkChartFidelity(slide: SlideIntent, scene: SlideScene): QualityFinding[] {
  const findings: QualityFinding[] = [];
  for (const block of slide.blocks) {
    if (block.kind !== "chart") continue;
    const el = scene.elements.find((e) => e.kind === "chart" && e.semanticRef === block.id);
    if (!el?.chart) continue; // absence is the representation check's job
    const norm = (v: unknown): string => JSON.stringify(v ?? null);
    if (
      norm(el.chart.categories) !== norm(block.categories) ||
      norm(el.chart.series) !== norm(block.series)
    ) {
      findings.push({
        layer: "L1",
        code: "chart-data-divergence",
        message: `chart block ${block.id} data differs from its scene element`,
        slideId: slide.id,
        blockIds: [block.id],
        elementIds: [el.id],
      });
    }
  }
  return findings;
}

export interface DeckAnalysis {
  scenes: SlideScene[];
  findings: QualityFinding[];
}

// Compiler fit evidence becomes stable L1 QA. The fitter already
// measured against the actual box, family, size, weight, tracking,
// transform, line ratio, policy, and mixed-run floor bound — QA
// consumes that verdict and MUST NOT re-measure text with a second
// overflow heuristic.
export function checkFitDiagnostics(
  intent: DeckIntent,
  diagnostics: readonly FitDiagnostic[],
): QualityFinding[] {
  const bySlide = new Map(intent.slides.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const findings: QualityFinding[] = [];
  for (const d of diagnostics) {
    const key = [d.slideId, d.elementId, d.kind, d.message].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    const slide = bySlide.get(d.slideId);
    const isBlock = d.semanticRef !== undefined &&
      slide !== undefined &&
      slide.blocks.some((b) => b.id === d.semanticRef);
    const finding: QualityFinding = {
      layer: "L1",
      code: d.kind === "word-floor-hit" ? "text-word-floor-hit" : "text-fit-floor-hit",
      message: `text element ${d.elementId} (${d.role}) cannot fit its box at the readable floor`,
      slideId: d.slideId,
      elementIds: [d.elementId],
      ...(isBlock ? { blockIds: [d.semanticRef as string] } : {}),
      evidence: {
        role: d.role,
        diagnostic: d.kind,
        ...(d.semanticRef !== undefined ? { semanticRef: d.semanticRef } : {}),
        detail: d.message,
      },
    };
    findings.push(finding);
  }
  return findings;
}

function takeawayElementText(el: SlideScene["elements"][number]): string {
  return (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).join("\n");
}

// The planner requested a deterministic takeaway treatment; the scene
// must realize exactly that treatment with the exact authored text.
// This proves emission, never persuasiveness, concision, or placement.
export function checkTakeawayRealization(
  slide: SlideIntent,
  composition: SlideCompositionPlan,
  scene: SlideScene,
): QualityFinding[] {
  if (!slide.takeaway) return [];
  const treatment = composition.takeawayTreatment;
  if (treatment === "none") return [];
  const expectedId = `${slide.id}:takeaway:${treatment}`;
  const el = scene.elements.find((e) => e.id === expectedId);
  const base = { slideId: slide.id, elementIds: [expectedId] as string[] };
  if (!el || el.kind !== "text") {
    const other = scene.elements.find((e) =>
      e.kind === "text" && /:takeaway:(headline|verdict|annotation)$/.test(e.id));
    if (other) {
      return [{
        layer: "L1",
        code: "takeaway-treatment-mismatch",
        message: `slide ${slide.id} planned takeaway ${treatment} but realized ${other.id}`,
        ...base,
      }];
    }
    return [{
      layer: "L1",
      code: "takeaway-not-realized",
      message: `slide ${slide.id} planned takeaway ${treatment} has no scene element`,
      ...base,
    }];
  }
  if (takeawayElementText(el) !== slide.takeaway) {
    return [{
      layer: "L1",
      code: "takeaway-not-realized",
      message: `slide ${slide.id} takeaway ${treatment} text differs from the authored takeaway`,
      ...base,
    }];
  }
  return [];
}

export async function analyzeDeck(intent: DeckIntent, design: DesignSystem): Promise<DeckAnalysis> {
  const intentVerdict = await validateDeckIntent(intent);
  if (!intentVerdict.ok) {
    return {
      scenes: [],
      findings: [{
        layer: "L1", code: "intent-invalid",
        message: `deck intent invalid: ${intentVerdict.errors.join("; ")}`,
      }],
    };
  }
  const { scenes, plan, findings: planFindings, fitDiagnostics } = compileDeckDetailed(intent, design);
  const findings: QualityFinding[] = [...planFindings];
  findings.push(...checkFitDiagnostics(intent, fitDiagnostics));
  const byId = new Map(intent.slides.map((s) => [s.id, s]));
  const planById = new Map(plan.slides.map((s) => [s.slideId, s]));
  for (const scene of scenes) {
    const sceneVerdict = await validateScene(scene);
    if (!sceneVerdict.ok) {
      findings.push({
        layer: "L1", code: "scene-invalid",
        message: `scene ${scene.id} invalid: ${sceneVerdict.errors.join("; ")}`,
        slideId: scene.id,
      });
    }
    findings.push(...checkSceneGeometry(scene));
    findings.push(...checkElementIds(scene));
    const slide = byId.get(scene.id);
    if (slide) {
      findings.push(...checkBlockRepresentation(slide, scene));
      findings.push(...checkChartFidelity(slide, scene));
      const comp = planById.get(scene.id);
      if (comp) findings.push(...checkTakeawayRealization(slide, comp, scene));
    }
  }
  findings.push(...checkRecipeMonotony(scenes));
  return { scenes, findings: order(findings) };
}

export interface SensitivityResult {
  pairId: string;
  sensitive: boolean;
  differences: { slideIndex: number; recipeChanged: boolean; contentChanged: boolean }[];
}

// Visual-structure projection: like semanticProjection plus geometry
// and frame treatment, minus renderer noise (colors, sizes, fills,
// strokes, z). Used to prove counterfactuals produce materially
// different scenes. This is NOT pixel comparison.
export interface CompositionSceneElement {
  kind: string;
  semanticRef?: string;
  geom: [number, number, number, number];
  text?: string;
  chartKind?: string;
  hasTable?: boolean;
  imageSrc?: string;
  shapeForm?: string;
}

export interface CompositionSceneProjection {
  recipeId?: string;
  elements: CompositionSceneElement[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function compositionSceneProjection(scene: SlideScene): CompositionSceneProjection {
  const elements = [...scene.elements]
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((el): CompositionSceneElement => {
      const out: CompositionSceneElement = {
        kind: el.kind,
        geom: [round2(el.x), round2(el.y), round2(el.w), round2(el.h)],
      };
      if (el.semanticRef !== undefined) out.semanticRef = el.semanticRef;
      if (el.kind === "text") {
        out.text = (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).join("\n");
      } else if (el.kind === "chart" && el.chart) {
        out.chartKind = el.chart.chartKind;
      } else if (el.kind === "table") {
        out.hasTable = true;
      } else if (el.kind === "image" && el.image) {
        out.imageSrc = el.image.src ?? "";
      } else if (el.kind === "shape" && el.shape) {
        out.shapeForm = el.shape.form;
      } else if (el.kind === "group") {
        out.text = `group(${(el.group?.children ?? []).length})`;
      }
      return out;
    });
  const projection: CompositionSceneProjection = { elements };
  if (scene.recipeId !== undefined) projection.recipeId = scene.recipeId;
  return projection;
}

// Compiles both sides of a counterfactual pair and compares semantic
// projections. Indifference here is a measurement, never a requirement:
// future composition work must make relevant pairs differ.
export function compareSensitivity(
  pairId: string,
  a: DeckIntent,
  b: DeckIntent,
  design: DesignSystem,
): SensitivityResult {
  const pa = compileDeckDetailed(a, design).scenes.map(semanticProjection);
  const pb = compileDeckDetailed(b, design).scenes.map(semanticProjection);
  const differences: SensitivityResult["differences"] = [];
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i];
    const sb = pb[i];
    if (JSON.stringify(sa ?? null) === JSON.stringify(sb ?? null)) continue;
    differences.push({
      slideIndex: i,
      recipeChanged: (sa?.recipeId ?? null) !== (sb?.recipeId ?? null),
      contentChanged: JSON.stringify(sa?.elements ?? null) !== JSON.stringify(sb?.elements ?? null),
    });
  }
  return { pairId, sensitive: differences.length > 0, differences };
}
