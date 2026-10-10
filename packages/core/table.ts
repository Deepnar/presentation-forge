// @forge/core — shared table projection primitives. Pure: no
// filesystem, no theme, no renderer. The compiler resolves layout
// (column widths, row heights) into the scene contract; both
// renderers divide cells from the same numbers through the helpers
// here so measurement and projection can never disagree about where
// a column starts. Authored row data is never altered: ragged rows
// pad with empty cells at projection time only.
export function maxColumns(rows: string[][]): number {
  let n = 1;
  for (const row of rows ?? []) n = Math.max(n, row.length);
  return n;
}

// Even column split with exact-sum enforcement: fp division must
// not leave the contract claiming a total the element box does not
// have. Content-aware columns would be constraint solving; the even
// split is the documented renderer behavior, recorded once.
export function splitWidths(width: number, cols: number): number[] {
  const n = Math.max(1, cols);
  const each = width / n;
  const out = Array.from({ length: n }, () => each);
  out[n - 1] += width - out.reduce((a, b) => a + b, 0);
  return out;
}

export function padTableRows(rows: string[][], cols: number): string[][] {
  const n = Math.max(1, cols);
  return (rows ?? []).map((row) => {
    const cells = [...row];
    while (cells.length < n) cells.push("");
    return cells;
  });
}
