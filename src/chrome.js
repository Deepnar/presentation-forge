import { access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "./paths.js";
import { hex } from "./theme.js";

/**
 * The locked brand layer.
 *
 * Themes own everything about how a slide looks; they own nothing here. This
 * runs AFTER the theme has drawn, on every slide, so a theme physically cannot
 * omit or misplace the institution's marks — which is the one thing that is
 * actually graded. Deliberately not themeable.
 */

const CANVAS = { w: 13.333, h: 7.5 };

const BANNER = { maxW: 6.4, y: 0.30 };   // title slide, horizontally centred
// 0.62in rendered the wordmark as mush at projector distance; 0.82 is the
// smallest size at which a crest's wordmark stays legible at projector distance.
const CREST = { h: 0.82, right: 0.55, y: 0.26 };
const FOOT = { y: 6.92, h: 0.3 };

async function probe(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
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

/** Resolve brand assets once per render; report what's missing exactly once. */
export async function loadBrand(identity) {
  const b = identity.brand ?? {};
  const [banner, crest, crestLight, watermark] = await Promise.all([
    b.banner ? probe(b.banner) : null,
    b.crest ? probe(b.crest) : null,
    b.crest_light ? probe(b.crest_light) : null,
    b.watermark ? probe(b.watermark) : null,
  ]);

  const missing = [];
  if (b.banner && !banner) missing.push(b.banner);
  if (b.crest && !crest) missing.push(b.crest);
  if (b.watermark && !watermark) missing.push(b.watermark);
  // crest_light is an enhancement, not a requirement — don't nag for it.

  return { banner, crest, crestLight, watermark, missing };
}

/** Relative luminance of a hex colour, 0..1. */
function luminance(c) {
  const s = String(c ?? "").replace(/^#/, "");
  if (s.length < 6) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Pick the crest variant that will actually be legible.
 * The full-colour mark has a dark navy wordmark that disappears on dark
 * backgrounds, so anything below mid-luminance gets the reversed mark.
 */
function crestFor(brand, bgColor) {
  if (brand.crestLight && luminance(bgColor) < 0.45) return brand.crestLight;
  return brand.crest;
}

/** Title slide: the wide department banner, centred at the top. */
export function applyTitleChrome(slide, { brand }) {
  if (!brand.banner) return;
  const w = Math.min(BANNER.maxW, CANVAS.w - 2);
  const h = w / brand.banner.ratio;
  slide.addImage({
    path: brand.banner.path,
    x: (CANVAS.w - w) / 2,
    y: BANNER.y,
    w,
    h,
  });
}

/**
 * Content slides: crest top-right, plus the footer line.
 * `reserved` tells the theme how much top-right space to keep clear.
 */
export function applyContentChrome(slide, { brand, theme, identity, index, total, bg }) {
  const cfg = identity.chrome ?? {};
  const mark = crestFor(brand, bg ?? theme.palette.bg);

  if (cfg.crest_on_content_slides !== false && mark) {
    const h = CREST.h;
    const w = h * mark.ratio;
    slide.addImage({
      path: mark.path,
      x: CANVAS.w - CREST.right - w,
      y: CREST.y,
      w,
      h,
    });
  }

  // The footer sits on whatever the layout painted — bone, terracotta, charcoal.
  // ink_muted is only correct on the standard page, so derive from the actual bg.
  const bgColor = bg ?? theme.palette.bg;
  const muted = hex(luminance(bgColor) < 0.45 ? "#FFFFFF" : theme.palette.ink_muted);
  const footOpacity = luminance(bgColor) < 0.45 ? 55 : 0;
  const footFont = theme.type.caption?.family ?? "Inter";

  if (cfg.presenter_on_slides !== false) {
    const presenting = (identity.team?.members ?? []).filter((m) => m.presenting);
    const who = presenting.length
      ? presenting.map((m) => m.name).join(" · ")
      : identity.team?.label || "";
    if (who) {
      slide.addText(who, {
        x: 0.7, y: FOOT.y, w: 6.5, h: FOOT.h,
        fontFace: footFont, fontSize: 9, color: muted, transparency: footOpacity,
        align: "left", valign: "middle",
      });
    }
  }

  if (cfg.slide_numbers !== false) {
    slide.addText(`${index} / ${total}`, {
      x: CANVAS.w - 1.9, y: FOOT.y, w: 1.2, h: FOOT.h,
      fontFace: footFont, fontSize: 9, color: muted,
      align: "right", valign: "middle",
    });
  }
}

/** Horizontal space on the right that content must not overlap on slide 2+. */
export function reservedTopRight(brand) {
  if (!brand.crest) return 0;
  return CREST.h * brand.crest.ratio + CREST.right + 0.25;
}

export { CANVAS };
