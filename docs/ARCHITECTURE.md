# Architecture

## The problem this shape solves

The obvious design — "ask the model to write pptxgenjs code" — fails with a
12–26B local model. Slide layout is coordinate arithmetic, text metrics and
overflow handling, which is precisely what small models are worst at. Worse, it
is unstable: every regeneration reshuffles the geometry, so iterating on content
destroys the design and iterating on design destroys the content.

The fix is to make layout something the model cannot touch.

```
                       ┌──────────────────────────────┐
   brief + sources ───►│  research  (tool-calling LLM) │───► notes.md, sources.json
                       └──────────────────────────────┘
                                     │
                       ┌──────────────────────────────┐
                       │  outline   (reasoning LLM)    │───► outline.yaml
                       └──────────────────────────────┘
                                     │
                              ┌──────▼──────┐
                              │ HUMAN GATE  │  approve / edit / reorder
                              └──────┬──────┘
                                     │
                       ┌──────────────────────────────┐
                       │  content   (reasoning LLM)    │───► deck.yaml
                       └──────────────────────────────┘
                                     │
                              ┌──────▼──────┐
                              │  validate   │  schema/deck.schema.json
                              └──────┬──────┘   errors ──► back to model
                                     │
     themes/*.yaml ────────────┐     │
                               ▼     ▼
                       ┌──────────────────────────────┐
                       │  render    (deterministic)    │───► deck.pptx
                       │  layouts + fit + chrome       │
                       └──────────────────────────────┘
                                     │
                       ┌──────────────────────────────┐
                       │  preview   (LibreOffice)      │───► slide PNGs
                       └──────────────────────────────┘
                                     │
                       ┌──────────────────────────────┐
                       │  critique  (vision LLM)       │───► fix list
                       └──────────────────────────────┘
                                     └──── loop back to content
```

## The three layers

Everything follows from this separation.

### chrome — locked
`src/chrome.js`. Department banner on the title slide, crest top-right on
content slides, presenter, slide number. Applied as a pass *after* the theme has
drawn, on every slide.

Why a separate pass: these marks are the only part of a deck that is actually
graded. Making them a theme responsibility means a buggy theme can drop them.
Making them a post-pass means no theme can.

The crest variant is chosen by the luminance of the background the layout
painted — not by the palette — because section dividers and title slides
deliberately break out of the standard page.

The content-slide footer's presenter is per-slide: `slide.presenter` (free text,
declared in the schema so the model's ops know it too) overrides whoever the
identity marks `presenting`, which only falls back to the team label. This is
content, not layout — the chrome reads the string, it never decides it.

### theme — free
`themes/*.yaml`, two disjoint halves:

- **`tokens`** — exact machine values. Read *only* by the renderer. Hex colours,
  point sizes, inch offsets. No adjectives, no "or similar"; every value must be
  directly usable without interpretation.
- **`voice`** — tone, density, what to prefer and avoid. Read *only* by the
  model. No hex, no geometry.

The disjointness is load-bearing. If the model can see hex values it starts
inventing them; if the renderer can see adjectives it starts guessing.

A theme is either **native** (pptxgenjs shapes and text only) or **plated**: it
declares `tokens.plate.enabled: true` plus a `plate.html` template (and optional
`plate.surfaces.title/section/content` variants) that interpolates its own
tokens as `{{tokens.palette.bg}}` — the renderer rasterises the template
through headless Chrome and uses it as the slide background, so a theme can
express effects OOXML cannot (backdrop blur, dual shadows, mesh gradients) while
all text stays native. The four plate themes (glassmorphism, claymorphism,
neumorphism, aurora-mesh) are the gallery's reference implementations of the
contract. Plate templates also receive `{{box.*}}` — the content region in CSS
pixels — so a theme can panel exactly the area the native content draws, and
native panels can be made translucent through `shape.card_fill` so they layer
over the plate instead of covering it.

**Styles layer over themes.** `styles/*.yaml` are cross-cutting token
overrides — deep-merged over a theme's tokens at load time, with voice merged
the same way — so a deck renders as *theme × style* without theme copies. A
style never declares a whole theme; it adjusts density, type scale or margins
on top of whichever theme is chosen. `loadTheme(name, { style })` is the single
place this happens.

