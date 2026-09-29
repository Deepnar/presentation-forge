# Handoff — 2026-09-30, canvas moved to a branch; main clean

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§11 canvas + tell + slide-links**. Note: the roadmap
on main still describes canvas as unbuilt — the built slices live on the
`canvas` branch (4 commits) and main's roadmap will catch up at merge.

## Current state

On `main`: one local commit ahead of `origin/main` (`487cd09`, needs
explicit OK before push). Working tree clean.

**Branch split (user ask, 2026-09-30):** all canvas work left main for the
`canvas` branch (4 commits: overrides+renderer core, preservation tests,
canvas mode UI + konva deps, docs). Main holds a single commit: the Sources
panel moved to the top of the research tab (`ResearchView.jsx`). Anyone
downloading main gets no canvas code — no `overrides.js`, no konva dep.

**Also done this session (lives on `canvas`, recorded in its docs):**
tell-to-add validated end to end on local `qwen3.6:35b-a3b` (17→18 slides,
existing byte-unchanged, appended stats slide read clean); §12 gained a
"Per-slide source refs" item (schema `cites` unwritten/unread — needs a
supporting-source contract).

**Built here (human-only bounded + manual, no model):**

- Blank slide of any type without AI (`app/web/src/lib/blankSlides.js`,
  `test/blank-slides.test.js`): shape derives from `TYPE_FIELDS` with schema
  minima, validated through `validateDeck` for every editor type plus
  `illustrated-points`. Deck-page "+ Add slide" offers templates plus a
  filtered list of all types and opens the form editor at the new slide.
- Descriptor fixes (`slideEditorFields.js`): callout/references gain the
  required headline; branching-flow steps are title-objects per the schema.
- Semantic reorder inside a slide (`lib/slides.js` `moveListItem`,
  `SlideEditor.jsx` up/down): lists, cards, nested rows, table rows, side
  points, chart series. Order only, no geometry.
- Tell-to-add door (`DeckDetail.jsx`): "Tell it what to add…" appends one
  AI-written slide via the existing chat turn. The same phrasing works in the
  normal chat thread post-deck (`ChatView.jsx:574` → same `runTurn`
  machinery, `src/ai/turn.js:40` maps "add a slide at the end" to
  `append_slide`).
- Image blanks carry a notes `[image]` marker so the card's add-image door
  shows; upload flow unchanged (`assets/`, grey placeholder render).

**Refs status (verified against a real deck):** the source-mapped slide exists
(second-to-last, part-scoped "used on slides …", top 10, 220-char plain text,
nothing clickable — `src/ai/provenance.js:98`, `src/layouts/core.js:1172`).
The Research tab already links every sourced URL including papers (title →
URL, paper badge on arXiv/DOI — `ResearchView.jsx:171`, `src/papers.js:56`):
31/31 sources linked on the perovskite deck. Open choice recorded in the
roadmap: short URLs in slide text, real OOXML hyperlinks (schema work), or
links tab-only.

## The canvas spec (to be built elsewhere)

The user wants the whole PowerPoint/Canva experience: click into an editor
mode after the deck is done and freely do anything — add/duplicate/remove
slides, write, move/resize, add pictures — and that is the final slide.

- Human-only layout-override layer. Content stays semantic; a per-slide human
  `layout` block (geometry + paint) wins at render time. The model grammars
  exclude it everywhere (unrepresentable beats scrubbed); every AI pass
  (sweep, trim, coherence, punch, critic, insert, convert) preserves it
  verbatim or refuses the slide with a visible reason.
- Chrome stays locked (banner, crest, slide numbers are graded marks, never
  overridable). Freeform stays the rasterised full-bleed hatch.
- Slices in order: (1) schema + validation + grammar exclusion + preservation
  tests, no UI; (2) renderer applies overrides (one layout first, then a
  shared helper); (3) per-pass preservation audits; (4) the visual editor
  surface (click-to-select on the rendered slide, drag/resize, paint,
  textboxes, images).
- Open decisions: paint fully custom vs theme-palette-first; override
  semantics on theme switch and type swap (likely reset-with-confirm).
- Bar (unchanged): full scope implemented *and* behaviourally validated — a
  real run plus rasterised reads, `npm test`, `vite build`, `git diff --check`.

## Verification

- `npm test` — 850/851. The one failure is pre-existing and unrelated
  (`byok-budget.test.js` locale: `50,00,000` vs `5,000,000`).
- `npx vite build` — clean. `git diff --check` — clean.
- Six representative blanks render with zero problems; placeholder images
  grey-box via the null-asset path.
- Dev server ran on `:5173`/`:5174` for the user's own visual check; it is
  not part of the committed state.

## Continue from here

1. Canvas slices (elsewhere) per the spec above; paint decision first.
2. Tell-to-add live-model validation (append lands, deck re-renders).
3. Slide-links pick: short-URL text, OOXML hyperlinks, or tab-only.
4. Then the user's own full functional sweep (§"The full functional sweep").
