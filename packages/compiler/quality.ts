// @forge/compiler — deterministic deck quality harness. Measures what
// the compiler emitted without changing it: schema validity, geometry,
// identity, authored-block representation, chart fidelity, fit/floor
// overflow (from compiler evidence, never re-measured), takeaway
// realization, chrome realization, footer-band reservation, and
// composition monotony. Findings are ordered deterministically. Pure
// apart from the model validators it delegates schema checks to (their
// schemas load from package data, never user disk). QA observes
// compilation; it never mutates it.
import { compileDeckDetailed } from "./compile.js";
import type { DeckIntent, SlideIntent } from "../model/intent.generated.ts";
import type { SlideScene } from "../model/scene.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";
import type { SlideCompositionPlan } from "./composition.ts";
import type { FitDiagnostic } from "./text-fit.ts";
import type { DeckChromeInput, DeckChromePlan, SlideChromePlan } from "./chrome.ts";
import { chromePlanForSlide } from "./chrome.ts";
import { FOOT_Y, FOOT_H } from "../core/chrome.ts";
import { SCENE_W } from "../model/scene-constants.ts";
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

const CHROME_ID = /:chrome:(title-banner|content-mark|presenter|slide-number)$/;

function isCompilerChrome(el: SlideScene["elements"][number]): boolean {
  return el.provenance === "compiler" && CHROME_ID.test(el.id);
}

function chromeText(el: SlideScene["elements"][number]): string {
  return (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join("")).join("\n");
}

interface ExpectedChrome {
  id: string;
  kind: "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  src?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
  align?: string;
  valign?: string;
}

function expectedChromeElements(plan: SlideChromePlan): ExpectedChrome[] {
  const out: ExpectedChrome[] = [];
  if (plan.banner) {
    out.push({ id: `${plan.slideId}:chrome:title-banner`, kind: "image", ...plan.banner.box, src: plan.banner.src });
  }
  if (plan.mark) {
    out.push({ id: `${plan.slideId}:chrome:content-mark`, kind: "image", ...plan.mark.box, src: plan.mark.src });
  }
  for (const [suffix, part, align] of [
    ["presenter", plan.presenter, "left"],
    ["slide-number", plan.slideNumber, "right"],
  ] as const) {
    if (!part) continue;
    out.push({
      id: `${plan.slideId}:chrome:${suffix}`, kind: "text",
      ...part.box, text: part.text,
      fontSize: part.style.fontSize, fontFamily: part.style.fontFamily,
      color: part.style.color, opacity: part.style.opacity,
      align, valign: part.style.valign,
    });
  }
  return out;
}

// The emitted scene must match the actual chrome plan: stable IDs,
// kinds, locked compiler ownership, exact geometry, and exact
// text/style for footer elements. A human element merely containing
// the word "chrome" never qualifies — provenance must be compiler
// and the ID must match the stable convention.
export function checkChromeRealization(
  plan: SlideChromePlan | null | undefined,
  scene: SlideScene,
): QualityFinding[] {
  if (!plan) return [];
  const findings: QualityFinding[] = [];
  const expected = expectedChromeElements(plan);
  const actual = new Map(scene.elements.filter(isCompilerChrome).map((e) => [e.id, e]));
  const expectedIds = new Set(expected.map((e) => e.id));
  for (const exp of expected) {
    const base = { slideId: scene.id, elementIds: [exp.id] as string[] };
    const el = actual.get(exp.id);
    if (!el) {
      findings.push({
        layer: "L1", code: "chrome-not-realized",
        message: `slide ${scene.id} planned chrome ${exp.id} has no scene element`,
        ...base,
      });
      continue;
    }
    const mismatch = (field: string, want: unknown, got: unknown): QualityFinding => ({
      layer: "L1", code: "chrome-realization-mismatch",
      message: `slide ${scene.id} chrome ${exp.id} ${field} differs from plan`,
      ...base,
      evidence: { field, expected: String(want), actual: String(got) },
    });
    if (el.kind !== exp.kind) { findings.push(mismatch("kind", exp.kind, el.kind)); continue; }
    if (el.locked !== true) findings.push(mismatch("locked", true, el.locked));
    if (el.provenance !== "compiler") findings.push(mismatch("provenance", "compiler", el.provenance));
    if (el.semanticRef !== undefined) findings.push(mismatch("semanticRef", "absent", el.semanticRef));
    for (const k of ["x", "y", "w", "h"] as const) {
      if (el[k] !== exp[k]) findings.push(mismatch(`box.${k}`, exp[k], el[k]));
    }
    if (exp.kind === "image") {
      if (el.image?.src !== exp.src) findings.push(mismatch("image.src", exp.src, el.image?.src));
    } else {
      if (chromeText(el) !== exp.text) findings.push(mismatch("text", exp.text, chromeText(el)));
      const run = el.paragraphs?.[0]?.runs?.[0];
      if (run?.size !== exp.fontSize) findings.push(mismatch("fontSize", exp.fontSize, run?.size));
      if ((run?.family ?? undefined) !== exp.fontFamily) findings.push(mismatch("fontFamily", exp.fontFamily, run?.family));
      if ((run?.color ?? undefined) !== exp.color) findings.push(mismatch("color", exp.color, run?.color));
      if ((el.opacity ?? undefined) !== exp.opacity) findings.push(mismatch("opacity", exp.opacity, el.opacity));
      if ((el.paragraphs?.[0]?.align ?? undefined) !== exp.align) findings.push(mismatch("align", exp.align, el.paragraphs?.[0]?.align));
      if ((el.valign ?? undefined) !== exp.valign) findings.push(mismatch("valign", exp.valign, el.valign));
    }
  }
  for (const el of actual.values()) {
    if (expectedIds.has(el.id)) continue;
    findings.push({
      layer: "L1", code: "chrome-not-realized",
      message: `slide ${scene.id} has unexpected stale chrome ${el.id} with no plan entry`,
      slideId: scene.id, elementIds: [el.id],
    });
  }
  return findings;
}

