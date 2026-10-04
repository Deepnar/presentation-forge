# Handoff — V2-1 complete (Slice B landed), V2-2 not started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-0 and V2-1 ticked with
Learned blocks; V2-2..V2-13 pending). External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, pushed to `origin/v2`. Slice A accepted as pushed; the
hardening pass landed on top; Slice B just landed. V2-1 is marked
complete against its Done-when criteria.

**Slice B (this session):** `Project`/`Artifact`/`FileRef`/`SourceRef`
as schema-first domain contracts — 4 JSON Schemas, 4 checked-in
generated types (via extended `tools/v2-types.mjs` targets, drift
covered), `packages/model/validate.ts` with AJV validators, 4
per-domain validation test files plus a `.ts` generated-type usability
guard (plain-array assignability fails `typecheck` on tuple-union
regression). Corrections applied: `projectId` required on FileRef and
SourceRef; `storageKey` (never paths/URLs); `searchProvider` opaque;
export invariants (`exportOf`/`format`/`storageKey`) enforced by schema
`if`/`then` with tests; no `designName`, no `revision`, no job states,
no `ToolResult` (stays V2-8); `design.js` untouched; `DesignSystem`
deferred to V2-2.

**Still true from hardening:** `maxItems: -1` generation; detached is
compiler-hands-off; V2-5 criteria require the shared command path and
explicit-only relayout; no Neon/Vercel/provider/auth/agent imports in
`packages/model` (domain only — verify with a grep before V2-2).

## Verification

- `npm run types:generate` — clean, schemas-as-truth.
- `npm run typecheck` — exit 0 (now covers 11 model files + 1 TS test).
- Full `npm test` — 911 tests, 910 pass, sole failure the
  pre-existing `byok-budget` locale expectation.
- Drift test green; stale `.js`-specifier search clean.
- `design.js`, intent/scene schemas, compiler untouched in Slice B.
- Compiler output and raster output unchanged (no code path touched).

## Continue from here

1. Slice B review (this handoff accompanies the pushed implementation).
   Do NOT start V2-2 until approved.
2. On approval: V2-2 core extraction per the §12 entry — theme/design
   loading moves into packages then, and only then is the real
   `DesignSystem` contract established from compiler evidence.
