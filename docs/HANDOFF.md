# Handoff — V2-5C implemented, in review; V2-5B/5B-1 accepted; V2-5D NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x] at
`5beba39`; V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [x] at
`4d16a2f`; V2-5B-1 [x] at `4d16a2f`; V2-5C [~] in review
with interaction evidence).

## Current state

On `v2`, over `4d16a2f`. This session implemented V2-5C:
browser drag/nudge/delete through the shared engine, with
D1 tombstones — no text editing, resizing, persistence, or
agents. Seams in `scene-dom` (replaceScenes, resolveNode,
editable keys, click suppression); `scene-edit.js`
adapter; `suppressed` schema + types; tombstones in
`runPlaced` and `recompileSlide`; browser-safe `scene.ts`
(JSON-schema import, WebCrypto ids); trusted drag input in
`chrome-shot`; Edit-mode React integration with undo/redo
controls and revision display.

**What lands (expect ~5 scoped commits):** tombstones +
Cases A–I (10/10, A fails baseline); adapter + seams
(19/19 headless); Chrome editing (5/5 trusted); eval
driver (8/8 trusted shots, deltas ≤ 0.1px); report
(`docs/V2-5C-EVAL.md`) + evidence (`docs/v2-5c-evidence/`,
seven inspected shots); D1 decided in the arch record;
roadmap (5B/5B-1 accepted, 5C in review); and this handoff.

**Result for the reviewer.** One drag = one command, one
nudge batch = one entry, delete suppresses exactly,
undo/redo restore exactly, locked never moves, groups
resolve to parents, previews never touch scenes, and no
second document model exists. Open: D2–D5, P2-1, BYOK.

## Verification (at push)

- Tombstones 10/10 (A fails base), adapter 19/19,
  Chrome editing 5/5 (each re-verified in isolation
  after all changes).
- Engine 27+21, ownership 5/5, preservation +
  renderer/viewer suites green (focused 130/130).
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells
  L1 zero.
- Full `npm test` — 1635 total · 1633 pass · 2 fail ·
  0 skipped/cancelled/todo (BYOK + one wedged Chrome
  file under parallel load, killed after 75 min with zero
  output; its 5 tests never ran there, 5/5 isolated
  right after).
- `node tools/v2-5c-eval.mjs` exits 0; tree clean after
  round-trip.

## Continue from here

1. Independent review of V2-5C (commits +
   `docs/V2-5C-EVAL.md` + `docs/v2-5c-evidence/`). Then
   V2-5D text editing per the eval §12.
2. Do NOT begin V2-5D, persistence, or agent integration
   without authorization.
