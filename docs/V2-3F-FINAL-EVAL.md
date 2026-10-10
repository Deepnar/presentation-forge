# V2-3F Final Evaluation — Quality & Acceptance Gate

Date: 2026-10-10. Baseline: `3033193` (V2-3F-9 accepted). Head at
evaluation: `0566f8b` (roadmap gate-open only; no product change
since baseline). No model wrote or judged anything here: all
intents are fixed instruments, allocation is deterministic code,
and every judgment below is the author's reading of machine
output and rasterized pixels.

## 1. Baseline and commands

- `git fetch origin v2 && git rev-parse HEAD` → `3033193`, clean
  apart from pre-existing untracked user files (`.agents/`, two
  root working documents — untouched throughout).
- `npm run typecheck` → clean.
- `npm test` → 1391 total / 1390 pass; sole failure the known
  unrelated `byok-budget` locale expectation (untouched).
- `node tools/v2-benchmark.mjs --out out/v2-3f-final --raster key`
  → 50 cells, L1 0, L2 0.
- Family matrix: `node tools/v2-final-eval.tmp.mjs matrix` →
  `out/v2-3f-final/contact-mech-*.png` (7 themes × plain/chromed,
  12 slides each). Stress: same driver `stress` →
  `out/v2-3f-final/stress/` (15 decks + per-slide SVG + rasters).
  Escape/dividers rendered directly (see §5). All `out/`
  gitignored and reproducible; the two `.tmp.mjs` drivers were
  scratch and are deleted before delivery.

## 2. Environment and tool versions

- LibreOffice 26.8.0.3 (e34ffb33), headless → PDF → PNG via
  `src/preview.js` at 110 dpi.
- Google Chrome 151.0.7922.173 (plate raster only; unchanged
  since V2-3F-5).
- Node v24 (native TS stripping, `node --test`).

## 3. Test and typecheck results

Typecheck exit 0. Full suite 1391/1390 with the single known
BYOK failure isolated (wrong-digit-grouping locale expectation,
pre-existing, unrelated to V2). No fixture was modified to make
anything pass; the one uncommitted working-tree file at gate
start (`test/v2-internal-3f8.test.js`, +22-line height-overflow
test authored and verified in the 3F-8 session) is committed by
this gate as evaluation tooling since the suite baseline already
ran with it present.

## 4. Canonical benchmark results

50 cells (5 decks × 5 themes × plain/chromed): **L1 0, L2 0**,
takeaway findings none, chart mismatches none, representation
missing none. Plans identical to the accepted baseline run. The
benchmark proves cleanliness, not excellence — §8 below is the
excellence check, conducted by looking.

## 5. Composition-family coverage

All 12 families rendered and inspected on warm-humanist plain
(reference sheet, 12 slides): divider, prose-list, card-grid,
comparison, data-table, metric, chart, sequence (linear + cycle),
hierarchy, media-led, framed-prose, escape (via direct planned
compile — unreachable through planning by design, renders with
all blocks present). All four divider variants inspected
(opening/transition through planning; closing/standard through
the legacy title override that reaches them). All six chart kinds
rendered natively (bar, hbar, line, pie, doughnut, area) plus
negatives, 12-category, and 4-series cases.

Result: every family communicates its intent; titles dominate,
stats dominate, caveats subordinate, verdicts centered. No
missing content anywhere. The systematic shape is top-anchored
cards over trailing whitespace on short content — evaluated as
acceptable (the 3F-3 record: whitespace under framed cards reads
as panel design), not a defect.

## 6. Theme and chrome coverage

Rendered and inspected: all five canonical themes (plain and
chromed, mechanism + benchmark sheets), glassmorphism and
gradient-mesh-dark (plates, plain and chromed), mono-terminal
at scene level. Status sheets additionally on
high-contrast-mono, sci-fi-hud, glassmorphism (plain+chromed).
Background layer order, decor, translucency, card fills, rule
colors, banner/crest/presenter/numbers, and footer reserves all
correct on every sheet. No theme loses its identity in native
export; no authored content was rasterized for any theme.

## 7. Stress fixtures

