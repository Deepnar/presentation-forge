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

**Vision critic loop (built).** `src/ai/critic.js` turns the manual QA into the
integrated loop: render → critique each slide PNG against a small bounded
findings schema → convert findings into a `runTurn` instruction → re-render →
re-critique, capped at two rounds. Wired into `generateFromPlan` and the CLI:
`forge generate <slug> --critic`. Reuses the turn primitive (no separate fix
path). Default critic is local `gemma4:26b-a4b-it-q4_K_M`; cloud opt-in via
model override. Validated both halves: full loop ran clean on a real deck
(~24s for 2 slides), and `runTurn` applied a valid edit from a critic-style
instruction. The loop returns the final preview so callers show fixed slides.

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

## NEXT TASK — intake wizard, then the shell/rails and chat

The outline gate and the vision critic are both live; the roadmap's remaining
UI items stand in dependency order. **Discuss the concrete implementation
before building.**

1. **Intake wizard.** `NewDeck.jsx` already collects brief + sources + theme.
   The roadmap item needs the identity half: team, subject, guide, academic
   year, pre-filled from `config/identity.yaml`, frozen into `meta.yaml`. The
   pipeline's `createDeck` already writes `meta.yaml` — extend it, don't bypass
   it.
2. **Application shell — collapsible rails.** Left nav collapses to an icon
   rail; right panel (chat) collapses to an edge tab; both persist. Build the
   right rail as a *generic slot*, not a chat drawer. Blocks chat.
3. **Chat panel.** Uses `runTurn` on `deck.yaml`. Memory model already
   specified in the roadmap (state over transcript; `deck.yaml` is memory,
   `chat.jsonl` for recent turns, `decisions.md` for durable prefs). Inherits
   the SSE transport from `startSSE`.
4. **Inline editing** (deck detail), **per-slide presenter assignment**, slide
   reorder/delete/duplicate — separate from chat, writes `deck.yaml` directly.
5. **Themes.** 15 native (mostly YAML), 4 blocked on the plate renderer. Render
   each before ticking it; re-check heading spacing per theme.

**Look-ahead already recorded:** `runTurn` is the shared primitive for chat and
the critic (both now proven). `generateDeck` deliberately does *not* use it —
the seam is: **turn = edit an existing deck; generate = build one from empty.**

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Intake wizard** — identity half of the entry form still to build.
- **Collapsible rails** — blocks the chat panel.
- **Chat panel** — streamed tokens, stop, retry, visible tool calls, model
  picker, context indicator.
- **Inline editing + presenter assignment + slide reorder/delete/duplicate.**
- **19 remaining themes** — 15 native (mostly YAML), 4 blocked on the plate
  renderer. Render each before ticking it.
- **HTML plate renderer** — headless Chrome; unblocks both the four blur-based
  themes *and* freeform slides. Build once, for both callers.
- **Freeform slides** — the "completely free" mode, per-slide and whole-deck.
- **Report renderer** — donor-`.docx`, fixed section order, no themes. A
  different review surface from the deck grid.
- **Shared research** — one brief feeding both deck and report; the research
  artefact now exists at `decks/<slug>/research/`.

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
