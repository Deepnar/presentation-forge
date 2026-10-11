# Handoff — chart-data editing implemented, pending review; V2-5F accepted at f2d29c9

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x] at
`5beba39`; V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [x] at
`4d16a2f`; V2-5B-1 [x] at `4d16a2f`; V2-5C [x] at `b7915aa`;
V2-5C-1 [x] at `b7915aa`; V2-5D [x] at `73eb531`; V2-5E [x] at
`b69472a`; V2-5F [x] at `f2d29c9`; V2-5G [~] pending
independent review; table editing [ ] next; Layers /
layout-library / consolidation planning entries retained).

## Current state

On `v2`, over `f2d29c9`. This session delivered native
chart-data editing: atomic `element.setChartData` (categories,
series, kind) with fail-closed multi-series pie/doughnut
rejection, `dataCustomized` preservation across regeneration,
a dock grid inspector with strict no-coercion parsing, and
native OOXML verification down to inline chart caches.

**What lands (expect ~4 scoped commits):** command vocabulary
(`commands.ts`: `setChartData` + `priorChart` inverse;
schema + regenerated types; engine validation/effectiveness;
`recompileSlide` data carry); adapter (`scene-edit.js`:
`setChartData` with full-matrix + conversion gates); viewer
(`SceneViewer.jsx`: `ChartDataPanel` grid with raw-string
drafts); headless suite (`test/v2-chart-edit.test.js`, 26/26
— 22 fail on `f2d29c9` in a removed worktree, 4 pass
vacuously); Chrome suite (`test/v2-edit-chrome-chart.test.js`,
2/2); eval driver (`tools/chart-eval.mjs`) +
`docs/chart-editor-evidence/` (8 shots + README + manifest);
`docs/V2-5G-EVAL.md`; roadmap (5F accepted, 5G pending,
table editing next) + architecture + V2-5A chart note; and
this handoff.

**Result for the reviewer.** Chart values, labels, names, and
kinds edit in place with every authored value preserved across
undo/redo, regeneration, and native export; unsafe conversions
are refused with explanations before commit. Open: table
editing (scoped proposal in eval §14), slide management UI,
persistence (V2-6 seam), agent turns — plus standing D3-UX/D4/
D5, P2-1, BYOK items.

## Verification (at push)

- Headless chart 26/26; 22 fail on `f2d29c9` (4 vacuous
  passes: rejection/legacy paths that hold without the op).
- Chrome chart 2/2 isolated (commit + undo/redo round-trip;
  add rows/columns + pie refusal with draft preserved).
- Related suites (chart/chart-4c/palette, renderer, scene,
  preservation, 5d text, 5e/f editor, 5c adapter, engine,
  ownership, tombstones, export) green.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells L1 zero.
- Production browser build green (`vite build` inside suites +
  driver).
- Full `npm test` — exact totals in the final report (BYOK
  locale out of scope; browser files isolated, none counted on
  kill/timeout).

## Continue from here

1. Independent review of V2-5G (commits, `docs/V2-5G-EVAL.md`,
   `docs/chart-editor-evidence/`, both new suites). Then table
   editing per eval §14.
2. Do NOT begin table editing, slide management, layers,
   layout-library work, persistence, or AI integration without
   authorization.
