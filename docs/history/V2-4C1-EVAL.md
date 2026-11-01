# V2-4C-1 Evaluation — tick truthfulness and multi-series pie

Date: 2026-10-11. Baseline `5d00a3b` (V2-4C in review).
Driver: `node tools/v2-4c1-eval.mjs` (outputs gitignored
`out/v2-4c1/`). Curated evidence: `docs/v2-4c1-evidence/` +
README. No compiler, schema, theme, or PPTX changes; the only
product-code touch is `packages/editor/scene-chart.js`.

## Verdict

Every displayed quantitative axis is numerically truthful down
to micro magnitudes, and multi-series pie data is never
silently misrepresented. Six focused tests fail on the V2-4C
baseline and pass after; the full suite holds.

## 1. Tick-label root cause

`fmtTick` derived decimals from the step's decimal string and
capped at four. For steps at or below 1e-6 the cap (or the
exponent-form parse) yielded precision 0–4 where 6–7 were
needed: step 1e-6 labeled 3e-6 as `"0"`, and a [0, 3e-6] axis
read `0|0|0|0` — nonzero data with an all-zero axis.

## 2. Formatting strategy and guarantees

- Decimals follow the step's exact expansion (2.5→1,
  0.000001→6, 1e-7→7, 2.5e-6→7, 2500000→0).
- Fixed-first to ten step decimals with trailing-zero
  stripping ("0.0000003", "2.5", "2500000"); zero (incl. −0)
  always reads "0".
- Scientific with two mantissa decimals beyond ten decimals
  ("3.00e-11").
- Shortest-form output is injective, so adjacent lattice ticks
  always label distinctly; lattice values are exact multiples
  of the step, so fp accumulation noise stays orders below the
  last printed digit for every plottable domain.
- Axis reservations already measure the actual strings, so
  longer scientific labels widen the axis instead of
  shrinking type (V2-4B contract intact).

## 3. Tick-pipeline audit

- `chartDomain`: unchanged; zero-spanning, [0,1] fallback.
- `niceTicks`: unchanged; lattice-anchored, count-capped,
  zero-snapped. Verified for micro ([0,3e-6] → 1e-6 steps),
  fractional (2.5), large (5e5), and extreme (±1e308, finite
  lattice) domains.
- `normPos` (new): normalized positions clamp finite to
  [0,1]; non-finite (fp64 span overflow) maps to the baseline
  instead of emitting NaN. Containment-by-construction now
  holds even past fp64 plottability; axes still label the true
  range. Applied uniformly to bar/hbar/line/area mappers
  (grid ticks were already in-range).
- No other path emits coordinates: pie sweeps derive from
  shares of a finite total; all-zero renders the honest ring.

## 4. Multi-series pie decision

- Native behavior (verified by raster): a two-series pie draws
  series[0] (1:2 → matching wedges) with a category legend;
  series B is absent from the rendering.
- OOXML probe: pptxgenjs collapses multi-series pies to one
  `<c:ser>` — B's values are dropped from the file, not
  merely hidden. (Bar/line keep every series.)
- No Layer-B single-series guarantee exists (passthrough
  emission, schema allows four series, no diagnostic), and
  adding compiler/schema machinery for author-only data would
  exceed the slice. No schema change made.
- Implemented (option b, minimal): geometry stays series[0]
  (parity with native rendering); unplotted series stay
  legend-listed with a hollow `□` swatch and an explicit
  "(not shown)" suffix, so no series reads as a slice it does
  not have. Single-series legends byte-identical in behavior
  (no spurious marks). The scene still carries everything;
  the browser note is the only visible trace of B anywhere.

## 5. Before/after

- Ticks: `0|0|0|0` → `0|0.000001|0.000002|0.000003`
  (browser-micro-after vs pptx-micro: same values, Office
  uses denser native ticks — owned client difference).
- Pie: solid `■ B` swatch implying a phantom slice →
  `□ B (not shown)` (browser-pie2 vs pptx-pie2: same A wedges;
  PPTX drops B silently).

## 6. Regressions and limitations

- 13 new tests green; 6 fail on baseline (stash-verified).
- Consumer net and full suite hold (sole failure the known
  BYOK locale one); PPTX bytes for single-series charts
  unaffected (renderer-pptx untouched).
- Left-inset asymmetry, system fonts, interim palette,
  area-overlap semantics: unchanged from V2-4C, still tracked.
- Extreme-domain collapse and exponent-form steps are covered
  by unit tests, not screenshots (no real deck reaches them).
