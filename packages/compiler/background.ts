// @forge/compiler — background resolution (V2-3F-5).
//
// Pure and deterministic: DesignSystem + composition plan + optional
// adapter-resolved plate assets in, Layer-C scene background out. The
// compiler never rasterizes, reads files, probes assets, or interprets
// theme documents: any plate PNG arrives already resolved through the
// SlideBackgrounds seam, and surface selection follows the composition
// family — never theme names, free text, or remembered state.
//
// Native decor rides the same path: DesignSystem already normalizes
// theme decor shapes (with alpha), and they project here behind all
// elements rather than as editable content. QA geometry and semantic
// projections iterate elements only, so dressing can never read as a
// content defect or alter authored semantics.
import type { DesignSystem } from "../model/design.generated.ts";
import type { BackgroundDecor, SlideScene } from "../model/scene.generated.ts";
import type { SlideCompositionPlan } from "./composition.ts";

export type SlideSurface = "title" | "section" | "content";

export interface PlateAsset {
  // Opaque renderer-ready reference, resolved by the adapter (data URIs
  // embed portably; future hosted adapters may supply blob sources).
  // The compiler copies it verbatim and never interprets it.
  src: string;
  // sha256 of the asset bytes: the determinism proof and dedup key.
  hash: string;
}

export interface SlideBackgrounds {
  title?: PlateAsset;
  section?: PlateAsset;
  content?: PlateAsset;
}

// Alpha resolution rounds to four decimals at the scene boundary:
// the binary double for 1 - 70/100 prints as 0.30000000000000004,
// which is deterministic but noisy in scene JSON and downstream
// assertions. Four decimals hold transparency-derived values exactly
// and 8-digit hex well below visibility while keeping scenes stable
// to assert against.
function roundAlpha(alpha: number): number {
  return Math.round(alpha * 10000) / 10000;
}

// Divider variants carry the institutional surfaces (opening/closing
// read as title ground, transitions as section ground); every other
// family reads the content plate. Mirrors the legacy surface mapping
// without importing its slide-type catalog.
export function surfaceForPlan(
  comp: Pick<SlideCompositionPlan, "family" | "variantKey">,
): SlideSurface {
  if (comp.family === "divider") {
    if (comp.variantKey === "divider/opening" || comp.variantKey === "divider/closing") {
      return "title";
    }
    return "section";
  }
  return "content";
}

// Card surfaces resolve from the declared cardFill (with its alpha),
// falling back to palette.surface exactly as the normalizer provides.
// This mirrors the legacy card helper: card_fill wins when declared,
// surface otherwise. Table header fills resolve through the same
// helper but stay opaque by design: header rows are data-dense and a
// translucent header over a busy plate costs readability, and opaque
// headers keep the accepted V2-3F-4 table contract byte-identical.
export function cardFillOf(design: DesignSystem): { hex: string; alpha?: number } {
  const fill = design.shape.cardFill;
  return fill.alpha === undefined ? { hex: fill.hex } : { hex: fill.hex, alpha: roundAlpha(fill.alpha) };
}

// Flat scene background: palette ground plus native decor when the
// theme declares any. Omits both keys when absent so themes without
// dressing compile byte-identical scenes to the pre-decor output.
export function flatSceneBackground(design: DesignSystem): SlideScene["background"] {
  const out: SlideScene["background"] = { fill: design.palette.bg.hex };
  const decor = design.background?.decor;
  if (decor?.length) {
    out.decor = decor.map((d): BackgroundDecor => ({
      shape: d.shape,
      x: d.x,
      y: d.y,
      w: d.w,
      h: d.h,
      fill: d.fill.hex,
      ...(d.fill.alpha !== undefined ? { fillAlpha: roundAlpha(d.fill.alpha) } : {}),
      ...(d.rotation !== undefined ? { rotation: d.rotation } : {}),
    }));
  }
  return out;
}

export function sceneBackground(
  design: DesignSystem,
  comp: Pick<SlideCompositionPlan, "family" | "variantKey">,
  backgrounds?: SlideBackgrounds | null,
): SlideScene["background"] {
  const out = flatSceneBackground(design);
  const asset = backgrounds?.[surfaceForPlan(comp)];
  if (asset) {
    out.image = { src: asset.src, hash: asset.hash };
  }
  return out;
}
