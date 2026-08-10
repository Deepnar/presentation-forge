# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary (uncommitted)

State at handoff: **uncommitted work staged in the working tree.** The previous
state was tree-clean and pushed to https://github.com/Deepnar/presentation-forge.

This session renamed the agent instructions and wired the generation pipeline
into the UI.

**Agent instructions** (`CLAUDE.md` → `AGENTS.md`). `CLAUDE.md` moved to
`AGENTS.md` so any agent that reads the standard file name gets the working
agreement; `docs/HANDOFF.md` references updated.

**Generation endpoints + outline review — the vertical slice.** The pipeline
previously ran only from Node; this session gave it the human gate in the UI.

- `src/ai/generate.js` — `generateDeck` now takes an explicit `plan` and runs
  `sanitizePlan` over both the planner's output and a human-edited outline, so
  the two cannot drift.
- `src/ai/pipeline.js` (new) — shared orchestration for CLI and API:
  `createDeck` (slug → research → plan, saved as `plan.yaml`), `generateFromPlan`
  (slides → validated `deck.yaml` → render → rasterise). `loadIdentity`,
  `runResearch`, `slugify`, `uniqueSlug`. Research persists as a first-class
  artefact at `decks/<slug>/research/notes.md` + `sources.json` — the primitive
  the roadmap's "shared research" item will need.
- `app/server/index.js` — `POST /api/decks` and `POST /api/decks/:slug/generate`
  stream Server-Sent Events over a POST body; `GET /api/types` returns the slide
  type enum for the review UI. Socket close aborts the pipeline via a
  request-scoped `AbortController`.
- `app/web/src/api.js` — `stream()` SSE client (fetch reader, dispatch per
  event, `error` frame rejects, returns `{promise, abort}`), plus
  `createDeck` / `generate` / `types`.
- `app/web/src/views/NewDeck.jsx` — brief form (brief, source URLs, theme, max
  slides, research toggle) streaming research/planning progress.
- `app/web/src/views/Outline.jsx` — the human gate: editable title, sections,
  per-slide type/section/purpose, reorder, approve → streamed generation.
- `app/web/src/views/Decks.jsx` — "New deck" entry, phase routing
  (list → new → outline → detail), empty-state action.
- `package.json` — `npm run forge` CLI (`node src/ai/pipeline.js`) for headless
  parity: `forge new "<brief>"`, `forge generate <slug>`.

**Validated behaviourally.** Ollama and SearXNG were both running. CLI
`forge new` planned a deck in ~8s; `forge generate` wrote and rendered 4 slides
in ~7s. API tested with curl: create (with and without a research pass),
generate (streamed `status` events → `result` with slide URLs), error path
(blank brief → `event: error`), and abort-on-disconnect (curl killed mid-run;
server survived and the deck stayed in `status: planned` with no `deck.yaml`).
SSE verified through the Vite dev proxy. `vite build` passes. Test decks were
removed; only the committed samples (`raytracing-ai`, `gpu-demo`) remain.

**Not validated:** the *visual* result of the new views and the rendered decks.
The authoring model on this session cannot read images, so the rendered PNGs
were never looked at. Do `npm run preview` and inspect before trusting the
outline-review result. The browser-screenshot route may also be dead again —
fall back to structural checks.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — read *before* debugging anything schema-constrained or
  render-related. Several failures present as a different problem than they are.
- `docs/ARCHITECTURE.md` — pipeline shape, the two rendering paths, the
  plan-as-disk-boundary lifecycle.
- `src/ai/pipeline.js` — the orchestrator both front-ends share; `createDeck`
  and `generateFromPlan` are the seams new endpoints and the intake wizard hang
  off.
- `src/ai/generate.js` — `sanitizePlan` is the single shape both the planner's
  output and human-edited outlines pass through.
- `src/ai/turn.js` — the shared primitive chat and the critic both use.
- `app/server/index.js` — `startSSE` is the transport contract; the chat panel
  inherits it, so change it only if chat forces the issue.
- `app/web/src/views/NewDeck.jsx` and `Outline.jsx` — the review surface.

## NEXT TASK — the rest of the generation surface

The outline gate is in; the roadmap's remaining UI items stand in dependency
order. **Discuss the concrete implementation before building.**

1. **Intake wizard.** `NewDeck.jsx` already collects brief + sources + theme.
   The roadmap item needs the identity half: team, subject, guide, academic
   year, pre-filled from `config/identity.yaml`, frozen into `meta.yaml`. The
   pipeline's `createDeck` already writes `meta.yaml` — extend it, don't bypass
   it.
2. **Application shell — collapsible rails.** Left nav collapses to an icon
   rail; right panel (chat) collapses to an edge tab; both persist. Build the
   right rail as a *generic slot*, not a chat drawer. Blocks chat.
3. **Chat panel.** Uses `runTurn` on `deck.yaml`. Memory model already
   specified in the roadmap (state over transcript). Inherits the SSE transport
   from `startSSE`.
4. **Vision critic.** A `runTurn` call whose instruction comes from a vision
   model looking at rendered PNGs. Needs `gemma4:26b-a4b-it` (vision role),
   a small bounded findings schema, and a two-round cap.
5. **Inline editing** (deck detail), **per-slide presenter assignment**, slide
   reorder/delete/duplicate — separate from chat, writes `deck.yaml` directly.

**Look-ahead already recorded:** `runTurn` is the shared primitive for chat and
the critic. `generateDeck` deliberately does *not* use it — the seam is: **turn
= edit an existing deck; generate = build one from empty.**

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Intake wizard** — identity half of the entry form still to build.
- **Collapsible rails** — blocks the chat panel.
- **Chat panel** — streamed tokens, stop, retry, visible tool calls, model
  picker, context indicator.
- **Vision critic** — closes the quality loop.
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

- **Commit before any history rewrite.** `filter-repo --force` resets the
  working tree and discards uncommitted work. This already cost one recovery.
- **The plan is a disk boundary.** A planned deck has no `deck.yaml`; if the
  UI's list doesn't show a planned deck that's correct behaviour, not a bug.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.** Dev harnesses inject
  `PORT` for the frontend; an API that claims it leaves the browser hitting
  Express with `Cannot GET /`.
- **Express needs `node --watch`** (already wired). A stale API 404s new routes
  with no hint that it is stale.
- **A written `.pptx` proves nothing.** Always `npm run preview` and *look* at
  the PNG. Valid YAML, passing schema and a written file all pass while the
  output is unusable. The authoring model on the last session could not read
  images — this check is still owed.
- **Never add an unbounded array or a bare `{type:"object"}` to a model-facing
  schema.** Both produce runaway generation under constrained decoding.
- **Always check `done_reason`.** `length` means truncated; anything else means
  the model meant it.
- **The author role (`qwen3-coder`) has no vision.** Anything reading images
  must request a vision-capable role explicitly.
- **SSE over POST:** keep the server's `startSSE` guards (`writableEnded` /
  `destroyed`) and the client's frame parser intact — dropping either makes a
  cancelled request crash or hang the response.
- **Only one theme exists.** Anything assuming a populated gallery looks broken.
- **SearXNG must be running** for research (`npm run searxng`).
- **The browser screenshot tool may be dead** for a whole session. Fall back to
  structural checks and never report a UI as visually verified when it was only
  checked structurally.
