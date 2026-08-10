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

### theme — free
`themes/*.yaml`, two disjoint halves:

- **`tokens`** — exact machine values. Read *only* by the renderer. Hex colours,
  point sizes, inch offsets. No adjectives, no "or similar"; every value must be
  directly usable without interpretation.
- **`voice`** — tone, density, what to prefer and avoid. Read *only* by the
  model. No hex, no geometry.

The disjointness is load-bearing. If the model can see hex values it starts
inventing them; if the renderer can see adjectives it starts guessing.

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

## Data locations

| Path | Committed | Notes |
|---|---|---|
| `themes/`, `schema/`, `src/`, `app/` | yes | source |
| `config/identity.yaml` | yes | remembered defaults, user-editable |
| `brand/logos/` | yes | raw supplied marks |
| `brand/generated/`, `brand/fonts/` | no | reproducible via tools |
| `decks/<slug>/deck.yaml`, `meta.yaml` | yes | the deck |
| `decks/<slug>/out/` | no | rendered artefacts |
| `reference/` | yes | institutional templates to check against |
