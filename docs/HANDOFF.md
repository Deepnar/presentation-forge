# Handoff — V2-3F-6 implementation in review, rest of 3F NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with measurement slice accepted and V2-3F-1/3/4
accepted; V2-3F-6 correction awaiting review).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. This session
implements narrow item V2-3F-6 against `2311160` — nothing else.
No schema, family, fitter, renderer, or policy changes.

**Correction (this session):** `placePrimary()` now places each
caveat against the primary carrier it qualifies. When the carrier
is centered frameless text, the caveat attaches below it at a
deterministic 0.1in gap (same x/w as the carrier); all other cases
— dense, framed, table/chart/image/stat, custom renders — keep the
historical region-bottom band bit-identically. Attachment is proven
to fit whenever centering fired, with an explicit fallback to the
region band. Pre-change probe recorded a 1.65in claim-to-caveat
gap on sparse content; post-change raster shows QUALIFIED directly
under the evidence text. Tables deliberately keep region-bottom
caveats (native geometry + caption interplay, V2-3F-8 boundary).

**Still true:** deferred families untouched; free-text/compiler
separation intact; tombstones V2-5; per-cell capacity assessment
remains V2-3F-8 (documented, not measured); plates, side capacity,
implemented-vs-planned channel all still open as V2-3F-5/7/9; no
judge runtime exists or is proposed.

## Verification

- `npm run typecheck` — exit 0 (see final report).
- `test/v2-caveat-3f6.test.js` — 16/16 (attachment, density,
  cautionary rail, evidence rule, framed/table/multi/takeaway/
  chrome/labels, determinism, themes, preservation); 7 fail on the
  pre-fix baseline as designed.
- Full `npm test` — 1281 total / 1280 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- Historical V2-3A/V2-3D files byte-identical; no fixture was
  regenerated or modified.
- Benchmark harness: 50 cells, L1 still exactly the 20 genuine
  decision-deck floor hits; research-defense + technical decks
  re-rendered and viewed.

## Continue from here

1. V2-3F-6 review (pushed correction + this handoff). On
   acceptance, flip the V2-3F-6 backlog item.
2. Remaining backlog V2-3F-5/7/9 (plus accepted 3F-1/3/4) — do NOT
   begin until authorized, one item at a time.
3. V2-4+ — do NOT begin until authorized.
