# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

**Ten queued items worked: the chat rail is now deck-only, chat handles
structural slide commands, reports stand alone and spawn companion decks, the
particle field and shell motion got richer, cloud routing has a header toggle,
a brand upload surface exists, and the crest no longer renders as a ghost. All
committed and pushed to `origin/main`.** `npm test` 73/73, `vite build` clean,
and the live dev servers were CDP-checked with screenshots inspected by
`mimo-v2.5` for the UI work and the crest.

### What changed

**Task 10 — the crest fix.** The root cause was *not* the knockout selection or
the chrome luminance logic: `brand/logos/crest.png` itself shipped with every
pixel at ~14/255 alpha (6%) — RGB fully intact, alpha meaningless. A viewer
compositing it against white made it look normal; on any slide it was a ghost.
`keyWhite` kept the source alpha for saturated pixels, so the defect survived
normalisation. The keyer now rebuilds alpha from RGB: a pixel with alpha 0 stays
a real cutout, everything else becomes saturated→opaque or neutral→lightness.
Verified by rendering warm-humanist (full-colour crest visible) and dark-neon
(the reversed white silhouette) and looking at both via `mimo-v2.5`.

**Task 1 — chat rail is deck-only.** `App.jsx` mounts the rail (and its edge
tab) only when `view === "deck"`; Home/Identity/Themes/NewDeck/Outline get the
main column full-width. The rail stays mounted and animates its width on the
shell easing instead of popping in.

**Task 2 — structural chat commands.** `src/ai/ops.js` gains `duplicate_slide`;
`runTurn`'s prompt now maps "add/delete/duplicate/move slide N" directly to ops
and is told never to paraphrase or refuse. The server-side `delete_slide` now
refuses to empty a deck, matching the editor's guard. New `test/ops.test.js`
(6 tests). The deck detail's manual move/duplicate/delete buttons were already
correct and are untouched.

**Task 3 — standalone reports + deck-from-report.** Two new doors on the same
generator and the same research:
- `forge report-new <brief>` / `POST /api/reports` — brief → research →
  `report.yaml` → `.docx`, no deck. The fixed section order is the structure,
  so no outline gate applies; `generateReport({ requirePlan: false })` derives
  its plan from brief + research.