### content — the model's job
`schema/deck.schema.json`. Semantic slide data: type, headline, bullets, card
bodies, chart series. No coordinates, colours, fonts or sizes anywhere.

The model chooses *what to say* and *which of 15 types fits each beat*, freely.
It cannot choose where anything sits.

## Why not LangChain / LangGraph

The pipeline is a fixed sequence with LLM calls at known stations, not
open-ended agentic exploration. A framework would add indirection without adding
capability. With small local models every prompt token matters and needs to be
directly visible and editable — frameworks hide exactly that. Plain Node over
Ollama's HTTP API is less code and far easier to debug.

## Model backends

`src/ai/ollama.js` is a role-addressed client, not an Ollama-only client. Each
role in `config/models.yaml` resolves to a backend:

- **`ollama`** (default) — native `/api/chat`, with `format` compiled to a
  decoding grammar. This is the constrained-decoding path the whole pipeline
  is built around.
- **`openai-compatible`** (opt-in, per role via `provider:`) — `/chat/completions`,
  `response_format: json_object` instead of a grammar. Streaming and image
  parts work the same; a cloud role simply relies on a strong model obeying
  JSON rather than a decoder forcing it.

Everything downstream (`chat`/`chatJSON`, generate, turn, pipeline, CLI, API)
is backend-agnostic — only the role's provider changes. The default stays
local; nothing calls a cloud endpoint unless a role opts in.

## Why the human gate replaces presets

Presets guess the deck's structure in advance and are wrong whenever the
material does not fit the template. Reviewing the outline lets the model propose
structure freely, because nothing reaches the renderer unapproved. The UI is the
guardrail; presets survive only as a soft density hint the model may ignore.

## Two rendering paths

**Native (default).** pptxgenjs shapes and text. Editable in PowerPoint,
selectable text, small files. Constrained to what OOXML can express.

**Plate (opt-in).** Headless Chrome renders CSS to PNG, placed as a slide
background with native text on top. Needed for effects OOXML cannot express —
backdrop blur, mesh gradients — and for `type: freeform`, where the model writes
arbitrary HTML.

The trade-off is real and drives the default: plate slides are images, so text
in them cannot be corrected by whoever opens the file later. Correct for one or
two hero slides; wrong for a whole deck.

### The plate primitive

`src/plate.js` is the single seam both plate themes and freeform slides use:
`renderPlate(html, { w, h, scale })` writes an HTML document to a temp file and
screenshots it with system `google-chrome-stable` (`--headless=new`, no npm
browser dependency), returning a PNG cached in `.plate-cache/` under a sha256 of
`(html + viewport + scale + version)`. A changed document therefore gets a fresh
plate automatically; an unchanged one is free on every later render. The page
is sandboxed by a CSP that allows only inline styles and local data:/file:
images and fonts, so scripts and all network schemes are unrepresentable — the
HTML renders in a real browser, so anything not allowed is simply absent.

Which plate a slide gets is decided in `render.js` and falls out of the theme
or the slide, in that order of precedence:

- a slide-level `html` override (the freeform seam) wins;
- otherwise the theme's `tokens.plate`, when `enabled: true`, supplies
  `plate.html` with optional `plate.surfaces.title/section/content` variants;
  its template interpolates `{{tokens.palette.bg}}`-style paths against the
  resolved theme (mode-adjusted), keeping the theme YAML the single source of
  colours.

The plate is set as the true slide background (`slide.background = { data }`)
after the layout paints, so it sits under every shape and the chrome — and the
chrome derives its legibility on plate slides from the surface's declared `bg`,
because the flat palette no longer describes what is actually painted.

## Deck vs report asymmetry

They are not two flavours of the same artefact.

| | Deck | Report |
|---|---|---|
| Design freedom | total, only chrome is fixed | none, template is graded |
| Structure | model proposes, human approves | fixed section order |
| Renderer | pptxgenjs from theme tokens | donor .docx, body injected |
| Themes | 20 | not applicable |

