# Handoff — V2-3C landed, V2-3D NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3C ticked with Learned;
V2-3D+ pending — no geometry, no recipes, no wiring).
External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-3C
implemented per instruction: planner decides WHAT, geometry untouched,
six-recipe scenes byte-identical, history preserved.

**V2-3C (this session):** `packages/compiler/composition.ts`
(plan/finding/projection/sensitivity contracts), 12 selectable
families with 4 deferred (reasons recorded), honesty-first precedence
with override refusal, structural density units, subordinate rhythm,
internal variantKeys, media/outcome/caveat/takeaway treatments,
section breaks, selection-basis tracking. All six structured pairs
plan-sensitive with minimal aspect diffs; theme projections identical
across five themes; new plan baseline committed beside untouched
scene-indifference history.

**Still true:** all prior slices; no DeckCompositionPlan consumers yet
(V2-3D wires it); no compositionHint/recipe-enum changes;
free-text/compiler separation tested, not just documented.

## Verification

- `npm run typecheck` — exit 0.
- Full `npm test` — 1043 tests, 1042 pass, sole failure the pre-existing
  `byok-budget` locale expectation. (+25: composition suite.)
- Boundary live-scan clean (composition imports model types +
  core finding type only).
- Six-recipe scene JSON byte-identical; V2-3A/B baselines untouched.

## Continue from here

1. V2-3C review (pushed implementation + this handoff). Do NOT start
   V2-3D until authorized — no family geometry exists yet.
2. V2-3D will consume: family, variantKey, densityClass,
   emphasisTargets, mediaTreatment, outcomeTreatments, caveatTargets,
   takeawayTreatment, breaks. Open design questions for then:
   taper/timeline/set-overlap/term-glossary semantic triggers,
   distribution/association encodings, chrome-as-locked-elements.
