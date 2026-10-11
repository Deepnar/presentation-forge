# Handoff — Layers implemented, pending review; V2-5I accepted at 7068972

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x] at
`5beba39`; V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [x] at
`4d16a2f`; V2-5B-1 [x] at `4d16a2f`; V2-5C [x] at `b7915aa`;
V2-5C-1 [x] at `b7915aa`; V2-5D [x] at `73eb531`; V2-5E [x] at
`b69472a`; V2-5F [x] at `f2d29c9`; V2-5G [x] at `9d2b660`;
V2-5H [x] at `cd7d069`; V2-5I [x] at `7068972`; V2-5J [~]
pending independent review; layout gallery [ ] next; Layers
done in-slice; consolidation planning entries retained).

## Current state

On `v2`, over `7068972`. This session delivered the Layers
panel and object arrangement: an authoritative layer tree with
bidirectional selection sync, `element.reorder` under an
explicit z-is-the-rank contract both projections share, user
locks with system-chrome protection, truthful hide/show
(omitted, never deleted or rasterized), group display with a
bounded no-grouping follow-up, and preservation carries for
z, user locks, and visibility. No fixture deck carries
groups, so hierarchy behavior is proven headlessly on
synthetic scenes — stated, not browser-faked.

**What lands (expect ~4 scoped commits):** model
(`commands.ts`: reorder/setLocked/setVisibility + inverses;
`engine.ts`: vocabulary, validation, effectiveness, lock-gate
exemption for the toggle; schema + regenerated types);
preservation (`compile.js`: z/lock/hidden carries + customized
sequence rule); projections (`scene-svg.js`, `render.ts`:
hidden omission; preflight hidden skip); adapter
(`scene-edit.js`: reorder/lock/hide entries, ancestor lock
rule, hidden guards); helpers (`scene-text.js`: labels, tree,
collapse filter, chrome guard); viewer (`SceneViewer.jsx`:
Slides/Layers tabs, panel, row actions, keyboard, docked
format bar intact); headless suite
(`test/v2-layers-5j.test.js`, 25/25 — fail-first on
`7068972` in a removed worktree); Chrome suite
(`test/v2-edit-chrome-5j.test.js`, 5/5); eval driver
(`tools/layers-eval.mjs`) + `docs/layers-evidence/` (9 shots
+ README + manifest); `docs/V2-5J-EVAL.md`; roadmap (5I
accepted, 5J pending) + architecture + V2-5A layer note; and
this handoff.

**Result for the reviewer.** Every slide object is inspectable
and controllable through one panel bound to the real scene,
with matching browser/export stacking, protected chrome, and
exact undo/redo; grouping stays an explicit follow-up. Open:
layout-skeleton gallery, V2-6 persistence, agent turns — plus
standing D3-UX/D4/D5, P2-1, BYOK items.

## Verification (at push)

- Headless layers 25/25; fail-first on `7068972` (new layer
  APIs absent).
- Chrome layers 5/5 isolated (tree sync, restack, lock/hide
  cycle, keyboard, narrow + read-only).
- Related suites (engine incl. lock-gate exemption,
  preservation incl. customized-order rule, tables/charts,
  5d–5i editor, 5c adapter, viewer/selection, renderer,
  export) green.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells L1 zero.
- Production browser build green (`vite build` inside suites +
  driver).
- Full `npm test` — exact totals in the final report (BYOK
  locale out of scope; browser files isolated, none counted on
  kill/timeout).

## Continue from here

1. Independent review of V2-5J (commits, `docs/V2-5J-EVAL.md`,
   `docs/layers-evidence/`, both new suites). Then the layout
   gallery per eval §12.
2. Do NOT begin the gallery, persistence, Layers follow-ups,
   or AI integration without authorization.