function footprints(el: SlideScene["elements"][number], dx: number, dy: number): { x: number; y: number; w: number; h: number }[] {
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  if (el.kind === "line" && el.line) {
    const x1 = Math.min(el.x + dx, el.line.x2 + dx);
    const y1 = Math.min(el.y + dy, el.line.y2 + dy);
    boxes.push({ x: x1, y: y1, w: Math.max(Math.abs(el.line.x2 - el.x), 0.01), h: Math.max(Math.abs(el.line.y2 - el.y), 0.01) });
  } else if (el.kind !== "group") {
    boxes.push({ x: el.x + dx, y: el.y + dy, w: el.w, h: el.h });
  }
  for (const c of el.group?.children ?? []) boxes.push(...footprints(c, dx + el.x, dy + el.y));
  return boxes;
}

// Narrowly scoped footer-band reservation check: compiler-owned
// NON-chrome content must not enter the known footer chrome band on
// a content-surface slide. This is legal only because the band has
// explicit semantics — it is not a generic overlap rule, and 3E-2's
// no-generic-overlap boundary stands.
export function checkChromeBand(
  plan: SlideChromePlan | null | undefined,
  scene: SlideScene,
): QualityFinding[] {
  if (!plan || plan.surface !== "content") return [];
  const band = { x: 0, y: FOOT_Y, w: SCENE_W, h: FOOT_H };
  const hits = (b: { x: number; y: number; w: number; h: number }): boolean =>
    b.x < band.x + band.w && b.x + b.w > band.x && b.y < band.y + band.h && b.y + b.h > band.y;
  const findings: QualityFinding[] = [];
  for (const el of scene.elements) {
    if (el.provenance !== "compiler" || isCompilerChrome(el)) continue;
    const intruding = footprints(el, 0, 0).filter(hits);
    if (intruding.length) {
      findings.push({
        layer: "L1", code: "chrome-band-overlap",
        message: `slide ${scene.id} compiler content ${el.id} enters the reserved footer band`,
        slideId: scene.id, elementIds: [el.id],
      });
    }
  }
  return findings;
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
    const code = d.kind === "word-floor-hit" ? "text-word-floor-hit"
      : d.kind === "table-cell-overflow" ? "table-cell-overflow"
        : d.kind === "chart-label-overflow" ? "chart-label-overflow"
          : "text-fit-floor-hit";
    const message = d.kind === "table-cell-overflow"
      ? `table element ${d.elementId} cannot seat its cells at readable size`
      : d.kind === "chart-label-overflow"
        ? `chart element ${d.elementId} cannot seat its labels at readable size`
        : `text element ${d.elementId} (${d.role}) cannot fit its box at the readable floor`;
    const finding: QualityFinding = {
      layer: "L1",
      code,
      message,
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

export async function analyzeDeck(intent: DeckIntent, design: DesignSystem, chrome: DeckChromeInput | null = null): Promise<DeckAnalysis> {
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
  const { scenes, plan, chromePlan, findings: planFindings, fitDiagnostics } = compileDeckDetailed(intent, design, chrome);
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
      findings.push(...checkChromeRealization(chromePlanForSlide(chromePlan, scene.id), scene));
      findings.push(...checkChromeBand(chromePlanForSlide(chromePlan, scene.id), scene));
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
