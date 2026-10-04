// @forge/compiler — deterministic deck composition planning. Converts
// structured semantic intent into an ephemeral composition plan: WHAT
// strategy each slide uses, never geometry. Pure, no model calls, no
// prose parsing — free-text fields (audience/objective/narrative/
// designDirection/visualDirection/purpose/speakerNotes) cannot change
// the plan; only structured consequences can. V2-3D consumes the plan;
// the six-recipe scene compiler is untouched by it.

import type { DeckIntent, SlideIntent, ContentBlock } from "../model/intent.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";
import type { QualityFinding } from "../core/scene-quality.ts";

export type CompositionFamily =
  | "divider" | "prose-list" | "card-grid" | "comparison" | "data-table"
  | "metric" | "chart" | "sequence" | "hierarchy" | "media-led"
  | "framed-prose" | "escape";

export type DensityClass = "sparse" | "standard" | "dense";

export type MediaTreatment = "dominant" | "balanced" | "subordinate" | "none";

export type OutcomeTone = "affirming" | "cautionary" | "balanced" | "neutral";

export type TakeawayTreatment = "headline" | "verdict" | "annotation" | "none";

export type SelectionBasis =
  | "legacy-override" | "primary-carrier" | "relationship"
  | "rhetorical-role" | "content-shape" | "rhythm" | "fallback";

export interface OutcomeTreatment {
  blockId: string;
  tone: OutcomeTone;
}

export interface CaveatTarget {
  blockId: string;
  uncertainty: NonNullable<ContentBlock["uncertainty"]>;
}

export interface SlideCompositionPlan {
  slideId: string;
  family: CompositionFamily;
  variantKey: string;
  densityClass: DensityClass;
  emphasisTargets: string[];
  mediaTreatment: MediaTreatment;
  outcomeTreatments: OutcomeTreatment[];
  caveatTargets: CaveatTarget[];
  takeawayTreatment: TakeawayTreatment;
  breaks: { sectionOpen: boolean };
  selectionBasis: SelectionBasis;
}

export interface DeckCompositionPlan {
  slides: SlideCompositionPlan[];
}

export interface PlanResult {
  plan: DeckCompositionPlan;
  findings: QualityFinding[];
}

const LEGACY_RECIPE_FAMILY: Record<string, CompositionFamily> = {
  title: "divider",
  content: "prose-list",
  comparison: "comparison",
  media: "media-led",
  chart: "chart",
  process: "sequence",
};

const HONEST_CHART: Record<string, boolean> = {
  comparison: true,
  trend: true,
  composition: true,
  distribution: false,
  association: false,
};

function outcomeTone(outcome: NonNullable<ContentBlock["outcome"]>): OutcomeTone {
  if (outcome === "favorable") return "affirming";
  if (outcome === "unfavorable") return "cautionary";
  if (outcome === "mixed") return "balanced";
  return "neutral";
}

function blockUnits(block: ContentBlock): number {
  const chars = `${block.text ?? ""} ${block.label ?? ""} ${(block.items ?? []).join(" ")}`.length;
  switch (block.kind) {
    case "text":
    case "quote":
    case "callout":
      return Math.max(1, Math.ceil(chars / 180));
    case "list":
      return Math.max(1, block.items?.length ?? 1);
    case "stat":
    case "image":
      return 1;
    case "chart": {
      const points = (block.series ?? []).reduce((n, s) => n + (s.values?.length ?? 0), 0);
      return 2 + Math.ceil(points / 8);
    }
    case "table": {
      const headerCells = block.header ? 1 : 0;
      const cells = (block.rows ?? []).reduce((n, r) => n + r.length, 0) + headerCells;
      return 2 + Math.ceil(cells / 8);
    }
    default:
      return 1;
  }
}

function densityOf(slide: SlideIntent): DensityClass {
  const units = slide.blocks.reduce((n, b) => n + blockUnits(b), 0);
  if (units <= 3) return "sparse";
  if (units <= 7) return "standard";
  return "dense";
}

