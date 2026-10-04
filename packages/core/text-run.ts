// @forge/core — Layer C text-run projection helpers shared by the
// PPTX renderer and the SVG/browser projection. Pure functions over
// run shapes; no DesignSystem access (resolution lives in the
// compiler). Both renderers import these so emphasis and transform
// semantics cannot disagree between outputs.

export interface ProjectableRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  weight?: number;
  transform?: string;
}

// Renderer emphasis rule: explicit bold wins; otherwise weight >= 600
// (the same threshold the legacy textStyle helper uses).
export function runBold(run: ProjectableRun): boolean | undefined {
  if (run.bold !== undefined) return run.bold;
  return (run.weight ?? 400) >= 600 ? true : undefined;
}

// Visible text for raster/export projections. The scene keeps authored
// casing; projections apply the design transform because PPTX/SVG have
// no text-transform abstraction the editor contract can rely on.
// Semantic projections keep reading the underlying authored text.
export function visibleText(run: ProjectableRun): string {
  return run.transform === "upper" ? run.text.toUpperCase() : run.text;
}