Tables: short, dense (12×3), wide (6-col), long-header, wrapped
cells, 34-char tokens, ragged/empty rows, `\n` cells, unicode
(µ Ω ×10 ⁻ — " "), 200-char cells, 16-column narrow, 15-row
overflow, status+uncertainty tables. Charts: long categories,
12-category, long series, legend volume, small footprints,
negatives, all six kinds. Composition: exhausted comparison,
status-pressure overflow, 200-word body, 8-card grid, max-length
fields. Every stress deck compiles to valid in-bounds geometry
with unique IDs; honest cases stay silent; impossible cases
diagnose (table-cell-overflow, chart-label-overflow,
text-fit-floor-hit as appropriate).

## 8. Visual observations

What works: reference sheet hierarchy; mono starkness; plate
identity with frosted panels and dark openers; status badges
(■/□ + words) restrained and legible on light, dark, mono, and
plate grounds including stat tiles and beside rails/caveats;
native pie/doughnut/line/area/hbar with legends; wrapped table
rows; ragged grids complete; negatives below the axis.

What is wrong (register §12; severities there):
- Caveat-vs-overflow-text collision on diagnosed-impossible
  content (status-pressure raster).
- Empty image seat glaring white on dark themes.
- Chart series colors hardcoded off-palette (`C0504D`).
- Verdict rule overhanging rounded card corners.
- Word-width findings firing 0.01in over heuristic margin.
- Empty-rows table rendering nothing silently.

## 9. Renderer differences

- Scene→PPTX→LO raster is the truth channel; SVG is structural
  preview. SVG per-kind chart geometry (vertical series[0] bars
  for every kind) is a documented V2-4 boundary, not a defect;
  labels/legends now project in both.
- `rowH` contracts vs PowerPoint's own row expansion on wrapped
  cells: scene understates, client reflows — classified
  third-party behavior with our diagnostic firing first.
- PPTX cell `valign` defaults top, matching SVG; `colW`
  gridCols verified in XML; legend at `sz="1000"` Inter 5C5C59
  right-positioned; hollow status mark as transparent fill plus
  ink line (`<a:alpha val="0"/>` accepted).
- No pixel parity claimed; no mismatch found that affects
  editing or review beyond the register.

## 10. Semantic preservation

Machine-verified across 5 decks × 5 themes: every authored
block represented; chart categories/series byte-exact; table
rows byte-exact (including `\n`, unicode, exquisite notation);
takeaway cardinality exactly one with exact text; uncertainty
labels faithful; statuses authored-only (no inference anywhere
in the pipeline — verified by code audit: no text scanning for
status exists); evidence refs untouched; no duplicate IDs; no
fabrications (no invented values in any output). Structured
counterfactuals: 6/6 sensitive; legacy pairs match the recorded
expectations (2 sensitive, 3 correctly indifferent).

## 11. Diagnostic coverage

Correct: text spill, dense-table overflow, narrow-column
overflow (modulo P1-1 margin noise), chart crowding (20
findings), comparison exhaustion (per-side hits), caveat
collisions (via text floor-hit), status pressure, max-length
fields, 8-card overflow. Correctly silent: fitting tables,
ordinary charts, small valid charts, extreme-but-fitting text,
narrow-but-fitting columns, dense single-line tables. No false
negatives found. One oversensitivity class found (P1-1):
word-width findings at ~1.5% heuristic margin.

## 12. Prioritized defect register

**P0 — acceptance blockers: NONE.** No missing or fabricated
content, no wrong data, no invalid output, no broken
determinism found anywhere in ~300 inspected slides.

**P1 — quality blockers (1):**

- **P1-1 — Word-width diagnostics fire within heuristic
  margin.** Narrow 16-col table: six L1s for "Head10…Head15"
  needing 0.66in in 0.65in columns. The 0.01in excess is
  measure-vs-reality noise, not a rendering fact; L1 noise
  trains authors to ignore L1. Evidence: probe output +
  `test/v2-internal-3f8.test.js` narrow case. Affects
  readability of nothing; affects trust in diagnostics.
  Owning component: `cellLines`/slot word rules in
  `text-fit.ts` + `mechanisms.ts`. Proposed slice: calibrate
  a word tolerance (absolute + relative bound) against
  rendered widths; messages already carry both numbers.

