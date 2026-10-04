# Handoff — V2-2C landed, V2-2D not started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-0, V2-1, V2-2A, V2-2B,
V2-2C ticked with Learned blocks; V2-2D..V2-2F specified; V2-3+
unchanged). External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-2C
implemented per the corrected instruction set (no `wideBody` in core,
no `sectionSurfaceKey`, no `listMarker`, no WeakMap in core, no
`checkBounds` change, orthogonal-only footprint with explicit name,
geometry→chrome import removed, legacy tests textually unchanged).

**V2-2C (this session):** `packages/core/layout.ts` (vocabulary,
resolver, policy, frame geometry) and `geometry2d.ts`
(`orthogonalFootprint`); `src/composition.js` delegates resolution,
frame geometry, and policy while keeping cache, WIDE_TYPES, drawing,
and bullet mapping; `src/geometry.js` keeps its watcher while sourcing
footprint math and canvas dimensions canonically; `test/v2-layout.test.js`
covers resolution, all-theme preferences, frame geometry, facade
wide-type parity, footprint semantics, and core purity.

**Still true:** Slice A/B contracts, detached semantics, DesignSystem
normalization, legacy render/layouts/report operational; general
rotation, fitted vertical flow, and chrome policy deferred
(V2-5 / V2-3 / V2-2F respectively).

## Verification

- `npm run typecheck` — exit 0.
- Full `npm test` — 946 tests, 945 pass, sole failure the pre-existing
  `byok-budget` locale expectation.
- V2 layout tests green; legacy composition/geometry tests unchanged
  and green.
- `npm run themematrix` — clean across 34 runs.
- Compiler scene JSON byte-identical; swiss-international slide
  raster-read clean.
- `WIDE_TYPES` and legacy type names grep-absent from `packages/core`;
  no `src/` imports from `packages/core`; boundary scan clean.

## Continue from here

1. V2-2C review (pushed implementation + this handoff). Do NOT start
   V2-2D until approved.
2. On approval: V2-2D per the roadmap slice — `renderPptx` bytes API
   with metadata options plus the Node file adapter; no legacy render
   extraction.
