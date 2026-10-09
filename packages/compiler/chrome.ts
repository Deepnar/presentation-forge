// @forge/compiler — locked chrome emission seam (V2-3E-3).
//
// Adapter-resolved ChromeInput in, locked compiler-provenance scene
// elements out. The compiler never resolves presenters, probes
// assets, reads remembered defaults, or touches the filesystem:
// every brand, roster, and suppression decision arrives already made.
// Geometry and policy come verbatim from packages/core/chrome.ts —
// nothing here reimplements them.
//
// Chrome elements carry stable `:chrome:*` IDs, `provenance:
// "compiler"`, `locked: true`, and NO authored-block semanticRef.
// Chrome is not a ContentBlock and must never read as one.

import type { SlideIntent } from "../model/intent.generated.ts";
import type { SceneElement } from "../model/scene.generated.ts";
import {
  effectiveBranding,
  planTitleBanner,
  planContentChrome,
  reservationForTopRight,
  type BrandingMode,
  type ChromeBox,
  type ChromeTextStyle,
} from "../core/chrome.ts";

export interface ChromeAssetInput {
  // Opaque renderer-ready asset reference. The compiler copies this
  // into SceneElement.image.src and MUST NOT resolve, probe, fetch,
  // stat, or otherwise interpret it. Local mode supplies a
  // filesystem-style source; other adapters supply data/blob-backed
  // sources. Aspect handling stays with whoever resolved the asset.
  src: string;
  // Already-probed positive aspect ratio: width / height.
  ratio: number;
}

export type ChromeSurface = "title" | "content";

export interface SlideChromeInput {
  slideId: string;
  // Explicit adapter decision. Never inferred from title, purpose,
  // free text, or composition family.
  surface: ChromeSurface;
  branding: BrandingMode;
  banner?: ChromeAssetInput | null;
  // Asset actually selected for content-mark emission. May be a
  // primary or a fallback crest.
  selectedCrest?: ChromeAssetInput | null;
  // Ratio of the PRIMARY crest only. Deliberately separate from
  // selectedCrest: legacy behavior lets a fallback-only crest draw
  // while earning zero top-right heading reservation.
  primaryCrestRatio?: number | null;
  crestOnContentSlides?: boolean;
  presenterOnSlides?: boolean;
  slideNumbers?: boolean;
  // Already-resolved semantic suppression. The compiler does not
  // import legacy divider/reference catalogs.
  suppressPresenter?: boolean;
  // Already-resolved presenter text. The compiler does not resolve
  // roster membership, speaker flags, or remembered fallbacks.
  presenterText?: string;
  // Adapter-supplied deck position. Never derived from deck metadata.
  index: number;
  total: number;
  // Actual surface background for chrome contrast planning. An
  // adapter may later supply a rendered plate surface here.
  background: string;
  mutedInk: string;
  captionFamily?: string;
}

export interface DeckChromeInput {
  slides: SlideChromeInput[];
}

export interface PlannedChromeText {
  text: string;
  box: ChromeBox;
  style: ChromeTextStyle;
}

export interface SlideChromePlan {
  slideId: string;
  surface: ChromeSurface;
  branding: BrandingMode;
  banner: { src: string; box: ChromeBox } | null;
  mark: { src: string; box: ChromeBox } | null;
  presenter: PlannedChromeText | null;
  slideNumber: PlannedChromeText | null;
  // Deterministic heading-width reserve for the standard content
  // title box, computed BEFORE fitting. Zero for title surfaces,
  // branding none, and fallback-only crests.
  topRightReserve: number;
}

export interface DeckChromePlan {
  slides: SlideChromePlan[];
}

export function planSlideChrome(input: SlideChromeInput): SlideChromePlan {
  if (input.surface !== "title" && input.surface !== "content") {
    throw new Error(`SlideChromeInput for slide "${input.slideId}" has unknown surface ${JSON.stringify(input.surface)}`);
  }
  const branding = effectiveBranding(input.branding);
  if (input.surface === "title") {
    const banner = planTitleBanner(branding, input.banner?.ratio ?? null);
    return {
      slideId: input.slideId,
      surface: "title",
      branding,
      banner: banner.place && input.banner ? { src: input.banner.src, box: banner.box } : null,
      mark: null,
      presenter: null,
      slideNumber: null,
      topRightReserve: 0,
    };
  }
  const content = planContentChrome({
    branding,
    selectedCrestRatio: input.selectedCrest?.ratio ?? null,
    crestOnContentSlides: input.crestOnContentSlides,
    presenterOnSlides: input.presenterOnSlides,
    slideNumbers: input.slideNumbers,
    suppressPresenter: input.suppressPresenter,
    presenterText: input.presenterText,
    index: input.index,
    total: input.total,
    background: input.background,
    mutedInk: input.mutedInk,
    captionFamily: input.captionFamily,
  });
  return {
    slideId: input.slideId,
    surface: "content",
    branding,
    banner: null,
    mark: content.mark.place && input.selectedCrest ? { src: input.selectedCrest.src, box: content.mark.box } : null,
    presenter: content.presenter
      ? { text: content.presenter.text, box: content.presenter.box, style: { ...content.presenter.style } }
      : null,
    slideNumber: content.slideNumber
      ? { text: content.slideNumber.text, box: content.slideNumber.box, style: { ...content.slideNumber.style } }
      : null,
    // Reservation follows emission, never configuration alone: only
    // an actually emitted content mark can earn heading width, so a
    // disabled or asset-less crest leaves zero geometry penalty.
    // Fallback-only crests draw while earning zero reservation —
    // the preserved V2-2 asymmetry.
    topRightReserve: content.mark.place && input.selectedCrest
      ? reservationForTopRight(input.primaryCrestRatio ?? null)
      : 0,
  };
}

