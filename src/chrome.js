import { access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "./paths.js";
import { resolveBrandPath } from "./tenant.js";
import { hex } from "./theme.js";
import { DIVIDER_TYPES } from "./ai/team.js";

const CANVAS = { w: 13.333, h: 7.5 };

const BANNER = { maxW: 6.4, y: 0.30 };   // title slide, horizontally centred
const CREST = { h: 0.82, right: 0.55, y: 0.26 };
const FOOT = { y: 6.92, h: 0.3 };

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

function luminance(c) {
  const s = String(c ?? "").replace(/^#/, "");
  if (s.length < 6) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function crestFor(brand) {
  return brand.crest ?? brand.crestLight ?? brand.crestDark ?? null;
}

export function brandingMode(identity) {
  return identity?.chrome?.branding ?? "full";
}

export function applyTitleChrome(slide, { brand, identity }) {
  if (brandingMode(identity) !== "full") return;
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

export function applyContentChrome(slide, { brand, theme, identity, data, index, total, bg }) {
  const cfg = identity.chrome ?? {};
  const branding = brandingMode(identity);
  const mark = crestFor(brand);

  if (branding !== "none" && cfg.crest_on_content_slides !== false && mark) {
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

  const bgColor = bg ?? theme.palette.bg;
  const muted = hex(luminance(bgColor) < 0.45 ? "#FFFFFF" : theme.palette.ink_muted);
  const footOpacity = luminance(bgColor) < 0.45 ? 55 : 0;
  const footFont = theme.type.caption?.family ?? "Inter";

  if (branding !== "none" && cfg.presenter_on_slides !== false) {
    if (!DIVIDER_TYPES.has(data.type)) {
      const presenting = (identity.team?.members ?? []).filter((m) => m.presenting);
      const fallback = presenting.length
        ? presenting.map((m) => m.name).join(" · ")
        : identity.team?.label || "";
      const who = data?.presenter?.trim() || fallback;
      if (who) {
        slide.addText(who, {
          x: 0.7, y: FOOT.y, w: 6.5, h: FOOT.h,
          fontFace: footFont, fontSize: 9, color: muted, transparency: footOpacity,
          align: "left", valign: "middle",
        });
      }
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

export function reservedTopRight(brand, identity) {
  if (!brand.crest || brandingMode(identity) === "none") return 0;
  return CREST.h * brand.crest.ratio + CREST.right + 0.25;
}

export { CANVAS };
