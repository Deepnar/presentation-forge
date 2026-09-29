import { hex, textStyle } from "./theme.js";
import { CANVAS } from "./chrome.js";

/**
 * Slice 2 of the canvas: the renderer applies the human `overrides` block.
 *
 * Two different mechanisms, because pptxgenjs shapes are immutable once added:
 *
 * - Placed elements (geometry + paint) resolve INSIDE the layout through
 *   `overrideGeom` / `overridePaint`, which the layout calls with a stable
 *   target name. No block, no targets: the default geometry passes through
 *   untouched, so every layout that has not been tagged renders exactly as
 *   before. Unknown targets are ignored — validation checks shape, the
 *   renderer only honours names it placed.
 * - Free textboxes and images are drawn AFTER the layout by `drawFreeforms`,
 *   in slide coordinates, needing no layout cooperation.
 *
 * Target vocabulary. Shared names every tagged layout honours: `headline`,
 * `standfirst`, `body`. Layouts add their own for repeated peers —
 * `body-left` / `body-right` (two-column lists), `card-0..N`, and so on —
 * documented at the call site. Chrome is never a target: the crest and footer
 * bands are locked, and a free element intersecting them is refused with a
 * visible problem rather than drawn.
 */

const GEOM_KEYS = ["x", "y", "w", "h"];

export function overrideGeom(ctx, target, geom) {
  const els = ctx?.overrides?.elements;
  const out = { ...geom };
  if (Array.isArray(els)) {
    const hit = els.find((e) => e?.target === target);
    if (hit) {
      for (const k of GEOM_KEYS) {
        if (typeof hit[k] === "number") out[k] = hit[k];
      }
    }
  }
  // The editor surface reads this back: every tagged box reports where it
  // actually drew, overridden or not. Keyed by target, so the canvas can
  // select "body" and write an entry the next render honours.
  if (ctx && typeof ctx === "object") {
    ctx.placed ??= {};
    ctx.placed[target] = out;
  }
  return out;
}

/** A paint value is a theme token path (follows a theme switch) or a hex
 *  colour (the user's explicit choice). Anything else is ignored, never
 *  guessed — the theme default stands. */
export function resolvePaintValue(theme, value) {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith("#")) return hex(value);
  const node = value.split(".").reduce((o, k) => o?.[k], theme);
  if (typeof node === "string") return hex(node);
  if (node && typeof node === "object" && typeof node.color === "string") return hex(node.color);
  return undefined;
}

export function overridePaint(ctx, theme, target, opts) {
  const paints = ctx?.overrides?.paint;
  if (!Array.isArray(paints)) return opts;
  const hit = paints.find((p) => p?.target === target);
  if (!hit) return opts;
  const out = { ...opts };
  const color = resolvePaintValue(theme, hit.color);
  if (color) out.color = color;
  const fill = resolvePaintValue(theme, hit.fill);
  if (fill) {
    out.fill = out.fill && typeof out.fill === "object" ? { ...out.fill, color: fill } : { color: fill };
  }
  return out;
}

// Chrome bands no free element may enter. The crest width varies with the
// brand mark, so the top-right reserve is conservative; the footer is exact.
const LOCKED = [
  { x: CANVAS.w - 2.0, y: 0, w: 2.0, h: 1.15 },
  { x: 0, y: 6.85, w: CANVAS.w, h: CANVAS.h - 6.85 },
];

const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function inLockedZone(geom) {
  return LOCKED.some((z) => intersects(geom, z));
}

function geomOf(entry) {
  return { x: entry.x, y: entry.y, w: entry.w, h: entry.h };
}

export function drawFreeforms(slide, ctx) {
  const problems = [];
  const block = ctx?.overrides;
  if (!block || typeof block !== "object") return problems;
  const { theme } = ctx;

  for (const [n, tb] of (block.textboxes ?? []).entries()) {
    const g = geomOf(tb);
    if (inLockedZone(g)) {
      problems.push(`free textbox ${n + 1} overlaps the locked chrome (crest/footer) — not drawn`);
      continue;
    }
    const st = theme.type.body;
    const scale = typeof tb.size === "number" ? tb.size / st.size : 1;
    slide.addText(tb.text, {
      ...geomOf(tb),
      ...textStyle(theme, "body", { scale }),
      valign: "top",
    });
  }

  for (const [n, img] of (block.images ?? []).entries()) {
    const g = geomOf(img);
    if (inLockedZone(g)) {
      problems.push(`free image ${n + 1} overlaps the locked chrome (crest/footer) — not drawn`);
      continue;
    }
    const abs = ctx.resolveAsset?.(img.asset);
    if (!abs) {
      problems.push(`free image ${n + 1} ("${img.asset}") does not resolve to a file — not drawn`);
      continue;
    }
    slide.addImage({ path: abs, ...g });
  }

  return problems;
}
