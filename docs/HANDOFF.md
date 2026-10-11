# Handoff — table editing implemented, pending review; V2-5G accepted at 9d2b660

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x] at
`5beba39`; V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [x] at
`4d16a2f`; V2-5B-1 [x] at `4d16a2f`; V2-5C [x] at `b7915aa`;
V2-5C-1 [x] at `b7915aa`; V2-5D [x] at `73eb531`; V2-5E [x] at
`b69472a`; V2-5F [x] at `f2d29c9`; V2-5G [x] at `9d2b660`;
V2-5H [~] pending independent review; slide management [ ]
next; Layers / layout-library / consolidation planning
entries retained).

## Current state

On `v2`, over `9d2b660`. This session delivered native table
editing: atomic `element.setTableData` over verbatim
full matrices with ragged input refused before commit,
`tableCustomized` preservation across regeneration, a dock
grid panel with raw-string drafts, density warnings from
shared line-count math, and native `<a:tbl>` verification.
Also hardened per §11: shared chart/table semantic validators
run on restore paths too, closing the inverse-input gap
without an engine rewrite.

**What lands (expect ~4 scoped commits):** command vocabulary
(`commands.ts`: `setTableData` + `priorRows` inverse,
`assertTableMatrix`/`assertChartPayload` on both paths;
schema + regenerated types; engine envelope/effectiveness);
`recompileSlide` table carry; adapter (`scene-edit.js`:
`setTableData` with matrix gates); helpers (`scene-text.js`:
`tableOverflowEstimate`); viewer (`SceneViewer.jsx`:
`TableDataPanel` grid + dock condition fix); headless suite
(`test/v2-table-edit.test.js`, 22/22 — fail-first on
`9d2b660` in a removed worktree); Chrome suite
(`test/v2-edit-chrome-table.test.js`, 3/3); eval driver
(`tools/table-eval.mjs`) + `docs/table-editor-evidence/` (8
shots + README + manifest); `docs/V2-5H-EVAL.md`; roadmap (5G
accepted, 5H pending, slide management next) + architecture +
V2-5A table note; and this handoff.

**Result for the reviewer.** Table cells, headers, rows, and
columns edit in place with every character preserved across
undo/redo, regeneration, and native export; ragged input and
last-member deletions are refused with reasons; density warns
instead of shrinking. Open: slide management UI, persistence
(V2-6 seam), agent turns — plus standing D3-UX/D4/D5, P2-1,
BYOK items.

## Verification (at push)

- Headless table 22/22; fail-first on `9d2b660` (new table
  APIs absent).
- Chrome table 3/3 isolated (cell edit + undo/redo;
  add/remove structure; narrow viewport).
- Related suites (chart-edit ×2, chart/chart-4c/palette,
  renderer, scene, preservation, 5d/e/f editor, 5c adapter,
  engine, ownership, tombstones, export) green.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells L1 zero.
- Production browser build green (`vite build` inside suites +
  driver).
- Full `npm test` — exact totals in the final report (BYOK
  locale out of scope; browser files isolated, none counted on
  kill/timeout).

## Continue from here

1. Independent review of V2-5H (commits, `docs/V2-5H-EVAL.md`,
   `docs/table-editor-evidence/`, both new suites). Then slide
   management UI per eval §15.
2. Do NOT begin slide management, Layers, layout templates,
   persistence, or AI integration without authorization.
