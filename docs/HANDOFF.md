# Handoff — V2-3A landed, V2-3B NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3A ticked; V2-3B+ pending
the accepted audit sequence — semantic schema NOT yet authorized).
External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-3A
implemented per instruction: measurement only, compiler byte-identical,
no schema/recipe/model-call changes.

**V2-3A (this session):** `packages/core/scene-quality.ts` (finding
contract, semantic projection, geometry/identity/monotony),
`packages/compiler/quality.ts` + `compile.d.ts` seam (analysis,
representation/fidelity checks, sensitivity comparison),
`test/fixtures/v2-quality/` (5 packs, 5 pairs, rubric-v1, compiler
golden, indifference baseline), `test/v2-quality.test.js`.
Deferred questions recorded untouched: resultStatus, evidenceRefs,
measure, relationship, rhetoricalRole, compositionHint, judge runtime.

**Still true:** all prior slices; legacy suites operational; V2-3B
schema work explicitly not started.

## Verification

- `npm run typecheck` — exit 0.
- Full `npm test` — 1000 tests, 999 pass, sole failure the pre-existing
  `byok-budget` locale expectation. (Pre-change baseline re-measured
  via stash: 990/989/1; delta is exactly the 10 new quality tests.)
- Monotony heuristic conservative by construction (streak ≥4 /
  60%-with-minimum-4); no prose judgement anywhere deterministic.
- Compiler golden byte-identical; no raster oracle needed (no output
  change by construction).

## Continue from here

1. V2-3A review (pushed implementation + this handoff). Do NOT start
   V2-3B until the semantic contracts (`relationship`, `measure`,
   `evidenceRefs`, `resultStatus` equivalents) are explicitly
   authorized — the audit proposed them, this slice deliberately did
   not build them.
2. Next authorized work decides the V2-3B schema; the indifference
   baseline and silent-loss findings are the evidence to design
   against.
