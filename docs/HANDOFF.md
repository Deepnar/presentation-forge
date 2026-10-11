# Handoff — V2-4C-2 implemented, in review; V2-4(C/C-1) open; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4B [x] at `34a758b`; V2-4 [~]; V2-4C
[~]; V2-4C-1 [~]; V2-4C-2 [~] in review with evidence).

## Current state

On `v2`, over `a1f2832`. This session implemented V2-4C-2:
Layer-B preservation fallback for multi-series pie/doughnut
— nothing else. No schema, theme, table-contract, or PPTX
changes; compiler touch is one fallback branch
(`renderBlockPrimary`), one diagnostic kind, one QA mapping.

**What landed (expect ~4 scoped commits):** fallback +
`chart-fallback-table` diagnostic/code; 11 regression tests
(`test/v2-chart-4c2.test.js`, 7 fail on baseline via stash);
doughnut case added to `tools/v2-4c1-eval.mjs`; report
(`docs/V2-4C2-EVAL.md`) + evidence (`docs/v2-4c2-evidence/`);
architecture note, roadmap, and this handoff.

**Result for the reviewer.** A=[1,2]/B=[30,40] compiles to
one table in Layer C; browser and PPTX show the identical
editable table (slide XML carries every token; single chart
part left is the micro bar). Single-series pies and all
cartesian behavior unchanged. The V2-4C-1 hollow marks remain
for off-canonical scenes only.

**Still true:** V2 suites green (sole failure the known BYOK
locale one); fixtures stable, no golden emits new findings;
`demo.html` seam open for V2-5; V2-4D–F not started.

## Verification

- `test/v2-chart-4c2.test.js` — 11/11 (7 fail on baseline).
- Consumer nets (199 + 189) green (re-verify before push).
- `npm run typecheck` — clean (re-verify before push).
- Full `npm test` (re-verify before push; expect only the
  known BYOK locale failure).
- `node tools/v2-4c1-eval.mjs` exits 0; tree clean after its
  round-trip.

## Continue from here

1. Independent review of V2-4C-2 (commits +
   `docs/V2-4C2-EVAL.md` + `docs/v2-4c2-evidence/`). V2-4C
   and V2-4C-1 stay pending alongside it.
2. Do NOT begin V2-4D–F or V2-5 without authorization.
