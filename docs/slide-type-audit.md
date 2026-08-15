# Slide-type audit — all 75 types, rendered and checked

Deck-quality round 3. Every slide type was rendered from the specimen deck
(`src/specimens.js`) in three themes (warm-humanist, swiss-international,
dark-neon), rasterised, and audited two ways:

1. **Deterministic** — the renderer's own `problems[]` (fit-floor flags,
   placeholders, missing renderers) via `tools/slideqa.mjs`.
2. **Visual** — labelled contact sheets plus full-size per-type PNGs, read by
   `mimo-v2.5` for content density, structure/zoning, and text fit.

Re-run the whole pass with:

```
node tools/slideqa.mjs --themes warm-humanist,swiss-international,dark-neon
```

Then point a vision model at `outDir/sheets/*.png` (the labels name each cell)
and at `outDir/per-slide/*.png` for any suspect type.

## The verdicts

`OK` = the layout reads as a deliberate, balanced design. `fixed` = changed
this round. **layout** = the drawing code in `src/layouts.js` was reworked.
**budget** = the layout was sound but the writer was under-filling it, so
`TYPE_BUDGETS` in `src/ai/catalog.js` now tells the writer how much the layout
invites. `(design-sparse)` = deliberately quiet surfaces (title, dividers,
quotes) where emptiness is the point, verified as intended.

| # | type | verdict | note |
|---|---|---|---|
| 1 | title | OK | design-sparse cover |
| 2 | section | OK | divider, design-sparse |
| 3 | chapter | OK | divider, design-sparse |
| 4 | closing | OK | design-sparse |
| 5 | agenda | fixed (budget) | invited as-many-entries-as-parts with one-line details |
| 6 | bullets | OK | full-width; thin only when content is |
| 7 | numbered-list | OK | full-width; thin only when content is |
| 8 | checklist | OK | |
| 9 | feature-grid | OK | |
| 10 | grid-items | OK | |
| 11 | icon-list | OK | full-width; thin only when content is |
| 12 | stacked-list | OK | |
| 13 | cards | OK | |
| 14 | compare | OK | |
| 15 | pros-cons | fixed (budget) | invited 5-6 items per side; two columns had room |
| 16 | before-after | OK | full-height cards; thin only when content is |
| 17 | framework | fixed (budget) | invited every element to carry a body — title-only ring nodes read empty |
| 18 | matrix | fixed (layout) | rotated y-axis label wrapped ("Impact"→Imp/act); box now measured on the transformed string |
| 19 | scorecard | fixed (budget) | invited 3-4 options × 3-5 criteria so the grid reads full |
| 20 | vs | OK | |
| 21 | side-by-side | OK | |
| 22 | stats | fixed (budget) | invited 4 stats — a two-up specimen on the four-up grid read half-empty |
| 23 | big-number | fixed (budget) | invited a number, label, 2-3 line body and source |
| 24 | kpi-dashboard | OK | |
| 25 | data-cards | OK | |
| 26 | progress-bars | OK | |
| 27 | ranking-list | OK | full-width rows |
| 28 | metric-comparison | OK | |
| 29 | sparklines | OK | |
| 30 | quote | OK | design-sparse |
| 31 | testimonial | OK | |
| 32 | pull-quote | OK | design-sparse single line |
| 33 | epigraph | OK | divider, design-sparse |
| 34 | callout | OK | |
| 35 | emphasis | OK | |
| 36 | warning | OK | |
| 37 | tip | OK | |
| 38 | takeaway | OK | |
| 39 | table | fixed (budget) | invited 5-8 rows — full-width table read empty at 3 rows |
| 40 | data-table | fixed (budget) | invited 5-8 rows |
| 41 | decision-matrix | fixed (budget) | invited 4-6 rows |
| 42 | chart | OK | |
| 43 | flow | fixed (layout) | vertical flow was six thin full-width stripes with bodies dropped and the bottom quarter empty; now a numbered spine (chip on a rail, title and body flowing right) |
| 44 | cycle | fixed (layout) | ring sat in the lower ~60% under a dead zone; now starts below the heading so the vertical run balances |
| 45 | funnel | fixed (layout) | stage stack hugged the heading; now centred in the space below it |
| 46 | pipeline | fixed (layout) | cards+baseline+gates hugged the heading, bottom half empty; whole cluster now centred |
| 47 | dependencies | fixed (layout) | edges drew on top of nodes (Enrichment→Alerts slashed across Storage); edges now draw behind boxes and layers order by dependency barycentre |
| 48 | branching-flow | OK | structure sound; sparse only when a branch has 1-2 steps |
| 49 | layered-architecture | fixed (budget) | invited 4-5 layers each with body and 2-3 item pills |
| 50 | image | OK | placeholder by design when no image is attached |
| 51 | image-text | OK | placeholder by design |
| 52 | image-grid | OK | |
| 53 | hero-image | OK | |
| 54 | split-screen | OK | |
| 55 | timeline | fixed (layout) | rail hugged the heading, lower half empty; block now centred between heading and footer |
| 56 | milestone | fixed (budget) | invited 4 milestones each with a body sentence |
| 57 | roadmap | fixed (budget) | invited 3 phases × 2-4 items |
| 58 | journey | fixed (budget) | invited 5-8 stages each with a sentence body; labels read small at 3 stages |
| 59 | chronology | fixed (budget) | invited 6-10 events |
| 60 | references | fixed (budget) | invited 6-10 citations — a short list on the full-width layout read empty |
| 61 | diagram | fixed (layout) | layered branch now orders by barycentre so edges cross fewer nodes |
| 62 | pyramid | OK | |
| 63 | venn | OK | |
| 64 | hierarchy | OK | |
| 65 | concept-map | fixed (layout) | leaf labels shrank to ~8pt and collided ("Events" over "Queues"); leaves are now pills sized to their own text, fanned so footprints never overlap |
| 66 | definition | fixed (budget) | invited definition + example + one-line why-it-matters |
| 67 | glossary | fixed (budget) | invited 5-8 terms |
| 68 | faq | fixed (budget) | invited 5-6 questions |
| 69 | team-grid | OK | |
| 70 | attribution | OK | sparse only with a short credit list |
| 71 | contact | fixed (layout) | small card pinned below the heading left most of the slide empty; card now spans the content width and fills heading-to-footer |
| 72 | equation | OK | |
| 73 | bibliography | fixed (budget) | invited 6-10 entries with annotations |
| 74 | data-source | fixed (budget) | invited 4-8 sources with descriptions |
| 75 | freeform | OK | design-sparse hero card |

