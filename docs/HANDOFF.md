# Handoff — for the next session

Read `CLAUDE.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary (committed & pushed)

State at handoff: **tree clean, 32 commits, pushed to
https://github.com/Deepnar/presentation-forge** (public).
`npm run dev` serves API on **:5174**, UI on **:5173**.
SearXNG on **:8888** — `npm run searxng`.

This session took the project from nothing to a working end-to-end generator.

**Foundation** (`acff5ec`…`7d5d8c8`) — 27 typefaces installed from a manifest;
brand-mark normalisation with white-keying and a reversed variant; the
`tokens`/`voice` theme format; a 15-type content schema whose validation errors
are written as model correction prompts; the renderer with a locked chrome pass
and a shrink-only text fitter; LibreOffice rasterisation; Express API; React UI
for decks, themes and identity; a keyboard-driven slide lightbox.

**Generation pipeline** (`218c927`…`76ceec8`) — SearXNG metasearch with
Readability extraction; a role-addressed Ollama client; a transactional deck
*operations* layer; the `runTurn` primitive; and a two-stage generator
(plan → write one slide per call).

**Publication** (`a7868a1`…`a9d9a9f`) — identity and brand marks moved out of the
repository behind a committed template and a placeholder generator; history
scrubbed; institution-specific details removed from source; README and MIT
licence.

**Validated behaviourally, not just compiled.** From a one-line brief the
pipeline planned and wrote a 9-slide deck in **24s, zero slides skipped**, which
rendered and rasterised; slides were inspected individually. Sample committed at
`decks/raytracing-ai/`. Six defects were found *by looking at rendered output*
and fixed: crest alpha, dark-background wordmark, crest legibility at 0.62in,
single-series chart colours, a lightbox keystroke-dropping bug, and a watermark
composite that sized its overlay from the untrimmed canvas.

**The expensive lesson was constrained decoding.** A single large-schema call
failed in escalating stages — token loops, runaway nesting, confabulated
content, then an outline that consumed 8192 tokens. *None* of it was fixed by
sampling parameters. The causes were grammar size, unbounded collections, and
model choice. Full taxonomy in `docs/TRAPS.md`; it is the most reusable artefact
here and applies to OpenAI and Anthropic structured output equally.

**Not validated:** the visual result of the UI redesign. The browser screenshot
tool failed for most of the session. Structure, design tokens, fonts and
keyboard behaviour were confirmed via `read_page` / `javascript_tool` / `curl`,
but nobody has *looked* at the redesigned interface. Treat it as unverified.

**A mistake worth not repeating:** `git filter-repo --force` was run with
uncommitted changes and reset the working tree, destroying local copies of
`reference/`, `brand/logos/`, `config/identity.yaml` and four un-committed
edits. All were recovered (reference material from `~/Downloads`, brand marks
re-extracted from the report `.docx`), but **commit before any history rewrite**.

## Context to read before starting

- `CLAUDE.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — read *before* debugging anything schema-constrained or
  render-related. Several failures present as a different problem than they are.
- `docs/ARCHITECTURE.md` — pipeline shape, the two rendering paths, deck/report
  asymmetry, why not LangChain.
- `src/ai/ops.js` — `buildOpsSchema` derives the model's grammar from
  `deck.schema.json` per turn, narrowed by deck state and slide type. The
  narrowing is load-bearing, not an optimisation.
- `src/ai/generate.js` — the two-stage generator, and the comment explaining
  why it is two stages.
- `src/ai/turn.js` — the shared primitive chat and the critic both use.
- `themes/warm-humanist.yaml` — the format contract every theme follows.
- `src/layouts.js` — note the total absence of literal colours and font names.

## NEXT TASK — wire the pipeline into the UI

The pipeline works from Node but the UI cannot reach it. Per `CLAUDE.md`,
**discuss the concrete implementation before building** — the roadmap entries
are intent, not specs.

