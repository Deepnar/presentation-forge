# Handoff — V2-2B landed, V2-2C not started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-0, V2-1, V2-2A, V2-2B
ticked with Learned blocks; V2-2C..V2-2F specified; V2-3+ unchanged).
External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-2B
implemented per the corrected instruction set (alpha fixes,
no DesignGuidance, no LAYOUT_DEFAULTS copy, loose layoutPreferences,
required baseline roles, optional surface accent, full shadow intent,
required cardFill, Color chart series, chartpalette untouched, optional
mode, loader IO shared with legacy, `design.js` deleted, allowlist
entry removed).

**V2-2B (this session):** `design.schema.json` + `design.generated.ts`
+ `validateDesign`, pure `normalizeDesign` in `packages/core/design.ts`,
`src/theme-loader.js` raw-document IO (legacy `src/theme.js` delegates
its reads, output shape unchanged), compiler migrated to
`grid.margins`/`palette.*.hex`/`roles` with `cmp`-identical scene JSON,
goldens for 8 theme/mode/style combos, 34×2 normalize-and-validate
sweep, voice/plate/outliers provably excluded from output.

**Still true:** Slice A/B contracts, detached semantics, legacy
`src/render.js`/`layouts`/`report.js` unmodified and operational;
`DesignGuidance` deferred to V2-8; layout vocabulary to V2-2C.

## Verification

- `npm run types:generate` — clean; `npm run typecheck` — exit 0.
- Full `npm test` — 929 tests, 928 pass, sole failure the pre-existing
  `byok-budget` locale expectation.
- V2 tests green including 13 design tests (validation, goldens,
  semantics, sweep).
- `npm run themematrix` — clean across 34 runs (legacy behavior
  unchanged through delegation).
- V2 slice re-rendered and raster-read (comparison) — identical.
- `design.raw` count in V2 code: zero. `packages/model/design.js`:
  deleted. Boundary allowlist: empty.

## Continue from here

1. V2-2B review (pushed implementation + this handoff). Do NOT start
   V2-2C until approved.
2. On approval: V2-2C per the roadmap slice — layout vocabulary,
   frame geometry, footprint math; `layoutPreferences` strictens there.
