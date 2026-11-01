# Handoff — 2026-11-01

Branch `v2`, pushed to `origin/v2`. Work follows the **Finish line** at the top
of [ROADMAP.md](ROADMAP.md#finish-line); the gated plan/review/evidence protocol
was removed today (see `AGENTS.md` → Development workflow).

## Where things stand

The V2 editor could not open a single real generated deck: the deck → project
converter refused academic identity, images, speaker notes, citations, decks
over today's length caps, and 24 of 74 slide types. F1 is making that converter
faithful, then landing every generation in the editor.

Done today (each with tests, pushed):

- **F0** process reset — protocol machinery, review records and 291 MB of
  committed test evidence removed; browser suites write to `out/evidence/`.
- **F1a** speaker notes — scene `notes`/`notesEdited`, `slide.setNotes` with
  undo, regeneration keeps human notes, native PPTX notes, notes panel under
  the editor canvas.
- **F1b** project assets — `v2_project_assets` (SQLite + Postgres), images
  referenced as `asset:<sha256>`, `POST /api/v2/projects/:id/assets` (bearer
  only), `GET /api/v2/assets/:hash` (owner-checked, cookie ok), inlined for
  export with real crop/letterbox; eight image slide types convert; captions draw.
- **F1c** academic identity — team/guide/course as editable title-slide text,
  banner and crest as locked chrome assets, presenter fallback restored,
  undeclared fields dropped and reported, length caps no longer refuse.
- **F1f** citations — deck `cites` become owner-private project sources and
  slide citations created atomically with the project.

## Next

**F1d**: the slide types still refused — `flow` with `direction` (most common),
`feature-grid` icons and `cards` images (needs an icon facility), `framework`,
`diagram`, `layered-architecture`, `roadmap`, `matrix`, `icon-list`,
`branching-flow`, `journey`, `venn`, `dependencies`, plus `progress-bars`,
`sparklines`, `funnel`, `pyramid`, `hierarchy`, `freeform`. Then **F1e**
(import on generation completion + land in the editor).

To see what still refuses on the real decks in `decks/`, convert each one with
`convertGeneratedDeck` and group the refusal `details` by slide type and field.

## Machine etiquette

The owner runs other GPU/CPU work here (opencode with many headless Chrome
processes). Do not start local model inference or the full test suite without
asking. Run focused suites with an explicit file list and
`--test-concurrency=1` under `nice` — a glob that matches nothing makes
`node --test` run everything.

The TCET gateway answered `/v1/models` but returned HTTP 500 on chat today.
