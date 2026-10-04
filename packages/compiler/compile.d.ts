// Type seam for the JavaScript compiler orchestration. Declares exactly
// what quality.ts and tests consume.
import type { DeckIntent, SlideIntent } from "../model/intent.generated.ts";
import type { SlideScene } from "../model/scene.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";
import type { DeckCompositionPlan, PlanResult } from "./composition.ts";
import type { SlideCompositionPlan } from "./composition.ts";

export function selectRecipe(slide: SlideIntent): string;
export function compileSlide(slide: SlideIntent, design: DesignSystem, recipe?: string): SlideScene;
export function compileDeck(intent: DeckIntent, design: DesignSystem): SlideScene[];
export function compileDeckDetailed(intent: DeckIntent, design: DesignSystem): {
  scenes: SlideScene[];
  plan: DeckCompositionPlan;
  findings: PlanResult["findings"];
};
export function recompileSlide(
  intent: SlideIntent,
  prev: SlideScene,
  design: DesignSystem,
  planned?: SlideCompositionPlan | null,
): SlideScene;
