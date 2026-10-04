# Handoff — V2-3D landed, V2-3E NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3D ticked with Learned;
V2-3E+ pending — no fit, no chrome emission, no full QA).
External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-3D
implemented per instruction: plan-driven canonical compilation, 12
real mechanisms, byte-identity of planner inputs preserved, history
preserved, no V2-3E work.

**V2-3D (this session):** `packages/compiler/mechanisms.ts` (shared
block renderers, 12 families, tone/caveat/takeaway realization,
canvas-clamped geometry), `compileDeck` plan-first with
`compileDeckDetailed`, legacy six-recipe path preserved for
compatibility, `selectRecipe` retired from authority,
`recompileSlide` with exact-ID then semanticRef+kind matching plus
optional plan, `compositionSceneProjection` for visual sensitivity,
new baselines beside untouched history, 12-family + recompile +
sensitivity + nativeness tests.

**Still true:** all prior slices; deferred families untouched;
free-text/compiler separation tested at scene level; tombstones
remain V2-5; fit/chrome/QA remain V2-3E; benchmark judgment V2-3F.

## Verification

- `npm run typecheck` — exit 0.
- Full `npm test` — 1062 tests, 1061 pass, sole failure the pre-existing
  `byok-budget` locale expectation. (+18 real its: 13 mechanisms + 5
  scene sensitivity; +1 phantom vacuous pass from the new
  test/v2-mechanism-fixture.js helper, matching the two pre-existing
  fixture helpers — verified by stashed 1043 baseline and TAP runs.)
- Six structured pairs scene-sensitive; old indifference files intact.
- Theme projections identical across five themes; free-text scenes
  identical; compiler scenes PPTX-native.
- Boundary live-scan clean; legacy suites green.

## Continue from here

1. V2-3D review (pushed implementation + this handoff). Do NOT start
   V2-3E until authorized — no fit integration, chrome emission, or
   QA completion exists yet.
2. V2-3E will consume: family scenes, density classes, takeaway
   expression targets, caveat markers, tone frames. Open for then:
   real text fitting, locked chrome elements, overlap/contrast QA,
   takeaway-expression enforcement.