1. **Generation endpoints.** `POST /api/decks` (brief → plan) and
   `POST /api/decks/:slug/generate` (plan → deck). Both are long-running.
   **Decide the streaming transport first** — it is the one the chat panel
   inherits, so choosing it twice means rewriting one. SSE is the natural fit;
   `chat()` in `src/ai/ollama.js` already takes an `onToken` callback, so the
   plumbing exists. Do not add a polling endpoint chat will replace.
2. **Outline review UI.** The human gate. `planDeck()` already returns a
   reviewable plan (`{title, sections, slides:[{type, section, purpose}]}`), so
   this is UI over an existing API. It gates generation, so it lands before chat.
3. **Collapsible rails.** Left nav to an icon strip, right panel to an edge tab,
   both persisted. Build the right rail as a *generic slot*, not a chat drawer.
4. **Chat panel.** Uses `runTurn`. Per-deck threads. Memory model is already
   specified in the roadmap — state over transcript, `deck.yaml` read fresh each
   turn, durable preferences promoted into `decisions.md`.
5. **Vision critic.** Needs its own vision-capable role and a small bounded
   findings schema.

**Look-ahead already recorded:** `runTurn` is the shared primitive for chat and
the critic. `generateDeck` deliberately does *not* use it — planning and
per-slide writing need their own narrow schemas, which is the entire reason the
two-stage design works. The seam is: **turn = edit an existing deck; generate =
build one from empty.**

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Generation in the UI** — endpoints, outline review, chat, inline editing.
- **Collapsible rails** — blocks the chat panel.
- **19 remaining themes** — 15 native (mostly YAML), 4 blocked on the plate
  renderer. Render each before ticking it.
- **HTML plate renderer** — headless Chrome; unblocks both the four blur-based
  themes *and* freeform slides. Build once, for both callers.
- **Freeform slides** — the "completely free" mode, per-slide and whole-deck.
- **Report renderer** — donor-`.docx`, fixed section order, no themes. A
  different review surface from the deck grid, not the same one with new data.
- **Shared research** — one brief feeding both deck and report.
- **Per-slide presenter assignment** — free ranges, not an even split.
- **Intake wizard** — replaces hand-written `meta.yaml`.
- **Vision critic** — closes the quality loop.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **Commit before any history rewrite.** `filter-repo --force` resets the
  working tree and discards uncommitted work. This already cost one recovery.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.** Dev harnesses inject
  `PORT` for the frontend; an API that claims it leaves the browser hitting
  Express with `Cannot GET /`, which reads as a routing bug.
- **Express needs `node --watch`** (already wired). A stale API 404s new routes
  with no hint that it is stale.
- **A written `.pptx` proves nothing.** Always `npm run preview` and *look* at
  the PNG. Valid YAML, passing schema and a written file all pass while the
  output is unusable.
- **Never add an unbounded array or a bare `{type:"object"}` to a model-facing
  schema.** Both produce runaway generation under constrained decoding. Bound
  every collection, `maxLength` every string.
- **Always check `done_reason`.** `length` means truncated; anything else means
  the model meant it. Without it, a runaway grammar looks like malformed output
  and the obvious fix is exactly backwards.
- **The author role (`qwen3-coder`) has no vision.** Anything reading images
  must request a vision-capable role explicitly.
- **`brand/logos/`, `config/identity.yaml` and `reference/` are gitignored** and
  exist only locally. `npm run brand` generates neutral placeholders when marks
  are absent, so a clone renders — if the crest looks like a plain shield, that
  is the placeholder, not a bug.
- **Only one theme exists.** Anything assuming a populated gallery looks broken.
- **SearXNG must be running** for research (`npm run searxng`).
  `searxngHealthy()` checks it.
- **The browser screenshot tool may be dead** for a whole session. Fall back to
  `read_page` / `javascript_tool` / `curl`, and never report a UI as visually
  verified when it was only checked structurally.
