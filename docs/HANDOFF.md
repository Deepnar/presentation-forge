# Handoff — V2-2D landed, V2-2E not started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-0 through V2-2D ticked
with Learned blocks; V2-2E/V2-2F specified; V2-3+ unchanged).
External reference:
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` (untracked root input,
not a roadmap).

## Current state

On `v2`, to be pushed to `origin/v2` with this handoff. V2-2D
implemented per instruction (strict-TS renderer, bytes API, metadata,
empty-input error, Node adapter, boundary exception, caller migration
by deletion, no legacy extraction).

**V2-2D (this session):** `packages/renderer-pptx/render.ts`
(`renderPptx(scenes, options) -> Uint8Array`, fresh presentation per
call, five metadata fields, `[]` rejected loudly) and `node.ts`
(`renderPptxToFile` persists the same bytes — the only generation path).
Old `scene-to-pptx.js` deleted (two trivial callers migrated, zero
parallel implementations). `test/v2-renderer-pptx.test.js` proves
bytes/signature, structure, native families, metadata, freshness, and
the adapter. Boundary test confines `node:` builtins to `node.ts` with
dedicated synthetic tests. Image `src` stays path/URL passthrough;
unprojected scene fields (rotation, per-run opacity, lock/provenance
metadata) recorded as future fidelity work.

**Still true:** Slice A/B contracts, detached semantics, DesignSystem
normalization, layout/geometry core, legacy render/layouts/report
operational; general rotation, fitted vertical flow, chrome policy
deferred; report/DOCX work is V2-2E.

## Verification

- `npm run typecheck` — exit 0 (model + core + renderer + usage test).
- Full `npm test` — 954 tests, 953 pass, sole failure the pre-existing
  `byok-budget` locale expectation.
- `npm run themematrix` — clean across 34 runs.
- Slice re-rendered through the adapter and raster-read (chart) —
  identical output.
- `render.ts` contains no `writeFile`/fs/path logic; old module path
  fully removed; `pptxgenjs` still renderer-local; boundary live-scan
  clean.

## Continue from here

1. V2-2D review (pushed implementation + this handoff). Do NOT start
   V2-2E until approved.
2. On approval: V2-2E per the roadmap slice — schema-backed ReportSpec
   plus deterministic DOCX bytes with donor-bytes input and external
   pagination; LibreOffice stays outside.
