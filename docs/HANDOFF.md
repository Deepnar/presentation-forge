# Handoff — V2-3F-8 implementation pending review, 3F-9 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with measurement slice and V2-3F-1/3/4/5/6/7 accepted;
V2-3F-8 implementation pending review).

## Current state

On `v2`, HEAD `806549c` plus docs and this handoff, to be pushed
to `origin/v2` with them. This session implemented V2-3F-8
(table-cell and chart-internal typography) against `2816389` —
nothing else. No composition, family, fitter, chrome, intent, or
QA-policy changes beyond two additive L1 codes.

**What landed (4 commits over `2816389` plus roadmap open):**
scene contracts for column widths and chart labels (`c8e15ba`);
per-cell measurement with word/height diagnostics, chart label
assessment, shared projection in both renderers (`2764ae3`);
22 stress tests, 11 of which fail on the baseline for genuine
previously unsupported behavior (`a9735e6`); measurement kept in
the fitting layer per the static guard, V2-3D chart allowance
(`806549c`).

**Still true:** deferred families untouched; free-text/compiler
separation intact; fitter floors and policies unchanged;
even-split columns (content-aware is constraint solving);
tables stay nominal (no per-cell shrink); no truncation or
ellipsis anywhere; PowerPoint client autofit/rotation and legend
corner layout documented as boundary; table splitting,
cell shrinking, per-kind SVG chart geometry, numeric alignment,
and shadows all explicitly out; implemented-vs-planned remains
V2-3F-9; no judge runtime exists or is proposed.

## Verification

- `npm run typecheck` — exit 0.
- `test/v2-internal-3f8.test.js` — 22/22 (readable, dense,
  wrap, token, header, columns, ragged, categories, legend,
  small charts, two kinds, preservation, projection,
  invariance, regressions).
- Full `npm test` — 1362 total / 1361 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Benchmark: 50 cells, L1 0, L2 0; takeaways exact, charts
  byte-exact, representation complete. Evidence:
  `docs/V2-3F-EVAL-4.md`, `out/v2-3f8/` + `out/v2-3f8-stress/`
  (gitignored).
- Historical files byte-identical (3E-1 fixture untouched —
  table/chart internals unprojected there; V2-3D with scoped
  comparison/chart allowances).

## Continue from here

1. V2-3F-8 review (pushed commits + this handoff). On
   acceptance, flip the V2-3F-8 backlog item.
2. Remaining backlog V2-3F-9 — do NOT begin until authorized.
3. V2-4+ — do NOT begin until authorized.
