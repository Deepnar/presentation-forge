# Handoff — V2-3E-1 landed, V2-3E-2/V2-3E-3 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E-1 ticked with Learned;
V2-3E-2 QA and V2-3E-3 chrome pending — no broad QA, no chrome
emission, no 3F evaluation).

## Current state

On `v2`, pushed to `origin/v2` with this handoff.

**V2-3E-1 (this session, 3 commits):** resolved Layer-C typography
(`role/family/weight/tracking/line/transform: upper` on TextRun,
schema-first with regenerated types), one canonical `resolveRunStyle`
feeding both fitter and scene, fit-aware emission for every
compiler text path (12 mechanisms + legacy six-recipe path),
shrink-only paragraph-aware wrap fit + longest-word guard + stat
sub-budgets, `FitDiagnostic {floor-hit, word-floor-hit}` via
`compileDeckDetailed` (`compileDeck` stays scenes-only), PPTX
projection (fontFace/charSpacing/lineSpacing points/uppercase, OOXML
asserted, no autofit) + SVG projection of the same fields,
customized-geometry refit against the preserved box, detached
untouched, 38-test `test/v2-fit-3e1.test.js`, focused
`compiler-v2-3e1-baseline.json` beside byte-identical history.

**Still true:** all prior slices; deferred families untouched;
free-text/compiler separation tested at scene level; tombstones
remain V2-5; table-cell/chart-internal fitting explicitly out of
scope (native elements, recorded); benchmark judgment V2-3F.

## Verification

- `npm run typecheck` — exit 0.
- `test/v2-fit-3e1.test.js` — 38/38.
- V2 suites (quality/mechanisms/treatments/preservation/composition/
  scene/pptx/drift/compiler/intent/constants/layout/design/legacy/
  renderer/boundary) — 155/155.
- Full `npm test` — see final report (only acceptable failure is the
  known pre-existing `byok-budget` locale expectation).
- Six structured pairs scene-sensitive; old indifference files intact.
- Theme semantic projections identical across five themes.
- Boundary live-scan clean; legacy suites green.

## Continue from here

1. V2-3E-1 review (pushed implementation + this handoff).
2. V2-3E-2 (deterministic QA completion) — consumes fitDiagnostics;
   do NOT begin until authorized. Open: overlap/contrast policy,
   takeaway-realization findings, chrome-presence checks.
3. V2-3E-3 (chrome emission + projection) — locked
   compiler-provenance chrome elements, renderer projection,
   presenter/number opacity distinction.
