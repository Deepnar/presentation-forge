# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed and pushed to `origin/main`.** The deck detail
view is complete — inline editing, per-slide presenter assignment, and
reorder/delete/duplicate are all live, verified, and ticked on the roadmap.

**Inline editing (`app/web/src/components/SlideEditor.jsx`).** A modal that
edits one slide's content straight into `deck.yaml` — no model anywhere in the
path. A per-type descriptor map (maxLengths mirroring deck.schema.json) drives
the form; every keystroke re-validates the draft deck through
`POST /api/validate`, so schema errors show while typing and a bad save is
blocked. Empty optional fields are stripped on save so clearing a field really
removes it. Title slides edit `deck.title`/`subtitle` (that is what the title
layout draws). Chart series data is the one deliberate gap, stated in the UI.
`api.js` gained `validateDeck`.

**Per-slide presenter.** A free `presenter` string on the slide (schema +
ops/catalog, so chat can propose splits too). The chrome footer
(`applyContentChrome`) reads `slide.presenter` ahead of the identity's
`presenting` member, then the team label. Cards have a per-slide picker
(datalist of team members in the editor; a `<select>` of members + "auto" in
the card footer). Verified visually: the footer on a presenter-assigned slide
read "Deepesh Sonar" (mimo-v2.5, confidence 0.95).

**Reorder / delete / duplicate.** Pure immutable ops in
`app/web/src/lib/slides.js` (move, deep-copy duplicate, delete that refuses to
empty a deck), unit-tested. Mutations persist deck.yaml immediately through the
existing validated `PUT /api/decks/:slug` and re-render on a 450ms debounce so
rapid presenter clicks coalesce. The grid iterates the deck (not the raster
previews) with a skeleton fallback, because the PNG set lags the content by one
render after a delete/duplicate.

**Verified behaviourally.** `npm test` 14/14 (8 chat + 6 slides). `vite build`
clean; the dev stack boots and the proxy forwards (decks list + validate + the
new module served by the dev server). Via the API against `decks/raytracing-ai`
(then restored): presenter field validated legal, a 120-char headline rejected
with the exact "slide N … 80 chars max" message the editor shows; a PUT carrying
presenter + reorder + duplicate round-tripped into deck.yaml (reordered order,
presenter on the moved slide); render produced 9 slides, zero problems. The
per-slide footer was confirmed on the rasterised PNG by a vision model.

**Honest limitation:** no browser tool in this CLI — the UI was verified
structurally (build, dev-server module transform, every endpoint it calls) plus
one rasterised-PNG vision check; no screenshot of the actual deck-detail UI was
taken or inspected. The edit/action buttons and the editor modal were NOT
click-tested in a real browser.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — fit traps, vision-model trust, and the browser-tool trap
  (do not claim visual verification you did not do).
- `app/web/src/components/SlideEditor.jsx` — the per-type field map; keep it in
  sync with `schema/deck.schema.json` (maxLengths).
- `app/web/src/lib/slides.js` — immutable slide ops, pure + tested.
- `app/web/src/views/Decks.jsx` — DeckDetail: `commitDeck` (validated PUT +
  debounced render) is the single mutation path.
- `src/chrome.js` — the per-slide presenter override in `applyContentChrome`.
- `docs/ROADMAP.md` §2 "Deck detail view" (ticked, with Learned).

## NEXT TASK — themes, then the plate renderer

The deck lifecycle (plan → gate → generate → chat → inline edit) is complete.
Next in priority order (from the roadmap):

1. **Themes.** 15 native (mostly YAML), 4 blocked on the plate renderer. Render
   each before ticking it; re-check heading spacing per theme and per style.
   `tools/compare.mjs` renders the theme × style matrix.
2. **HTML plate renderer** — headless Chrome; unblocks the four blur-based
   themes and freeform slides. Build once, for both callers.
3. **Freeform slides** — per-slide and whole-deck, on the plate renderer.
4. **Report renderer** + **shared research.**

**Look-ahead already recorded:** the seam holds — chat edits an existing deck
(`deck.yaml` required), inline editing and slide ops write `deck.yaml` directly
(no model), and generation builds from an approved plan. Keep the three paths
separate. The chat panel's `refreshToken` still drives deck-detail re-fetching;
a deck edited inline does not bump chat's thread (they are independent surfaces
over the same file).

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **19 remaining themes** — 15 native (mostly YAML), 4 blocked on the plate
  renderer. Render each before ticking it.
- **HTML plate renderer** — headless Chrome; unblocks both the four blur-based
  themes *and* freeform slides. Build once, for both callers.
- **Freeform slides** — the "completely free" mode, per-slide and whole-deck.
- **Report renderer** — donor-`.docx`, fixed section order, no themes.
- **Shared research** — one brief feeding both deck and report.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **No browser tool in this CLI.** UI claims must be structural (build, API
  calls) unless a real screenshot was taken and inspected.
- **A written `.pptx` proves nothing.** Rasterise and look (the preview PNGs are
  LibreOffice's own render, so they match what LibreOffice shows).
- **Vision QA:** prefer `opencode-go/mimo-v2.5` or `gemma4:26b-a4b-it-q4_K_M`;
  never trust `qwen3-vl:8b-thinking` for defect-finding (false-clean).
- **Stacked text must be fit-scaled or line-counted.** Never
  `fitScale(text, w, 99, st)` to detect wrapping — count lines.
- **`pkill -f` with a pattern that appears in the command's own line kills the
  shell.** Kill dev servers by port (`fuser -k 5173/tcp`) or PID instead.
- **Background dev servers in this shell hang the next command.** Detach with
  `setsid … &` + `disown`, or kill by port immediately after testing.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.** Express needs
  `node --watch`.
- **Never add an unbounded array or a bare `{type:"object"}` to a model-facing
  schema.** Always check `done_reason`. The author role has no vision.
- **Only one theme exists.** Anything assuming a populated gallery looks broken.
- **SearXNG must be running** for research (`npm run searxng`).
