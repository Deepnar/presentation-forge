# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed and pushed to `origin/main`.** Freeform slides
are live — schema, render path, model prompt and UI — and the roadmap item is
ticked. The Gamma-like loop is complete: a topic in, a themed deck out, with
genuinely free hero slides.

**Schema.** `type: freeform` joined the enum; the freeform `allOf` branch
requires a non-empty `html` (minLength 1, maxLength 24000) and a slide-level
`else: not required html` forbids `html` on every other type, so the freeform
grammar never leaks into native slides. The catalog and ops schema derive from
the branch, so the model sees freeform as an ordinary type. `validate.js` got
clear `minLength` ("too short") and `not` ("field html is only allowed on type
freeform slides") error messages.

**Render.** A freeform slide has no native layout — `render.js` skips it and
lets the plate primitive rasterise the whole slide from `html`, with the
institutional chrome (crest, footer, slide number) drawn on top. Chrome
legibility now samples the plate's own top-right corner luminance (sharp crop)
to pick the crest variant — the theme palette says nothing about arbitrary
freeform HTML, and this also sharpened the plated themes.

**Model prompt.** `writeSlide` branches for freeform: it is the one deliberate
exception to the no-layout rule. The prompt describes the 1280×720 canvas, the
sandboxed subset (inline CSS only; scripts and network blocked by the plate
CSP), legible text sizes (44px+ headline, 18–24px body), and the chrome overlay
margins. The planner is told to use freeform sparingly for hero moments.

**UI.** The outline review offers the type with a per-slide rasterisation
warning and a whole-deck conversion button that confirms the same trade-off
("no text editable in PowerPoint afterwards — maximum visual impact,
editability deliberately traded away"). The slide editor edits `html` in a
monospace field and repeats the warning.

**Verified.** `npm test` 27/27 — added test/freeform.test.js: html-required,
forbid-on-other-types, empty and oversized html errors, mixed native+freeform
decks, and a sandbox test that renders a page whose `<script>` tries to paint
it red and asserts the pixels stay blue. Rendered a real deck mixing a native
title/section with a freeform hero through Chrome → pptx → LibreOffice → PNG
and vision-checked with mimo-v2.5: the hero's gradient, frosted chip, headline
and paragraph all present, native neighbours untouched, chrome footer overlaid.
The crest on the dark hero initially rendered faint (full-colour mark on dark);
chrome now samples the plate luminance and picks the reversed variant.

**Honest limitations.** The crest's absolute legibility on a freeform plate is
bounded by the placeholder brand assets, which are semi-transparent by design
(the same "faded" crest appears on native dark section dividers) — the
variant *selection* is verified, the asset opacity is a brand concern. The
whole-deck freeform path (outline conversion) relies on the author model
writing good HTML for every slide; quality of model-written freeform HTML was
not visually verified this session (a hand-written hero was). No browser tool —
UI verified structurally (build + all endpoints).

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — fit traps, vision-model trust, "chrome colour derives from
  the painted background".
- `schema/deck.schema.json` — the freeform branch + the `else: not` forbid.
- `src/render.js` — the freeform layout skip and `plateChromeBg`.
- `src/ai/generate.js` — the freeform writer branch + planner guidance.
- `app/web/src/views/Outline.jsx`, `app/web/src/components/SlideEditor.jsx` —
  the trade-off copy.
- `docs/ROADMAP.md` §4 "Freeform slides" (ticked, with Learned).

## NEXT TASK — the 15 native themes, then reports

The deck pipeline is feature-complete (plan → gate → generate → chat → inline
edit → freeform). Next in priority order:

1. **15 native themes** — mostly YAML; render each before ticking it. The
   plated themes (glassmorphism etc.) are the reference for the plate contract;
   native themes follow the warm-humanist contract. Verify heading spacing per
   theme/style.
2. **Report renderer** — donor-`.docx`, fixed section order, no themes. A
   different review surface.
3. **Shared research** — one brief feeding both deck and report.

**Look-ahead already recorded:** `slide.html` wins over `tokens.plate`, and
freeform is a first-class type. The plate cache version tag is `plate-v1`
(bump to invalidate). `plateChromeBg` sampling is general — plate themes get it
too.

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **15 native themes** — render each before ticking it.
- **Report renderer** — donor-`.docx`, fixed section order, no themes.
- **Shared research** — one brief feeding both deck and report.
- **Flow layout capacity** — six-step LTR cards are over-capacity for verbose
  bodies; contained by fit-shrink, real fix is a layout question.
- **Model-written freeform HTML quality** — worth a visual check once the
  freeform generation path is exercised end to end.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **`toBuffer()` returns a Buffer.** Destructuring `{ data }` off it yields
  undefined and the surrounding try/catch swallows it — a helper silently
  falls back. Use `toBuffer({ resolveWithObject: true })` or read the Buffer
  directly.
- **A written `.pptx` proves nothing.** Rasterise and look. For plates, the
  PNGs ARE the proof — vision-check them and pixel-sample subtle effects.
- **Render + preview into a shared `out/preview/` overwrites the last theme.**
  Verify one theme/deck at a time.
- **Chrome colour/legibility must derive from what is painted.** On freeform
  plates that means sampling the raster, not reading the palette.
- **Vision QA:** prefer `opencode-go/mimo-v2.5` or `gemma4:26b-a4b-it-q4_K_M`.
- **`content()` has no `h`.** Derive `h = bottom - y`; a `NaN` in `{{box.h}}`
  silently kills the panel.
- **A relative cacheDir breaks the plate file:// URL.** Resolve absolutely.
- **No browser tool in this CLI.** UI claims must be structural unless a real
  screenshot was inspected.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.**
- **SearXNG must be running** for research (`npm run searxng`).
