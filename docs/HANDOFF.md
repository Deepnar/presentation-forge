# Handoff — V2-3F-1 correction in review, rest of 3F NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with first measurement slice accepted and V2-3F-1
correction awaiting review).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. This session
implements narrow correction V2-3F-1 against `9745f5c` — nothing
else. Architecture, schema, policy, renderers, and QA are otherwise
unchanged.

**Correction (this session):** nine unguarded trailing
`takeawayEls()` calls (comparison, data-table, metric, chart,
sequence, hierarchy, media-led, framed-prose, escape) now fire only
for verdict/annotation, matching the established prose-list/card-grid
pattern. Headline takeaways emit exactly once below the title;
verdict/annotation/none paths are byte-identical to before. No new
IDs, no geometry touched, no policy changed.

**Proof gathered:** all-12-family × 4-treatment cardinality matrix
green (48 combos + planner-driven cases); new focused suite
`test/v2-takeaway-cardinality.test.js` 17/17, verified to fail 12/17
on the pre-fix code; benchmark harness rerun gives
20 × text-fit-floor-hit / 0 duplicate / 0 band-overlap (was
20 / 20 / 10 across both variants); old-vs-new scene diff shows the
only change on 25 slides is the removal of the second
`:takeaway:headline` copy (top copy kept); decision-deck floor hits
intact; raster of the fixed closing slide confirms a single
takeaway. `docs/V2-3F-EVAL-1.md` preserved untouched as history.

**Still true:** deferred families untouched; free-text/compiler
separation intact; tombstones V2-5; table-cell/chart-internal
fitting out of scope; no judge runtime exists or is proposed.

## Verification

- `npm run typecheck` — exit 0 (see final report).
- `test/v2-takeaway-cardinality.test.js` — 17/17.
- `test/v2-benchmark-3f.test.js` — 12/12 (detection test updated
  to the fixed expectation, history preserved in EVAL-1).
- Mechanism/preservation/quality/chrome/composition/fit/renderer/
  boundary suites — green (see final report).
- Full `npm test` — 1240 total / 1239 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Historical V2-3A/3D/3E baselines byte-identical (zero fixture
  changes).

## Continue from here

1. V2-3F-1 review (pushed correction + this handoff). On
   acceptance, flip the V2-3F-1 backlog item.
2. Remaining backlog V2-3F-3…V2-3F-9 — do NOT begin until
   authorized, one item at a time.
3. V2-4+ — do NOT begin until authorized.