function listedIds(ids: string[]): string {
  return ids.map((id) => `"${id}"`).join(", ");
}

// Central coverage validation: one path for every caller. An
// explicit DeckChromeInput must cover the deck totally and exactly —
// a silently skipped slide would also disable the QA that catches
// missing institutional marks. Throws identifying the bad IDs.
export function assertChromeCoverage(slideIds: string[], inputs: SlideChromeInput[]): void {
  const counts = new Map<string, number>();
  for (const s of inputs ?? []) counts.set(s.slideId, (counts.get(s.slideId) ?? 0) + 1);
  const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (dupes.length) {
    throw new Error(`DeckChromeInput has duplicate entries for slide(s): ${listedIds(dupes)}`);
  }
  const known = new Set(slideIds);
  const unknown = (inputs ?? []).map((s) => s.slideId).filter((id) => !known.has(id));
  if (unknown.length) {
    throw new Error(`DeckChromeInput references unknown slide(s): ${listedIds([...new Set(unknown)])}`);
  }
  const have = new Set((inputs ?? []).map((s) => s.slideId));
  const missing = slideIds.filter((id) => !have.has(id));
  if (missing.length) {
    throw new Error(`DeckChromeInput is missing entries for slide(s): ${listedIds(missing)}`);
  }
}

// Single-slide lookup for recompileSlide, which reflows one slide
// without deck context. Same missing/duplicate strictness as deck
// coverage; unknown extras belong to other slides and are irrelevant
// here — the deck-level gate already ran at compile/analyze time.
export function requireSlideChromeInput(
  inputs: SlideChromeInput[],
  slideId: string,
): SlideChromeInput {
  const matches = (inputs ?? []).filter((s) => s.slideId === slideId);
  if (matches.length > 1) {
    throw new Error(`DeckChromeInput has duplicate entries for slide(s): "${slideId}"`);
  }
  if (!matches.length) {
    throw new Error(`DeckChromeInput is missing entries for slide(s): "${slideId}"`);
  }
  return matches[0];
}

// Ephemeral compiler plan, like DeckCompositionPlan: normalized
// decisions for emission, QA, and preservation verification — never
// project truth. Null when no ChromeInput was supplied.
export function planDeckChrome(
  intent: SlideIntent[] | { slides: SlideIntent[] },
  chrome: DeckChromeInput | null | undefined,
): DeckChromePlan | null {
  if (!chrome) return null;
  const slides = Array.isArray(intent) ? intent : intent.slides;
  assertChromeCoverage(slides.map((s) => s.id), chrome.slides ?? []);
  const byId = new Map((chrome.slides ?? []).map((s) => [s.slideId, s]));
  const planned: SlideChromePlan[] = [];
  for (const slide of slides) {
    const input = byId.get(slide.id);
    if (!input) continue;
    planned.push(planSlideChrome(input));
  }
  return { slides: planned };
}

export function chromeForSlide(
  chrome: DeckChromeInput | null | undefined,
  slideId: string,
): SlideChromeInput | null {
  if (!chrome) return null;
  return (chrome.slides ?? []).find((s) => s.slideId === slideId) ?? null;
}

export function chromePlanForSlide(
  chromePlan: DeckChromePlan | null | undefined,
  slideId: string,
): SlideChromePlan | null {
  if (!chromePlan) return null;
  return chromePlan.slides.find((s) => s.slideId === slideId) ?? null;
}

function chromeTextEl(
  id: string,
  box: ChromeBox,
  text: string,
  style: ChromeTextStyle,
  z: number,
): SceneElement {
  // Fixed policy size, deliberately role-less: institutional footer
  // type is exempt from role readability floors by design (legacy
  // renders 9pt always), is never fitted, and refit skips role-less
  // runs. Family/size/color project verbatim.
  return {
    id,
    kind: "text",
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    z,
    provenance: "compiler",
    locked: true,
    opacity: style.opacity,
    valign: "middle",
    paragraphs: [{
      runs: [{
        text,
        size: style.fontSize,
        color: style.color,
        family: style.fontFamily,
      }],
      align: style.align,
    }],
  };
}

function chromeImageEl(
  id: string,
  box: ChromeBox,
  src: string,
  alt: string,
  z: number,
): SceneElement {
  return {
    id,
    kind: "image",
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    z,
    provenance: "compiler",
    locked: true,
    image: { src, alt },
  };
}

// Maps a planned slide to its locked scene elements. Chrome text is
// emitted at exact planned geometry and size — it is never fitted,
// so no fit diagnostics arise from chrome.
export function emitChromeElements(
  plan: SlideChromePlan,
  takeZ: () => number,
): SceneElement[] {
  const els: SceneElement[] = [];
  if (plan.banner) {
    els.push(chromeImageEl(
      `${plan.slideId}:chrome:title-banner`,
      plan.banner.box, plan.banner.src, "banner", takeZ(),
    ));
  }
  if (plan.mark) {
    els.push(chromeImageEl(
      `${plan.slideId}:chrome:content-mark`,
      plan.mark.box, plan.mark.src, "crest", takeZ(),
    ));
  }
  if (plan.presenter) {
    els.push(chromeTextEl(
      `${plan.slideId}:chrome:presenter`,
      plan.presenter.box, plan.presenter.text, plan.presenter.style, takeZ(),
    ));
  }
  if (plan.slideNumber) {
    els.push(chromeTextEl(
      `${plan.slideId}:chrome:slide-number`,
      plan.slideNumber.box, plan.slideNumber.text, plan.slideNumber.style, takeZ(),
    ));
  }
  return els;
}
