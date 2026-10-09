# Handoff — V2-3F-5 implementation pending review, 3F-7/8/9 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3E [x] at `001edec`;
V2-3F [~] with measurement slice, V2-3F-1/3/4/6 accepted;
V2-3F-5 implementation pending review).

## Current state

On `v2`, HEAD `2cc13ad`, to be pushed to `origin/v2` with this
handoff. This session implemented V2-3F-5 (plate background
compatibility) against `03ca8d6` — nothing else. No composition,
family, fitter, QA, or chrome-policy changes.

**What landed (7 commits over `03ca8d6`):** scene schema gains
optional background decor/image plus shape alpha (`e0e2309`);
compiler resolves cardFill, native decor, and per-surface plate
assets (`8563de4`); PPTX/SVG project the contract with image
backgrounds assigned before any element draw (`9f6fc88`);
`src/v2-plates.js` rasterizes plates outside the deterministic
packages with benchmark wiring (`3e901e5`); 30 focused tests
(`0ab1886`); divider surface-ink rule for dark plates
(`9a1459f`); slice evidence and pending-review status (`2cc13ad`).

**Still true:** deferred families untouched; free-text/compiler
separation intact; shadows unprojected (declared, documented);
table headers opaque by design; legacy bridge flat-background;
content plates never flip lightness so only dividers read surface
ink; side capacity, cell/chart fitting, and implemented-vs-planned
all still open as V2-3F-7/8/9; no judge runtime exists or is
proposed.

## Verification

- `npm run typecheck` — exit 0.
- `test/v2-plate-3f5.test.js` — 30/30 (audit, native, adapter,
  integration, projection, chrome).
- Full `npm test` — 1311 total / 1310 pass; sole failure is the
  known pre-existing `byok-budget` locale expectation.
- 35 scene dumps before/after: 20 byte-identical; 15 differ only
  by added decor arrays or `fillAlpha` on existing frames; zero
  geometry/id/count changes; all 35 semantically identical.
- Benchmark findings identical before/after (canonical 50 cells
  L1 = 20 floor-hits; plate 20 cells L1 = 8). Flat themes
  pixel-identical plain and chromed; decor/plates verified on
  rasters with OOXML reads (`docs/V2-3F-EVAL-2.md`).

## Continue from here

1. V2-3F-5 review (pushed commits + this handoff). On
   acceptance, flip the V2-3F-5 backlog item.
2. Remaining backlog V2-3F-7/8/9 — do NOT begin until
   authorized, one item at a time.
3. V2-4+ — do NOT begin until authorized.
