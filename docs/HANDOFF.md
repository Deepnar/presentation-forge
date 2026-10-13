# Handoff — V2-5K layout gallery implemented, pending review

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x];
V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [x], V2-5B-1 [x] at
`4d16a2f`; V2-5C/C-1 [x] at `b7915aa`; V2-5D [x] at `73eb531`;
V2-5E [x] at `b69472a`; V2-5F [x] at `f2d29c9`; V2-5G [x] at
`9d2b660`; V2-5H [x] at `cd7d069`; V2-5I [x] at `7068972`;
V2-5J + V2-5J1 [x] at `dd4ab9b`; V2-5K [~] pending independent
review with `docs/V2-5K-EVAL.md`; layout switching recorded as a
separate future item; consolidation planning entries retained).

## Current state

On `v2`, over `dd4ab9b`. This session built the V2-5K manual
layout gallery end to end: a deterministic template registry
independent of the AI composition selector
(`packages/editor/layout-templates.js`, 15 skeletons in 4
categories), engine insertion through the accepted `slide.insert`
path (`insertLayoutSlide` in `scene-edit.js`, per-build ids
checked against the deck domain), a New Slide chooser (blank /
layout / duplicate) plus searchable gallery with same-scene SVG
previews (`SceneViewer.jsx`), human `customized` ownership with
orphan-carry preservation, a contrast-guarded theme fallback,
and native PPTX export. The legacy 74-type vocabulary is audited
in `docs/V2-LAYOUT-CATALOG-MAP.md` (counted from the schema: 17
direct, 27 alias, 5 partial, 25 omitted with mechanics).

**What lands (expect ~6 scoped commits):** docs (roadmap J/J1
acceptance + 5K scoping); registry + catalog map; adapter +
headless suite (`test/v2-layouts-5k.test.js` 31/31, fail-first
proven on `dd4ab9b` at import); viewer gallery + browser suite
(`test/v2-edit-chrome-5k.test.js` 9/9) + 5i chooser-flow update;
contrast guard + tests; evidence (`docs/layout-gallery-evidence/`,
10 shots + README); eval + ARCHITECTURE + V2-5A + TRAPS +
roadmap + this handoff.

**Result for the reviewer.** Gallery inserts real editable
Layer-C through one revision/one undo entry with navigation;
placeholders edit, restyle, and re-data through existing
commands; previews are the built scenes; dark/high-contrast
grounds hold 3:1; export is native (slide/chart/table OOXML
asserted, LibreOffice rasters read); compiler output untouched
(benchmark 50 cells L1 zero). Open: V2-6 persistence (recommended
next — gallery decks are the first work users will mind losing),
layout switching (separate slice), agent turns — plus standing
D3-UX/D4/D5, P2-1, BYOK items.

## Verification (at push)

- Headless 31/31; fail-first on `dd4ab9b` proven in an isolated
  worktree (import-level `ERR_MODULE_NOT_FOUND`).
- Chrome 9/9 gallery + updated 5i blank/narrow (isolated,
  port 5257/5254).
- Related suites 281/281 (engine/slides/layers/preservation/
  ownership/tombstones/text/style/resize/format/tables/scenes/
  composition/renderers).
- `npm run typecheck` clean; production build green; benchmark
  50 cells L1 zero.
- Full `npm test` — exact totals in the final report (BYOK
  locale out of scope; browser files isolated, none counted on
  kill/timeout).

## Continue from here

1. Independent review of V2-5K (commits, eval doc, evidence,
   both suites, PPTX rasters). Then V2-6 persistence binding.
2. Do NOT begin layout switching, persistence, frontend
   consolidation, or AI integration without authorization.
