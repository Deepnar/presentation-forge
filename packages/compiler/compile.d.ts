// Type seam for the JavaScript six-recipe compiler. Declares exactly
// what quality.ts consumes; V2-3C replaces compile.js itself.
import type { DeckIntent, SlideIntent } from "../model/intent.generated.ts";
import type { SlideScene } from "../model/scene.generated.ts";
import type { DesignSystem } from "../model/design.generated.ts";

export function selectRecipe(slide: SlideIntent): string;
export function compileSlide(slide: SlideIntent, design: DesignSystem, recipe?: string): SlideScene;
export function compileDeck(intent: DeckIntent, design: DesignSystem): SlideScene[];
export function recompileSlide(intent: SlideIntent, prev: SlideScene, design: DesignSystem): SlideScene;
