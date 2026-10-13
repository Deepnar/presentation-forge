# V2 Layout Catalog Map — legacy 74 → V2 families → gallery skeletons

Date: 2026-10-13. Baseline `dd4ab9b` (V2-5J/J1 accepted).

The legacy application names **74** slide types (counted from
`schema/deck.schema.json:103-178`, corroborated by
`src/ai/catalog.js` `TYPE_DESCRIPTIONS`/`TYPE_USE_WHEN` at 74 keys
each and 73 native layouts in `src/layouts/*` plus the raster-only
`freeform`). The V2 compiler does not port that vocabulary: it
plans from semantic intent into **12** composition families
(`packages/compiler/composition.ts:13-16`), and the V2-5K manual
gallery ships **15** native skeletons that are independent of both.

This map is the audit trail between the three systems. It guides
eventual gallery expansion without forcing AI generation back
into a rigid template selector.

Legend: ✓ direct skeleton · ~ usable alias (same geometry, renamed
placeholders) · ◐ partial (geometry fits, some semantics lost) ·
✗ no skeleton (reason + missing mechanics recorded).

## V2-5K skeleton inventory (15)

Essentials: `title`, `section`, `title-body`, `two-column`,
`closing`. Comparison: `compare-2col`, `pros-cons`,
`compare-3col`. Process/structure: `process-3step`, `timeline`,
`hierarchy`. Data/research: `metrics-3up`, `chart-insight`,
`data-table`, `key-findings`.

Every skeleton is flat top-level Layer-C (text/shape/line/chart/
table only, no groups), human provenance, `customized` state,
`recipeId: layout:<id>`, and carries `legacyAliases` for the
names below marked ✓/~.

## Foundation (6 legacy types)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| title | cover with team and guide | divider (opening) | ✓ `title` | centered display + subtitle; no chrome copied |
| section | divider announcing next part | divider (transition) | ✓ `section` | label + title + accent rule |
| chapter | larger opener with agenda | divider | ~ `section` | alias; agenda list added by hand |
| closing | thank-you and wrap-up | divider (closing) | ✓ `closing` | centered heading + support line |
| agenda | talk roadmap, numbered list | sequence | ◐ `process-3step` | geometry fits 3 items; numbering by hand |
| references | sources cited | prose-list | ✗ | compiler-generated source map; manual curation is ordinary text. Priority: low |

## List & Grid (9)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| bullets | key points as bullets | prose-list | ✓ `title-body` | heading + 4 bullets |
| numbered-list | steps in order | prose-list | ~ `title-body` | alias; numbering by hand |
| checklist | items with tick boxes | prose-list | ✗ | tick-box marks need a glyph/box convention the scene model has (rect) but the gallery does not bless yet. Priority: low |
| cards | headline + line per card | card-grid | ✓ `compare-3col` | alias: 3 cards |
| feature-grid | features in small cards | card-grid | ~ `compare-3col` | alias |
| grid-items | many small labelled tiles | card-grid | ◐ `compare-3col` | fits 3 tiles; 6+ tiles need denser geometry. Priority: medium |
| icon-list | point + icon per row | prose-list | ✗ | **missing: icon set.** No icon vocabulary in Layer-C; shapes-as-icons would lie about editability. Priority: medium (needs icon decision first) |
| stacked-list | label + detail rows | prose-list | ~ `key-findings` | alias: 3 labelled rows |
| illustrated-points | points with a picture | card-grid / media-led | ✗ | **missing: image asset story.** Image elements need a `src`; the gallery slice has no upload. Priority: medium (with upload) |

## Comparison (8)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| compare | two options point for point | comparison | ✓ `compare-2col` | |
| pros-cons | wins and costs, two columns | comparison (decision) | ✓ `pros-cons` | |
| before-after | change as two states | comparison | ~ `compare-2col` | alias |
| vs | two contenders head to head | comparison | ~ `compare-2col` | alias |
| side-by-side | two panels, image or text | comparison / media-led | ~ `compare-2col` | text half only; image half waits on upload |
| scorecard | criteria scored, simple table | data-table | ~ `data-table` | alias: criteria × scores |
| framework | boxed diagram of pieces | — (no V2 family) | ✗ | **missing: node-link auto-layout.** Algorithmic box placement from content is a compiler mechanism, not a skeleton. Priority: low |
| matrix | items scored on two axes | — (no V2 family) | ✗ | **missing: axis geometry** (rotated labels, quadrant bands). Priority: low |

## Data & Stats (8)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| stats | big numbers + captions | metric | ✓ `metrics-3up` | |
| big-number | one number, whole slide | metric | ~ `metrics-3up` | use one card, delete two |
| kpi-dashboard | row of key-figure tiles | metric | ✓ `metrics-3up` | alias |
| data-cards | one figure per card | metric | ✓ `metrics-3up` | alias |
| metric-comparison | two figure sets compared | comparison + metric | ◐ `pros-cons` / `data-table` | geometry fits; combined metric+compare semantics do not |
| progress-bars | figures as filled bars | metric | ✗ | mechanics trivial (proportional rects) — omitted for catalog size, not capability. Priority: medium |
| ranking-list | ordered list + rank per row | prose-list | ✗ | mechanics trivial (numerals by hand) — omitted for size. Priority: low |
| sparklines | trend lines under numbers | chart | ✗ | **missing: miniature trend geometry** (sub-chart slots inside stat cards). Priority: low |

