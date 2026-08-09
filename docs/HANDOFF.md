# Handoff — for the next session

Read `CLAUDE.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

State at handoff: tree clean, 22 commits, no remote (local only).
`npm run dev` serves API on **:5174**, UI on **:5173**.
SearXNG runs at **:8888** — `docker compose -f docker/docker-compose.yml up -d`.

Two arcs. First the **foundation**: fonts, brand normalisation, theme system,
content schema, renderer, rasterisation, API and web UI (commits `acff5ec`
through `7d5d8c8`). Then the **generation pipeline** (`218c927` through
`76ceec8`): local metasearch, a role-addressed Ollama client, a deck-operation
layer, the turn primitive, and a two-stage generator.

**End-to-end validated.** From a one-line brief the pipeline planned and wrote a
9-slide deck in 24s with zero slides skipped, which then rendered and rasterised;
slides were inspected individually. Content is model-written, correctly themed,
chrome intact. Sample output is committed at `decks/raytracing-ai/`.

The hard-won part was constrained decoding. A single large-schema call failed in
escalating stages — token loops, runaway nesting, confabulated content, then an
outline that ran to 8192 tokens. None of it was fixed by sampling parameters.
The causes were grammar size, unbounded collections, and model choice. Full
taxonomy in `docs/TRAPS.md`; it is the most reusable thing here.

**Not validated:** the visual result of the UI redesign. The screenshot tool
failed for most of the session. Structure, tokens and fonts were confirmed via
`read_page` / `javascript_tool`; nobody has looked at the redesigned interface.

## Context to read before starting

- `CLAUDE.md` — the three-layer rule is the thing that must not be violated.
- `docs/ARCHITECTURE.md` — pipeline shape, the two rendering paths, deck/report
  asymmetry, why not LangChain.
- `docs/TRAPS.md` — read before debugging anything; several failures here look
  like different problems than they are.
- `themes/warm-humanist.yaml` — the format contract every other theme follows.
- `schema/deck.schema.json` + `src/validate.js` — the model's contract and the
  error text it will read.
- `src/layouts.js` — how a slide type is implemented; note the total absence of
  literal colours and font names.
- `reference/` — the institutional templates output is checked against.

## NEXT TASK — wire the pipeline into the UI

The pipeline works from Node but the UI cannot reach it. Per CLAUDE.md,
**discuss the concrete implementation before building**.

1. **API endpoints for generation** — `POST /api/decks` (brief → plan),
   `POST /api/decks/:slug/generate` (plan → deck). Both are long-running, so
   decide the transport up front: SSE is the natural fit and the chat panel will
   need streaming anyway. Do not add a polling endpoint chat will replace.
2. **Outline review UI** (`roadmap §2`) — `planDeck()` already returns a
   reviewable plan; this is now UI over an existing API. It gates generation, so
   it comes before chat.
3. **Collapsible rails** (`roadmap §2`) — build the right rail as a generic slot.
4. **Chat panel** (`roadmap §2`) — uses `runTurn`, per-deck threads, memory model
   already specified in the roadmap entry.
5. **Vision critic** (`roadmap §4`) — needs a vision-capable role; the author
   role is now a coder model with no vision.

**Look-ahead for step 1:** the streaming transport chosen here is the one the
chat panel inherits. `chat()` in `src/ai/ollama.js` already takes `onToken`, so
the plumbing exists — expose it as SSE once, not twice.

## Remaining known items

See `docs/ROADMAP.md` for the full list with rationale.

- **Generation in the UI** — endpoints, outline review, chat panel.
- **Vision critic** — needs its own vision-capable role.
- **19 remaining themes** — 15 native, 4 requiring the HTML plate renderer.
- **HTML plate renderer** — headless Chrome for blur/mesh effects OOXML cannot
  express; also unblocks `type: freeform`.
- **Report renderer** — donor-`.docx` approach, fixed section order.
- **Chat + inline editing** — right sidebar, per-deck threads.
- **Collapsible sidebars** — both rails.
- **Intake wizard** — replaces hand-written `meta.yaml`.
- **Per-slide presenter assignment** — free ranges, not an even split.

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **`npm run dev`** runs both processes. API is `FORGE_API_PORT` (5174), **not**
  `PORT` — harnesses inject `PORT` for the frontend and the API will steal it.
- **Express needs `node --watch`** (already wired). A stale API 404s new routes
  with no hint that it is stale.
- **A written `.pptx` proves nothing.** Always `npm run preview` and look at the
  PNG before claiming a render works.
- **PowerPoint autofit is not applied until a human opens the file** — sizing is
  baked in by `src/fit.js`, which only shrinks.
- **pptxgenjs takes bare hex**, no `#`. Use `hex()` from `src/theme.js`.
- **Brand marks:** `brand/generated/` is produced by `npm run brand` and is
  gitignored. If the crest looks like a white box, that tool has not been run.
- **Fonts:** `npm run fonts` is idempotent. Verify with `fc-match "<name>"`
  returning the name, not a fallback.
- **The screenshot tool may be dead.** Fall back to `read_page` /
  `javascript_tool` / `curl`. Do not report a UI as visually verified if it was
  not.
- **Only one theme exists.** Anything that assumes a populated gallery will look
  broken until more land.
- **SearXNG must be running** for research: `docker compose -f
  docker/docker-compose.yml up -d`. `searxngHealthy()` checks it.
- **Read `docs/TRAPS.md` before touching anything schema-constrained.** Every
  failure there cost real time and none were guessable.
- **The author role has no vision** (`qwen3-coder`). Anything reading images
  must request a vision-capable role explicitly.
