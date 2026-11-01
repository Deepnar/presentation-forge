# V2-4C Evaluation — browser chart geometry and data fidelity

Date: 2026-10-11. Baseline `34a758b` (V2-4A/B accepted).
Driver: `node tools/v2-4c-eval.mjs` (outputs gitignored
`out/v2-4c/`, manifest `out/v2-4c/eval-manifest.json`).
Curated evidence: `docs/v2-4c-evidence/` + README. Method: a
chart intent compiled through the real compiler on three
themes (warm-humanist plain+chromed, high-contrast-mono,
gradient-mesh-dark) — native PPTX → LibreOffice raster vs
headless-Chrome viewer screenshots of the identical scenes.

## Verdict

All six scene chart kinds render deterministically with exact
data relationships. The browser communicates the authored
chart — no first-series-only fallback, no fabricated values,
no misleading axes. Comparison against PPTX shows the same
meaning everywhere; residual differences are client layout
choices (axis limits, pie start angle, palette hues, legend
side), each owned below. One self-found tick-label rounding
bug was fixed and regression-tested before delivery.

## Root causes of the historical mismatch

The pre-4C projector drew every kind as first-series vertical
bars with no value scale: kind, sign, extra series, and
proportion all collapsed. PowerPoint instead natively plots
all series with auto axes and Office palette colors — none of
which the scene defines. The scene contract (kind,
categories, series, label typography) is sufficient for
honest geometry; only series colors have no shared contract
(see palette decision).

## Architecture

New pure module `packages/editor/scene-chart.js`
(`chartInner(el, boxPx, labelStyle)` → inner SVG), wired by
the existing `scene-svg.js` chart branch, which keeps element
identity (`data-el`, locked, semantic ref, opacity). No DOM,
no network, no mutation, no randomness, no charting
dependency; output stays inspectable DOM, one selectable
unit (no nested `data-el`). Containment is by construction
(every coordinate maps inside the plot box), so no clip paths
are emitted.

## Scaling, axes, ticks

- Cartesian domains span all finite series values **and
  zero**; all-zero degrades to [0, 1]; no finite data renders
  honest empty axes (never NaN).
- Nice ticks from {1, 2, 2.5, 5, 10}×10ⁿ, lattice-anchored so
  zero always lands on a tick; count adapts to plot size.
- Labels name their gridline value exactly (`fmtTick` follows
  the step's own decimals — a shipped-then-fixed bug had
  rounded 2.5→"3"; regression test pins "2.5"/"7.5").
- Gridlines use the contract label color at 0.35 opacity
  (0.6 for zero/axes): theme-harmonious on light and dark
  without a new contract. Legend stays bottom (PPTX puts it
  right — documented divergence; mapping, not position,
  carries meaning).
- Category labels keep full text at contract size (never
  shrunk); overflow stays visible exactly when the capacity
  diagnostic fires.

## Per-kind rules

- **bar**: grouped series per category slot, order kept,
  bars span value→zero (negatives hang below, zero heights
  honest gaps).
- **hbar**: genuinely transposed — categories on the
  vertical dimension, value axis horizontal.
- **line**: scaled polylines in category order, per-series
  markers (circle/square/diamond/triangle); missing
  observations break the run (no interpolation); isolated
  points render as markers.
- **area**: line geometry filled to the zero baseline at
  0.35 opacity with stroked top edge; overlapping (not
  stacked) series, later over earlier.
- **pie/doughnut**: series[0], start −90°, clockwise,
  authored category order, exact share sweeps; zero/negative
  values take zero sweep but stay legend-listed (no
  absolute-value invention); single 100% slice renders a disc;
  all-zero renders an honest empty ring; doughnut hole via
  even-odd rings (transparent over plates).
- Unknown kinds fall back to bars (schema-closed, unreachable
  except forward tolerance).

## Palette decision (explicit, not silent)

PPTX assigns Office defaults per chart; the scene carries no
series colors and the theme defines no categorical ramp, so
parity is impossible from scene data alone. The design layer,
however, already owns the answer: themes may declare
`chart.series` (high-contrast-mono.yaml does — six chromatic
entries) and `chartSeries()` in packages/core/chartpalette.ts
resolves declared palettes contrast-enforced or generates
contrast-safe ramps; V2 simply never carries the result into
Layer C. The tracked follow-up is therefore concrete: resolve
via `chartSeries(design, n)` at chart emission, carry
`series[].color` (optional, backward-compatible) through the
schema workflow, project verbatim in SVG fills and PPTX
`chartColors`. This slice uses a documented
interim ramp (`INTERIM_SERIES_COLORS`, first entry preserves
the historical single-series accent so existing decks are
unchanged) with exact legend mapping in both projections.
No silent fixed palette: it is named, justified, and queued
for replacement by the mechanism above.

## PPTX/browser comparison (same scenes)

- bar/neg/hbar/line/area: identical relationships, order,
  signs, categories; axis limits differ (Office auto vs
  deterministic nice) — same meaning, owned difference.
- pie/ring: identical ratios and order; start angle differs
  (Office 0° vs −90°) and hues differ (Office vs interim
  ramp); legend right vs bottom.
- mono theme: fully legible; dark plate: ring hole
  transparent, labels contrast-clean.
- Native PPTX charts untouched (OOXML values asserted).

## Tests

`test/v2-chart-4c.test.js` (24): scale math, per-kind
invariants (proportions, orientation, peak placement,
arc flags, hole, zero-shares, disc), grouping/colors,
gaps, honesty cases (all-zero, equal, magnitudes,
single-category, long names unshrunk), determinism,
identity/selection/opacity/zoom, OOXML nativeness. Kind
cases fail on `34a758b` (verified via stash); contract
cases pass on both. Consumer net 273/273; full suite
1499/1500 (sole failure the known BYOK locale one).

## Limitations / next slice

- Left text inset asymmetry (~5px, bounded, from V2-4B).
- System-font metrics until V2-4D webfonts.
- Multi-series pie renders series[0] (documented; compiler
  emits single-series pies; native export carries all data).
- Area overlap (not stacking) is by contract absence.
- Interim palette awaits the theme-resolved contract.

V2-4D (browser fonts) is the correct next slice: it removes
the last systematic metric residual across text AND chart
labels.
