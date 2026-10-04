// @forge/core — renderer-neutral chrome geometry and policy. Pure: no
// filesystem, brand paths, identity, slide types, or PptxGenJS. The
// legacy src/chrome.js facade translates identity/brand into these
// explicit inputs and performs the actual drawing; the V2 compiler
// emits the same plan as locked compiler-provenance scene elements.
import { SCENE_W, SCENE_H } from "../model/scene-constants.ts";

export type BrandingMode = "full" | "minimal" | "none";

export interface ChromePolicy {
  branding?: BrandingMode;
  slideNumbers?: boolean;
  presenterOnSlides?: boolean;
  crestOnContentSlides?: boolean;
}

export interface ChromeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChromeTextStyle {
  fontSize: number;
  align: "left" | "center" | "right";
  valign: "top" | "middle";
  color: string;
  opacity: number;
  fontFamily: string;
}

export const BANNER_MAX_W = 6.4;
export const BANNER_Y = 0.3;
export const CREST_H = 0.82;
export const CREST_RIGHT = 0.55;
export const CREST_Y = 0.26;
export const FOOT_Y = 6.92;
export const FOOT_H = 0.3;
export const FOOT_FONT_SIZE = 9;

// Minimum daylight between compiler-managed content and the footer
// chrome band, in inches. Part of the canonical geometry contract.
export const FOOTER_DAYLIGHT = 0.04;

// Canonical compiler content reserve above the canvas bottom edge.
// Derivation: the footer band sits (SCENE_H - FOOT_Y) above the
// bottom edge, plus FOOTER_DAYLIGHT of minimum daylight; theme
// bottom margins add further daylight on top. Quantized to layout
// precision. Preserves the historical 0.62 behavior exactly —
// content bottom plus any nonnegative theme bottom margin stays at
// or above FOOT_Y with daylight to spare.
export const CONTENT_FOOTER_RESERVE = Math.round((SCENE_H - FOOT_Y + FOOTER_DAYLIGHT) * 100) / 100;

const DARK_LUMINANCE_LINE = 0.45;

// Legacy luminance rule, preserved exactly: simple channel weighting on
// normalized 0-1 channels, NOT WCAG gamma-corrected relative luminance.
// V2-2F is a parity migration; any future correction is explicit work.
export function backgroundDark(background: string): boolean {
  const s = String(background ?? "").replace(/^#/, "");
  if (s.length < 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < DARK_LUMINANCE_LINE;
}

// Unknown or absent branding resolves without failing. Absent means full
// (the legacy default); any other unexpected value keeps the effective
// behavior legacy code produced for it — no banner (only "full" draws
// one) with crest and presenter intact — i.e. minimal-like. Pinned by test.
export function effectiveBranding(mode: string | null | undefined): BrandingMode {
  if (mode == null) return "full";
  if (mode === "none" || mode === "minimal" || mode === "full") return mode;
  return "minimal";
}

export interface TitleBannerPlan {
  place: boolean;
  box: ChromeBox;
}

export function planTitleBanner(
  branding: BrandingMode,
  bannerRatio: number | null | undefined,
): TitleBannerPlan {
  const box = { x: 0, y: BANNER_Y, w: 0, h: 0 };
  if (branding !== "full" || !bannerRatio) return { place: false, box };
  const w = Math.min(BANNER_MAX_W, SCENE_W - 2);
  const h = w / bannerRatio;
  return { place: true, box: { x: (SCENE_W - w) / 2, y: BANNER_Y, w, h } };
}

export interface ContentMarkPlan {
  place: boolean;
  box: ChromeBox;
}

export function planContentMark(
  branding: BrandingMode,
  crestOnContentSlides: boolean,
  selectedCrestRatio: number | null | undefined,
): ContentMarkPlan {
  const box = { x: 0, y: CREST_Y, w: 0, h: CREST_H };
  if (branding === "none" || crestOnContentSlides === false || !selectedCrestRatio) {
    return { place: false, box };
  }
  const w = CREST_H * selectedCrestRatio;
  return { place: true, box: { x: SCENE_W - CREST_RIGHT - w, y: CREST_Y, w, h: CREST_H } };
}

// Heading reservation uses ONLY the primary crest ratio. A configuration
// carrying merely a fallback mark draws that mark without reserving
// heading width — preserved legacy asymmetry, pinned by test.
export function reservationForTopRight(primaryCrestRatio: number | null | undefined): number {
  if (!primaryCrestRatio) return 0;
  return CREST_H * primaryCrestRatio + CREST_RIGHT + 0.25;
}

export interface FooterPlan {
  foreground: string;
  opacity: number;
  fontFamily: string;
}

export function planFooter(
  background: string,
  mutedInk: string,
  captionFamily?: string,
): FooterPlan {
  if (backgroundDark(background)) {
    return { foreground: "FFFFFF", opacity: 0.45, fontFamily: captionFamily ?? "Inter" };
  }
  return { foreground: mutedInk, opacity: 1, fontFamily: captionFamily ?? "Inter" };
}

export interface ContentChromePlan {
  mark: ContentMarkPlan;
  presenter: { show: boolean; text: string; box: ChromeBox; style: ChromeTextStyle } | null;
  slideNumber: { show: boolean; text: string; box: ChromeBox; style: ChromeTextStyle } | null;
}

export interface ContentChromeInput {
  branding: BrandingMode;
  selectedCrestRatio?: number | null;
  crestOnContentSlides?: boolean;
  presenterOnSlides?: boolean;
  slideNumbers?: boolean;
  suppressPresenter?: boolean;
  presenterText?: string;
  index: number;
  total: number;
  background: string;
  mutedInk: string;
  captionFamily?: string;
}

export function planContentChrome(input: ContentChromeInput): ContentChromePlan {
  const branding = effectiveBranding(input.branding);
  const mark = planContentMark(branding, input.crestOnContentSlides !== false, input.selectedCrestRatio ?? null);
  const footer = planFooter(input.background, input.mutedInk, input.captionFamily);
  const style: ChromeTextStyle = {
    fontSize: FOOT_FONT_SIZE,
    align: "left",
    valign: "middle",
    color: footer.foreground,
    opacity: footer.opacity,
    fontFamily: footer.fontFamily,
  };
  const showPresenter =
    branding !== "none" &&
    input.presenterOnSlides !== false &&
    !input.suppressPresenter &&
    Boolean((input.presenterText ?? "").trim());
  // Preserved legacy quirk: on dark grounds only the presenter inherits
  // the 55% PptxGenJS transparency (opacity 0.45); the slide number stays
  // fully opaque even though it shares the white foreground.
  const presenter = showPresenter
    ? {
        show: true as const,
        text: (input.presenterText ?? "").trim(),
        box: { x: 0.7, y: FOOT_Y, w: 6.5, h: FOOT_H },
        style,
      }
    : null;
  const showNumber = input.slideNumbers !== false;
  const slideNumber = showNumber
    ? {
        show: true as const,
        text: `${input.index} / ${input.total}`,
        box: { x: SCENE_W - 1.9, y: FOOT_Y, w: 1.2, h: FOOT_H },
        style: { ...style, align: "right" as const, opacity: 1 },
      }
    : null;
  return { mark, presenter, slideNumber };
}
