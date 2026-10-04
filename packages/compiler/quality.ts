// @forge/compiler — deterministic deck quality harness. Measures what
// the compiler emitted without changing it: schema validity, geometry,
// identity, authored-block representation, chart fidelity, and
// composition monotony. Findings are ordered deterministically. Pure
// apart from the model validators it delegates schema checks to (their
// schemas load from package data, never user disk).
import { compileDeck } from "./compile.js";
import type { DeckIntent, SlideIntent } from "../model/intent.generated.ts";
import type { SlideScene } from "../model/scene.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";
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
  return [...findings].sort((a, b) =>
    (a.slideId ?? "") < (b.slideId ?? "") ? -1
    : (a.slideId ?? "") > (b.slideId ?? "") ? 1
    : a.code < b.code ? -1
    : a.code > b.code ? 1
    : a.message < b.message ? -1
    : a.message > b.message ? 1 : 0,
  );
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
  const scenes = compileDeck(intent, design);
  const findings: QualityFinding[] = [];
  const byId = new Map(intent.slides.map((s) => [s.id, s]));
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

// Compiles both sides of a counterfactual pair and compares semantic
// projections. Indifference here is a measurement, never a requirement:
// future composition work must make relevant pairs differ.
export function compareSensitivity(
  pairId: string,
  a: DeckIntent,
  b: DeckIntent,
  design: DesignSystem,
): SensitivityResult {
  const pa = compileDeck(a, design).map(semanticProjection);
  const pb = compileDeck(b, design).map(semanticProjection);
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
