# Handoff — 2026-11-14

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

Landed 2026-11-14 (all pushed, each with tests and checked in the sandbox):

- **F4b** rotated elements drag, resize and snap in their own frame; text
  boxes and lines are selectable anywhere (Delete works). Left, small:
  lines in groups, equal-spacing guides.
- **F4c** Save as layout (slide menu) → **+ Slide ▾ → Your layouts**
  (`v2_project_layouts`, `layoutFromSlide`/`slideFromLayout`).
- **F8** files as project material the Assistant reads; a chart's data
  panel fills from a project CSV or pasted spreadsheet cells
  (`packages/editor/chart-table.js`). Left: a PPTX's look as a visual
  reference, the real-model check.
- **F3** **Layout ▾** in the toolbar: a compiled slide's other
  arrangements as thumbnails, applied as one undo; the Assistant's
  `change_layout` does the same through an approved `replace_slide`. The
  choice is kept on the scene (`layoutChoice`) and survives theme changes
  (`src/projects/slide-layouts.js`, `packages/compiler/layout-choice.js`).
  Left: several slides per proposal, the real-model check.

Also 2026-11-14: drag-to-select starts in the stage margin and outlines
what it will take; PRODUCTION.md §0 maps hosted (BYOK, provided model
"coming"), plugins (one MCP endpoint for ChatGPT, Claude, Gemini CLI,
local clients) and self-hosting. **F7 started**: the project report
backend (`src/projects/report.js`, generate/list/download/remove routes).

Next, in order: **F7** rest — the editor's Report section, the speaker
script into slide notes (`generateScript` still reads a deck directory;
give it inputs like `generateReport` got), deck-from-report — then **F9** (hosted lifecycle —
V2 state is already all in the database, so the work is the Postgres
default for hosted, the decks directory's lifetime, the container and
DEPLOY.md), then **F5** (the redesign, starting with the study of Canva,
Excalidraw, PowerPoint, Gamma, Google Slides, Pitch and Figma, with the
Claude Design skill; the add-slide menu's discoverability is recorded
there). Everything content-quality is blocked on a model: the gateway is
down and local inference is off-limits while the owner's other work runs.

Sandbox projects for checking: `p-304801890f356c9f861dac99` (imported
PPTX, all slides detached) and `p-33ddd3f460e2f54f4087a3b1` (generated,
has a stored intent — use it for Layout ▾).

Testing note: the linkedom harness stubs the slide's on-screen size on the
`<svg>`, and every commit redraws it, so a second gesture in one test needs
the stub again (or a fresh rig) — it is not an editor bug.

The sandbox's slide 1 carries a "Test picture" rectangle from a picture-insert
check; it is sandbox data, not part of any real deck.

## The owner's notes of 2026-11-12 (in the roadmap)

- Editor scope: a small, deliberate set of editing features, each working
  without glitches, rather than everything PowerPoint has. First: the
  glitchy drag of a vertical text box on a recently opened project (F4b).
- A way to make and save a slide layout of your own (F4c).
- Inspector, layers, and grouped insert tools (Shapes / Text / Media /
  Charts popovers) in the F5 pass.
- Slides that fit but do not get their message across — a new content
  quality entry beside "Measuring content quality".
- (2026-11-14) Delete removes the selected object — in the editor's small
  set; it works now that text boxes are clickable anywhere.
- (2026-11-14) F5 starts with a real study of Canva, Excalidraw,
  PowerPoint, Gamma, Google Slides, Pitch, Figma: take what makes them
  natural and accessible, adopt closely related features only, with the
  Claude Design skill.

## Machine etiquette

The owner runs other GPU/CPU work here (opencode with many headless Chrome
processes). Do not start local model inference or the full test suite without
asking. Run focused suites with an explicit file list and
`--test-concurrency=1` under `nice` — a glob that matches nothing makes
`node --test` run everything.

The TCET gateway answered `/v1/models` but returned HTTP 500 on chat today.
