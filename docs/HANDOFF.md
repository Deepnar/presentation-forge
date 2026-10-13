# Handoff — V2-5J1 correction implemented, pending review with V2-5J

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x] at
`5beba39`; V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [x] at
`4d16a2f`; V2-5B-1 [x] at `4d16a2f`; V2-5C [x] at `b7915aa`;
V2-5C-1 [x] at `b7915aa`; V2-5D [x] at `73eb531`; V2-5E [x] at
`b69472a`; V2-5F [x] at `f2d29c9`; V2-5G [x] at `9d2b660`;
V2-5H [x] at `cd7d069`; V2-5I [x] at `7068972`; V2-5J [~] and
V2-5J1 [~] pending independent review together; layout
gallery [ ] next; consolidation planning entries retained).

## Current state

On `v2`, over `015835d`. This session is the scoped V2-5J1
correction to the review finding: system chrome unlockable
through direct engine envelopes despite the adapter refusal.
Enforcement moved to the canonical `applyCommand` primitive
over one shared `isSystemChrome` predicate (now in
dependency-free `scene-constants.ts`, replacing the
editor-local copy with zero bundle change); actor strings
confer nothing; duplicate copies inherit protection; ordinary
lock/unlock, undo/redo, regeneration, and export verified
unchanged.

**What lands (expect ~2 scoped commits):** model
(`commands.ts`: authoritative refusal;
`scene-constants.ts`: shared predicate);
adapter+tests (`scene-edit.js` import, `scene-text.js`
copy removed, `test/v2-layers-5j.test.js` import,
`test/v2-layers-5j1.test.js` 12/12 — bypass repro fails on
`015835d` with `{ok: true, revision: 1}`, passes after);
docs (`V2-5J1-EVAL.md`, V2-5J §14 note, V2-5A note, roadmap
pointer, TRAPS entry on UI-only checks); and this handoff.
No schema, engine-shape, renderer, or UI changes.

**Result for the reviewer.** Protected chrome refuses
unlocking from adapter, direct, batch, actor-varied, and
duplicated-chrome paths with scene/revision/history
untouched; everything else behaves exactly as V2-5J left it.
Open: layout-skeleton gallery, V2-6 persistence, agent turns
— plus standing D3-UX/D4/D5, P2-1, BYOK items.

## Verification (at push)

- New boundary suite 12/12; bypass repro fails on
  `015835d` (import-level fail plus live `{ok: true}`
  demonstration), passes after.
- Related suites (layers 5j, engine/batch/duplication,
  ownership, tables/charts, editor family, viewer/selection,
  renderer, export) green.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells L1 zero.
- Production browser build green.
- Full `npm test` — exact totals in the final report (BYOK
  locale out of scope; browser files isolated, none counted on
  kill/timeout).

## Continue from here

1. Independent review of V2-5J + V2-5J1 together (commits,
   both eval docs, layers evidence, all three suites). Then
   the layout gallery.
2. Do NOT begin the gallery, persistence, Layers follow-ups,
   or AI integration without authorization.
