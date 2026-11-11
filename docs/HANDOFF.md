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

Later on 2026-11-11 (a long session): every slide type converts, and every
finished deck on disk imports (`npm run import-coverage -- --import`); over-long
text imports with `fitWarnings`. Context lines (section, standfirst, on-slide
note) no longer choose a slide's layout. Finished generations create their
editor project in `finalizeDeck` and the chat opens it. The editor can insert
pictures. The session cookie now covers `/api` and v2 project routes accept it
for reads only. **F1 is done** apart from F1g (show fit warnings, dense
content) and F1h (re-import a changed deck keeping edits).

## Checking the app in a browser

Use the `forge-sandbox` launch (`.claude/launch.json`): API 5374 / UI 5373
against `out/sandbox` — its own config, database and decks, so nothing touches
the real install. Create the owner account through `POST /api/auth/register`
and keep the generated credentials in `out/sandbox/credentials.txt`
(gitignored). Copy a deck into `out/sandbox/decks/<slug>` with `meta.owner`
set to that account and import it with
`POST /api/decks/<slug>/v2-project {"requestId":"browser-editor-v1"}`.

## Next

The owner set the order on 2026-11-11: **core before the front end** (see the
roadmap's finish-line decisions). No visual redesign until the core items are
done; editing behaviour that feels broken counts as core.

- **F4b** the editor behaves like a slide editor — most of it landed
  2026-11-11 (text boxes fit their text, snapping and guides, Shift
  constraints, clipboard keys, drag-to-select, a right-click menu with
  align/distribute, shrink to fit, offline autosave). Paste/drop of image
  files landed after (not yet clicked through in the browser — check a real
  screenshot paste and a file drop first). Left: group/ungroup, rotation. New
  editor gestures live in `packages/editor/scene-arrange.js` (pure) and
  `scene-edit.js` (wiring); `test/v2-arrange.test.js` covers them.
- **F1g / F1h** (fit warnings in the editor; re-import a changed deck).
- **F3** starts with persisting `DeckIntent` in projects; theme change follows.
- **F2** the Assistant on every provider; then F7, F8, F9.
- **F5** is now the whole-site UI/UX redesign, after the above, starting from
  a study of how Canva, Google Slides, PowerPoint web, Pitch and Gamma lay out
  the same surfaces, and checked page by page by screenshot.
- Verifying generate → editor end to end needs a working model (the TCET
  gateway returned HTTP 500 on chat; local inference is off-limits while the
  owner's other work runs).

Testing note: the linkedom harness stubs the slide's on-screen size on the
`<svg>`, and every commit redraws it, so a second gesture in one test needs
the stub again (or a fresh rig) — it is not an editor bug.

The sandbox's slide 1 carries a "Test picture" rectangle from a picture-insert
check; it is sandbox data, not part of any real deck.

## Machine etiquette

The owner runs other GPU/CPU work here (opencode with many headless Chrome
processes). Do not start local model inference or the full test suite without
asking. Run focused suites with an explicit file list and
`--test-concurrency=1` under `nice` — a glob that matches nothing makes
`node --test` run everything.

The TCET gateway answered `/v1/models` but returned HTTP 500 on chat today.
