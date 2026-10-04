// @forge/model — DesignSystem seam. V2 themes become design systems; for
// the slice this is a read-only view over the existing themes/*.yaml tokens
// (palette + type roles + margins), so the compiler styles scenes from the
// same source the renderer uses. No hex ever flows toward the model.

import { loadTheme } from "../../src/theme.js";

/**
 * @typedef {object} DesignSystem
 * @property {string} name
 * @property {{bg:string,surface:string,ink:string,inkMuted:string,accent:string,rule:string,onAccent:string}} palette
 * @property {{family:string,weight:number,size:number}[]} roles
 * @property {{top:number,right:number,bottom:number,left:number}} margins
 */

function bare(c, fallback) {
  const s = String(c ?? fallback).replace(/^#/, "");
  return s.length === 8 ? s.slice(0, 6) : s;
}

export async function designFromTheme(name, { mode = "light" } = {}) {
  const theme = await loadTheme(name, { mode });
  const p = theme.palette ?? {};
  const t = theme.type ?? {};
  const m = theme.grid?.margin ?? {};
  return {
    name,
    palette: {
      bg: bare(p.bg, "#FFFFFF"),
      surface: bare(p.surface, "#FFFFFF"),
      ink: bare(p.ink, "#111111"),
      inkMuted: bare(p.ink_muted ?? p.ink, "#555555"),
      accent: bare(p.accent, "#C05D4E"),
      rule: bare(p.rule, "#DDDDDD"),
      onAccent: bare(p.on_accent, "#FFFFFF"),
    },
    roles: Object.fromEntries(
      Object.entries(t).map(([role, v]) => [role, { family: v.family, weight: v.weight, size: v.size }]),
    ),
    margins: { top: m.top ?? 0.62, right: m.right ?? 0.7, bottom: m.bottom ?? 0.7, left: m.left ?? 0.7 },
    raw: theme,
  };
}