function mediaTreatmentFor(slide: SlideIntent): { treatment: MediaTreatment; variant: string | null } {
  const images = slide.blocks.filter((b) => b.kind === "image");
  if (!images.length) return { treatment: "none", variant: null };
  if (images.some((b) => b.emphasis === "primary")) return { treatment: "dominant", variant: "media-led/evidence" };
  const first = images[0];
  if (first.mediaRole === "evidence") return { treatment: "dominant", variant: "media-led/evidence" };
  if (first.mediaRole === "explanatory") return { treatment: "balanced", variant: "media-led/explanatory" };
  if (first.mediaRole === "decorative") return { treatment: "subordinate", variant: "media-led/decorative" };
  return { treatment: "balanced", variant: "media-led/standard" };
}

function takeawayFor(slide: SlideIntent, family: CompositionFamily): TakeawayTreatment {
  if (!slide.takeaway) return "none";
  if (family === "comparison") return "verdict";
  if (slide.rhetoricalRole === "decision" || slide.rhetoricalRole === "recommendation") return "verdict";
  if (family === "chart" || family === "metric" || family === "data-table") return "annotation";
  if (slide.rhetoricalRole === "evidence") return "annotation";
  return "headline";
}

interface FamilyPick {
  family: CompositionFamily;
  basis: SelectionBasis;
  finding?: QualityFinding;
}

function pickFamily(slide: SlideIntent): FamilyPick {
  const kinds = new Set(slide.blocks.map((b) => b.kind));
  const texts = slide.blocks.filter((b) => b.kind === "text");
  const chartBlock = slide.blocks.find((b) => b.kind === "chart");
  const tableBlock = slide.blocks.find((b) => b.kind === "table");
  const statBlock = slide.blocks.find((b) => b.kind === "stat");
  const imageBlock = slide.blocks.find((b) => b.kind === "image");

  // A. Honesty/capability: measures with no honest V2 chart encoding fall
  // back to data-table with a finding. Never a fake chart.
  if (chartBlock?.measure !== undefined && !HONEST_CHART[chartBlock.measure]) {
    return {
      family: "data-table",
      basis: "content-shape",
      finding: {
        layer: "L2",
        code: "measure-encoding-unavailable",
        message: `measure "${chartBlock.measure}" has no honest chart encoding; planning data-table`,
        slideId: slide.id,
        blockIds: [chartBlock.id],
        evidence: { measure: chartBlock.measure, fallback: "data-table" },
      },
    };
  }

  // B. Explicit compatibility override, honored unless dishonest.
  const hinted = slide.layoutHint?.recipe;
  if (hinted !== undefined && LEGACY_RECIPE_FAMILY[hinted] !== undefined) {
    const family = LEGACY_RECIPE_FAMILY[hinted];
    if (family === "chart" && chartBlock?.measure !== undefined && !HONEST_CHART[chartBlock.measure]) {
      return {
        family: "data-table",
        basis: "content-shape",
        finding: {
          layer: "L2",
          code: "measure-encoding-unavailable",
          message: `override to chart refused: measure "${chartBlock.measure}" has no honest encoding`,
          slideId: slide.id,
          blockIds: [chartBlock.id],
          evidence: { measure: chartBlock.measure, fallback: "data-table" },
        },
      };
    }
    return { family, basis: "legacy-override" };
  }

  // C. Primary carrier, unless a relationship demands stronger structure.
  const primary = slide.blocks.filter((b) => b.emphasis === "primary");
  const primaryKinds = new Set(primary.map((b) => b.kind));
  const carrier = ((): CompositionFamily | null => {
    if (primaryKinds.has("chart")) return "chart";
    if (primaryKinds.has("table")) return "data-table";
    if (primaryKinds.has("stat")) return "metric";
    if (primaryKinds.has("image")) return "media-led";
    return null;
  })();
  if (carrier && !slide.relationship) return { family: carrier, basis: "primary-carrier" };

  // D. Explicit relationship.
  switch (slide.relationship) {
    case "comparison":
      return { family: "comparison", basis: "relationship" };
    case "sequence":
      return { family: "sequence", basis: "relationship" };
    case "cause-effect":
    case "cycle":
      return { family: "sequence", basis: "relationship" };
    case "hierarchy":
      return { family: "hierarchy", basis: "relationship" };
    case "part-whole": {
      const quantitative = slide.blocks.find(
        (b) => b.kind === "chart" && b.measure === "composition",
      );
      if (quantitative) return { family: "chart", basis: "relationship" };
      return { family: "card-grid", basis: "relationship" };
    }
  }
  if (carrier) return { family: carrier, basis: "primary-carrier" };

  // E. Rhetorical role.
  const role = slide.rhetoricalRole;
  if ((role === "opening" || role === "transition") && slide.blocks.length <= 2) {
    return { family: "divider", basis: "rhetorical-role" };
  }
  if (role === "limitation" || role === "recommendation" || role === "conclusion") {
    const framed = slide.blocks.some((b) => b.kind === "quote" || b.kind === "callout" || b.kind === "text");
    if (framed) return { family: "framed-prose", basis: "rhetorical-role" };
  }
  if (role === "evidence") {
    const evidenceCarrier = ((): CompositionFamily | null => {
      if (kinds.has("chart")) return "chart";
      if (kinds.has("table")) return "data-table";
      if (kinds.has("stat")) return "metric";
      if (kinds.has("image")) return "media-led";
      return null;
    })();
    if (evidenceCarrier) return { family: evidenceCarrier, basis: "rhetorical-role" };
  }

  // F. Content shape.
  if (kinds.has("chart")) return { family: "chart", basis: "content-shape" };
  if (kinds.has("table")) return { family: "data-table", basis: "content-shape" };
  if (kinds.has("stat")) return { family: "metric", basis: "content-shape" };
  if (kinds.has("image")) return { family: "media-led", basis: "content-shape" };
  if (kinds.has("quote") || kinds.has("callout")) return { family: "framed-prose", basis: "content-shape" };
  if (kinds.has("list")) return { family: "prose-list", basis: "content-shape" };
  if (texts.length >= 2) return { family: "card-grid", basis: "content-shape" };
  if (texts.length === 1 && slide.blocks.length === 1) return { family: "prose-list", basis: "content-shape" };
  return { family: "escape", basis: "fallback" };
}

