# Handoff — V2-2A landed, V2-2B not started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-0, V2-1, V2-2A ticked;
V2-2B..V2-2F specified per the corrected subdivision; V2-3+ unchanged
except the fit-API reference). External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. Revised V2-2A
implemented per the corrected instruction (no core canvas authority, no
`textStyle` move, no slide-type sets in core, facades not duplication,
AST boundary test, WeakMap question moot — composition untouched).

**V2-2A (this session):** `packages/core` exists (`fit.ts`,
`chartpalette.ts`, strict TS, zero imports); `src/fit.js` and
`src/chartpalette.js` are delegating facades preserving every export
including the global floor-event API; scene dimensions canonicalized in
`packages/model/scene-constants.ts` with schema drift test;
`test/v2-core-boundary.test.js` enforces the direction matrix
(model←core←compiler←renderers, editor neutral) with one named
allowlist entry (`design.js → src/theme.js`, dies in V2-2B).

**Still true:** Slice A/B contracts, detached semantics, `design.js`
untouched (still imports `src/theme.js` — V2-2B removes it), legacy
`src/render.js`/`layouts`/`report.js` unmodified and operational.

## Verification

- `npm run typecheck` — exit 0 (model + core + TS usage test).
- Full `npm test` — 916 tests, 915 pass, sole failure the pre-existing
  `byok-budget` locale expectation.
- V2 tests: 61/61 green (incl. boundary self-tests + live repo scan,
  scene-constants drift).
- `npm run themematrix` — clean across 34 themes (legacy output
  unchanged through the facades).
- Transcription audit: `lab()` coefficient slip caught pre-commit by
  line-level diff re-read; `measure()` no-style default (`NaN` before,
  12pt now) affects no caller — all pass styles.

## Continue from here

1. V2-2A review (pushed implementation + this handoff). Do NOT start
   V2-2B until approved.
2. On approval: V2-2B per the roadmap slice — schema-backed
   `DesignSystem`, pure `normalizeDesign`, theme adapter outside
   model/core, `design.raw` removal, golden tests, `cmp`-proofed
   compiler output.
