# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`, then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

State at handoff: **work-in-progress, mid-investigation.** The previous session
wired generation + outline review into the UI (committed). This session added
local vision QA and set up the vision MCP; an overlap investigation is
**unresolved** and needs a vision-capable look at two slides.

**Vision MCP setup (needs opencode restart to take effect).**
`~/.config/opencode/config.json` now registers the local vision models on the
ollama provider with `attachment: true`:

- `qwen3-vl:8b-thinking` — vision, 8.8B
- `gemma4:26b-a4b-it-q4_K_M` — vision, 25.8B (this is the repo's designated
  critic role in `config/models.yaml`)
- `qwen3.6:27b` — vision, 27.8B

The vision plugin's picker now offers `ollama/qwen3-vl:8b-thinking` and
`ollama/gemma4:26b-a4b-it-q4_K_M` (capped at two per provider), and
`ollama/gemma4:26b-a4b-it-q4_K_M` is persisted as the choice in
`~/.config/opencode/vision-model-image.txt`. **After restarting opencode**, the
`vision-ollama-*` subagents will be registered and visual checks can be
delegated via the plugin; until then the task tool rejects them
("Unknown agent type").

**Vision QA so far.** The authoring model on this session is text-only, so
rendered slides were checked via local vision models called directly through
`src/ai/ollama.js` (the repo's own client). Results:

- `qwen3-vl:8b-thinking` is **unreliable for QA**: it reported all slides
  "clean" on a render the user says had real overlap. Do not trust it for
  defect-finding.
- `gemma4:26b-a4b-it-q4_K_M` and `qwen3.6:27b` are larger and more detailed,
  but they also reported the current renders clean.
- One-off QA scripts live in `/tmp/opencode/` (`qa-model.mjs` calls a named
  model on one image; `qa-all.mjs` loops a deck's slides against expected
  headlines).

**The overlap problem — unresolved.** The user reported that slides 4 and 5 of
the FIRST `mechanical-keyboards-as-typing-ergonomics` render (slide 4 = `cards`,
slide 5 = `stats`) had overlapping text, seen by opening the `.pptx` in
LibreOffice. That render was deleted; a regenerated deck has different content
(current slide 5 is a `section`), so the exact reproduction is gone.

A deliberate reproduction deck exists at `decks/zz-overlap-test/` — a `cards`
slide whose first card title is 39 chars ("Superior Typing Feedback Mechanisms
for"). **Pixel analysis of `decks/zz-overlap-test/out/preview/slide-2.png`
showed the title on ONE line, no overlap in that render.** So the bug did not
reproduce at the schema max of 40 chars on warm-humanist.

**Root-cause hypothesis (code-level, unconfirmed visually):** in
`src/layouts.js`, the `cards` title (line 246) and `compare` titles are NOT
fit-scaled — only the body is. A title long enough to wrap in a card column
renders its second line into the body box (body starts at `ty+0.54`), which
would overlap. The `stats` layout (line 331) stacks value/label/sub at fixed
offsets with no fit; a value that wraps in a narrow column could collide with
its label. **Confirm by looking at a wrapped-title reproduction** (crop a card
column at `src/layouts.js` card geometry and inspect), then fix by fitting the
titles to one line (shrink-only) so a wrap is impossible.

**Next actions after restart:**

1. Confirm the `vision-ollama-*` subagents are registered (persisted model =
   `ollama/gemma4:26b-a4b-it-q4_K_M`).
2. Look at `decks/zz-overlap-test/out/preview/slide-2.png` (first card) and the
   current `mechanical-keyboards-as-typing-ergonomics` slides 4–5 and settle
   whether overlap is actually present.
3. If the cards-title wrap reproduces (try ~40 chars with several narrow cards,
   or check the `stats` value wrap), fix `src/layouts.js` and re-render + verify.
4. Reconcile the discrepancy: the preview PNGs ARE LibreOffice-rendered (soffice
   → PDF → PNG), so if the user saw overlap in LibreOffice the PNG should show
   it too — unless the `.pptx` they opened was rendered differently (theme
   switch, mode, or an older file). Get the exact file/slide from the user if
   the reproduction keeps failing to match their report.
5. Delete `decks/zz-overlap-test/` when the investigation is done.

## Context to read before starting

- `AGENTS.md` — the three-layer rule is the thing that must not be violated.
- `docs/TRAPS.md` — read before debugging anything schema-constrained or
  render-related.
- `src/layouts.js` — `cards` (line 226) and `stats` (line 331) are the two
  layouts under suspicion. Note the total absence of literal colours/fonts.
- `src/ai/ollama.js` — `chat({ role: "critic", model, images })` is how a local
  vision model is called directly; `model` overrides the role default.
- `config/models.yaml` — critic role already points at gemma4:26b-a4b-it-q4_K_M
  with `vision: true`.
- The previous session's work: generation endpoints + outline review are live
  (see `docs/ROADMAP.md` §2, `src/ai/pipeline.js`, `app/server/index.js`,
  `app/web/src/views/Outline.jsx`).

## Remaining known items

Full list with rationale in `docs/ROADMAP.md`. In rough priority order:

- **Vision critic loop** — closes the quality loop; this session's QA work is
  the manual prototype. Needs a small bounded findings schema and a two-round
  cap. The local models and the direct-Ollama call path are proven.
- **Intake wizard** — identity half (team, subject, guide, year) of the entry
  form still to build; brief+sources+theme already exists (`NewDeck.jsx`).
- **Collapsible rails** — blocks the chat panel.
- **Chat panel** — uses `runTurn`; inherits the SSE transport.
- **Inline editing + presenter assignment + slide reorder/delete/duplicate.**
- **19 remaining themes**, **HTML plate renderer**, **freeform slides**,
  **report renderer**, **shared research** (research artefact exists).

## Gotchas

Full list in `docs/TRAPS.md`. The ones most likely to bite immediately:

- **The vision subagents need an opencode restart** to register; config is not
  hot-reloaded. Until then `task({ subagent_type: "vision-ollama-*" })` fails
  with "Unknown agent type".
- **The authoring model is text-only.** Anything claiming a slide "looks fine"
  must be backed by a vision-capable model or pixel analysis, and even then
  verify against the user's report.
- **`qwen3-vl:8b-thinking` gives false-clean verdicts** on layout QA. Prefer
  gemma4:26b-a4b-it-q4_K_M or qwen3.6:27b.
- **A written `.pptx` proves nothing.** Rasterise and look.
- **The preview PNGs are LibreOffice's own render** — if the user's LibreOffice
  differs from the PNGs, suspect a different file/theme/mode, not the pipeline.
- **Commit before any history rewrite.** `filter-repo --force` resets the
  working tree.
- **API binds `FORGE_API_PORT` (5174), never `PORT`.** Express needs
  `node --watch`.
- **Never add an unbounded array or a bare `{type:"object"}` to a model-facing
  schema.** Always check `done_reason`. The author role has no vision.
- **Only one theme exists.** Anything assuming a populated gallery looks broken.
- **SearXNG must be running** for research (`npm run searxng`).
