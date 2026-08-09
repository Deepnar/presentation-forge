# Handoff — for the next session

Read `CLAUDE.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

State at handoff: tree clean, 15 commits, no remote configured (local only).
`npm run dev` serves API on **:5174** and UI on **:5173**.

This was the **foundation session** — the project did not exist at the start of
it. Shipped end to end: a deck renders from semantic YAML to a themed `.pptx`,
rasterises to PNGs, and is browsable in a local web UI.

1. **Font pipeline** (`3111792`) — 27 Google families / 76 weights via a manifest.
   The machine had only Noto/DejaVu/Liberation.
2. **Brand normalisation** (`6de0470`) — white-keying, trim, and a knockout
   variant for dark backgrounds, from whatever raw files land in `brand/logos/`.
3. **Theme system** (`b507149`) — `tokens` (renderer-only) / `voice` (model-only)
   split. One theme shipped: `warm-humanist`, ported from `design_system.txt`.
4. **Content schema + validator** (`cc154c9`) — 15 slide types, per-type
   conditional rules, errors phrased as correction prompts for a small model.
5. **Renderer** (`6a79d05`) — 15 layouts with zero literals, locked chrome pass,
   shrink-only text fitter.
6. **Rasterisation** (`59b15ab`) — LibreOffice → PDF → PNG + 480px thumbs.
7. **API + web UI** (`94c342f`, `6ed1fce`) — Express over `src/`; React views for
   decks, themes, identity.
8. **Lightbox** (`7d5d8c8`) — keyboard-driven slide review, plus a real bug fix
   (see Gotchas).
9. **Docs** (`fad71dc`, this commit) — architecture, roadmap, traps, handoff.

**Validated behaviourally**, not just compiled: the 12-slide smoke deck renders,
rasterises, and was inspected slide by slide; four defects were found that way
and fixed (crest alpha, dark-background wordmark, crest legibility at 0.62in,
single-series chart colours). Lightbox keyboard nav was driven through the DOM
and asserted (5 → three lefts → 02, clamping at both ends, Esc closes).

**Not validated:** the visual result of the UI redesign. The screenshot tool
failed for the back half of the session (see TRAPS). Structure, tokens and fonts
were confirmed via `read_page` / `javascript_tool`; nobody has actually looked at
the redesigned interface.

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

## NEXT TASK — **generation pipeline**, in this order

The UI is a viewer with nothing behind it. The pipeline is what makes the rest
worth having. Per CLAUDE.md, **discuss the concrete implementation before
building** — the roadmap entries below are intent, not specs.

1. **Local search** (`roadmap §4`) — SearXNG in Docker + a `search()` /
   `fetch_page()` module. Docker already runs on this machine.
2. **Ollama orchestrator** (`roadmap §4`) — plain Node over the HTTP API, role
   split across models. Deliberately not LangChain; see ARCHITECTURE.
3. **Outline review gate** (`roadmap §2`) — the human approval step. This is what
   makes free-form structure safe with a small model, and it is a *prerequisite*
   for chat, not a nice-to-have after it.
4. **Vision critic loop** (`roadmap §4`) — feed rendered PNGs back for overflow
   and contrast defects.

**Look-ahead already done for this work:** the chat panel (§2) and the critic
loop (§4) both need a conversation/turn primitive and a deck-mutation primitive.
Build the orchestrator so a "turn" is a first-class thing that takes the current
`deck.yaml` plus an instruction and returns a validated new `deck.yaml` — the
critic is then just a turn whose instruction comes from a vision model instead of
a human. Do not build a one-shot generate-only path that chat will have to tear
out.

## Remaining known items

See `docs/ROADMAP.md` for the full list with rationale.

- **Generation pipeline** — search, orchestrator, outline gate, vision critic.
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
