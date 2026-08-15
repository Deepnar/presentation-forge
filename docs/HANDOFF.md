# HANDOFF — deck-quality round 4: speaker script, geometry honesty, action-row clarity

Four user-testing findings shipped and verified. Commit history up to `9a2b76c`
on `origin/main`. Servers left running: UI :5173, API :5174 (restarted this
session — the --watch child had gone stale mid-session and served pre-change
code; kill the child and `npm run api` respawns with the current file). Local
models untouched; cloud `deepseek-v4-flash` used for the generation tests.

## 1. Speaker-script generator — the user's "script maker" idea

"Make a proper script too, at the end if the user wants, so if the person is
unable to tell from the ppt the connection, the script fills in the gaps."
`src/ai/script.js` writes `decks/<slug>/script.md`: one small-grammar call per
slide producing 60–90 seconds of spoken prose in the presenter's voice,
bridging the slide's bullets to the deck's argument and voicing the "so what"
the coherence pass only implies. It is a button, never automatic — Export's
"Speaker script" item and the deck-detail Script panel generate on demand; a
per-slide Regenerate rewrites just that slide's words after an edit.

- Per-slide blocks are delimited by invisible `<!-- slide:N -->` markers; a
  regen replaces exactly its own block and the file is rebuilt from deck
  order, so a deleted slide drops its block. Unwritten slides stay blockless
  (the panel shows "not written yet", never placeholder text).
- CLI `forge script <slug> [--slide N]`; API `GET`/`POST /api/decks/:slug/script`
  (SSE, abort-on-disconnect); download title-named via the existing route
  (which now falls back to the deck root for `script.md`); bundled in the .zip.
- Verified with the cloud author on a 14-slide data-centre deck: every slide
  written, addressed to its presenter (Farid's checklist closer, Ben's chart),
  figures drawn verbatim from the notes. The prompt's core instruction: write
  in the presenter's voice, never read the slide, voice the connection the
  bullets only point at.

## 2. Geometry honesty — a shape may only look like a measurement when it is one

The journey's sawtooth implied magnitudes its `sentiment` field never stated;
the funnel's bars narrowed index-linearly regardless of any value. The rule
now (audited across all geometry types, recorded in `docs/slide-type-audit.md`):

- **journey**: stages carry an optional numeric `value`. Every stage valued →
  a real line scaled to the values, each value captioned under its label.
  Any unvalued stage → a flat milestone rail (sentiment colours the nodes
  categorically, never position). Schema, catalog budgets/descriptions and the
  slide editor all carry the same rule.
- **funnel**: the taper comes from real numbers only when every stage carries
  one; otherwise equal-width steps.
- Qualitative types (roadmap, timeline, milestone, chronology, flow, pipeline,
  pyramid, venn, hierarchy, concept-map, diagram) are already honest — rails,
  flows and trees over categories. Chart/progress-bars/sparklines/etc. require
  their values by schema.
- **Grounding walks numbers as claims**: a chart value or journey value the
  research never states flags like any fabricated figure. The one structural
  exception is `depends_on` (integer indices), excluded by key. New tests cover
  chart values flagged, journey values flagged, dependency indices not.
- **The research view lists every figure the deck's data slides claim** (plain
  mono chips against the source table), so "are the graphs reflective of real
  numbers?" is answered before presenting. The deck-detail research card shows
  the count.
- **The slide editor now edits chart data directly** (kind, categories, series
  values) and journey values per stage — flattening a journey or fixing a
  chart figure is a hand edit that re-renders on save (CDP-verified: changed a
  chart value to 200/150/100/50, deck.yaml persisted, deck re-rendered).
- Verified with `mimo-v2.5` on a 7-slide fixture: categorical journey flat with
  all dots on the rail, valued journey falling 64→29 with captions, value-less
  funnel equal-width, valued funnel narrowing 4%→100%. All 307 tests pass.

## 3. The lightbox scroll jump — root cause found, not just patched

Opening the lightbox/editor/swap from a scrolled position scrolled the page
toward the top (CDP: main.scrollTop 1773 → 628). Root cause: `main`'s
`view-in` animation used `animation-fill-mode: both`, which retains the
animated `transform` (even the identity matrix) after it finishes — and any
transform on a scroll container makes it a containing block for `position:
fixed` descendants. The overlays mount inside `main`, so they positioned
against scrolled `main` instead of the viewport. Fix: `backwards` fill mode
(fills only during the animation). Verified: scroll to the last slide, click,
scrollTop unchanged, overlay covers the exact viewport. See TRAPS for the
reusable version.

## 4. Deck-detail action row — five questions answered by construction

- **Render** disabled "Up to date" until deck.yaml (or theme/style/mode)
  changes, with an accent dot when a render is pending. The server computes the
  deck.yaml-vs-pptx half from mtimes; theme/style/mode changes flip it
  client-side.
- **Re-sweep** enables only when the chosen density differs from the density
  the content was last written at — the "we didn't change the setting, yet we
  can still click it" fix.
- **Export ▾** holds exactly PDF / Markdown (.md) / Bundle (.zip) / Speaker
  script (.md). Clone / Versions / Dark mode moved behind a ⋯ ellipsis menu.
- **Report panel**: one action — "Generate report" / "Generate / Update
  report" — writes, renders and downloads the .docx in one click. The separate
  "Render .docx" step and the duplicate download link are gone.
- CDP-verified: Re-sweep greyed then enabled on a density change; Render
  "Up to date" then "Render" with a dot on a theme change; Export menu holds
  exactly the four items.

## Open items / notes for the next session

- The `docs/slide-type-audit.md` round-4 addendum records the geometry-honesty
  verdicts; re-run `node tools/slideqa.mjs` + a vision pass before claiming a
  future layout change is verified.
- The speaker script is a text artefact; it is not re-grounded (the deck is).
  A future pass could run the script's figures through `groundDeck` too, but
  spoken prose paraphrases numbers ("three point six times") so exact matching
  would need the same normalize-as-words treatment the deck gets.
- The script prompt targets 60–90s per content slide; divider slides get a
  short 15–30s transition by instruction, not by schema. If a real script
  reads too long/short, the timing note in `writerSystem()` is the only knob.
- The stale `node --watch` child this session is a reminder: `git checkout` /
  `cp` on a watched file can leave the running server on an intermediate state.
  After any file surgery on the server, verify `GET /api/decks/:slug/script`
  and the `dirty` key before concluding an endpoint is live.
- Local models untouched, no qwen. Model discipline held: flash codes ONLY,
  mimo-v2.5 vision ONLY, cloud for generation tests.
