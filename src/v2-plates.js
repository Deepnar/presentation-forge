// Node/local plate adapter for V2 (V2-3F-5).
//
// Resolves theme plate templates into renderer-ready background assets
// OUTSIDE the deterministic packages: it loads theme documents,
// interpolates templates against mode-resolved tokens, rasterizes
// through the sandboxed plate pipeline, and returns per-surface assets
// the compiler copies verbatim into scenes. The compiler never imports
// this module (enforced by test/v2-core-boundary.test.js); renderers
// project the asset without knowing it came from a plate.
//
// Trust boundary: theme YAML is first-party repository content, held
// to the same trust as theme tokens. Interpolated values are token
// strings plus integer panel geometry only. The raster runs inside
// src/plate.js's CSP wrapper (no scripts, inline styles only, data:/
// file: images and fonts), and this module additionally rejects any
// interpolated template carrying executable or externally-referenced
// content before it reaches Chrome. No network fetch happens here:
// grain textures are embedded data: SVGs, and the screenshot loads
// from a local file. Exported decks therefore embed bytes and never
// phone home.
//
// Determinism: identical resolved inputs produce identical scenes —
// the compiler copies {src, hash} opaquely — and the hash pins the
// exact bytes so a Chrome-version raster drift is visible rather
// than silent. Cross-machine byte stability is NOT promised: plates
// carry no text (pure gradient/geometry raster math), which removes
// the fontconfig variance class, but the same binary and version
// remain the reproducibility unit.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { loadTheme } from "./theme.js";
import { plateHtmlFor, renderPlate, PLATE_W, PLATE_H, PLATE_SCALE } from "./plate.js";
import { SCENE_W, SCENE_H } from "../packages/model/scene-constants.ts";
import { CONTENT_FOOTER_RESERVE } from "../packages/core/chrome.ts";

// Rejected before rendering, in addition to the plate CSP wrapper
// that already blocks scripts and non-local subresources. The data:
// SVG grain namespaces legitimately contain "http://www.w3.org" (an
// xmlns inside an embedded data: URI), so external references are
// matched structurally — url()/src/href/import carrying an absolute
// http(s) or file: scheme — never by bare substring.
const HOSTILE_PATTERNS = [
  /<script[\s>]/i,
  /url\(\s*["']?\s*https?:\/\//i,
  /url\(\s*["']?\s*file:\/\//i,
  /\bsrc\s*=\s*["']\s*https?:\/\//i,
  /\bhref\s*=\s*["']\s*https?:\/\//i,
  /@import\s+["']?\s*https?:\/\//i,
  /\bfile:\/\//i,
];

export function assertPlateSafe(html, where) {
  for (const re of HOSTILE_PATTERNS) {
    if (re.test(html)) {
      throw new Error(`Plate ${where} rejected: template carries external or executable content (${re})`);
    }
  }
}

// Content-box geometry in slide inches, derived from the normalized
// DesignSystem margins — the same box the compiler lays content into.
// plateHtmlFor converts to CSS pixels and grows the panel inset, so
// the plate's content panel lands exactly under native content. No
// brand, identity, or legacy layout state enters this computation.
function contentBox(design) {
  const m = design.grid.margins;
  const bottom = SCENE_H - m.bottom - CONTENT_FOOTER_RESERVE;
  return {
    x: m.left,
    y: m.top,
    w: SCENE_W - m.left - m.right,
    h: bottom - m.top,
    bottom,
  };
}

// Representative contrast surface for chrome planning, mirroring the
// legacy plateChromeBg probe: mean color of the plate's top-right
// corner, where the crest and footer sit. Falls back to the declared
// surface ground when sampling fails.
export async function samplePlateCorner(pngPath) {
  try {
    const meta = await sharp(pngPath).metadata();
    const w = meta.width;
    const h = meta.height;
    if (!w || !h) return null;
    const data = await sharp(pngPath)
      .extract({ left: Math.floor(w * 0.84), top: 0, width: Math.max(1, Math.floor(w * 0.16)), height: Math.max(1, Math.floor(h * 0.16)) })
      .raw()
      .toBuffer();
    let r = 0;
    let g = 0;
    let b = 0;
    const px = data.length / 3;
    if (!px) return null;
    for (let i = 0; i < data.length; i += 3) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return `#${[r / px, g / px, b / px].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  } catch {
    return null;
  }
}

function flatFallbackFor(design, surface) {
  if (surface === "title") return `#${design.surfaces.title.bg.hex}`;
  if (surface === "section") return `#${design.surfaces.section.bg.hex}`;
  return `#${design.palette.bg.hex}`;
}

const PLATE_SURFACES = ["content", "title", "section"];

export async function resolvePlateBackgrounds({ themeName, style, mode = "light", design, cacheDir } = {}) {
  if (!themeName) throw new Error("resolvePlateBackgrounds requires a themeName");
  if (!design) throw new Error("resolvePlateBackgrounds requires the normalized design (for panel geometry)");
  const theme = await loadTheme(themeName, { mode, style });
  if (!theme.plate || theme.plate.enabled !== true) return { hasPlate: false, assets: {} };
  const box = contentBox(design);
  const renderOpts = { w: PLATE_W, h: PLATE_H, scale: PLATE_SCALE, ...(cacheDir ? { cacheDir } : {}) };
  const seen = new Map();
  const assets = {};
  for (const surface of PLATE_SURFACES) {
    const want = plateHtmlFor({ theme, surface, slide: null, box });
    if (!want?.html) {
      if (surface === "content") {
        throw new Error(`Plate theme "${themeName}" is enabled but declares no plate html`);
      }
      continue;
    }
    assertPlateSafe(want.html, `${themeName}/${surface}`);
    let asset = seen.get(want.html);
    if (!asset) {
      const { path: png } = await renderPlate(want.html, renderOpts);
      const bytes = await readFile(png);
      const meta = await sharp(png).metadata().catch(() => ({}));
      asset = {
        src: `data:image/png;base64,${bytes.toString("base64")}`,
        hash: createHash("sha256").update(bytes).digest("hex"),
        width: meta.width ?? null,
        height: meta.height ?? null,
        bytes: bytes.length,
        contrastBg: (await samplePlateCorner(png)) ?? flatFallbackFor(design, surface),
      };
      seen.set(want.html, asset);
    }
    assets[surface] = asset;
  }
  return { hasPlate: true, assets };
}

// Strip adapter-only metadata down to the compiler seam: opaque
// {src, hash} per surface. Missing surfaces stay missing so the
// compiler falls back to its flat ground for them.
export function slideBackgrounds(resolved) {
  const out = {};
  for (const [surface, asset] of Object.entries(resolved?.assets ?? {})) {
    if (asset) out[surface] = { src: asset.src, hash: asset.hash };
  }
  return out;
}

// Chrome contrast input for one surface: the sampled plate corner
// when a plate resolved, else the declared flat ground. Keeps footer
// legibility planning honest on dark plates without changing chrome
// policy itself.
export function contrastBackground(resolved, surface, design) {
  return resolved?.assets?.[surface]?.contrastBg ?? flatFallbackFor(design, surface);
}
