# Handoff — V2-3F-4 implementation in review, rest of 3F NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with first measurement slice accepted, V2-3F-1 and V2-3F-3
accepted, V2-3F-4 correction awaiting review).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. This session
implements narrow item V2-3F-4 against `a4057a4` — nothing else.
No schema-shape changes beyond one additive optional table layout
object, no new families, no fitting algorithms, no renderer forks.

**Correction (this session):** compiler resolves one Layer-C
`table.layout` per table (row heights from nominal body metrics
with 0.05in cell padding; short tables compact to content height,
dense tables keep the full region with even rows; header is body
size + bold on a theme-surface fill; typography/padding/grid from
normalized theme tokens) shared by `dataTableScene` natives and
chart-to-table fallbacks alike. PPTX projects the contract
natively (rowH array, per-cell family/size/color/bold, header
fills, margins, rule borders) with a byte-identical legacy path
for layout-less scenes; SVG projects the same contract (row
boundaries, header treatment, family/size, grid color) with its
legacy path likewise preserved. Values byte-exact everywhere
(±0.1, n=3, decimals verified in scene, OOXML, and SVG).
Data-heavy benchmark reads as compact intentional data on
warm-humanist, high-contrast-mono, and sci-fi-hud (plain and
chromed), confirmed on rasterized slides.

**Still true:** deferred families untouched; free-text/compiler
separation intact; tombstones V2-5; per-cell capacity assessment
remains V2-3F-8 (documented, not measured); plates, caveat
placement, side capacity, implemented-vs-planned channel all still
open as V2-3F-5…V2-3F-9; no judge runtime exists or is proposed.

## Verification

- `npm run typecheck` — exit 0 (see final report).
- `test/v2-tables-3f4.test.js` — 14/14 (compact/dense geometry,
  header distinction + absence, exact values, fallback fidelity,
  native PPTX with contract row heights, SVG contract match,
  legacy fallbacks, determinism, preservation, 5-theme
  invariance, non-table stability).
- All V2 suites green (mechanisms, scene, renderer, quality,
  fit, benchmark, QA, cardinality, rhythm, preservation,
  treatments, composition, scene-composition, chrome ×2,
  design, layout, intent, semantics, legacy, report-spec,
  renderer-docx, artifact, project, fileref, sourceref,
  types-drift).
- Full `npm test` — 1265 total / 1264 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Historical V2-3A/V2-3D files byte-identical; no fixture was
  regenerated (sampleDeckIntent carries no tables; mechanism
  tables assert validity/geometry only).

## Continue from here

1. V2-3F-4 review (pushed correction + this handoff). On
   acceptance, flip the V2-3F-4 backlog item.
2. Remaining backlog V2-3F-5…V2-3F-9 — do NOT begin until
   authorized, one item at a time.
3. V2-4+ — do NOT begin until authorized.