## Quote & Testimonial (4)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| quote | quotation + source | framed-prose | ✗ | mechanics trivial (large text + attribution line) — omitted for size. Priority: medium |
| testimonial | someone in own words | framed-prose | ✗ | same as quote. Priority: medium |
| pull-quote | one line for emphasis | framed-prose | ✗ | same as quote. Priority: medium |
| epigraph | motto opening a section | divider | ~ `section` | alias |

## Callout & Highlight (5)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| takeaway | the one thing to remember | framed-prose | ~ `key-findings` | alias: single finding row |
| callout | highlighted note in a box | framed-prose | ~ `key-findings` | alias |
| emphasis | one idea made loud | framed-prose | ~ `title` | alias: loud single line |
| warning | caution not to miss | framed-prose | ◐ `key-findings` | geometry fits; caution tone is structural in V2 (frames, accent restraint), not red semantics — a skeleton cannot carry it |
| tip | practical hint | framed-prose | ~ `key-findings` | alias |

## Table & Matrix (3)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| table | rows and columns | data-table | ✓ `data-table` | |
| data-table | figures in a proper table | data-table | ✓ `data-table` | alias |
| decision-matrix | options × weighted criteria | data-table | ~ `data-table` | alias; weights by hand |

## Chart (1)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| chart | live chart from data | chart | ✓ `chart-insight` | bar + insight text; single-series only (multi-series pie/doughnut refused at every boundary) |

## Process & Flow (6)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| flow | steps connected by arrows | sequence | ✓ `process-3step` | |
| pipeline | stages left to right | sequence | ~ `process-3step` | alias |
| funnel | stages narrowing | sequence | ✗ | **missing: polygon shape.** Layer-C shapes are rect/roundRect/ellipse only; a funnel needs a trapezoid. Priority: low (needs shape-form extension) |
| dependencies | boxes linked by need | sequence | ✗ | **missing: edge routing** (same as framework). Priority: low |
| branching-flow | one path splits | sequence | ✗ | **missing: diamond shape** (decision node) + branch layout. Priority: low |
| layered-architecture | stacked tiers | hierarchy | ◐ `hierarchy` | tiers read as levels; alias with renamed placeholders |

## Image & Visual (5)

All five (image, image-text, image-grid, hero-image,
split-screen → media-led) have ✗ no skeleton: **missing image
asset story** (see illustrated-points). Text halves are covered
by `two-column`/`compare-2col`. Priority: medium, with upload —
the gallery must never ship grey `[image]` seats as skeletons.

## Timeline & Milestone (5)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| timeline | events along a line | sequence | ✓ `timeline` | 4 nodes, native line + ellipses |
| milestone | milestones in sequence | sequence | ✓ `timeline` | alias |
| chronology | dates in order | sequence | ✓ `timeline` | alias |
| roadmap | phases toward a goal | sequence | ~ `timeline` | alias; goal emphasis by hand |
| journey | path through stages | sequence | ~ `timeline` | alias |

## Diagram-ish (4)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| hierarchy | tree of parent/children | hierarchy | ✓ `hierarchy` | parent + 3 children + connectors |
| pyramid | stack base to peak | — (no V2 family) | ✗ | **missing: triangle shape** (same class as funnel). Priority: low |
| venn | overlapping sets | — (no V2 family) | ✗ | overlaps are drawable (ellipses) but intersection semantics need custom layout. Priority: low |
| diagram | custom boxes and links | escape | ✗ | custom by definition; edge routing missing. Priority: low |

## Definitions & FAQ (3)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| definition | term + meaning | framed-prose | ~ `title-body` | alias |
| glossary | terms + meanings | prose-list | ~ `two-column` | alias: term/result columns |
| faq | questions + answers | prose-list | ~ `key-findings` | alias: Q/A rows |

## Team & Attribution (3)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| team-grid | team names and rolls | card-grid | ~ `compare-3col` | alias: 3 member cards |
| attribution | credit for sources | framed-prose | ✗ | specialized, compiler-adjacent. Priority: low |
| contact | reach details | prose-list | ~ `title-body` | alias |

## Special (3) + escape (1)

| legacy | purpose | closest V2 family | skeleton | notes |
|---|---|---|---|---|
| equation | formula alone | escape | ✗ | math typesetting outside Layer-C text. Priority: low |
| bibliography | full citations | prose-list | ✗ | specialized. Priority: low |
| data-source | where figures came from | framed-prose | ✗ | specialized. Priority: low |
| freeform | custom raster design | escape | ✗ | by design: raster has no native skeleton |

## Coverage summary

- Direct ✓: 17 legacy names ride 15 skeletons without renaming.
- Alias ~: 27 further names are the same geometry with renamed placeholders (kept as `legacyAliases` on the registry entry, searchable in the gallery).
- Partial ◐: 5 names fit geometrically with lost semantics (agenda, grid-items, metric-comparison, warning, layered-architecture).
- Omitted ✗: 25 names. Capability omissions (need new mechanics): icon-list, funnel, pyramid, branching-flow, framework, dependencies, diagram, matrix, venn, sparklines, checklist. Asset omissions (need upload): image ×5, illustrated-points. Size omissions (trivial geometry, cut for catalog focus): progress-bars, ranking-list, quote ×3, definition-side aliases excluded. Specialized (compiler-adjacent, low priority): references, bibliography, data-source, attribution, equation.

No legacy name is equated with a V2 composition family: the
"closest V2 family" column is a generation-path fact (where AI
content with that meaning would plan), not a claim that the
skeleton implements the family. The gallery registry imports
nothing from `packages/compiler/composition.ts`.
