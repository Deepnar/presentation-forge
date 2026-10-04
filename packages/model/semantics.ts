// @forge/model — semantic cross-field validation for Layer A intent.
// JSON Schema owns shape; this module owns meaning rules the schema
// cannot awkwardly encode: field/kind placement and the measure/chartKind
// honesty matrix. Deterministic, stable error ordering, no prose
// interpretation, no storage/project lookup (evidence ID existence is a
// project-boundary concern, not a model one).

import type { DeckIntent, SlideIntent, ContentBlock } from "./intent.generated.ts";

export interface SemanticValidation {
  ok: boolean;
  errors: string[];
}

// Honest encodings per quantitative intent. Measures without a supported
// encoding (distribution, association) are valid intent — they record a
// capability gap for composition instead of forcing a lying chart.
const MEASURE_KINDS: Record<string, readonly string[]> = {
  comparison: ["bar", "hbar"],
  trend: ["line", "area", "bar"],
  composition: ["pie", "doughnut"],
  distribution: [],
  association: [],
};

function slideLabel(slide: SlideIntent, si: number): string {
  return `slide ${si + 1} (${slide.id})`;
}

function checkBlock(slide: SlideIntent, si: number, block: ContentBlock, bi: number): string[] {
  const errors: string[] = [];
  const where = `${slideLabel(slide, si)} block ${bi + 1} (${block.id})`;
  if (block.mediaRole !== undefined && block.kind !== "image") {
    errors.push(`${where}: mediaRole is valid only on image blocks`);
  }
  if (block.measure !== undefined && block.kind !== "chart") {
    errors.push(`${where}: measure is valid only on chart blocks`);
  }
  if (block.measure !== undefined && block.kind === "chart" && block.chartKind !== undefined) {
    const allowed = MEASURE_KINDS[block.measure] ?? [];
    if (!allowed.includes(block.chartKind)) {
      errors.push(
        `${where}: chartKind "${block.chartKind}" cannot honestly encode measure "${block.measure}"`,
      );
    }
  }
  return errors;
}

export function validateIntentSemantics(deck: DeckIntent): SemanticValidation {
  const errors: string[] = [];
  const slides = deck.slides ?? [];
  slides.forEach((slide, si) => {
    (slide.blocks ?? []).forEach((block, bi) => {
      errors.push(...checkBlock(slide, si, block, bi));
    });
  });
  return { ok: errors.length === 0, errors };
}

// Stable de-duplicated union of block evidence refs, in first-seen order.
// Slide bibliography derivation reads this; intent is never mutated to
// synchronize the coarse slide-level sourceRefs.
export function collectBlockEvidenceRefs(slide: SlideIntent): string[] {
  const seen = new Set<string>();
  for (const block of slide.blocks ?? []) {
    for (const ref of block.evidenceRefs ?? []) {
      if (!seen.has(ref)) seen.add(ref);
    }
  }
  return [...seen];
}
