# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, which will save you hours. Then
the sections below. This file is overwritten at the end of every session; git
history preserves older handoffs.

## Session summary

State at handoff: **committed.** The chat panel is built, verified end-to-end
against a real deck, and the roadmap item is ticked.

**Chat panel (built).** `src/ai/chat.js` is the per-deck thread orchestrator,
shared by the API and the CLI. One turn is `runTurn` (the same primitive the
vision critic uses) fed a replay history built per the roadmap's memory model:

- **State** — `deck.yaml` + theme voice + `meta.yaml` are the memory.
- **Recent** — the last 10 user turns verbatim in `decks/<slug>/chat.jsonl`.
- **Durable** — standing prefs in `decks/<slug>/decisions.md`, extracted each
  turn by the `utility` role (`qwen3:4b-instruct`) with a tiny bounded schema.
  One-off requests are never promoted; promoted instructions leave the replay
  window (they already sit in decisions.md, which `runTurn` feeds as system).
- **Rolling summary** — turns past the window fold into a `summary` record at
  the top of chat.jsonl (another utility call), so a long session degrades
  gracefully instead of truncating.

The seam from the roadmap is enforced in code: `runChatTurn` refuses a missing
`deck.yaml` — turn = edit an existing deck, generate = build from empty, and
they are not merged. A broken deck.yaml is not silently loaded either: the turn
prepends the validation errors as a repair demand and only writes back a
validated deck.

Endpoints (SSE over POST, same `startSSE` transport as generation): streamed
`token` frames, `status` frames (reading/editing/rendering), a `result` frame
with changes/diff/stats/re-rendered previews, and abort-on-disconnect via the
shared AbortController. Plus `GET`/`DELETE /api/decks/:slug/chat` for the
thread, and `GET /api/models` for the picker. CLI: `forge chat <slug>
"<instruction>" [--model <id>] [--no-render]`.

Frontend: `app/web/src/components/ChatPanel.jsx` fills the right-rail slot —
streamed token block, Stop, retry ("re-run the last instruction"), edit-and-
resend on each user turn, model picker (installed models + "auto" default),
per-turn token stats, "earlier · summarised" collapse, a "standing decisions"
collapse, and a rendered-thumbnails strip after each turn. The deck detail in
the centre re-fetches when a chat turn lands (a `refreshToken` bump from App).

`npm test` is real now: `node --test` runs `test/chat.test.js` (8 tests) on the
pure thread-memory functions (JSONL round-trip, window retirement, replay
history, promotion flagging, broken-deck instruction assembly).

**Verified behaviourally.** On `decks/raytracing-ai` (then restored): a full SSE
turn streamed tokens → rendered → returned previews with zero problems; a client
abort at 2s stopped the model call with no unhandled rejection and a healthy
server; 11 consecutive turns left exactly the last 10 in chat.jsonl plus a
summary record; a durable instruction was promoted to decisions.md while one-off
edits were not. The rendered deck passed a vision-model defect check
(`opencode-go/mimo-v2.5`) with no findings. The UI compiles (`vite build`) and
the dev stack serves with the Vite proxy forwarding `/api/*` to the API, but
**the chat panel itself was not visually inspected** — no browser tool is
available to this CLI, so the UI was verified structurally (build + every
endpoint it calls exercised) and via server-side checks, not screenshots.

**Not validated:** the UI visually, and anything not on `warm-humanist`. The
`getImageSize`-style fitter behaviour for very long chat-edited headlines
(beyond what the existing decks contain) is covered by the same fitter that the
critic loop audits, but a stress run of pathological edits has not been done.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — vision-model trust, pixel-analysis limits, fit traps, and
  the browser-tool trap (this CLI has no browser tool; do not claim visual
  verification when only structural checks were done).
- `src/ai/chat.js` — the thread orchestrator; the pure functions
  (`retireOldTurns`, `buildReplayHistory`, `maintainThreadState`) are exported
  for tests.
- `src/ai/turn.js` — the turn primitive both chat and the critic share.
- `src/ai/identity.js` — `loadIdentity`/`deepMerge` extracted from pipeline.js
  so chat.js could use them without a static import cycle.
- `docs/ROADMAP.md` §2 "Chat panel" (ticked, with Learned) and §4 (turn
  primitive seam).

## NEXT TASK — inline editing, then themes

The chat panel fills the right rail. Next in priority order (from the roadmap):

1. **Inline editing** (deck detail), **per-slide presenter assignment**, slide
   reorder/delete/duplicate. Inline editing deliberately writes `deck.yaml`
   directly and re-renders — it must NOT wake a model. `POST /api/validate`
   already exists so the editor can show schema errors while typing.
2. **Themes.** 15 native (mostly YAML), 4 blocked on the plate renderer. Render
   each before ticking it; re-check heading spacing per theme and per style.
3. **HTML plate renderer** — headless Chrome; unblocks the four blur-based
   themes and freeform slides. Build once, for both callers.

**Look-ahead already recorded:** `runTurn` is the shared primitive for chat and
the critic. `runChatTurn` is deliberately NOT the generate path — chat edits an
existing deck (`deck.yaml` required), `generateFromPlan` builds one from an
approved plan. Keep them separate.

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

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
- **No browser tool in this CLI.** UI claims must be structural (build, API
  calls) unless a real screenshot was taken and inspected.
- **A written `.pptx` proves nothing.** Rasterise and look (the preview PNGs are
  LibreOffice's own render, so they match what LibreOffice shows).
- **Stacked text must be fit-scaled or line-counted.** Never
  `fitScale(text, w, 99, st)` to detect wrapping — count lines.
- **Commit before any history rewrite.** `filter-repo --force` resets the tree.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.** Express needs
  `node --watch`.
- **Never add an unbounded array or a bare `{type:"object"}` to a model-facing
  schema.** Always check `done_reason`. The author role has no vision.
- **Only one theme exists.** Anything assuming a populated gallery looks broken.
- **SearXNG must be running** for research (`npm run searxng`).
- **Background dev servers in this shell hang the next command.** Start
  `npm run dev` and immediately `kill` the process group; the persistent shell
  waits on background children otherwise.
