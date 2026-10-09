# V2-3F Evaluation, Slice 1 — Benchmark and Quality Report

Date: 2026-10-09. Baseline commit `001edec`. No model judged anything
here: every deck below was compiled by deterministic code from
hand-authored `DeckIntent`s, and every number was read off machine
output or rasterized pixels by the author. No LLM/vision judge ran;
no human review beyond the author has happened.

Runner: `node tools/v2-benchmark.mjs --out out/v2-3f --raster key`
(regenerates everything below; `out/` is gitignored and reproducible).
Intents: `test/v2-benchmark-intents.js` (fixed instruments, no model).
Fast assertions: `test/v2-benchmark-3f.test.js` (12 tests, no
LibreOffice). Contact sheets: `out/v2-3f/contact-*.png`.

## Method in one paragraph

Five hand-authored decks (one per V2-3A class, facts verbatim from
that class's source pack) × five representative themes × {plain,
chromed} = 50 cells. Per cell: composition plan, L1/L2 findings, fit
diagnostics, authored-block representation, takeaway realization,
chart fidelity, native PPTX bytes. Raster subset: research-defense on
all five themes (theme comparison) plus every deck on warm-humanist
(content comparison); SVG for everything. Counterfactuals re-measured
at the scene-composition layer. Plates audited from theme YAML plus
normalizer behavior, not by rendering.

## Benchmark-by-benchmark

### 1. research-defense — NOT usable unchanged

Plan: divider/headline, prose-list, chart/annotation,
metric/annotation, framed-prose, framed-prose/headline. L1 on all 10
cells: `duplicate-element-id` (`rd-close:takeaway:headline` emitted
twice — once below the title at y=1.77, once at the slide bottom at
y=6.33); the bottom copy also trips `chrome-band-overlap` on chromed
cells. Representation, chart data (1.2/12.5/0.4 exact), and takeaway
realization are otherwise clean on all 50 cells.

What reads well on the raster: the chart slide (bars true to data,
unit + caption + annotation all present), the metric slide (8% stat,
label, visible INCONCLUSIVE caveat, annotation takeaway), the
limitation card (CONTESTED badge). Uncertainty survives structurally
— the pack's central demand holds.

What fails: the closing slide prints its takeaway twice (defect
V2-3F-1). The prose-list slide parks three bullets top-left above a
half-slide of nothing (weakness V2-3F-3). Fix the duplication and
this deck is close; the emptiness is polish, not wrongness.

### 2. source-of-truth-project — usable for an internal review, not a grading

L1-clean on all 10 cells. 26/26 and 877/878 stats exact, mixed
outcome on the second tile renders without red/green editorializing
(by design), QUALIFIED caveat on the planned slide, limitation card
honest. The pack's hard demand — implemented vs planned must stay
distinct — holds VERBALLY (titles, takeaways) but not VISUALLY:
both lists use identical composition, so a skimming examiner sees
two look-alike lists. That is a real gap (V2-3F-3/V2-3F-9 territory:
no visual implemented-vs-planned differentiation exists), just not
an L1 defect.

### 3. technical-explainer — NOT usable unchanged

Same duplicate-takeaway defect on the closing slide
(`te-hard:takeaway:headline` twice, L1 on all its cells). Everything
else reads well: comparison cards, sequence badges 1-2-3, metric with
annotation, QUALIFIED caveat. Motivation-before-mechanism order
survives compilation. One defect away from usable.

### 4. decision-recommendation — NOT usable unchanged

L1 `text-fit-floor-hit` ×2 on all 10 cells: the comparison side
cards budget 0.43in for label+body while the authored sides need
~1in. The fitter correctly refuses to shrink below 13pt and
diagnoses — but the raster shows the consequence plainly: body text
spills outside the white side cards onto the поддержки callout
below. Keeping text readable instead of shrinking it is the right
call; rendering it outside its card is the visible cost. The
verdict/callout/takeaway machinery itself works (accent rule,
centered verdict, fallback caveat with QUALIFIED badge). This deck
needs either tighter side copy (authoring guidance) or
capacity-aware side budgets (future work, V2-3F-7) — not a fitter
change.

### 5. data-heavy-analytical — usable with minor polish

L1-clean on all 10 cells. Table exact down to ±0.1 and n=3;
annotation takeaway names the weakest link; chart carries unit and
caption; closing caveat qualified. Weaknesses are cosmetic: table
rows divide height evenly so short rows strand text at the top with
dead air, and the header row is typographically identical to body
rows (V2-3F-4). Nothing is wrong; a grader could use this deck.

## Theme compatibility matrix

Semantic projection identical across all five themes on all five
benchmarks (invariance green, 5×5). Real differences observed on
rasters, all attributable to theme data rather than compiler
behavior: high-contrast-mono drops card surfaces (surface FFFFFF on
bg FFFFFF — invisible by theme data, grouping lost), sci-fi-hud
renders the full dark deck legibly with footer chrome correct
(presenter 0.45 white, number opaque), mono type narrows measure so
identical content fits at different sizes per theme (expected and
correct). No theme-name branching in compiler chrome code (tested).

## Counterfactual sensitivity matrix

