# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**The product plan's Part 1 is complete: the full slide vocabulary now lives in
the schema, the renderer and the editor — 75 types in the enum, each a native
pptxgenjs layout, each rendered, rasterised and vision-checked with
`mimo-v2.5` before its batch shipped. Part 2's remaining features (F3–F11,
F14–F20, plus F17/F18) shipped as a focused tranche. Part 3's deployment is
shelved by the user; hosting-readiness only (env-overridable stateful dirs).**
`npm test` 153/153, `vite build` clean, every deck in the repo re-renders,
features verified live over CDP and visually. Dev servers running at :5174/:5173.

### Part 1 — the 50-type vocabulary (53 types added on top of the existing 22)

Eight batches, each one commit (or tight group) pushed, each batch built a demo
deck that was rasterised and vision-checked:

| Batch | Families | Types |
|---|---|---|
| 1 | Foundation + List & Grid | chapter, closing, numbered-list, checklist, feature-grid, grid-items, icon-list, stacked-list |
| 2 | Data & Stats + charts | kpi-dashboard, data-cards, progress-bars, ranking-list, metric-comparison, sparklines; chart kinds +scatter/radar/stacked-bar |
| 3 | Comparison | before-after, framework, matrix, scorecard, vs, side-by-side |
| 4 | Process & Flow | cycle, funnel, pipeline, dependencies, branching-flow, layered-architecture |
| 5 | Timeline + Quote | roadmap, journey, chronology, testimonial, pull-quote, epigraph |
| 6 | Callout + Image + Table | warning, tip, takeaway, image-grid, hero-image, split-screen, data-table, decision-matrix |
| 7 | Diagram-ish | diagram (vertical/horizontal/radial), pyramid, venn, hierarchy, concept-map |
| 8 | Definitions + Team + Special | glossary, faq, team-grid, attribution, contact, equation, bibliography, data-source; + `speaker_note` bar |

Demo decks live at `decks/type-batch1..8` and `decks/flow-ttb`. The vocabulary
test is `test/vocabulary.test.js` (valid payloads pass, wrong shapes reject,
catalog derivation, ops-schema size, maxLength < 2000 guard). The inline editor
gained descriptors for all 75 types with composite editors (matrix axes,
roadmap phases, recursive hierarchy, per-column data-table cells).

Vision findings fixed per batch (all re-verified clean): data-cards stat
wrap (`fitOneLine` added to `src/fit.js` — width-based one-line fit for stat
digits, used by data-cards/kpi/metric-comparison), empty scatter chart
(pptxgenjs needs a synthetic X-Axis series), framework ring overlap (elliptical
ring), matrix axis-label collisions (position + text-sized rotated boxes),
cycle ring collapse (radius geometry), takeaway panel overflow, hierarchy
post-order collapse (tree builder pushed children before parent — a real JS
evaluation-order trap), concept-map leaf stacking (perpendicular fan + spread
caps), decision-matrix total styling.

### Part 2 — features (all shipped except F13/F16)

F3 outline drag-reorder · F4 clone (`cloneDeck`, "Clone" button opens the copy)
· F5 slide templates (`templates/*.yaml` + "+ Add slide" menu) · F6 vertical-flow
capacity fix (title-only at 5+ steps) · F7 shortcuts (Ctrl+K/N/S, Ctrl+Z/Y,
Escape) · F8 PDF/Markdown export (`src/export.js`, CLI `--format`, API, UI
buttons) · F9 undo/redo (20-deep deck-state stack) · F10 chat empty state with
suggestion pills · F11 sharing bundle (zip via jszip) · F14 version history
(`backups/` snapshots + Versions popover with Restore) · F15 light storyboard
in the outline · F17 per-deck dark mode (meta `mode`) · F18 per-slide retry +
placeholder · F19 full-text deck search (API + sidebar merge) · F20 report
section "Add as slide".

**Not built, by design:**
- **F13 image grounding** — the model still emits `image` filenames without
  writing files. Design for a future session: the writer's schema already names
  a path; a search-based pass (SearXNG query from the slide's headline, fetch a
  CC-licensed match, download into `decks/<slug>/`) is the honest local-first
  option. Generated images (cloud DALL-E/Stable Diffusion via opencode-go)
  would violate the no-cloud-LM default; do search first.
- **F16 i18n** — the renderer has no locale-aware number formatting and no RTL.
  Design: `meta.yaml` gains `language`; the chrome strings ("Guide:", "Slide x / y",
  "Presented by") move to per-language maps; number formatting via
  `Intl.NumberFormat(locale)` in `layouts.js`; RTL is a pptxgenjs gap — do
  non-RTL languages first and record the RTL seam explicitly.

### Part 3 — hosting-readiness (deployment shelved)

No `storage.js`/S3 (shelved). What changed: `src/paths.js` exposes
`FORGE_DECKS_DIR / FORGE_THEMES_DIR / FORGE_BRAND_DIR / FORGE_CONFIG_DIR`, and
`src/plate.js` reads `FORGE_PLATE_CACHE` — every stateful directory is
env-overridable. `FORGE_CHROME`, `SEARXNG_URL` were already env-driven. No
secrets in source; keys live in gitignored `config/local.yaml` (env-first in
`src/cloud.js`).

## Verification notes

- `npm test` 153/153; `npx vite build --config app/web/vite.config.js` clean.
- All 10 committed decks re-render; spot-checked `type-batch4` on dark-neon and
  `type-batch3` on glassmorphism — clean.
- CDP (Node 24's global WebSocket, headless Chrome at
  `--remote-debugging-port=0`): home loads, a deck opens, the action row
  (PDF/.md/Bundle/Clone/Versions), template menu and chat suggestion pills all
  present; deck + chat screenshots vision-checked clean.
- Vision model: `opencode-go/mimo-v2.5` (persisted choice).

## What remains

- **F15 full form** — a live filmstrip of *rendered* slides streaming during
  generation needs a new SSE phase in `generateFromPlan` that emits each
  validated slide (render-per-slide or a storyboard of placeholders); the light
  storyboard ships now.
- **F13 image grounding** and **F16 i18n** — designs above.
- **Chart expansion**: `scatter` is native-but-lineMarker (pptxgenjs bakes the
  style in); true marker-only scatter would need XML surgery or a plate.
- The fitter's unit pessimism (TRAPS) remains a deliberate non-goal.

## End-of-session state

- Dev servers running: API `http://localhost:5174` (node --watch), UI
  `http://localhost:5173` (Vite). Restart with `npm run api` / `npm run web` if
  down; the API can die mid-session on some edits (TRAPS) — check
  `/api/health` before trusting an endpoint.
- `config/local.yaml` holds the OpenCode Go key and `routing.default: local`.
- All commits pushed to `origin/main` (last verified push: the docs commit).