**P2 — improvements/deferred (5 + accepted boundaries):**

- **P2-1 — Caveat collides with overflow text on diagnosed-
  impossible slides** (status-pressure raster). z-order
  already favors the caveat; strings preserved; diagnostic
  fires. Accepted limitation: no-truncation plus region
  discipline leave overlap as the honest price. No slice
  proposed beyond documenting.
- **P2-2 — Empty image seat glaring white on dark themes.**
  Proposed slice: theme-aware seat (surface-tinted fill,
  muted label). Degenerate input only.
- **P2-3 — Chart series colors hardcoded `C0504D`.**
  Proposed slice: theme chartColors contract (needs a design
  decision on derivation; do not hardcode another palette).
- **P2-4 — Verdict/accent rule overhangs rounded card
  corners** (framed-prose recommendation/conclusion: square
  full-width rule over roundRect card). Proposed slice: inset
  rule by card radius or roundRect rule.
- **P2-5 — Empty-rows table renders nothing with no
  diagnostic.** Proposed slice: schema `minItems` on rows or
  an explicit empty-table finding.
- Accepted boundaries (not defects): SVG per-kind chart
  geometry; PowerPoint client autofit/rotation/legend layout;
  trailing whitespace under short cards (3F-3 decision);
  zero-side degenerate path (L1-flagged, preserved);
  divider/closing+standard reachable only via legacy override
  (coverage note, exercised this gate).

## 13. Known accepted limitations

As above plus: legend corner geometry is client-owned (only
volume impossibility diagnoses); content-aware columns would be
constraint solving; table splitting, cell shrinking, per-kind
SVG geometry, numeric alignment, shadows, and slide-level
status are explicitly out of scope with no slices proposed
here.

## 14. Recommended corrective slices (ordered)

1. P1-1 word tolerance calibration (small, test-first,
   no geometry change).
2. P2-4 rule/corner alignment (small, renderer-visible).
3. P2-2 theme-aware image seat (small, both renderers).
4. P2-5 empty-table guard (schema or finding, tiny).
5. P2-3 theme chartColors (needs design direction first —
   do not build straight from this entry).
6. P2-1 documents as-is (no slice).

None is a V2-3F acceptance precondition in this report's
judgment — see §15.

## 15. Final recommendation: CONDITIONAL PASS

V2-3F meets its quality standard **conditionally**: accept the
milestone after acknowledging P1-1 as the single quality
blocker with an agreed correction slice, or accept outright
with P1-1 as the first post-3F fix. Rationale: zero P0s
across ~300 inspected slides; semantic fidelity machine-clean;
diagnostics honest in every probed class; the one P1 affects
diagnostic precision at heuristic margins, not content
correctness, readability, or editability — and its own
messages already show the margin, so no author is misled about
facts. A FAIL would overstate a noise issue; an unconditional
PASS would understate it. The six P2s are polish and deferred
capabilities, several already documented as boundaries in
prior slices.

## Appendix: evidence map

- Canonical: `out/v2-3f-final/results.json` (50 cells),
  `contact-{research-defense × 5 themes × 2, *-warm-humanist
  × 2}.png`, `png/` per-slide rasters, `svg/` per-slide SVG.
- Family matrix: `out/v2-3f-final/contact-mech-*.png`
  (7 themes × 2, 12 slides each) + `matrix/*.pptx`.
- Stress: `out/v2-3f-final/stress/` (15 decks: pptx, svg,
  rasters) + `escape/` (escape family, all divider variants).
- Status sheets: `out/v2-3f9-status/contact-{high-contrast-
  mono,sci-fi-hud,glassmorphism}.png`.
- Regeneration: benchmark command §1; matrix/stress via the
  (deleted) scratch drivers — exact deck definitions live in
  §7 and the committed suites; rerun equivalents with
  `tools/v2-benchmark.mjs` plus the suite fixtures.
