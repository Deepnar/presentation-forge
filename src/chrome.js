import { access } from "node:fs/promises";
import sharp from "sharp";
import { ROOT } from "./paths.js";
import { resolveBrandPath } from "./tenant.js";
import { hex } from "./theme.js";
import { DIVIDER_TYPES, REFERENCE_TYPES } from "./ai/team.js";
import { SCENE_W, SCENE_H } from "../packages/model/scene-constants.ts";
import {
  effectiveBranding,
  planTitleBanner,
  planContentMark,
  reservationForTopRight,
  planContentChrome,
} from "../packages/core/chrome.ts";

const CANVAS = { w: SCENE_W, h: SCENE_H };

async function probe(file) {
  const abs = resolveBrandPath(file, ROOT);
  try {
    await access(abs);
  } catch {
    return null;
  }
  try {
    const { width, height } = await sharp(abs).metadata();
    return { path: abs, w: width, h: height, ratio: width / height };
  } catch {
    return null;
  }
}

export async function loadBrand(identity) {
  const b = identity.brand ?? {};
  const [banner, crest, crestLight, crestDark, watermark] = await Promise.all([
    b.banner ? probe(b.banner) : null,
    b.crest ? probe(b.crest) : null,
    b.crest_light ? probe(b.crest_light) : null,
    b.crest_dark ? probe(b.crest_dark) : null,
    b.watermark ? probe(b.watermark) : null,
  ]);

  const missing = [];
  if (b.banner && !banner) missing.push(b.banner);
  if (b.crest && !crest) missing.push(b.crest);
  if (b.watermark && !watermark) missing.push(b.watermark);

  return { banner, crest, crestLight, crestDark, watermark, missing };
}

function crestFor(brand) {
  return brand.crest ?? brand.crestLight ?? brand.crestDark ?? null;
}

export function brandingMode(identity) {
  return identity?.chrome?.branding ?? "full";
}

export function applyTitleChrome(slide, { brand, identity }) {
  const plan = planTitleBanner(
    effectiveBranding(brandingMode(identity)),
    brand.banner?.ratio ?? null,
  );
  if (!plan.place) return;
  slide.addImage({
    path: brand.banner.path,
    x: plan.box.x,
    y: plan.box.y,
    w: plan.box.w,
    h: plan.box.h,
  });
}

function presenterFallback(identity) {
  const presenting = (identity.team?.members ?? []).filter((m) => m.presenting);
  return presenting.length
    ? presenting.map((m) => m.name).join(" · ")
    : identity.team?.label || "";
}

export function applyContentChrome(slide, { brand, theme, identity, data, index, total, bg }) {
  const cfg = identity.chrome ?? {};
  const branding = effectiveBranding(brandingMode(identity));
  const mark = crestFor(brand);

  const content = planContentChrome({
    branding,
    selectedCrestRatio: mark?.ratio ?? null,
    crestOnContentSlides: cfg.crest_on_content_slides,
    presenterOnSlides: cfg.presenter_on_slides,
    slideNumbers: cfg.slide_numbers,
    suppressPresenter: DIVIDER_TYPES.has(data.type) || REFERENCE_TYPES.has(data.type),
    presenterText: data?.presenter?.trim() || presenterFallback(identity),
    index,
    total,
    background: bg ?? theme.palette.bg,
    mutedInk: hex(theme.palette.ink_muted),
    captionFamily: theme.type.caption?.family,
  });

  if (content.mark.place) {
    slide.addImage({
      path: mark.path,
      x: content.mark.box.x,
      y: content.mark.box.y,
      w: content.mark.box.w,
      h: content.mark.box.h,
    });
  }

  if (content.presenter) {
    slide.addText(content.presenter.text, {
      x: content.presenter.box.x, y: content.presenter.box.y,
      w: content.presenter.box.w, h: content.presenter.box.h,
      fontFace: content.presenter.style.fontFamily,
      fontSize: content.presenter.style.fontSize,
      color: content.presenter.style.color,
      transparency: Math.round((1 - content.presenter.style.opacity) * 100),
      align: content.presenter.style.align, valign: content.presenter.style.valign,
    });
  }

  if (content.slideNumber) {
    slide.addText(content.slideNumber.text, {
      x: content.slideNumber.box.x, y: content.slideNumber.box.y,
      w: content.slideNumber.box.w, h: content.slideNumber.box.h,
      fontFace: content.slideNumber.style.fontFamily,
      fontSize: content.slideNumber.style.fontSize,
      color: content.slideNumber.style.color,
      align: content.slideNumber.style.align, valign: content.slideNumber.style.valign,
    });
  }
}

export function reservedTopRight(brand, identity) {
  if (!brand.crest || brandingMode(identity) === "none") return 0;
  return reservationForTopRight(brand.crest.ratio ?? null);
}

export { CANVAS };
