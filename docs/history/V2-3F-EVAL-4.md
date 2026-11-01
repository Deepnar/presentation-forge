# V2-3F-8 Evaluation — Table-Cell and Chart-Internal Typography

Date: 2026-10-10. Head `a9735e6` plus review fixes (this slice,
unpushed at writing). Baseline: `2816389` (V2-3F-7 accepted). No
model judged anything here: stress fixtures are fixed instruments
in `test/v2-internal-3f8.test.js`, allocation and assessment are
deterministic code, and every number below was read off machine
output or rasterized pixels by the author.

Runners: `node tools/v2-benchmark.mjs --out out/v2-3f8 --raster
key` (canonical 50 cells); stress decks under `out/v2-3f8-stress/`
(PPTX + SVG + LibreOffice rasters). `out/` is gitignored and
reproducible.

## Failure classes (reproduced before fixing)

Measured on `2816389` with zero diagnostics everywhere — the
silence was the bug:

- **Missing measurement.** Cell wrap lines, header wrap,
  per-cell word width, and all chart label capacity unmeasured.
  Twelve-row tables, 90-char cells, 34-char tokens, and
  12-category charts all compiled diagnostic-free.
- **Insufficient allocated capacity.** Every row budgeted one
  line (0.38in); wrapped cells overflowed silently.
- **Renderer divergence.** PowerPoint expands wrapped rows past
  the contract `rowHeights` (raster-proven: 2-line rows from
  0.38in contracts), so the scene understates rendered height;
  ragged rows rendered missing cells as solid green fills;
  SVG tables showed single-line text and SVG charts no labels
  at all.
- **Unsupported authored features.** None found: no data labels
  are emitted (all `show* val="0"` in OOXML), and titles,
  legends, and axes are all settable through library options.
- **Genuine impossibilities.** Tokens wider than columns,
  tables taller than regions at readable sizes, labels that
  cannot fit slots at floor size.

## Contracts

`table.layout` gains `colWidths` (even split, exact-sum, both
renderers divide from it). `chart` gains `labels` (caption family,
nominal size, muted ink — the size is the floor as well as the
nominal; labels never shrink). Both optional; historical scenes
validate unchanged. Column-aware widths and content-aware columns
are deliberately out: the even split is the documented renderer
behavior, recorded once, and content-aware columns would be
constraint solving.

## Capacity logic

Tables: every cell measured at its column width with header/body
metrics (`\n` segments independently, empty segments own a line,
headers at bold advance). Rows take true wrapped heights; short
tables compact, dense tables squeeze evenly. Height findings fire
only when text itself exceeds the row (padding squeeze stays
quiet — proven readable on rasters); word findings fire on
unbreakable tokens. Charts: no word wider than the chart, no
category word wider than its cartesian slot, no label line taller
than its hbar row, no legend volume larger than the chart.
Legend entries are series names (plus pie categories for
single-series pies, matching PowerPoint). All measurement lives
in `text-fit.ts` / `core/fit.ts`; mechanisms hold no
`heightOf`/`lineCount` (guard-tested).

## Overflow diagnostics

L1 `table-cell-overflow` and `chart-label-overflow`, each naming
slide, element, block, and measured evidence (row/col/lines/need
vs have; label/slot/token widths). Text stays nominal and
complete; geometry stays finite; squeezed tables keep region
discipline (valid vessel, diagnosed honesty) rather than
overlapping takeaways. The fitter is untouched; QA policy only
gains the two additive codes.

## Evidence

- Stress: long-wrap rows [0.38, 0.66, 0.66] seat clean;
  34-char tokens and 12× identical long categories diagnose per
  label; ragged tables render complete grids with no green;
  `\n` cells break and expand honestly; ordinary benchmark
  tables/charts stay silent on all five themes.
- Benchmark: 50 cells, L1 0, L2 0; takeaways exact, charts
  byte-exact, representation complete, no new findings.
  Data-heavy table and research chart rasters read clean.
- OOXML: `gridCol` counts follow the contract, full cell text
  (including `\n`) embedded, legend at `sz="1000"` in Inter
  5C5C59 at `legendPos r`, native chart parts, no rasterized
  charts, no truncated values.
- SVG: cells wrap exactly as counted, charts carry categories
  and legends in contract typography, decor/image layering
  intact.
- Suite: 22/22 focused; 11 of 22 fail on `2816389` for genuine
  previously unsupported behavior. Full suite 1362/1361, sole
  failure the known unrelated BYOK locale expectation.
- Fixtures: 3E-1 untouched (table/chart internals unprojected
  there); V2-3D file byte-identical with scoped comparison and
  chart-label allowances.

## Deferred limits

- PowerPoint's own cell autofit (row expansion) and label
  staggering/rotation at open time are client behavior: our
  diagnostic fires pre-emptively, but we cannot suppress the
  client's reflow. Documented, not solved.
- Legend corner geometry is renderer-internal: only volume
  impossibility diagnoses. Realistic-but-crowded legends keep
  contractual sizes; crowding the plot remains PowerPoint's call.
- Content-aware column widths, per-kind SVG chart geometry
  (bars stay series[0] verticals for every kind), cell shrinking,
  and table splitting are explicitly out of scope.
- Numeric alignment stays left (observed default, not a fitting
  failure); shadows stay unprojected.
