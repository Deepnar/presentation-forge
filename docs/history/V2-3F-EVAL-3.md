# V2-3F-7 Evaluation — Comparison-Side Capacity

Date: 2026-10-09. Head `c895274` (this slice, unpushed at writing).
Baseline: `c67c5cc` (V2-3F-5 accepted). No model judged anything
here: the benchmark intents are fixed instruments, allocation is
deterministic code, and every number below was read off machine
output or rasterized pixels by the author. EVAL-1's failure history
stands; this report records the fix, not a rewrite.

Runner: `node tools/v2-benchmark.mjs --out out/v2-3f7 --raster
key` (canonical 50 cells). `out/` is gitignored and reproducible.

## Failure mechanism

Slide `dr-compare` (family `comparison/decision`, verdict
takeaway, two text sides + one callout) on warm-humanist:

- Region after title: y 1.77 → 5.43 (3.66in for sides + support).
- Old allocation: fixed 1.2in support reserve, equal side split →
  side cards 0.83in, text carriers 0.43in.
- Sulfide body needs ~1.0in at 13pt; oxide ~0.7in. Fitter
  correctly refused (8.1pt / 9.9pt vs the 13pt floor) and
  diagnosed — while the one-line support callout luxuriated in
  2.33in. Pure misallocation: the fixed reserve assumed one
  constant fits every case, and the leftover pooled entirely into
  support. EVAL-1's "0.43in for content needing ~1in" is this
  arithmetic, confirmed rather than guessed.

## Allocation rule

Measure demand before dividing space, in `comparisonScene`:

- Each side: `nominalContentHeight` of its label/body paras at the
  carrier width (insets and cautionary-rail narrowing included)
  plus 0.25in planning slack, the card chrome (0.4in), and the
  caveat band when uncertain — never below the 0.8in card minimum.
- Each support block: measured text demand at full width, real
  natural height for tables via the table layout contract, the
  card minimum for charts/images (aspect unprobed), caveat band
  when uncertain — never below 0.4in.
- Sides served first at demand with peer-row alignment (row takes
  its maximum); support shares the remainder. Headline, verdict,
  and annotation reserves unchanged. Fitting runs after final
  geometry and diagnoses genuine overflow: no truncation, no
  omission, no sub-floor shrink, no silent loss.
- Scarce space splits proportional to need with the same minima;
  anything still short overflows honestly into diagnostics.

Measurement stays in the fitting layer (`nominalContentHeight`,
exported from `text-fit.ts`); no `heightOf` arithmetic entered
mechanisms. No free-text parsing, no per-slide special cases.

## Evidence

- `dr-compare` on warm-humanist: cards 0.83 → 1.49in, carriers
  0.43 → 1.09in at nominal 13/15pt, support 2.33 → 0.53in,
  verdict band byte-identical (5.53–6.33), diagnostics 2 → 0.
- Benchmark: 50 cells, L1 20 → 0, L2 0 → 0. All ten
  decision-deck cells clean on all five themes, plain and
  chromed. No new findings anywhere; plans, charts, tables,
  takeaways, and chrome unchanged.
- Rasters viewed: full decision deck plain and chromed on
  warm-humanist (all copy inside cards at readable size, support
  and verdict legible, chrome correct). Cards did not balloon;
  support did not degrade — it shrank to its line.
- Focused suite `test/v2-comparison-3f7.test.js`: 25/25 across
  sides/support shapes, all takeaway treatments, uncertainty,
  rails, genuine overflow (diagnosed, complete, floored,
  in-bounds), single-side fallback, empties, determinism,
  preservation, detached, invariance, and the benchmark
  resolution at nominal size.
- Regression pins transitioned reviewably: the 3E-1 fixture
  changes six s3 numbers (cards 1.28 → 1.21, support 2.78 →
  0.53) with identical diagnostics and untouched siblings; the
  decision-overflow test now asserts resolution with the EVAL-1
  history cited.

## Limits

- Genuine overflow still diagnoses (proven by test, not yet met
  in the benchmark corpus): the rule buys room, not infinity.
- Trailing whitespace below fitted support is honest and stays;
  centering it would be rhythm work, not capacity work.
- Zero-side comparisons keep their historical degenerate path
  (unchanged, still L1-flagged, out of scope).
