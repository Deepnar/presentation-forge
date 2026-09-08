# Handoff — 2026-09-08, repository structural cleanup started

Read `AGENTS.md`, `CLAUDE.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **Repository-wide structural cleanup**.

## Current state

Three structural passes are complete and behaviorally verified. The Express entry
point is 516 lines, down from 3,411. Authentication, provider/account settings,
workspace settings, shared HTTP responses, and boot/lifecycle work now live in
dedicated registrar modules under `app/server/`. Workspace settings comprise
presets, identity overrides, brand assets and report templates. Route ordering
remains controlled by `index.js`, and business logic remains in `src/`.

Admin account, plan, quota, cleanup, storage and health routes now live in
`app/server/admin-routes.js`. The entry point and admin registrar have only a
file-purpose comment; standalone narrative comments were removed after their
invariants were captured by module boundaries, tests and architecture docs.

Deck artefact/report routes now live in `artifact-routes.js`; specimen, chat,
creation and resumable-generation routes live in `generation-routes.js`. Both
receive shared transport primitives from the entry point. The full suite remains
at 808 passing tests after these moves.

The ineffective dynamic import of `modelMode.js` in `ChatView.jsx` is now a
normal static dependency. The Vite warning for that false split is gone. The
remaining bundle-size warning is real and belongs to the roadmap's React
route-level splitting pass.

## Verification

- `npm test` — 808 passing, 0 failing.
- `npx vite build --config app/web/vite.config.js` — successful; only the real
  646 kB initial-chunk warning remains.
- `npm run render -- decks/solar-microgrids-for-rural-electrification-i/deck.yaml`
  — successful, 2 slides.
- `npm run preview -- decks/solar-microgrids-for-rural-electrification-i/out/deck.pptx`
  — successful, 2 rasterized pages; slide 1 was visually inspected and is clean.
- `git diff --check` — clean.

## Continue from here

Do not mechanically split files by line count or delete every explanatory
comment. Follow the checked seams in the roadmap: server route families first,
then the layout registry, React views and AI orchestration. Add route-order
characterisation tests before moving each remaining server family. Preserve the
chrome/theme/content boundary throughout.
