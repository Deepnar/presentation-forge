# Handoff — V2-5C-1 implemented, in review; V2-5C pending; V2-5D NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x] at
`5beba39`; V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [x] at
`4d16a2f`; V2-5B-1 [x] at `4d16a2f`; V2-5C [~] in review;
V2-5C-1 [~] correction in review).

## Current state

On `v2`, over `a10ea2c`. This session fixed the V2-5C
review finding: drag preview and commit divided — not
multiplied — by the live rendered scale, through one
shared `clientToSvgDelta` with per-axis scales. No
engine, schema, compiler, or UI changes.

**What lands (expect ~2 scoped commits):** the conversion
fix (`packages/editor/scene-edit.js`); corrected scale
tests + division/matrix/non-uniform/release regressions
(23/23 headless, 4 fail on baseline); two Chrome
displacement suites (fit/200%/narrow + chart diagonal,
scene within 0.003in, visual within 4px); measured
numbers table; report (`docs/V2-5C1-EVAL.md`) + compact
evidence (`docs/v2-5c1-evidence/`); roadmap + V2-5C eval
notes; and this handoff.

**Result for the reviewer.** Elements move exactly as far
as the pointer indicates at every zoom, preview and
commit provably share one formula, and the old wrong
test now asserts the equation. Open: D2–D5, P2-1, BYOK.

## Verification (at push)

- Headless editing 23/23 (4 fail base), Chrome editing
  7/7 (each re-verified in isolation after all changes).
- Related suites (viewer/selection/engine/tombstone)
  green.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells
  L1 zero.
- Full `npm test` — 1639 total · 1636 pass · 3 fail ·
  0 skipped/cancelled/todo (BYOK + fonts dist-build
  raced by a concurrent rebuild (ENOENT in-log) + one
  wedged Chrome file under parallel load (killed after
  29 min zero-output; 0/7 ran there, 7/7 isolated
  after); nothing reclassified.
- `node tools/v2-5c-eval.mjs` exits 0 (re-ran on fixed
  code); tree clean after round-trip.

## Continue from here

1. Independent review of V2-5C + V2-5C-1 (commits,
   both eval docs, both evidence dirs). Then V2-5D text
   editing per V2-5C eval §12.
2. Do NOT begin V2-5D, persistence, or agent integration
   without authorization.