- `forge deck-from-report <slug>` / `POST /api/decks/:slug/report/deck` — an
  existing `report.yaml` plans a companion deck (`reportBrief()` feeds the
  report's own sections to `planDeck`), through the ordinary outline gate and
  `/generate` path.
- Report-only decks (`deck: false`) appear in the list and open a new
  `ReportView` (section cards, render/download, Generate-companion-deck button).
  Home Report mode gained a From-a-deck / From-a-brief toggle.
- **End-to-end proven on `decks/solar-water-pumping-for-irrigation`** — a
  standalone report that gained a rendered 18-slide deck through the reverse
  flow. This deck is committed as the demonstration.

**Task 4 — particle field.** More/smaller dots (area/4200, capped 260), and the
idle motion is now a two-axis sine wander around a fixed home (figure-eight,
not a sway). Capped at 60fps for high-refresh displays; reduced-motion static
frame and hidden-tab pause kept. Behaviourally verified via CDP (frame counter,
pointer stamp, pushed-dot count).

**Task 5 — fluid motion.** One easing everywhere —
`--ease-shell: cubic-bezier(0.2,0.8,0.2,1)` — for view switches (keyed
fade-and-rise on `main`), sidebar collapse, chat rail, card hover; a
`prefers-reduced-motion` query collapses all transitions/animations to instant.

**Task 6 — cloud routing.** `config/local.yaml` gains `routing.default`
(local|cloud). The header shows a CLOUD badge + LOCAL/CLOUD toggle when a key is
attached (plain LOCAL otherwise); the Cloud panel has the same toggle. "auto" in
every picker follows it (default label + actual routing), but **only the author
role routes** — research/utility/critic stay on their configured backends.

**Task 8 — Gamma affordances.** Audience + slide-count presets fold into the
existing brief flow (audience into the brief, count into `maxSlides`); a
per-slide "make it punchier" bolt in deck detail runs a scoped chat turn through
`runTurn`.

**Task 9 — brand upload surface.** Identity's Brand section uploads
crest/banner/watermark into gitignored `brand/logos/` and re-runs the same
`normalizeBrand()` the CLI uses (now exported from `tools/prep-brand.mjs`).
Uploads replace any earlier extension; remove falls back to placeholders. The
report renderer needs nothing extra — it preserves the donor's own VML
watermark byte-for-byte.

### Cloud structured output — the cross-cutting fix

Getting the standalone report working surfaced a real cloud-path bug: OpenAI-
compatible `json_object` is not Ollama's grammar. It 400s unless the prompt
contains the word "json" (the report planner never did), and even then only
guarantees output parses — the section writer returned `{"introduction":[…]}`
where the schema demanded `{"paragraphs":[…]}`. Both are fixed at the
transport: `cloudMessages` prepends a system message stating the schema
contract verbatim whenever `format` is set. In `docs/TRAPS.md`.

### Verification (all behavioural)

- `npm test` 73/73; `vite build` clean; the running API + Vite at :5174/:5173.
- CDP on the live app: Home has no chat rail; deck view has it plus the punch
  bolt; rail opens with the chat input; Identity shows Brand (Crest/Banner/
  Watermark cards) and Cloud (key, routing toggle); header shows the badge.
  All screenshots inspected with `mimo-v2.5` — no overlaps, clean layout.
- Particle field instrumented: loop runs, pointer repulsion responds, 60fps cap
  in place, reduced-motion static frame, hidden-tab pause.
- Cloud routing: `modelChoices` default flips with the preference; an unpicked
  author call routes to `deepseek-v4-flash`; utility stays local.
- `/api/reports` and `/api/decks/:slug/report/deck` exercised live on
  `deepseek-v4-flash`: a brief became an 8-section report (0 skipped) plus a
  companion deck plan. The verification deck was then removed (only the
  solar-water demonstration deck is committed).
- Crest verified by rendering both themes and looking at the PNGs, twice.

### Known open work

- **Deck writer image grounding** — the model emits image filenames for
  `image`/`image-text`/`compare` slides without writing the files. Still open.
- **Report UI section-reader** — generate/render/download exists (now including
  the standalone Report view); no reader for the `.docx` content itself.
- **Flow layout capacity** — six-step ttb cards still collide with the footer.
- **Task 7 (stretch) canvas slide-builder** — designed but not built; see the
  roadmap entry. It belongs over the existing `status: writing` SSE events, not
  a new pipeline: `generateFromPlan` would emit each validated slide as it
  lands and a storyboard view would render them.

### Gotchas

Full list in `docs/TRAPS.md`. New this session:

- **A supplied logo's alpha channel is not to be trusted — rebuild it from
  RGB.** The crest shipped at ~6% alpha everywhere (RGB intact); keying that
  keeps source alpha for saturated pixels preserves the defect. Real cutouts
  are alpha 0; anything with content gets alpha from colour.
- **`json_object` ≠ schema conformance.** Two traps on the cloud path: the
  provider 400s without the word "json" in the prompt, and the output shape is
  only "parses", not "matches the schema". Both fixed at the transport by
  stating the schema verbatim in a prepended system message. Keep cloud schemas
  small.
- **The vision subagent can misread a synthetic composite** while the real
  rendered artefact is correct — when an asset check and pixel data disagree,
  trust the pixel data (white marks on black were pixel-confirmed) and re-check
  against a real render.

## Context to read before starting

- `docs/ARCHITECTURE.md` §"The web shell", §"The cloud surface" and §"The brand
  surface" describe the shell's new subsystems; §"The report generator" now
  covers both extra doors.
- `docs/ROADMAP.md` — new ticked items: "Standalone reports", "Deck-from-report",
  "Structural chat commands", "Shell polish — rails, motion, cloud routing,
  brand surface", and the unchecked "Canvas slide-builder (stretch)".
- `src/ai/ops.js` — the ops layer including `duplicate_slide`.
- `src/ai/pipeline.js` — `createReport` and `createDeckFromReport`.
- `tools/prep-brand.mjs` — `normalizeBrand()` exported for the API.
- `src/ai/ollama.js` — `cloudMessages` schema-hint injection and routing.

## End-of-session state

- `config/local.yaml` (gitignored) holds the real OpenCode Go key, saved via
  the Settings panel, plus `routing.default`. The app works with the
  subscription out of the box on this machine. Remove it (Settings → Cloud →
  Remove) to hand the repo back to a machine without the subscription.
- `brand/logos/` holds the real marks (banner.jpeg, crest.png, watermark.png);
  `brand/generated/` is the normalised output. Both gitignored.
