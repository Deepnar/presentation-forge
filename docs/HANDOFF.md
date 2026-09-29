# Handoff — 2026-09-30, human-only manual editing + tell-to-add door

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§11 canvas + tell entries ([~] with direction agreed)**.

## Current state

Direction agreed: the canvas is for humans after the AI is done. The model
never writes layout and no per-slide coordinates/colours/fonts enter the
schema from any source. Pixel-free work stays on `type: freeform`.

Landed on `origin/main` in small commits (push pending at write time):

- **Blank slide of any type without AI** (`app/web/src/lib/blankSlides.js`,
  `test/blank-slides.test.js`): shape derives from `TYPE_FIELDS` with schema
  minima, validated through `validateDeck` for every editor type plus
  `illustrated-points`. The deck-page "+ Add slide" menu offers templates plus
  a filtered list of all types and opens the form editor at the new slide.
- **Descriptor fixes** (`slideEditorFields.js`): callout/references gain the
  required headline; branching-flow steps are title-objects per the schema.
  The blank test caught all six mismatches; the form mirrors the schema again.
- **Semantic reorder inside a slide** (`lib/slides.js` `moveListItem`,
  `SlideEditor.jsx` up/down): lists, cards, nested rows, table rows, side
  points, chart series. Order only, no geometry.
- **Tell-it-what-to-add door** (`DeckDetail.jsx`): "Tell it what to add…"
  input appends one AI-written slide via the existing chat turn, beside the
  no-AI manual path.
- **Image blanks** carry a notes `[image]` marker so the card's add-image door
  shows; upload flow itself unchanged (`assets/`, grey placeholder render).

## Verification

- `npm test` — 850/851. The one failure is pre-existing and unrelated
  (`byok-budget.test.js` locale: `50,00,000` vs `5,000,000`).
- `npx vite build` — clean. `git diff --check` — clean.
- Six representative blanks (bullets, cards, chart, image-text with
  placeholder path, compare, matrix) render with zero problems; placeholder
  images grey-box via the existing null-asset path, never a dead deck.

## Continue from here

1. Behavioural validation of the tell-to-add turn against a live model
   (append lands, deck re-renders) — needs a model; local exercises plumbing
   only, Auto judges quality.
2. Visual check of the new deck-page controls in a running browser
   (menu filter, editor opens at new index, up/down buttons, tell input).
3. Then the user's own full functional sweep (§"The full functional sweep").
4. Open by design: grid drag for slide order (menu moves exist); no
   free-coordinate drag — excluded by the chrome/theme/content split.