Structured pairs, scene-composition layer: 6/6 sensitive
(s-outcome, s-relationship, s-emphasis, s-media-role,
s-uncertainty, s-rhetorical-role). Every hardened semantic now
moves the scene. Legacy pairs: strong-vs-misses-target and
primary-vs-minor sensitive (takeaway/emphasis machinery);
compare-vs-sequence, evidence-vs-illustration, and novice-vs-expert
indifferent — CORRECTLY so, because those pairs differ only in
free-text purpose/visualDirection/audience, which the compiler must
not parse. Indifference here is architecture, not apathy; the V2-3A
indifference record stays historical.

## L1/L2 rollup (50 cells)

- L1: 20× `text-fit-floor-hit` (decision deck, legitimate
  overflow), 10× `duplicate-element-id` + 5× `chrome-band-overlap`
  (one shared root cause: duplicated headline takeaway), 0
  elsewhere. Zero L2 findings anywhere in the matrix — the
  capability-gap emitters (honesty fallback, hierarchy tiers)
  simply did not trigger on these decks.
- No scene-invalid, no off-canvas, no unrepresented blocks, no
  chart divergence, no takeaway mismatches on any cell.

## Capability gaps (unsupported, not defects)

- Table-cell fitting and chart-internal typography remain unfitted
  by design boundary (3E-1 record stands).
- Plate themes (10/34): V2 normalizes plate HTML to flat
  `palette.bg` — blur, gradients, and imagery never reach the
  scene. Translucent `cardFill` (e.g. glassmorphism 0.58) drops its
  alpha at `palette.surface.hex`, rendering opaque. Chrome
  contrast stays self-consistent because it plans against the same
  flat bg, but compositing a real plate underneath later would need
  the adapter-supplied `background` seam (which exists) plus a
  raster path (which does not).
- Media: image blocks carry `src`/alt; no supply, sizing, or
  caption-overflow intelligence beyond the box.

## Defects vs deferred, ranked

1. **V2-3F-1 (defect, small): duplicate headline takeaway.** Nine
   families (comparison, data-table, metric, chart, sequence,
   hierarchy, media-led, framed-prose, escape) call trailing
   `takeawayEls` unguarded, re-emitting the headline placed at top.
   Fix: guard trailing calls to verdict/annotation (prose-list and
   card-grid already do). Closes duplicate-element-id AND the
   footer-band intrusion in one move.
2. **V2-3F-3 (weakness, medium): vertical rhythm.** Content clumps
   top; single-block slides strand half the canvas. Needs
   composition-level vertical distribution, not fitter tweaks.
3. **V2-3F-4 (weakness, small-medium): table density.** Even row
   division strands text; header indistinguishable from body.
4. **V2-3F-6 (weakness, small): caveat detachment.** Caveats pin to
   region bottom, far below one-line content. Should hug content.
5. **V2-3F-5 (capability, large): plate backgrounds.** 10 themes
   lose their defining surface; cardFill alpha dropped. Needs the
   raster/adapter path, explicitly V2-3F-later, not V2-4.
6. **V2-3F-7 (guidance + possible future): comparison side
   capacity.** Real decision copy overflows 0.43in side budgets
   honestly. Short term: authoring guidance. Long term:
   capacity-aware planning.
7. **V2-3F-8 (capability, known): table-cell and chart-internal
   fitting.** Unchanged from the 3E-1 boundary.
8. **V2-3F-9 (observation): no visual implemented-vs-planned
   channel.** Verbal distinction only; a skimming reader sees two
   identical lists.

## Narrative/visual weaknesses requiring future work

Rhythm (V2-3F-3) is the systemic one: nearly every slide is
top-anchored content over trailing whitespace. Hierarchy is
otherwise sound (titles dominant, stats dominant, caveats
subordinate). No red/green outcome encoding anywhere (by design).
No template repetition observed across the five decks (families:
divider, prose-list, chart, metric, framed-prose, comparison,
sequence, data-table all exercised distinctly).

## Comparison against the V2-3A baseline

V2-3A measured the old six-recipe compiler: stat/table/quote
blocks and ignored lists vanished silently; all five legacy pairs
indifferent. Now: zero unrepresented blocks on 50 cells, chart
data byte-exact, 6/6 structured pairs sensitive, takeaways
realized and checked. What V2-3A called "silent loss" is gone;
what remains is one emission defect (V2-3F-1), honest overflow
diagnostics, and polish gaps. That is material improvement, not
layout variety.

## The acceptance question

Would these decks be usable substantially unchanged for an
important technical, research, or project presentation? **Not yet
as a set.** Data-heavy comes closest (yes, with cosmetic polish).
Research-defense and technical-explainer are one small fix
(V2-3F-1) away from usable. Decision-recommendation needs its side
copy cut roughly in half or V2-3F-7. Source-of-truth needs a
visual implemented/planned channel for a graded setting. No deck
fabricates, drops, or mis-states its facts — the failures are
emission, capacity, and polish, never fidelity.

## Confidence limits

- Rasters viewed: research-defense ×5 themes (plain+chromed where
  built), all decks × warm-humanist, plus SVG for all 50 cells.
  Plate themes viewed not at all in V2 (nothing to render).
- No model wrote or judged any content; qualitative judgments
  above are the author's, uncalibrated against other readers.
- The L3 rubric (`rubric-v1.json`) was used as a reading contract
  only. No judge runtime exists, proposed, or costed here.
- Benchmark intents are fixed instruments written for this slice;
  they cover the vocabulary but are not a coverage proof of all
  families × roles (mechanism tests already do that part).
