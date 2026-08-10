# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed.** Vision QA is working and the reported layout
overlap is fixed and verified.

**Vision MCP — working.** The opencode-vision plugin now delegates visual checks
to `opencode-go/mimo-v2.5` (persisted in
`~/.config/opencode/vision-model-image.txt`). Two config lessons were needed:

- `~/.config/opencode/opencode.jsonc` `model` must be a **non-vision** model
  (`opencode-go/deepseek-v4-flash`) — the plugin skips registering `vision-*`
  subagents when the configured main model can see images.
- `~/.config/opencode/config.json` registers the ollama vision models with
  `modalities: { input: ["image", "text"] }` — `attachment: true` alone puts
  them in the picker but the read tool still rejects the image.

The delegation is exercised via `task({ subagent_type: "vision-opencode-go-mimo-v2.5", ... })`
with a prompt-local JSON response template. Local models (`gemma4:26b-a4b-it-q4_K_M`,
`qwen3.6:27b`) are registered too; **`qwen3-vl:8b-thinking` is unreliable for QA**
(false-clean verdicts) and should not be used.

**Overlap fixed.** The user reported slides 4–5 of a generated deck overlapping
in LibreOffice. Root causes, all in `src/layouts.js`:

- `cards` and `compare` card titles were **not fit-scaled** — a title long
  enough to wrap rendered its second line over the body. Now fit to stay within
  their boxes (shrink-only, min 0.55).
- `stats` stacked value/label/sub at fixed offsets with no fit — a wrapping
  value hit its label. Value and label now fit.
- `heading()` advanced y by one line even when the headline wrapped: its
  wrap-detection used `fitScale(text, w, 99, st)`, which can never return < 1
  (a huge height never binds), so a 2-line headline's standfirst overlapped its
  own second line. Now counts lines at the fitted size and reserves the real
  height. **Lesson:** never "detect wrapping" with an unbounded-height
  `fitScale` — count lines instead.

**Verified.** All decks re-rendered and inspected. MiMo confirmed clean on the
reproduction (long card title), raytracing-ai cards/compare, and
mechanical-keyboards cards/stats. Pixel band-analysis found the bugs and the
fixes but has false positives (eyebrow-above-headline, card boundaries) — use
it to target a vision model, not as the sole judge. `decks/zz-overlap-test/`
(the reproduction fixture) was removed; the layout is verified by the real
decks.

**Cloud backends (new).** `src/ai/ollama.js` is now backend-aware. Each role in
`config/models.yaml` resolves to local Ollama by default or an opt-in
`openai-compatible` provider (`provider: <name>`), which speaks
`/chat/completions` with `response_format: json_object` instead of a decoding
grammar. Streaming and image parts work on both. Keys come from env
(`env:OPENAI_API_KEY`), never the config. Verified against Ollama's own `/v1`
endpoint: non-stream chatJSON, streaming, and a full `forge new` plan all pass;
the default Ollama path is unchanged. README + ARCHITECTURE updated.

**Not validated:** the visual result of the UI, and anything not on the
`warm-humanist` theme (the only theme that exists). The heading change moves
2-line-headline content down slightly — fine on warm-humanist, re-check when
more themes land.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — new entries on vision-model trust, pixel-analysis limits,
  unfitted stacked text, and the opencode-vision config traps.
- `src/layouts.js` — `heading()` (~line 82), `cards` (~226), `compare` (~270),
  `stats` (~330): the layouts touched this session. Note the total absence of
  literal colours/fonts.
- `src/fit.js` — `fitScale`/`fitScaleAll`/`lineCount`/`measure`.
- `docs/ROADMAP.md` §4 "Vision critic loop" — the manual QA prototype is proven;
  the item is the integrated loop.
- The generation pipeline and outline review from the previous session
  (`src/ai/pipeline.js`, `app/server/index.js`, `app/web/src/views/Outline.jsx`).

## NEXT TASK — build the real vision critic

The manual QA loop this session used is the prototype for the roadmap item.
Concrete shape to discuss before building:

1. **Critic role + bounded findings schema.** Reuse `chat({ role: "critic",
   model, images })`. Default model should be the persisted vision choice
   (`opencode-go/mimo-v2.5`) with a local fallback (`gemma4:26b-a4b-it-q4_K_M`).
   Findings schema small and bounded (`maxItems`, `maxLength` on every field).
2. **Wiring.** Feed rendered PNGs to the critic after `generateFromPlan`, apply
   fixes via `runTurn` (the seam: critic's instruction is a turn), cap at two
   rounds, re-render between rounds.
3. **Surface.** A CLI flag and a button in the deck detail UI. The pipeline must
   stay headless-first (`app/server` is a thin transport).

Then the roadmap's remaining UI items in dependency order: intake wizard
identity half, collapsible rails, chat panel, inline editing / presenter
assignment / slide reorder.

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Vision critic loop** — prototype proven; integrate the loop.
- **Intake wizard** — identity half (team, subject, guide, year) of the entry
  form; brief+sources+theme already exists (`NewDeck.jsx`).
- **Collapsible rails** — blocks the chat panel.
- **Chat panel** — uses `runTurn`; inherits the SSE transport from `startSSE`.
- **Inline editing + presenter assignment + slide reorder/delete/duplicate.**
- **19 remaining themes** — 15 native (mostly YAML), 4 blocked on the plate
  renderer. Render each before ticking it; re-check heading spacing per theme.
- **HTML plate renderer**, **freeform slides**, **report renderer**,
  **shared research** (research artefact exists at `decks/<slug>/research/`).

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **Vision QA:** prefer `opencode-go/mimo-v2.5` or `gemma4:26b-a4b-it-q4_K_M`;
  never trust `qwen3-vl:8b-thinking` for defect-finding (false-clean).
- **Vision plugin needs a restart** to pick up config; the `model` in
  `opencode.jsonc` must stay non-vision or no subagents register, and the ollama
  vision entries need `modalities.input: ["image", "text"]`.
- **A written `.pptx` proves nothing.** Rasterise and look (the preview PNGs are
  LibreOffice's own render, so they match what LibreOffice shows).
- **Stacked text must be fit-scaled or line-counted.** A text box with a fixed
  height and un-shrunk content wraps into whatever is below it.
- **Never `fitScale(text, w, 99, st)` to detect wrapping.** Count lines.
- **Commit before any history rewrite.** `filter-repo --force` resets the tree.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.** Express needs
  `node --watch`.
- **Never add an unbounded array or a bare `{type:"object"}` to a model-facing
  schema.** Always check `done_reason`. The author role has no vision.
- **Only one theme exists.** Anything assuming a populated gallery looks broken.
- **SearXNG must be running** for research (`npm run searxng`).
