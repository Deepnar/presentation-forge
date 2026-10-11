# Handoff — V2-4C-1 implemented, in review; V2-4(C) open; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4B [x] at `34a758b`; V2-4 [~]; V2-4C
[~]; V2-4C-1 [~] in review with evidence).

## Current state

On `v2`, over `5d00a3b`. This session implemented V2-4C-1:
micro-scale tick truthfulness + explicit multi-series pie
marking — nothing else. No compiler, schema, theme, table,
or PPTX changes; product-code touch is
`packages/editor/scene-chart.js` only (formatter, mapping
guard, pie legend).

**What landed (expect ~4 scoped commits):** tick formatter
(step-exact decimals, scientific fallback, finite mapping
guard) + hollow "(not shown)" pie entries; 13 regression
tests (`test/v2-chart-4c1.test.js`, 6 fail on baseline via
stash); eval driver (`tools/v2-4c1-eval.mjs`); report
(`docs/V2-4C1-EVAL.md`) + evidence (`docs/v2-4c1-evidence/`);
roadmap and this handoff.

**Result for the reviewer.** Micro axes read truthfully
(`0|0.000001|0.000002|0.000003`, was all zeros); multi pie
shows A wedges + `□ B (not shown)` where PPTX drops B from
the file without a trace (raster-verified). Remainder:
interim palette, system fonts, left inset — all still
tracked, untouched.

**Still true:** V2 suites green (sole failure the known BYOK
locale one); fixtures stable; chart fixtures eval-local and
reverted; `demo.html` seam open for V2-5; V2-4D–F not started.

## Verification

- `test/v2-chart-4c1.test.js` — 13/13 (6 fail on baseline).
- Consumer net incl. 4C tests green (re-verify before push).
- `npm run typecheck` — clean (re-verify before push).
- Full `npm test` (re-verify before push; expect only the
  known BYOK locale failure).
- `node tools/v2-4c1-eval.mjs` exits 0; tree clean after its
  round-trip.

## Continue from here

1. Independent review of V2-4C-1 (commits +
   `docs/V2-4C1-EVAL.md` + `docs/v2-4c1-evidence/`). V2-4C
   stays pending alongside it; its accept/reject call stays
   with the reviewer.
2. Do NOT begin V2-4D–F or V2-5 without authorization.
