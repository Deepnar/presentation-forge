# Handoff — V2-4B implemented, in review; V2-4 open; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4 [~]; V2-4B [~] in review with
evidence).

## Current state

On `v2`, over `c5b564a`. This session implemented V2-4B:
shared-projection typography calibration (F1 + F2) — nothing
else. No compiler, schema, floor, theme, geometry, or PPTX
changes; the only product-code touch is
`packages/editor/scene-svg.js` (central `pt2px`, margin+ascent
first baseline, table/chart paths on the same conversion).

**What landed (expect ~4 scoped commits):** calibration +
contract comments (`scene-svg.js`); historical pin updated
with explanation (`test/v2-viewer-4a.test.js`); 10 regression
tests (`test/v2-typography-4b.test.js`, 7 proven to fail on
the V2-4A baseline via stash); eval report
(`docs/V2-4B-EVAL.md`) + curated evidence
(`docs/v2-4b-evidence/`); architecture, roadmap, and this
handoff.

**Result for the reviewer.** Metric/status collisions gone
(9.6px clear where glyphs overlapped); type at true size
everywhere with no prose/table/chart/chrome/plate
regressions across 10 compared slides; PPTX bytes unaffected
(renderer-pptx untouched, OOXML sizes asserted). Remainder:
~5px left-inset asymmetry (documented, bounded), system-font
metrics (V2-4D), chart axes (V2-4C).

**Still true:** V2 suites green (full-suite sole failure the
known BYOK locale one); fixtures stable, plate fixtures never
committed; `demo.html` mutation seam open for V2-5; V2-4C–F
not started.

## Verification

- `test/v2-typography-4b.test.js` — 10/10 (7 fail on
  baseline, verified via stash + pop).
- Consumer net (viewer, smoke, pptx, chrome, tables, plates,
  fit, benchmark, comparison, internal) — 263/263.
- `npm run typecheck` — clean (re-verify before push).
- Full `npm test` (re-verify before push; expect only the
  known BYOK locale failure).
- `node tools/v2-viewer-fixtures.mjs --check` stable.
- `node tools/v2-4a-eval.mjs` exits 0; tree clean after its
  plate round-trip.

## Continue from here

1. Independent review of V2-4B (commits + `docs/V2-4B-EVAL.md`
   + `docs/v2-4b-evidence/`). On acceptance, flip V2-4B; the
   V2-4 accept/reject call stays with the reviewer.
2. Do NOT begin V2-4C–F or V2-5 without authorization.
   V2-4C (per-kind chart geometry) is the correct next slice
   when authorized.
