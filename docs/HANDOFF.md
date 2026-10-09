# Handoff — V2-3F-7 implementation pending review, 3F-8/9 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with measurement slice and V2-3F-1/3/4/5/6 accepted;
V2-3F-7 implementation pending review).

## Current state

On `v2`, HEAD `9845f39` plus this handoff, to be pushed to
`origin/v2` with it. This session implemented V2-3F-7
(comparison-side capacity) against `c67c5cc` — nothing else. No
composition, family, fitter, QA, chrome, or intent changes.

**What landed (3 commits over `c67c5cc` plus roadmap open):**
`nominalContentHeight` exported from the fitting layer; the
comparison family measures side/support demand before dividing
space, sides first with peer-row alignment (`cd8c9aa`); 25
structural tests (`c895274`); regression pins propagated with the
3E-1 fixture transitioning six s3 numbers and the V2-3D byte
comparison scoping comparison frames/support (`9845f39`).

**Still true:** deferred families untouched; free-text/compiler
separation intact; fitter floors unchanged; table headers opaque;
legacy bridge flat-background; genuine overflow still diagnoses
(never truncates, omits, or shrinks below floor); zero-side
comparisons keep their historical degenerate path; table-cell and
chart-internal fitting remain V2-3F-8; implemented-vs-planned
remains V2-3F-9; no judge runtime exists or is proposed.

## Verification

- `npm run typecheck` — exit 0.
- `test/v2-comparison-3f7.test.js` — 25/25 (sides, supports,
  reserves, rails, caveats, overflow honesty, preservation,
  invariance, benchmark resolution).
- Full `npm test` — 1340 total / 1339 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Benchmark: 50 cells, L1 20 → 0, L2 0 → 0. All ten decision
  cells clean on all five themes, plain and chromed; no new
  findings; plans, charts, tables, takeaways, chrome unchanged.
- Rasters read: decision deck plain and chromed on
  warm-humanist (cards seat full copy at nominal size, support
  hugs its line, chrome correct). Evidence:
  `docs/V2-3F-EVAL-3.md`, `out/v2-3f7/` (gitignored).

## Continue from here

1. V2-3F-7 review (pushed commits + this handoff). On
   acceptance, flip the V2-3F-7 backlog item.
2. Remaining backlog V2-3F-8/9 — do NOT begin until
   authorized, one item at a time.
3. V2-4+ — do NOT begin until authorized.
