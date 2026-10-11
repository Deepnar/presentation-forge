# Handoff — V2-4C implemented, in review; V2-4 open; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4B [x] at `34a758b`; V2-4 [~]; V2-4C
[~] in review with evidence).

## Current state

On `v2`, over `34a758b`. This session implemented V2-4C:
native browser chart geometry for all six scene kinds —
nothing else. No compiler, schema, floor, theme, table, or
PPTX changes; product-code touch is the new pure projector
`packages/editor/scene-chart.js` plus a slimmer chart branch
in `packages/editor/scene-svg.js` (element wiring only).

**What landed (expect ~4 scoped commits):** chart projector
(domain-zero spans, nice ticks, grouped bars, transposed
hbar, gapped lines/markers, zero-baseline areas, exact-share
pies, interim series ramp); 24 invariant tests
(`test/v2-chart-4c.test.js`, kind cases proven to fail on the
V2-4B baseline via stash); eval driver
(`tools/v2-4c-eval.mjs`, chart intent compiled on 3 themes
plain+chromed); report (`docs/V2-4C-EVAL.md`) + curated
evidence (`docs/v2-4c-evidence/`); architecture, roadmap, and
this handoff.

**Result for the reviewer.** Every kind communicates its
authored data (proportions, order, signs, shares verified in
rasters); PPTX comparison shows the same meaning with owned
client differences (axis limits, pie start, hues, legend
side). Self-found tick-label rounding (2.5→"3") fixed with
regression test before delivery. Remainder: interim palette
awaits the concrete theme-resolved `series[].color` proposal
(`chartSeries` foundation documented); left-inset asymmetry
and system fonts ride V2-4D; multi-series pie renders
series[0] by documented rule.

**Still true:** V2 suites green (full-suite sole failure the
known BYOK locale one); fixtures stable, chart fixtures
eval-local and reverted; `demo.html` seam open for V2-5;
V2-4D–F not started.

## Verification

- `test/v2-chart-4c.test.js` — 24/24 (kind cases fail on
  baseline, verified via stash + pop).
- Consumer net (viewer, smoke, typography, pptx, chrome,
  tables, plates, fit, benchmark, comparison, internal) —
  273/273.
- `npm run typecheck` — clean (re-verify before push).
- Full `npm test` (re-verify before push; expect only the
  known BYOK locale failure).
- `node tools/v2-4c-eval.mjs` exits 0; tree clean after its
  round-trip.

## Continue from here

1. Independent review of V2-4C (commits + `docs/V2-4C-EVAL.md`
   + `docs/v2-4c-evidence/`). On acceptance, flip V2-4C; the
   V2-4 accept/reject call stays with the reviewer.
2. Do NOT begin V2-4D–F or V2-5 without authorization.
   V2-4D (browser fonts) is the correct next slice when
   authorized.
