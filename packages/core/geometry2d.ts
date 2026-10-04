// @forge/core — orthogonal rotation footprint math. Compatibility
// utility, NOT general rotation support: boxes rotated to exactly 90 or
// 270 degrees swap width/height around their center; every other angle
// (including 0 and 180) keeps its declared box. This preserves legacy
// QA semantics verbatim. A general arbitrary-angle bounds function, if
// editor rotation ever requires one, must be separately named.

export interface RotatableBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
}

export function orthogonalFootprint({ x, y, w, h, rotate }: RotatableBox): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const turn = ((Number(rotate) || 0) % 360 + 360) % 360;
  if (turn !== 90 && turn !== 270) return { x, y, w, h };
  if ([x, y, w, h].some((v) => typeof v !== "number")) return { x, y, w, h };
  return { x: x + w / 2 - h / 2, y: y + h / 2 - w / 2, w: h, h: w };
}
