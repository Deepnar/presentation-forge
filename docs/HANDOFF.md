# Handoff — Slice A accepted, hardening pass landed, Slice B proposed

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (phases V2-0..V2-13; V2-1 now
reflects the corrected incremental-TS direction, V2-8 the V2.2
agent-runtime scope, V2-5 the explicit preservation acceptance
criteria). External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, pushed to `origin/v2`. Slice A accepted as pushed; this session
is the approved hardening pass on top, also pushed.

**V2-1 Slice A (landed):** `packages/model/{intent,scene,commands,legacy}`
are strict TypeScript executed natively by Node 24 (no build step).
`intent.generated.ts` / `scene.generated.ts` are checked in from the
JSON Schemas via `tools/v2-types.mjs` (`npm run types:generate`) with a
byte-for-byte drift test; `npm run typecheck` is clean. AJV owns runtime
validation; no Zod. `design.js` deliberately still JS. Tests import the
`.ts` modules directly; assertions/fixtures unchanged (import specifiers
excepted).

**Hardening pass (this session, landed):**

- Generated types use `maxItems: -1` (verified against installed
  json-schema-to-typescript 15.0.1: schema maxima deleted before
  generation, `minItems` preserved) — `blocks: [ContentBlock,
  ...ContentBlock[]]`, plain arrays elsewhere. Schemas untouched; AJV
  still enforces every maximum. Dead casts removed from `legacy.ts`;
  genuine bridge casts (enum narrowing, tuple non-emptiness, series
  values) remain and are documented.
- `detached` corrected to compiler-hands-off (not read-only):
  `assertEditable` rejects locked elements only; move/resize/text/add/
  delete all work on detached scenes without flipping `layoutState`;
  `recompileSlide` still returns detached scenes untouched. Five new
  preservation tests prove it.
- V2-5 roadmap criteria now require the shared command path, text-edit
  ownership, delete persistence semantics, undo/redo participation, and
  explicit-only relayout — design deferred, not worked around.
- V2-1 Slice B scope corrected: `Project`/`Artifact`/`FileRef`/`SourceRef`
  (+ `DesignSystem` seam question); `ToolResult`/`ToolError` stay V2-8.
- `docs/HANDOFF.md` (this file) and the ARCHITECTURE V2 section rewritten
  to built reality.

## Verification

- `npm run typecheck` — exit 0.
- Full `npm test` — 879 tests, 878 pass, 1 fail (pre-existing
  `byok-budget` locale expectation, unchanged).
- V2 tests: 32/32 (26 Slice A + 1 drift + 5 detached).
- Stale `.js`-specifier search over packages/test/tools/app/src — zero.
- No duplicate schema-contract definitions (generated files only).
- Compiler output byte-identical pre/post migration (`cmp` clean).
- Raster spot-check (comparison + chart, warm-humanist) — identical to
  pre-migration reads.

## Continue from here

1. Slice B proposal (delivered with the hardening report, awaiting
   approval) — do NOT implement until approved.
2. On approval: `Project`/`Artifact`/`FileRef`/`SourceRef` schemas +
   generated types (+ `DesignSystem` decision per proposal), drift
   covered, tests, then push.
3. V2-2 core extraction waits for Slice B. Serve the present phase
   before reaching for the next.