## Summary

- **10 fixed (layout):** flow, cycle, funnel, pipeline, dependencies, diagram,
  concept-map, matrix, timeline, contact.
- **26 fixed (budget):** agenda, pros-cons, framework, scorecard, stats,
  big-number, table, data-table, decision-matrix, layered-architecture,
  milestone, roadmap, journey, chronology, references, bibliography,
  data-source, definition, glossary, faq, and the flow-family content budgets
  (flow, cycle, funnel, pipeline, timeline also carry one).
- **39 OK:** the rest — including every type whose audit flag was short
  specimen content (a three-row table, two-item stats, one-word flow steps)
  rather than a structural defect.

## Round 4 addendum — the geometry-honesty audit

The user's "the ups and downs mean nothing based on the content" finding
turned into a rule, not a fix: **a shape that looks like a measurement only
draws it when the data carries that measurement; qualitative content keeps a
designed, clearly-illustrative treatment.** Audited every type that draws
geometry, and the verdicts now record honesty as well as fit:

| type | geometry | honest? |
|---|---|---|
| chart (all kinds) | bars/lines/scatter/radar drawn from `series[].values` | yes — values are required, real data |
| journey | was a sentiment-driven sawtooth implying magnitude | **fixed (round 4)** — with all stages valued the line is real and each value is captioned; any unvalued stage renders a flat milestone rail (sentiment colours nodes, never position) |
| funnel | was an index-linear taper implying conversion | **fixed (round 4)** — taper is drawn from real numbers only when every stage carries one; otherwise equal-width steps |
| roadmap / timeline / milestone / chronology | markers on rails | yes — categorical positions, no axis, no magnitude implied |
| flow / pipeline / branching-flow | steps connected by arrows | yes — categorical sequence |
| pyramid | index-based taper | yes — the pyramid's iconic categorical shape (no unit, no scale); an illustrative hierarchy, not a measurement |
| venn / hierarchy / concept-map / diagram | overlapping sets, trees, radial maps | yes — decorative geometry over categories |
| progress-bars / sparklines / metric-comparison / ranking-list / scorecard / decision-matrix | geometry or values from explicit number fields | yes — every value is real, required, and now grounded |

The grounding pass now walks numbers as claims too, so a chart value or
journey value the research never states is flagged; the research view lists
every figure a deck's data slides claim for the "are the graphs reflective
of real numbers?" check. Verified visually with `mimo-v2.5` on a seven-slide
fixture covering all four honesty modes (journey valued/unvalued, funnel
valued/unvalued).