function variantFor(slide: SlideIntent, family: CompositionFamily): string {
  const role = slide.rhetoricalRole;
  switch (family) {
    case "divider":
      if (role === "opening") return "divider/opening";
      if (role === "transition") return "divider/transition";
      if (role === "conclusion") return "divider/closing";
      return "divider/standard";
    case "sequence":
      if (slide.relationship === "cause-effect") return "sequence/cause-effect";
      if (slide.relationship === "cycle") return "sequence/cycle";
      return "sequence/linear";
    case "comparison": {
      const hasVerdict = slide.blocks.some((b) => b.kind === "callout");
      if (role === "decision" || role === "recommendation" || hasVerdict) return "comparison/decision";
      return "comparison/balanced";
    }
    case "media-led": {
      const first = slide.blocks.find((b) => b.kind === "image");
      if (first?.mediaRole === "evidence") return "media-led/evidence";
      if (first?.mediaRole === "explanatory") return "media-led/explanatory";
      if (first?.mediaRole === "decorative") return "media-led/decorative";
      return "media-led/standard";
    }
    case "framed-prose":
      if (role === "limitation") return "framed-prose/limitation";
      if (role === "recommendation") return "framed-prose/recommendation";
      if (role === "conclusion") return "framed-prose/conclusion";
      return "framed-prose/standard";
    case "prose-list":
      if (role === "context") return "prose-list/context";
      if (role === "evidence") return "prose-list/evidence";
      return "prose-list/standard";
    default:
      return `${family}/standard`;
  }
}

const WEAK_FAMILIES: ReadonlySet<CompositionFamily> = new Set(["prose-list", "card-grid"]);

// Rhythm is subordinate to semantics: only weak generic decisions may
// change, and only to a truthful alternative. Strong decisions
// (relationship, carriers, honesty, overrides) never move for variety.
function listItemCount(slide: SlideIntent): number {
  return slide.blocks.filter((b) => b.kind === "list").reduce((n, b) => n + (b.items?.length ?? 0), 0);
}

function applyRhythm(plans: SlideCompositionPlan[], intents: SlideIntent[]): void {
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    if (plan.selectionBasis !== "content-shape" || !WEAK_FAMILIES.has(plan.family)) continue;
    const prevA = i >= 1 ? plans[i - 1] : null;
    const prevB = i >= 2 ? plans[i - 2] : null;
    const streak =
      prevA && prevB &&
      prevA.family === plan.family && prevB.family === plan.family &&
      prevA.selectionBasis === "content-shape" && prevB.selectionBasis === "content-shape";
    if (!streak) continue;
    const slide = intents[i];
    const alternative: CompositionFamily | null =
      plan.family === "prose-list" && listItemCount(slide) >= 2 ? "card-grid"
      : plan.family === "card-grid" ? "prose-list"
      : null;
    if (!alternative) continue;
    plan.family = alternative;
    plan.variantKey = `${alternative}/standard`;
    plan.selectionBasis = "rhythm";
  }
}