Both share the research and outline stages, so one brief produces both — which
is the actual submission workflow.

## Shared core, two front-ends

`src/` is the whole implementation. `app/server/` is a transport over it and
holds no logic; the CLI must be able to do everything the UI can, because the
pipeline has to run headless.

The orchestrator (`src/ai/pipeline.js`) is where the CLI and the API meet:
`createDeck` (brief → research → outline) and `generateFromPlan` (outline →
deck → render → rasterise) are shared, and the `forge` CLI plus the server's
SSE endpoints are thin wrappers. Long-running calls stream Server-Sent Events
over a POST body; dropping the socket aborts the request via an
`AbortController`, so a vanished client stops the model call.

A deck has a lifecycle that is also a disk boundary: `planning` means
`meta.yaml` + `plan.yaml` exist and no `deck.yaml` does, which is what makes the
outline gate enforceable — nothing renders until a human approves, and an
aborted generation can never leave a half-written deck.

## The chat panel — a turn over a per-deck thread

The chat panel is the conversational surface of the same generation pipeline,
not a second one. `src/ai/chat.js` orchestrates one turn exactly as the vision
critic does — the instruction is human-typed instead of vision-derived — and
both call `runTurn` (`src/ai/turn.js`). The look-ahead seam is enforced in code:
`runChatTurn` requires `deck.yaml` to exist, because *turn = edit an existing
deck* and *generate = build from empty* are deliberately different paths.

**Memory model — state over transcript.** The thread is three tiers:

| Tier | Holds | Lives in |
|---|---|---|
| State | current `deck.yaml` + theme voice + `meta.yaml` | the files themselves |
| Recent | last 10 turns verbatim | `decks/<slug>/chat.jsonl` |
| Durable | extracted standing preferences | `decks/<slug>/decisions.md` |

`deck.yaml` is the memory: after a turn the result is in the file the model
reads every turn, so the transcript only carries intent that has not yet been
materialised. `chat.jsonl` is one JSON object per line: a `summary` record
followed by user/assistant pairs. Beyond the 10-turn window, the oldest turns
collapse into the rolling summary (a `utility`-role call) instead of being
dropped, so a long session degrades gracefully. Durable preferences are
extracted each turn by the `utility` role with a tiny bounded schema — a
one-off request is never promoted — and promoted instructions leave the replay
window because they already sit in `decisions.md`, which `runTurn` feeds as
system context.

The server's `/api/decks/:slug/chat` endpoint is SSE over a POST body, the same
transport generation uses: `token` frames stream the model's working, `status`
frames report reading/editing/rendering, and the `result` frame carries the
applied changes, the diff, token stats and the re-rendered previews. A dropped
socket aborts the turn via the shared `AbortController`, exactly like
generation. The `forge chat <slug> "<instruction>"` CLI command is the same
orchestrator headless.

**Inline editing is a separate, model-free surface.** `SlideEditor.jsx` edits
one slide's content through the same validated `PUT /api/decks/:slug` and
re-renders; it shares no code with the turn path. The two layers are
deliberate: chat is structural, inline is precision. Every mutation the deck
detail performs — edit, presenter assign, reorder, delete, duplicate — goes
through the immutable ops in `app/web/src/lib/slides.js`, persists deck.yaml
immediately, and re-renders on a short debounce.

## Data locations

| Path | Committed | Notes |
|---|---|---|
| `themes/`, `schema/`, `src/`, `app/` | yes | source |
| `config/identity.yaml` | yes | remembered defaults, user-editable |
| `brand/logos/` | yes | raw supplied marks |
| `brand/generated/`, `brand/fonts/` | no | reproducible via tools |
| `decks/<slug>/deck.yaml`, `meta.yaml` | yes | the deck |
| `decks/<slug>/out/` | no | rendered artefacts |
| `.plate-cache/` | no | headless-Chrome plate PNGs, keyed by content hash |
| `decks/<slug>/chat.jsonl`, `decisions.md` | no | per-deck thread state |
| `reference/` | yes | institutional templates to check against |
