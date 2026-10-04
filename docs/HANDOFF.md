# Handoff — V2-3E-1 correction pass in review, 3E-2/3E-3 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E-1 at [~] with a
correction pass awaiting review; V2-3E-2 QA and V2-3E-3 chrome
pending — no broad QA, no chrome emission, no 3F evaluation).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-3E-1 is
NOT accepted: this session is a narrow adversarial correction pass
against `659825a`, keeping the accepted DesignSystem → resolved
typography → compiler fitting → SlideScene → renderer architecture.

**Correction (this session):** exact readable floors in
`packages/core/fit.ts` (floor-derived scales returned unrounded, so
no emitted size crosses its effective floor; one shrink-search and
one floor rule shared via `searchScale`/`finishFit`/`floorRule`);
new canonical `fitScaleStack` (paragraph-height sums) and
`fitLineHeight` (vertical one-line/stat budgets under floor
semantics); `packages/compiler/text-fit.ts` composes core
primitives only (no FLOOR_PT/minScale/step-loop duplication);
stored `fitPolicy` (`wrap`/`one-line`/`stat`) on Layer-C text
elements with policy-aware `refitTextEl`; SVG shares the core
emphasis/transform helpers; 21.9-style test replaced with the exact
contract; focused 3E-1 baseline delta is `fitPolicy` lines only;
historical V2-3D baselines byte-identical.

**Still true:** all prior slices; deferred families untouched;
free-text/compiler separation tested at scene level; tombstones
remain V2-5; table-cell/chart-internal fitting explicitly out of
scope (native elements, recorded); benchmark judgment V2-3F.

## Verification

- `npm run typecheck` — exit 0.
- `test/v2-fit-3e1.test.js` — 51/51 (exact floors, vertical
  constraints, customized stat/one-line policy preservation).
- `test/fit.test.js` (legacy facade) — green, no expectation changes.
- `test/themematrix.test.js` — green.
- Full `npm test` — see final report (only acceptable failure is the
  known pre-existing `byok-budget` locale expectation).
- Six structured pairs scene-sensitive; old indifference files intact.
- Theme semantic projections identical across five themes.
- Boundary live-scan clean; legacy suites green.

## Continue from here

1. V2-3E-1 correction review (pushed implementation + this
   handoff). On acceptance, flip ROADMAP 3E-1 back to [x].
2. V2-3E-2 (deterministic QA completion) — do NOT begin until
   authorized. V2-3E-3 (chrome) likewise. No 3F work.
