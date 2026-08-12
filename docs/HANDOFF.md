# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

**The first tranche of the 50-type vocabulary shipped (Tier 1: big-number,
agenda, milestone, pros-cons, emphasis, definition), content grounding is a
live hallucination guard in the generate path, and the deck's research is now
visible and editable in the UI. All committed and pushed to `origin/main`.**
`npm test` 89/89, `vite build` clean, every new type rendered + rasterised +
vision-checked (`mimo-v2.5`) on a real deck in two themes, grounding verified
on a real cloud-model run, and the research panel round-trips through the live
API. Dev servers are running at :5174 / :5173.

### What changed

**Tier-1 slide types.** Six conditional blocks in `schema/deck.schema.json`
(data fields only), six native layouts in `src/layouts.js`, family
categorisation in `src/ai/catalog.js` (the map already names all 50 planned
types, so Tier 2-4 need no catalog work), an outline-prompt steer
("a number → data family, a definition → definition type…"), and SlideEditor
descriptors. The demo deck `decks/tier1-types/` shows all six types and is
committed; it renders clean on warm-humanist and dark-neon.

**The big-number layout bug.** The caption was landing on the chrome footer.
Root cause was two-fold: `heightOf`/`measure` in the fitter never multiply the
per-em advance by the em size (documented in TRAPS — a units quirk every
layout works around by letting `fitScale` own boxes), and the layout derived a
y-offset from raw `heightOf`. It now pins the caption to the content-box bottom
and fit-scales the body into the fixed budget between the label and the
caption. Inter was also added to the fitter's `WIDE_SANS` set — it renders
wider than the generic sans advance.

**Grounding (F1).** `src/ai/grounding.js` compares each slide's figures, dates
and names against `research/notes.md` after generation and flags ungrounded
claims into the slide's `notes` (`[grounding] …`) and the result's `problems[]`.
Wired into `generateFromPlan`, re-run on the critic's output, printed by the
CLI. Verified with the cloud model: a stats slide prompted with a figure that
was *not* in the notes emitted "4.2%" and "2030" — both flagged. Names only
count as claims when their field carries a real figure, so a well-grounded
cloud deck produces zero findings.

**Research panel (F2).** `GET/PUT /api/decks/:slug/research` (404-safe:
`exists: false` for a deck with no research pass; notes/sources validated).
`DeckDetail` shows the notes as a read-only code block with an Edit mode
(textarea + Save) and `sources.json` as a collapsible list; states are
loading / error / no-research / content. Round-trip verified live: PUT a
distinctive fact into a scratch deck's notes, regenerated with the cloud model,
and the writer used it — the edit feeds the content stage because
`generateFromPlan` reads `notes.md` fresh at write time.

### Verification (all behavioural)

- `npm test` 89/89; `vite build` clean; dev API :5174 + Vite :5173 running.
- Six new types rendered (`decks/tier1-types/deck.yaml`), rasterised, and
  vision-checked with `mimo-v2.5` — warm-humanist all 7 slides clean; the
  big-number caption/footer collision was found by the vision pass and fixed;
  a dark-neon spot check of the three riskiest slides also clean.
- Grounding: unit tests pass; the real green-hydrogen deck grounds clean; a
  cloud-model generation produced two genuine ungrounded claims ("4.2%",
  "2030") that were flagged into slide notes.
- Research panel: GET/PUT round-tripped through the running API (including the
  non-string rejection), and a PUT edit reached the regenerated deck's content.
  UI inspected via headless Chrome screenshots (deck detail, research notes,
  edit mode) — vision-checked, no overlaps.

### Known open work

- **Fitter units.** `measure()` never multiplies by the em size, so its width
  and line estimates are ~5-8x pessimistic against real inches. Every layout
  works because `fitScale` shrinks defensively. Fixing it would re-type every
  deck — deliberately deferred; see the TRAPS entry. Future layouts must anchor
  to fixed boxes, never compute offsets from raw `heightOf`/`lineCount`.
- **Tier 2-4 types.** The plan's other 44 types (numbered-list, kpi-dashboard,
  progress-bars, framework, matrix, cycle, funnel, image-grid, faq, …) follow
  the same recipe: schema conditional block, native layout, SlideEditor
  descriptor, catalog detail auto-derives. The family map already covers them.
- **Deck writer image grounding** — the model emits image filenames without
  writing the files (pre-existing open work).
- **Chart expansion** — `scatter`, `radar`, `stacked-bar` in the existing chart
  kind enum (small, high payoff).
- **Cross-cutting `speaker_note`** field for all content types (plan Family O).
- **Flow layout capacity** — six-step TTB cards still collide with the footer.
- **Canvas slide-builder (stretch)** — see the roadmap entry.

### Gotchas

Full list in `docs/TRAPS.md`. New this session:

- **The fitter's `measure` is not true inches.** `length * advance` with no em
  multiply makes `heightOf` wildly pessimistic. Let `fitScale` own text boxes;
  a layout that derives a y-offset from fit arithmetic will drift onto the
  chrome (the big-number caption hit the footer exactly this way).
- **Inter is a wide geometric sans.** It was missing from the fitter's
  `WIDE_SANS` set, so its real width wrapped the big-number body. Now included.
- **Names are the grounding guard's noise source.** A bare card title or stat
  label is not a claim; flagging every capitalized phrase absent from research
  cries wolf. Names are only extracted from fields carrying a real figure.
- **A missing research dir is a state, not an error.** The research endpoint
  returns `exists: false`; the panel shows a hint, never a fetch error.

## Context to read before starting

- `docs/ARCHITECTURE.md` — new section "The grounding guard — research is the
  contract"; the web-shell `DeckDetail` bullet covers the Research panel.
- `docs/ROADMAP.md` — new ticked items: "Tier-1 slide-type vocabulary",
  "Content grounding", "Research panel".
- `src/ai/grounding.js` — the guard; pure functions tested in
  `test/grounding.test.js`.
- `src/layouts.js` — the six new layouts at the top of the `layouts` object.
- `app/server/index.js` — `GET/PUT /api/decks/:slug/research`.
- `decks/tier1-types/` — the committed demo deck for all six new types.

## End-of-session state

- Dev servers running: API `http://localhost:5174`, UI `http://localhost:5173`.
  The `node --watch` API auto-reloads on server edits; Vite hot-reloads the UI.
- `config/local.yaml` (gitignored) holds the OpenCode Go key and
  `routing.default: local`. Generation tests this session passed
  `model: deepseek-v4-flash` explicitly to route to the cloud provider.
- `decks/tier1-types/` is the new-type demonstration deck (committed). Its
  `out/` previews are gitignored and regenerated by `npm run render` +
  `npm run preview`.
