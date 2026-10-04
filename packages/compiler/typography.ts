// @forge/compiler — resolved typography truth for Layer C text.
//
// DesignSystem roles own family/weight/size/line/tracking/transform.
// The compiler resolves a role (+ explicit per-run overrides for the
// nominal size the mechanism actually draws, colors, and emphasis)
// into ONE object that both the canonical fitter and the emitted
// TextRun derive from. Renderers must never re-derive fonts from
// theme files: the scene is the visual source of truth.
//
// Layer A gains no typography controls here: roles name compiler/
// design metadata (fitting floors, future editing), never model intent.

import type { DesignSystem } from "../model/design.generated.ts";
import type { FitStyle } from "../core/fit.ts";

export { runBold, visibleText } from "../core/text-run.ts";

export interface RunOverrides {
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  family?: string;
  weight?: number;
  tracking?: number;
  line?: number;
  transform?: "upper";
}

export interface ResolvedRun {
  role: string;
  family: string;
  weight: number;
  size: number;
  tracking: number;
  line: number;
  transform?: "upper";
  color: string;
  bold?: boolean;
  italic?: boolean;
}

export function resolveRunStyle(
  design: DesignSystem,
  role: string,
  overrides: RunOverrides = {},
): { run: ResolvedRun; fit: FitStyle } {
  const spec = design.roles[role] ?? {};
  const family = overrides.family ?? spec.family ?? "";
  const weight = overrides.weight ?? spec.weight ?? 400;
  const size = overrides.size ?? spec.size ?? 12;
  const tracking = overrides.tracking ?? spec.tracking ?? 0;
  const line = overrides.line ?? spec.line ?? 1.35;
  const rawTransform = overrides.transform ?? spec.transform;
  const transform = rawTransform === "upper" ? ("upper" as const) : undefined;
  const color = (overrides.color ?? design.palette.ink.hex).replace(/^#/, "");
  const run: ResolvedRun = {
    role, family, weight, size, tracking, line, color,
  };
  if (transform !== undefined) run.transform = transform;
  if (overrides.bold !== undefined) run.bold = overrides.bold;
  if (overrides.italic !== undefined) run.italic = overrides.italic;
  const fit: FitStyle = {
    family: family || undefined,
    size, weight, tracking, line,
    _role: role,
  };
  if (transform !== undefined) fit.transform = transform;
  return { run, fit };
}

// Renderer emphasis rule and visible-text transform live in
// ../core/text-run.ts (re-exported above) so PPTX and SVG projections
// share them without a compiler dependency.