export function planDeckComposition(intent: DeckIntent, design: DesignSystem): PlanResult {
  void design;
  const findings: QualityFinding[] = [];
  const slides: SlideCompositionPlan[] = intent.slides.map((slide) => {
    const pick = pickFamily(slide);
    if (pick.finding) findings.push(pick.finding);
    const media = mediaTreatmentFor(slide);
    return {
      slideId: slide.id,
      family: pick.family,
      variantKey: variantFor(slide, pick.family),
      densityClass: densityOf(slide),
      emphasisTargets: slide.blocks.filter((b) => b.emphasis === "primary").map((b) => b.id),
      mediaTreatment: media.treatment,
      outcomeTreatments: slide.blocks
        .filter((b) => b.outcome !== undefined)
        .map((b) => ({ blockId: b.id, tone: outcomeTone(b.outcome as NonNullable<ContentBlock["outcome"]>) })),
      caveatTargets: slide.blocks
        .filter((b) => b.uncertainty !== undefined)
        .map((b) => ({ blockId: b.id, uncertainty: b.uncertainty as NonNullable<ContentBlock["uncertainty"]> })),
      takeawayTreatment: takeawayFor(slide, pick.family),
      breaks: {
        sectionOpen: slide.rhetoricalRole === "opening" || slide.rhetoricalRole === "transition",
      },
      selectionBasis: pick.basis,
    };
  });
  applyRhythm(slides, intent.slides);
  return { plan: { slides }, findings };
}

// Semantic composition projection: the decisions that must stay stable
// across themes and identical for identical meaning. variantKey is
// excluded — future themes may vary purely presentational variants.
export interface CompositionProjection {
  slideId: string;
  family: CompositionFamily;
  densityClass: DensityClass;
  emphasisTargets: string[];
  mediaTreatment: MediaTreatment;
  outcomeTreatments: OutcomeTreatment[];
  caveatTargets: CaveatTarget[];
  takeawayTreatment: TakeawayTreatment;
  breaks: { sectionOpen: boolean };
}

export function compositionProjection(plan: DeckCompositionPlan): CompositionProjection[] {
  return plan.slides.map((s) => ({
    slideId: s.slideId,
    family: s.family,
    densityClass: s.densityClass,
    emphasisTargets: [...s.emphasisTargets],
    mediaTreatment: s.mediaTreatment,
    outcomeTreatments: s.outcomeTreatments.map((o) => ({ ...o })),
    caveatTargets: s.caveatTargets.map((c) => ({ ...c })),
    takeawayTreatment: s.takeawayTreatment,
    breaks: { ...s.breaks },
  }));
}

export interface PlanSensitivity {
  pairId: string;
  sensitive: boolean;
  differences: { slideIndex: number; aspects: string[] }[];
}

// Plan-level counterfactual sensitivity. Unlike the scene baseline,
// relevant structured pairs MUST differ here; the historical scene
// indifference record stays untouched in its own fixture.
export function comparePlanSensitivity(
  pairId: string,
  a: DeckIntent,
  b: DeckIntent,
  design: DesignSystem,
): PlanSensitivity {
  // Full plans including variantKey: any derived composition decision
  // counts here (theme invariance separately uses the variant-free
  // projection, since themes may vary presentational variants).
  const pa = planDeckComposition(a, design).plan.slides;
  const pb = planDeckComposition(b, design).plan.slides;
  const differences: PlanSensitivity["differences"] = [];
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const aspects: string[] = [];
    const keys = ["family", "variantKey", "densityClass", "emphasisTargets", "mediaTreatment", "outcomeTreatments", "caveatTargets", "takeawayTreatment", "breaks", "selectionBasis"] as const;
    for (const key of keys) {
      if (JSON.stringify(pa[i]?.[key] ?? null) !== JSON.stringify(pb[i]?.[key] ?? null)) aspects.push(key);
    }
    if (aspects.length) differences.push({ slideIndex: i, aspects });
  }
  return { pairId, sensitive: differences.length > 0, differences };
}
