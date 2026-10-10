# V2-3F-9 Evaluation — Implemented vs Planned Visual Differentiation

Date: 2026-10-10. Head `bb747b0` plus review fixes (this slice,
unpushed at writing). Baseline: `e542479` (V2-3F-8 accepted). No
model judged anything here: status annotations are fixed intent
edits, badges are deterministic emission, and every judgment below
is the author's reading of machine output and rasterized pixels.

Runners: `node tools/v2-benchmark.mjs --out out/v2-3f9 --raster
key` (canonical 50 cells) plus targeted source-of-truth renders on
high-contrast-mono, sci-fi-hud, and glassmorphism, plain and
chromed (`out/v2-3f9-status/`). Before-outputs came from a worktree
at `e542479`. `out/` is gitignored and reproducible.

## Semantic gap and contract

Layer A had no machine-readable status: the source-of-truth deck
distinguished shipped from planned through slide titles ("Shipped
this term" / "Planned, not shipped") and prose alone. The compiler
could not see the distinction it was asked to draw.

Contract: optional block-level `status: implemented | planned`.
Absent means unspecified — never defaulted, never inferred from
wording. Orthogonal to outcome, uncertainty, emphasis, evidence,
role, and measure by schema construction (all 2×4×4×3
combinations validate). No composition change was needed: status
is block-intrinsic like uncertainty's label, and the structured
counterfactual fixtures stay closed (every pair there must differ
at plan level, which status correctly does not). Status pairs live
inline in the focused suite instead.

Benchmark deltas (words and numbers untouched): st-built-b1,
st-measured-s1, st-measured-s2 → implemented; st-planned-b1 →
planned; st-open-b1 and st-limit-b1 stay unspecified.

## Visual language

One badge band per status-bearing block, allocated before fitting
inside the shared placement path: a 0.12in square plus an eyebrow
word in the block's own ink. Implemented fills the square with the
theme accent; planned outlines it in ink over a transparent fill
(the 3F-5 alpha contract, already projected by both renderers).
Unspecified blocks get no badge and no reservation.

Why this combination: words need no legend; fill-vs-outline
survives monochrome and color loss (word color is identical ink
for both, so no value judgment leaks through color); ink text and
outline stay legible on light and dark grounds while only the
small implemented fill uses accent; no checkmarks, no red/green,
no giant status cards. The hollow mark required one scoped
addition — SVG shape stroke projection — since the stroke channel
existed in the contract but never reached SVG.

## Evidence

- Counterfactuals: implemented/planned, implemented/unspecified,
  and planned/unspecified all differ visibly; same-status
  compiles byte-identically; status semantics identical across
  all five themes (presence, kinds, words, solid-vs-hollow —
  never the theme's own accent hex); free-text-only changes keep
  badges byte-identical.
- Benchmark: 50 cells, L1/L2 zero before and after; plans,
  takeaways, charts, and representation identical. The only scene
  deltas are added badge elements on annotated blocks.
- Rasters read (source-of-truth, plain+chromed): warm-humanist,
  high-contrast-mono, sci-fi-hud, glassmorphism. Shipped slides
  read "■ IMPLEMENTED", planned slides "□ PLANNED", unspecified
  bare. Mono is the strongest proof — pure black and white, fully
  legible, even where card surfaces vanish. Badges coexist
  cleanly with evidence rules, caveats, takeaways, stat tiles,
  and chrome on every sheet. A viewer can tell what exists from
  what is proposed without reading a word of body copy.
- OOXML: badge words native (`IMPLEMENTED`/`PLANNED` in `<a:t>`),
  implemented fill as native shape fill, hollow mark as
  transparent fill plus ink line, nothing rasterized. SVG carries
  the same words, fills, and outlines.
- Suite: 29/29 focused; 20 of 29 fail on `e542479` (schema
  rejects status, no badges emitted). Full suite green except
  the known unrelated BYOK locale expectation.
- Non-status slides: scenes without annotated blocks contain no
  status keys; unspecified siblings keep byte-identical substance
  (geometry, ids, typography — only the shared draw counter
  shifts, which paint order does not depend on for non-overlapping
  cards).

## Capacity found and fixed in-slice

Demand models did not know about the new band: a status card
promised fit on a budget the badge then ate (10.4pt vs 13pt
floor). Side and support demands now reserve the band, so
status-bearing cards promise honestly; status-less blocks compute
byte-identical demand. No benchmark impact.

## Limits

- The badge band (0.35in with gap) can tip genuinely tight slides
  into honest diagnostics; that is the fitter working, not a
  defect to suppress.
- Status is authored metadata, unverified: recording `implemented`
  does not prove implementation. Verification belongs to a later
  grounded-research workflow, explicitly out of scope.
- Slide-level status does not exist; takeaways carry no status.
- The eyebrow word follows each theme's eyebrow voice (caps where
  the theme uppercases); wording is fixed to the intent
  vocabulary, never synonyms.
