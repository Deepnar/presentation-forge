# Handoff — 2026-11-11

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

2026-11-07: `flow` direction converts — a top-to-bottom flow compiles to a
numbered rail (`layoutHint.flowDirection: "down"`). Also fixed the editor's SVG
renderer placing middle/bottom-aligned text half a line high.

2026-11-08: content blocks carry an optional `icon` (emoji, drawn as text at
the top of its card); feature-grid icons convert. Unfilled `[image] …`
requests become empty image slots with the description as alt text; card
images (never drawn by the old layout) are dropped and reported. Card grids
now share height between rows instead of cards.

2026-11-09: `framework` converts to a radial hierarchy
(`layoutHint.arrangement: "radial"`): concept in a central ellipse, elements on
a ring with spokes, falling back to tiers if the ring would touch. `icon-list`
converts to icon-headed cards. Tiered hierarchy children share height by row.

2026-11-10: `layered-architecture` converts to a layered hierarchy
(`layoutHint.arrangement: "layers"`): full-width bands with accent edge, label,
text and aligned component pills. Across flows now size cards to their content
and centre a short row (they had each card at 1/n of the height).

2026-11-11: `diagram` converts to a graph hierarchy (slide `connections`,
`layoutHint.arrangement: "graph"`; radial diagrams use the radial
arrangement with authored links). `matrix` converts to card-grid
`quadrants` between slide `axes`; `roadmap` to card-grid `lanes` (block
`group` per phase, time labels as `axes.x.ticks`). Import refuses if an axis
label, lane name or link label is not drawn.

## Next

10 of the 18 decks in `decks/` convert (`npm run import-coverage`). Left:
- `branching-flow`, `journey`, `venn`, `dependencies` (one deck each); never
  seen in real decks but still refused: `progress-bars`, `sparklines`,
  `funnel`, `pyramid`, `hierarchy`, `freeform`.
- Two intent caps real content exceeds: a list over 8 items, a block label
  over 120 characters — raise the caps (the compiler fits text) rather than
  refuse.
- Three `cites` with no URL — keep them as speaker-note references instead of
  refusing.
- Six slides missing a `headline`: structural, the old renderer refuses them
  too; leave refused.

Then **F1e** (import on generation completion + land in the editor). The owner
declined merging `v2` into `main` for now (roadmap M1); do not merge unasked.

## Machine etiquette

The owner runs other GPU/CPU work here (opencode with many headless Chrome
processes). Do not start local model inference or the full test suite without
asking. Run focused suites with an explicit file list and
`--test-concurrency=1` under `nice` — a glob that matches nothing makes
`node --test` run everything.

The TCET gateway answered `/v1/models` but returned HTTP 500 on chat today.
