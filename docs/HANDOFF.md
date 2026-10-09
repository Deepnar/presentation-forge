# Handoff — V2-3F-3 implementation in review, rest of 3F NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with first measurement slice accepted, V2-3F-1 accepted,
V2-3F-3 correction awaiting review).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. This session
implements narrow item V2-3F-3 against `6332cfc` — nothing else.
No schema, family, fitter, or renderer changes.

**Correction (this session):** sparse frameless text recenters
vertically inside its allocated region BEFORE fitting, via a
`centerSparse` flag on `placePrimary` honored only for text/list/
quote/callout carriers in prose-list, escape, divider blocks, and
unframed prose. Nominal content fills under half the region → box
shrinks to content + 0.25in slack and centers; dense regions keep
byte-identical geometry. Measurement lives in `text-fit.ts`
(`centerSparseBox`) so mechanisms.ts stays free of height
arithmetic; cautionary tone rails follow the carrier's actual box.
Research-defense list: y=1.77/h=4.41 (19% fill) → y=3.43/h=1.09
(77% fill), text/sizes/diagnostics unchanged. Framed cards, stats,
titles, takeaways, caveats, badges, captions untouched by
construction. Rasters confirm improved distribution with no new
overflow; dense comparison slides pixel-stable.

**Still true:** deferred families untouched; free-text/compiler
separation intact; tombstones V2-5; table-cell/chart-internal
fitting, plates, caveat placement, side capacity, implemented-vs-
planned channel all still open as V2-3F-4…V2-3F-9; no judge
runtime exists or is proposed.

## Verification

- `npm run typecheck` — exit 0 (see final report).
- `test/v2-rhythm-3f3.test.js` — 8/8 (distribution pins,
  dense byte-identity, reservations, stat exclusion, invariants
  across 5 decks × 5 themes × plain/chromed).
- Historical V2-3D baseline file byte-identical; its test now
  proves only centered-text-box containment deltas.
- V2-3E-1 baseline regenerated (3 recentered boxes, nothing else).
- Full `npm test` — 1240 total / 1239 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Contact sheets regenerated and viewed (sparse improved, dense
  unchanged, dark chrome intact).

## Continue from here

1. V2-3F-3 review (pushed correction + this handoff). On
   acceptance, flip the V2-3F-3 backlog item.
2. Remaining backlog V2-3F-4…V2-3F-9 — do NOT begin until
   authorized, one item at a time.
3. V2-4+ — do NOT begin until authorized.
