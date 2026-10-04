# Handoff — V2-2F landed, V2-2 all ticked, V2-3 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-0 through V2-2F ticked
with Learned blocks; V2-3+ unchanged and explicitly awaiting
re-specification — do NOT mechanically expand recipes or port the 73
types). External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-2F
implemented per instruction (core policy/geometry, facade delegation,
asymmetry + unknown-mode pins, CANVAS from scene constants, no
`textStyle`/ontology/paths in core, compiler and PPTX renderer
untouched).

**V2-2F (this session):** `packages/core/chrome.ts`
(`effectiveBranding`, banner/crest/reservation/footer planners,
legacy luminance rule, 0..1 opacity); `src/chrome.js` as
adapter/facade (sharp probing, identity→policy mapping, type-set
suppression, PptxGenJS drawing, preserved signatures); `test/v2-chrome.test.js`
(13 tests incl. facade asymmetry pin and purity grep); branded raster
oracle (full/minimal/none + dark) pixel-identical 12/12.

**Recorded for V2-3:** chrome will arrive as ordinary locked
compiler-provenance `SlideScene` elements consumed by both renderers —
never a renderer-only overlay, never a `renderPptx(..., {chrome})`
API. General rotation, fitted vertical flow, plate compat stay
deferred as previously recorded.

## Verification

- `npm run typecheck` — exit 0.
- Full `npm test` — 988 tests, 987 pass, sole failure the pre-existing
  `byok-budget` locale expectation.
- Legacy crest/brand/composition/layout suites green, unchanged.
- `npm run themematrix` — clean across 34 runs.
- Six-recipe scene JSON byte-identical (compiler untouched).
- Boundary live-scan clean (core: no fs/sharp/pptx/ontology).
- V2-2E cleanup (metadata + opacity wording) included and pushed
  earlier this run.

## Continue from here

1. V2-2F review (pushed implementation + this handoff).
2. V2-3 is EXPLICITLY awaiting re-specification per the instruction:
   quality/narrative/recipe architecture around the "would we trust
   Forge with an important real presentation?" bar. Do NOT implement
   V2-3 until that design lands. No recipe expansion, no 73-type port,
   no agent critic in the meantime.
