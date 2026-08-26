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
all text stays native. Plate templates also receive `{{box.*}}` — the content
region in CSS pixels — so a theme can panel exactly the area the native content
draws, and native panels can be made translucent through `shape.card_fill` so
they layer over the plate instead of covering it.

Native themes can also carry a **background layer**: `tokens.background.decor`
is a list of native shapes (ellipse/rect/roundRect/triangle) drawn behind the
content box — a corner halo, an edge bar, a hairline grid. pptxgenjs has no
gradient fills (a gradient option is silently dropped), so any theme that wants
a true mesh or wash uses the plate path instead; the decor layer is for
treatments expressible as plain translucent shapes. `drawBackground()` in
`render.js` reads it and nothing in deck.yaml can reach it — same three-layer
boundary as the palette.

The gallery sits at **38 themes**: the native reference (warm-humanist), a
broad native family (Swiss grid, editorial magazine with its layout flags,
Muji, neubrutalism, Bauhaus with its section block, Memphis, Art Deco,
dark-neon, Linear, Material You, flat, retro-terminal, newsprint, Notion,
Alegria, corporate blue, nature organic, blueprint, high-contrast mono,
risograph, letterpress, paper pastel, sci-fi HUD) and plated ones
(glassmorphism, claymorphism, neumorphism, aurora-mesh, soft glass, sunset,
gradient mesh dark, retro CRT). Theme cards carry NEUTRAL specimens — "Title" /
"subtitle line" placeholders on the theme's own proportions (16/8 title band,
16/5 content strip), never real deck content — so the card shows the design,
not someone else's slides; the type-swap gallery's specimen slides are neutral
the same way (`src/specimens.js` prefers hand-written neutral payloads over
demo-deck content). Layout-LEVEL distinctness is carried by
per-theme flags the layouts read (`tokens.editorial`, `tokens.bauhaus`) and
falls back to the default when absent. The themes rely on the fitter's family
table — its per-family advance estimates are what keep a one-line title on one
line — and on their section-surface luminance, which the chrome's
crest/footer variant derives from. A theme-contract test loads every theme and
machine-checks the split, including the background-decor shapes.

**Styles layer over themes.** `styles/*.yaml` are cross-cutting token
overrides — deep-merged over a theme's tokens at load time, with voice merged
the same way — so a deck renders as *theme × style* without theme copies. A
style never declares a whole theme; it adjusts density, type scale or margins
on top of whichever theme is chosen. `loadTheme(name, { style })` is the single
place this happens.

### content — the model's job
`schema/deck.schema.json`. Semantic slide data: type, headline, bullets, card
bodies, chart series. No coordinates, colours, fonts or sizes anywhere.

The model chooses *what to say* and which of 15 types fits each beat, freely.
It cannot choose where anything sits.

The vocabulary is now the full 75-type enum: the sixteen original types, the
six Tier-1 additions, and the rest of the plan's families (Foundation closers,
List & Grid, Data & Stats, Comparison, Process & Flow, Timeline & Quote,
Callout, Image & Visual, Table & Matrix, Diagram-ish, Definitions, Team and
Special) plus `freeform` as the escape hatch. Each type is a conditional schema
block declaring data only, a native layout in `src/layouts.js`, and an editor
descriptor. The chart kind enum covers `scatter`, `radar` and `stacked-bar`
alongside the originals, and a cross-cutting `speaker_note` field draws a note
bar above the chrome footer on standard content slides.

The layout discipline for the new types follows the Tier-1 lessons: every
stacked element is fit-scaled or reserves its rendered line count, stat values
use `fitOneLine` (width-based, pessimistic) because the height-based fitter is
optimistic for wide digits, and the algorithmic diagram types (framework,
cycle, dependencies, diagram, hierarchy, concept-map, venn) place nodes purely
from angles, radii and topological depth — never from content. A node's text
zone never sits under another shape: the framework ring is checked for card-vs-
ellipse and card-vs-card clearance at the largest size the box allows and falls
back to a stacked panel + grid when a ring cannot fit; the diagram sizes nodes
from the layer spacing (auto-routing a thin chain horizontally) and draws edges
before nodes, from a node's edge rather than its centre. When the layout
genuinely cannot hold a body line at the floor, it drops the body (label-only)
instead of shipping a tiny font. The fitter itself is em-aware (advance ×
size/72, with a weight factor for Black faces) and every text role has a
readable floor — the fitter clamps at the floor and reports "would need Xpt"
into the render problems rather than shrinking below it. Stacked zones size to
the content's real line count, so long card titles keep their lines instead of
being shrunk to ~8pt.

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
  JSON rather than a decoder forcing it. A `model` override naming one of a
  provider's `models:` list routes that request to the provider — the picker's
  cloud group — while keys resolve env-first then from the gitignored
  `config/local.yaml` store (`src/cloud.js`).

Everything downstream (`chat`/`chatJSON`, generate, turn, pipeline, CLI, API)
is backend-agnostic — only the role's provider changes. The default stays
local; nothing calls a cloud endpoint unless a role opts in.

### Per-transport capability split

A role's sampling, output and context settings are written for the LOCAL
backend — the caps a small-model pipeline survives on. A role may declare
`transports.cloud` (and optionally `transports.local`) overrides in
`config/models.yaml`; `applyTransport` merges the block for whichever backend
the role resolves to, replacing nested blocks wholesale. This is how the cloud
path escapes limits that only exist because the local model cannot handle more:

- the author's `num_predict` (12000 local / 24000 cloud) and research
  `excerpt_chars` (80000 / 240000) are per-transport;
- the research role's `research:` block sets the depth budget per transport —
  a cloud research role searches and reads far deeper;
- a completion cut at `done_reason=length` retries with the cap doubled up to
  `defaults.num_predict_bump_ceiling`, so a legitimate large output is not
  failed by a cap that was sized for a smaller model.

Prompts are per-transport too: `authorTransport()` tells prompt-builders which
backend the author will run on, so the cloud writer gets a full-strength
synthesis note (claim-first prose, real hooks, figures from the notes) while
the local writer keeps the conservative instructions that small models survive
on.

### Hosted vs local — single repo, one switch

`FORGE_HOSTED` is the only fork. `isHosted()` (`src/cloud.js:15`) checks `config/hosted.json` (admin runtime toggle, file wins) then `process.env.FORGE_HOSTED`/`FORGE_DISABLE_LOCAL`, so the same image runs both ways:

- `FORGE_HOSTED=1` (hosted): `autoProvider()` returns TCET `qwen3.6` when `FORGE_TCET_API_KEY` is set and `null` otherwise — no local Ollama fallback. `resolveRole()` and `modelChoices()` hide local models, `chat()` for `role=author` surfaces a clear "Hosted auto not configured — switch to Cloud" error instead of "Ollama unreachable". Internal roles (`research`/`critic`/`utility`) fall through TCET → Cloud when hosted.
- unset / `0` (local clone): `autoProvider()` falls back to `localhost:11434` Ollama, `modelChoices()` lists installed models, and the author route falls back to the local default. `docker-compose.app.yml` wires `FORGE_HOSTED` + provider keys into the container; `config/models.yaml` header documents the switch.

The admin UI (`#/admin` → System) and `Settings → Deployment mode` both call `POST /api/admin/hosted` (`src/cloud.js:setHosted`) which writes `config/hosted.json` and reloads the frontend (`forge:hostedChanged` + `window.location.reload()`), so Chat's `hosted/local` badge (`ChatView.jsx:1015`) and `Local·Ollama` / `Auto·TCET` pill (`ChatView.jsx:944`) plus the Sidebar `Auto/Cloud` toggle reflect instantly. No fork, no second branch — one repo, one image, one env var.

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

`type: freeform` is a real schema type, not a hidden flag: it requires a
non-empty `html` field, every other type forbids it, the writer prompt
describes the sandboxed subset, and the whole slide rasterises — there is no
native layout at all. The outline review and slide editor state the trade-off
(no text editing in PowerPoint afterwards) at the point of choosing.

The plate is set as the true slide background (`slide.background = { data }`)
after the layout paints, so it sits under every shape and the chrome. Chrome
legibility on a plate slide is derived from the plate's own top-right corner
luminance (a sharp sample of the raster), falling back to the surface's
declared `bg` — for a freeform plate the theme's flat palette says nothing
about what was actually painted.

## Deck vs report asymmetry

They are not two flavours of the same artefact.

| | Deck | Report |
|---|---|---|
| Design freedom | total, only chrome is fixed | none, template is graded |
| Structure | model proposes, human approves | fixed section order |
| Renderer | pptxgenjs from theme tokens | donor .docx, body injected |
| Themes | 20 | not applicable |

Both are generated from the same research pass, so one brief produces both —
which is the actual submission workflow.

**Structure is sized to the team.** Both planners derive their section count
from the merged identity's team (`src/ai/team.js`): a deck gets `clamp(members,
3, 8)` major parts (one per presenting member, capped at the renderer's
8-section ceiling) and the outline grammar's sections cap is tightened to the
same number; the report planner floors the same calculation at the four-section
graded core. The count is the deck's own data, never a separate input.

**Presenters are assigned centrally, not by the model.** `distributePresenters`
in `src/ai/team.js` is the one place the split is computed: content slides
group by their `section` and whole sections go to presenting members in order,
so every member's slides are a single contiguous block (their section's divider
opens it, the next divider closes it) and block sizes differ by at most one
slide where the section sizes allow. With at least as many members as sections,
each section goes to its own member — nobody doubled up while another sits
idle. The writer's ops grammar drops the `presenter` field for every type
(unrepresentable beats scrubbed), the distribution is force-applied after
generation, and the chrome footer skips the presenter line on divider surfaces.
The briefing's slides-per-member answer overrides the automatic per-member
target (still contiguous) and reaches generation structurally through
meta.yaml. Chat turns can still reassign a presenter by hand — their grammar
keeps the field.

## The report generator

`src/ai/report.js` is the report's half of the generation pipeline, mirroring
the deck writer's decomposition (`generate.js`): a plan call fixes the title
and which of the eight fixed sections carry content, then one call per section
constrained to that section's own grammar. Depth is a parameter, not a second
generator — the same function with different schema bounds and a different
prompt:

- **full** — three-to-six paragraphs (target four) and a table where one earns
  its place;
- **brief** — a headline statement plus three short supporting sentences, never
  a table, and References capped at six entries.

Both densities write the same `decks/<slug>/report.yaml` shape and draw
unchanged through the renderer. The depth used is remembered in `meta.yaml`
(`reportDepth`) so a later `--generate` keeps the same budget.

**Shared research orchestration.** The report generator reads the same
`research/notes.md`, the same approved `plan.yaml` and the same merged identity
the deck used, and refuses to run without them — the outline gate is the human
gate for both artefacts. The model only ever sees a bounded excerpt of the
research (`excerptResearch` in `src/ai/research.js`); the full artefact stays
whole on disk, because a research pass can outgrow the model's context window
and an unbounded prompt collapses generation. Reachable as
`forge report <slug> --generate [--depth full|brief]` (CLI) and
`POST /api/decks/:slug/report/generate` (API, SSE like deck generation).

**Two extra doors on the same generator.** A report does not have to come from
a deck. `forge report-new <brief>` / `POST /api/reports` runs the standalone
flow — brief → research → `report.yaml` → `.docx`, no `deck.yaml` at all. The
fixed section order is the structure, so no outline gate applies; the generator
is told `requirePlan: false` and derives its plan from the brief and research.
And the flow reverses cleanly: `forge deck-from-report <slug>` /
`POST /api/decks/:slug/report/deck` plans a *companion deck* from an existing
`report.yaml` and its shared research, routing the plan through the ordinary
outline gate and `/generate` path. Both directions share `decks/<slug>/research/`,
so the deck and report agree by construction whichever way they were built.
A report-only deck (`meta.yaml` + `report.yaml`, no `deck.yaml`) appears in the
deck list with `deck: false` and opens the Report view.

## The report renderer

`src/report.js` is the opposite of the deck renderer. No themes, no layout
vocabulary — the whole job is matching the institutional template exactly,
because that is what is graded. The template's own `.docx` (gitignored
`reference/`) is the *donor*:

1. Load it with jszip (the `docx` package is generation-only and cannot open an
   existing file).
2. Take `word/document.xml` apart by string surgery: keep the `<w:document>`
   opening tag and the body-level `<w:sectPr>` verbatim, discard the body
   between them. The sectPr carries the header/footer references and the page
   geometry, so it is the whole chrome in one element.
3. Build a fresh body from schema-validated `decks/<slug>/report.yaml` plus the
   merged identity (meta.yaml over config, the same merge the deck uses): a
   cover page, a table of contents, and the fixed section order — Abstract →
   Acknowledgement → Introduction → Theoretical Background → Application →
   Future Scope → Conclusion → References. Sections with no content are skipped
   gracefully; present sections are numbered 1..N.
4. Rezip. Every part other than the body survives byte-for-byte, which is what
   preserves the VML watermark and banner inside the headers, the footer's page
   field, the styles the generated tables reference, and all media.

The TOC's page numbers are real, not hand-typed: the render is two-pass. The
first pass renders to a temp .docx, `libreofficeToPdf` (a helper shared with
`src/preview.js`) converts it, pdftotext locates the page each numbered heading
lands on, and the final pass writes those numbers. The first section starts on
a fresh page like the donor's Abstract. Exactly ONE page break follows the
cover and ONE follows the TOC, and section 1 needs no pageBreakBefore of its
own — the doubled breaks the renderer used to emit produced blank pages 2-3
whenever a cover or TOC ended near a page boundary, and the single-break layout
is verified blank-page-free by rasterising a real report.

Content shape (`schema/report.schema.json`): each of the eight sections is
`paragraphs` plus an optional borderless `table` (bold header, like the
donor's own content table); `References` additionally accepts `entries`.
The renderer is depth-agnostic, so both report densities — full and brief —
draw through it without knowing which they are.

Reachable like the deck path: `forge report <slug>` (CLI), and on the API
`GET/PUT /api/decks/:slug/report` plus `POST /api/decks/:slug/report/render`
returning the download URL — the server stays a transport. A missing donor
(`reference/` empty or ambiguous) fails loudly rather than half-working.

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

`createDeck` freezes the briefing into `meta.yaml` — team, guide, academic,
theme, max-slides, slides-per-member and now **density** — so the deck detail
can show what the deck actually is, and `generateFromPlan` re-loads that meta
so the per-member promise survives from plan to deck. The outline itself is
sized in `planDeck`: the max-slides budget counts **content** slides only, with
the title, section dividers and closing slide as structural overhead that
never counts toward it; a `slidesPerMember` briefing sizes the plan to the team
(N members × M each, capped by max-slides) and `trimContentToBudget` trims it
to that exact number. The budget is a two-way door: `mintContentSlides` GROWS a
thin outline (fewer sections than people, one slide per part) up to the
team-sized count before distribution, so a plan can never strand a presenting
member — the observed defect was 11 members and 10 content slides, the deck
jumping from the 10th member's slide to the closing. `generateDeck` then writes
one validated slide per plan entry, and the writer loop treats "no new valid
slide appeared" as a failure — an empty or mis-targeted op list would otherwise
apply as a no-op and silently vanish, so it retries once and then writes a
validating placeholder (`placeholderFor`): a degraded slide beats a missing
one, and a divider spec never degrades into a content slide. The writer's ops
are read tolerantly through `slideFromOps` (`src/ai/ops.js`): a model that
drifts toward `update_slide` without an index, or a full `slide` object on the
wrong key, is a correct-in-intent rewrite, not a failure to discard — the sweep,
convert and field-length rewrites all resolve through it.

A deck has a lifecycle that is also a disk boundary: `planning` means
`meta.yaml` + `plan.yaml` exist and no `deck.yaml` does, which is what makes the
outline gate enforceable — nothing renders until a human approves.

### Resumable generation — the run survives the socket

Generation is split into a **write half** and a **finalize half**, each
standalone so a dropped run re-enters only the stage that is left:

- `writeDeckContent` persists the *approved* outline to `plan.yaml` first (the
  resume contract), then checkpoints `deck.yaml` as each slide lands (the
  `onSlide` hook on `generateDeck`), writes a durable `.run.json` marker and
  sets `meta.status` to "writing". A dropped connection leaves a resumable
  deck, never a lost run.
- `finalizeDeck` runs the post-write pass — grounding, the field-length
  rewrite, trim, coherence, render, preview — and flips `meta.status` to
  "ready", clearing the checkpoint. It reads deck.yaml + plan.yaml from disk,
  so it can finalise a deck whose content is complete but whose run died before
  the pass (the "N/M written — finalize it" watchdog state).

The server no longer aborts a run when the SSE socket drops; that was the
"refresh restarted from slide 1" bug. Runs live in a slug-keyed in-memory
registry (`generationRuns` in `app/server/index.js`), a reconnect attaches to
the SAME run and streams its events (dedupe, not restart), and Stop is the one
explicit abort via `POST /api/decks/:slug/generate/stop` — the checkpoint
survives even that. `GET /api/decks/:slug` folds the registry over the on-disk
checkpoint into a `run` field (`{active, written, total, resumable,
needsFinalize}`), which is what lets the chat and deck views offer watch /
resume / finalize instead of a silent fresh run. The CLI mirrors the split:
`generate --resume` and a `finalize` command.

### The field-length pass — rewrite, never cut mid-sentence

`src/ai/fieldlength.js` runs after writing and after a density sweep, BEFORE
the deterministic trim. It renders to find slides the fitter flags below their
floor, walks each flagged slide's string fields against their per-field schema
caps (`fieldInventory`), and sends one scoped model call per slide: rewrite the
flagged fields as complete sentences within their caps — no ellipsis. Only what
it cannot fix reaches the trim, and `shortenString` (`src/ai/trim.js`) now cuts
at sentence boundaries only: with no sentence end reachable it returns null and
the floor flag reports the slide rather than ship a mid-sentence "…". The two
together make the banned artifact unproducible.

### The chart-eligibility rule — an empty chart is unrepresentable

A `chart` slide with empty `values` is banned at every entry point: the
data-affinity steering tells the planner *and* the writer to choose chart only
when the research carries real numbers (and names the qualitative alternative
when it does not), `planDeck` coerces a proposed `chart` to `cards` below the
numeric-fact threshold, and the schema requires `series[].values` and
`categories` to be non-empty — so an empty chart fails validation and the
render gate refuses it.

## The chat panel — a turn over a per-deck thread

The chat panel is the conversational surface of the same generation pipeline,
not a second one. `src/ai/chat.js` orchestrates one turn exactly as the vision
critic does — the instruction is human-typed instead of vision-derived — and
both call `runTurn` (`src/ai/turn.js`). The look-ahead seam is enforced in code:
`runChatTurn` requires `deck.yaml` to exist, because *turn = edit an existing
deck* and *generate = build from empty* are deliberately different paths.

**The input bar knows WHICH slides you mean.** Once a deck is ready a ~40% side
panel sits beside the thread (the chat shifts left) showing every rendered
slide scrollable (`SlideSelectPanel.jsx`). Selecting one or many and typing
builds the turn context from the selection — each chosen slide's 1-based index,
type, headline and content excerpt — so "add more content to THIS slide" can no
longer drift. The deck view's lightbox writes the focused slide into a
module-level `deckContext` store, so opening slide 4 there and returning to the
chat makes "make THIS punchier" resolve to that slide. The panel also carries
per-slide actions (punch-up, type swap) over the selected set, through the same
endpoints the deck view's toolbar uses. A leading `/` in the input is parsed
before the turn runs (`lib/slash.js`): `/theme`, `/density`, `/slides`, `/papers`,
`/report` and `/help` map to direct actions with an inline confirmation, and an
unknown command gets a helpful reply instead of being forwarded as a prompt.
The composer is an auto-growing textarea (44px up to a ~152px cap, then
scrolls).

**The briefing reaches the planner verbatim.** The full briefing record — team,
guide, academic, audience, emphasis, theme, density, branding, slide count — is
sent as an explicit "The user answered: …" block alongside the research brief,
and the planner is told to always produce a complete talk (title → intro →
body → conclusion/closing) regardless of what the brief says.

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

### Admin — RBAC, analytics and hosted toggle

`#/admin` (`app/web/src/views/Admin.jsx`) is the operator surface, gated by `src/auth.js:isAdmin` — `role=admin` in `users` table, or `email==18deepnar@gmail.com` (hardcoded seed, auto-promoted on `register`/`findOrCreateGoogleUser`), or `FORGE_ADMIN_EMAIL` env. `App.jsx:139` `isAdminUser` controls the Sidebar shield link (`Sidebar.jsx:287`) and `App.jsx:244` `#/admin` route; the view itself also handles `403` from the API.

Server `app/server/index.js:486` `requireAdmin` guards `GET /api/admin/hosted` / `POST /api/admin/hosted` (`src/cloud.js:isHosted`/`setHosted` → `config/hosted.json`, file wins over env for runtime flips), `GET /api/admin/users` / `POST /api/admin/users/:email/role` / `DELETE /api/admin/users/:email` (`src/auth.js:listUsers`/`setUserRole`/`deleteUserAccount` with last-admin guard), `GET /api/admin/decks` (all owners + `deck.pptx` size), and `GET /api/admin/stats` (users total/admins/week, decks total/slides/reports/size, `byTheme`/`byOwner`/`recent`, `auto_events` aggregate total/top-10, `limits`, `system` — TCET key, Ollama/SearXNG health, disk `df`, uptime, node). `published/` (`published/*.pptx|*.pdf|*.docx`) is the public showcase, force-added via `!published/**` in `.gitignore:28` while private `decks/*` stays ignored except `!decks/_public/**`.

Frontend `Admin.jsx` has five tabs — Overview (4 stat cards + `BarChart` for themes/owners + recent decks), Users (search, Make/Remove admin, Delete), Decks (search, all decks table), Analytics (total requests/slides/tokens, top users bar chart, limits grid), System (hosted/local switch with `forge:hostedChanged` + reload, backend health, disk/uptime, RBAC explanation). `SettingsModal.jsx:522` `HostedSection` (admin only) also toggles hosted and reloads, so Settings and Chat (`ChatView.jsx:1015` `hosted/local` badge + `944` `Local·Ollama`/`Auto·TCET` pill) stay linked.

### Published presentations — public without leaking private decks

`published/` (`published/*.pptx|*.pdf|*.docx` + `published/README.md`) holds only decks owned by `18deepnar@gmail.com` (3 decks: `recent-trends-mixed-mode` + 2× `first-impressions`, 6 files, 9.2 MB total) force-added via `!published/**` in `.gitignore:28` while private `decks/*` stays ignored (`decks/*` + `!decks/_public/**`). `decks/_public` (previous sanitized yaml-only examples) and `app/web/public/examples`/`docs/assets/examples` previews were removed per request to only publish your own PDFs. `README.md` links to `[published/](published/)` (`app/web/src/views/Home.jsx` gallery removed). `src/sweep.js:37` skips `public` and `.`/`_` prefixed decks so the sweep never deletes the showcase.

### Security — no leaks

`FORGE_TCET_API_KEY` in `.env.example` is now `sk-change-me-tcet-key` placeholder, `config/hosted.json` is gitignored (`config/hosted.json`), `config/local.yaml`/`users.json`/`sessions.json`/`forge.db` stay gitignored. `git ls-files` shows no real `sk-` keys; `config/local.yaml` on disk holds the real `OPENCODE_GO_API_KEY` but is ignored. Chat normalization (`app/web/src/lib/chats.js:12` `normalizeChat`, `briefing.js:222` `echoAnswer` guard) and `ErrorBoundary.jsx:1` + `SlideSelectPanel.jsx:52` `PanelLeftClose` fix prevent the white-screen on existing chats; favicon regenerated from `logo.svg` (`app/web/public/favicon.png` 32 + `apple-touch-icon.png` 180).

## The grounding guard — research is the contract

`src/ai/grounding.js` runs after deck generation in `generateFromPlan` (and
again on the critic's output when the critic rewrites the deck). It walks every
slide's content, extracts the factual claims — numbers with units, years,
proper-noun phrases — and checks each against the research text the writer was
given. Anything it cannot find is appended to the slide's `notes` field as a
`[grounding]` line and surfaced in the render result's `problems[]`. It never
edits a number to make the check pass; flagging is the whole job.

The guard is deliberately conservative about what counts as a claim. Headlines
and standfirsts are the rhetorical frame, so their noun phrases are skipped
(their numbers still count). Names are only extracted from fields that carry a
real figure — a name tied to a number is a claim ("Inflation Reduction Act
unlocked 180 GW"), a bare card title or stat label ("Early Innovator") is not.
Without any research text the pass stays silent: flagging every number against
nothing would be noise, not honesty.

Because the research the writer sees is `research/notes.md`, and that file is
now user-editable from the deck detail's Research panel, the grounding contract
is: the notes are the ground truth, the user owns them, and the model is
flagged when it leaves them.

**Numbers are claims too.** The walker treats numeric values like any other
figure, so a chart series value or journey value the research never states is
flagged exactly like a fabricated percentage — the "are the graphs reflective
of real numbers?" check the user wants before presenting, not after. The one
structural exception is `depends_on`: integer indices that reference other
nodes, not measurements. `deckFigures` surfaces the same numbers to the
Research view as plain mono chips against the source table, so the cross-check
has a surface, not just a rule.

**Geometry is honest about what it measures.** A shape that looks like a
measurement only draws it when the data carries that measurement: the journey
renders a real line only when every stage carries a numeric `value` (any
unvalued stage switches the whole slide to a flat milestone rail, sentiment
colouring nodes categorically and never positioning them), and the funnel's
taper comes from real numbers only when every stage has one, otherwise
equal-width steps. Qualitative types keep their designed, clearly-illustrative
treatments — the rule is that a decoration must not pretend to be an axis.

**The research pass is deep, not one query.** `deepResearch` (`src/ai/research.js`)
expands the brief into 5-8 angle queries via the research role (keywords,
science, practical, regional, data, counterpoint; falling back to the brief
alone when the model is unavailable), runs each at a higher read budget than
the old single query, follows up the richest sources, then closes the gaps the
diversity guard finds (missing domains / missing academic voice) and the
examiner-gap pass raises. The model only ever sees a bounded excerpt; the
richer artefact stays whole on disk for the deck, the report and the user's
edits. **Papers are a toggle away.** `src/papers.js` queries arXiv and
Crossref for the brief, dedupes by canonical id, ranks by brief-term overlap,
writes arXiv IDs and DOIs into sources.json with `kind: "paper"`, and pulls the
top papers' full text (arXiv HTML) into the notes. Jina Reader
(`https://r.jina.ai/<url>`) is the second extraction path for JS-heavy pages,
gated behind `RESEARCH_JINA=1` so the local-first default is untouched.

**Invented images degrade, never crash.** The renderer's `resolveAsset` returns
null for URLs and for files that do not exist, and every image layout already
draws a placeholder for a null source — so a model that puts
`https://example.com/x.jpg` in an image field costs one grey box, not a whole
deck that fails at write time. Both the planner and the writer are told to avoid
image-requiring types unless the brief names real files.

## Upload-only research — the user's file is the source of truth

The briefing's research question is a three-way choice — Web search (default) |
My uploaded file (no search) | No research — and the upload path is a new
intake seam, not a fork in the pipeline. When the file wins, the research pass
is skipped entirely (no SearXNG, no arXiv/Crossref, no Jina) and the document
becomes `research/notes.md` verbatim, marked `kind: "user-provided"` in
sources.json, so everything downstream — planning, writing, the report, and
the grounding guard — works on exactly the text the user gave.

`src/ai/upload.js` owns the intake:

- **Conversion.** md/txt are decoded directly (with a binary sniff so an
  executable renamed `.txt` fails loudly); docx/pdf go through LibreOffice
  headless to text (the same private-profile + absolute-path discipline as the
  preview rasteriser). Caps: 25 MB and 60k words, rejected before staging.
- **Staging.** The converted document is staged under a token in gitignored
  `config/uploads/` (swept after 48h), so a large file never round-trips
  through the browser or localStorage — the briefing holds `{token, name,
  words}` and the plan resolves it once the deck's slug exists. The CLI
  (`forge new/report-new --upload <file>`) passes `{name, text}` inline
  instead; `resolveResearchSource` in `src/ai/pipeline.js` normalises both.
- **Server.** `POST /api/briefing/upload` (session-gated like presets) accepts
  md/txt/markdown/docx/pdf raw bytes, validates extension + size + readability,
  stages, and returns the token; the plan's `createDeck`/`createReport` accept
  `researchSource` + `upload`.

The grounding guard becomes strict fidelity automatically: its label names
"your uploaded file" instead of "research/notes.md" when `meta.researchSource`
is upload, so the speaker's notes state the contract. The upload is visible and
editable in the existing Research panel before generating — notes.md was always
user-editable, and in upload mode it IS the user's document.

## The coherence pass — every slide must serve the deck's topic

Grounding proves the facts; coherence proves the argument. A slide can be
perfectly grounded and still not belong — the soft-skills deck shipped a
flight-attendant demographics chart inside a first-impressions deck, real data
with no link to the deck's point, and a presenter could not voice the "so what".

`src/ai/coherence.js` is the post-generation review that catches this. After
generation (`generateFromPlan`) and after a density sweep (`sweepDensity`) it:

1. **Reviews** the finished deck against its title and sections with one
   bounded call (the critic's small-schema lesson): each slide is flagged for
   either *topical drift* (headline and content do not serve the deck's central
   topic or this section) or *framing* (data without a point — no implied "so
   what" a presenter can voice).
2. **Rewrites** every flagged slide through `runTurn` with a per-slide fix
   instruction naming the exact reframe, capped at two rounds like the critic.
3. **Re-grounds and re-trims** the fixed deck, so a fix never trades a
   coherence problem for an ungrounded claim or an overfull slide.

The writer prompts carry the framing rule as a first line of defence: the
headline is a claim, the body is its support, and a grounded fact that does not
serve THIS deck's argument is not used — even if it is in the research. The
report section writer carries the same rule, and the report planner must agree
with the deck's approved outline, so both artefacts stay coherent with the same
topic.

## The speaker-script generator — the coherence pass's downstream

The coherence pass asks "is there a 'so what' the presenter can voice"; the
speaker script is where that voice lives. `src/ai/script.js` writes
`decks/<slug>/script.md`, the words each presenter says aloud for every slide:
60–90 seconds of spoken prose per content slide, in the presenter's voice,
bridging the slide's bullets to the deck's argument and voicing the connection
the slide only points at, grounded in the same `research/notes.md` the deck was
written from. It rides the same decomposition as every other writer — one
small-grammar call per slide (a single `words` string capped at 1999 chars) —
and is deliberately a button, never automatic: the user asked for it "at the
end if I want", so Export's "Speaker script" item and the deck-detail Script
panel both generate on demand, and a per-slide Regenerate rewrites just that
slide's words after an edit.

`script.md` is plain markdown with an invisible `<!-- slide:N -->` marker per
block. A regeneration replaces exactly its own block and rebuilds the file from
the deck's slide order, so a deleted slide drops its block and unwritten slides
stay blockless (the panel shows them as "not written yet" with a regenerate
affordance, never placeholder text). The API mirrors the sweep (SSE, abort-on-
disconnect): `POST /api/decks/:slug/script` with an optional `index`, plus
`GET` returning per-slide blocks; the CLI is `forge script <slug> [--slide N]`;
and the existing title-naming download route gained a deck-root fallback so
`script.md` (a content artefact living beside deck.yaml, bundled in the .zip)
downloads like any other file.

## The placeholder gate — a degraded slide must never ship as content

When a slide's generation fails (cut-short JSON, a model that never lands a
slide), the writer writes a validating placeholder so the deck stays whole and
the promised count holds. The placeholder used to read like real content —
"Details in the full briefing." sailed into committed decks.

`src/placeholders.js` is the single seam that recognises placeholders by their
marker text (current and historical phrasing), and three layers make them
impossible to miss:

- **The render gate.** A real render (`write: true`) of a deck with any
  placeholder slide throws, returning a 422 that names every placeholder slide.
  The trim loop and preview pass render in-memory so audits still run; only
  shipping is refused.
- **The problems list.** `generateDeck` gives each surviving placeholder one
  dedicated regeneration attempt after the write loop, then flags any that
  remain into `problems[]` ("slide N (bullets) is a PLACEHOLDER — it must be
  regenerated before this deck is presented").
- **The deck view.** A red "Needs regeneration" panel lists every placeholder
  slide with a per-slide Regenerate button (a scoped chat turn that rewrites
  the slide from research), plus a badge on each affected slide card.

## The web shell

The browser UI is a shell around the same `src/` pipeline; `app/server` stays a
thin transport and every control maps to a real endpoint. `App.jsx` owns the
deck list (fetched once, re-fetched on a version bump) and routes between
`chat`, `deck`, `report`, `research`, `themes` and `home`. **View
routing is hash-based** (`lib/router.js`): every navigation pushes a
`#/chat[/<id>]`, `#/deck/<slug>`, `#/report/<slug>`, `#/research/<slug>`,
`#/themes` or `#/home` entry, and a single `hashchange` listener
is the only consumer of the URL — so the browser back button walks the same
route the user walked forward (chat → deck → home) instead of exiting the
site, and a deep link like `#/deck/<slug>` reopens that view on reload (per-user
auth still gates it, and a route's hash survives logout, so logging back in
restores where the user was). Settings is deliberately NOT a route — it is a
modal over whatever view is open (an old `#/identity` hash resolves to chat).

**Entry flow — landing-first.** The `#/home` landing page is the front door, now with a pinned scroll tour (GSAP `ScrollTrigger` pin `2000%`, `scrub 1.2`) and a `fixed` header that auto-hides on scroll down and reappears at the footer. An unauthenticated visitor lands on it whatever the hash; the landing carries ONE strong CTA — "Start a chat" leads to sign-up — with the rest as quiet links. The `AuthModal` is split screen. After login the landing is a **pending New chat** (lazy, not in sidebar until first prompt) — `pendingChat` in `App.jsx` holds it, `handleChatChanged` saves on `topic`.

- **`HeaderBar` / `LandingHeader`** — `fixed` on `isTourView` (`home`, `tour-themes`, legal) with auto-hide on scroll down (reappear on up or footer `IntersectionObserver`), `sticky` elsewhere. Wordmark `href="#/home"` vs `"#/chat"`, `AUTO/CLOUD` toggle hidden on tour (now in `Sidebar` top bar and `ChatView` composer), GitHub link, auth buttons. `isTourView` drives `pt-14` offset and `ParticleField` boost. For `view==="chat"` the global header is hidden and `ChatView`'s own header carries the left-nav `PanelLeft` and slides-panel toggle.
- **`Home`** — the landing tour at `#/home`, the front door. For a visitor it
   adds a slim auth bar (a single "Log in" link — the hero's one strong CTA is
   "Start a chat", which routes to register) and the tour; for a signed-in user
   the same page is the tour. Hero with the "the app does the bulk, you do the
   final touches" framing and "Bulk by machine, polish by you", the pipeline as
   a designed icon flow, how-it-works cards, a live theme carousel (reusing the
   specimen renderer), a local-vs-cloud split, a capability grid and a footer
   strip. Sections scroll-reveal on the shell keyframe via an IntersectionObserver;
   reduced motion shows them immediately.
- **`ParticleField`** — an ambient canvas dot-field behind the whole shell: a
  fine stipple drifts on two-axis sine wander so it moves without the pointer,
  and repels gently around it. Tuned as "drifting embers" — base opacity
  0.16–0.40, accent-dot share 0.22, 150px repulsion — with a 1.5× opacity boost
  on the login screen. Capped at 60fps, one static frame under
  `prefers-reduced-motion`, no loop while the tab is hidden or a navigation
  rail is focused, and nothing at all when a 2d context is unavailable.
- **`App.jsx` — the chat store and its cross-tab sync.** Chats live in
  localStorage keyed by account (`lib/chats.js`), persisted on every change and
  loaded at boot. Because a middle-clicked tab is a fresh load over the same
  storage, the shell listens for the `storage` event on its chat key: any other
  tab that writes the list triggers a reload here (the active chat survives
  unless the other tab deleted it, and the deck list refreshes when a produced
  chat appears). "New chat" (sidebar button, Home, Ctrl+N) returns to the
  account's existing empty chat of that kind — nothing sent, nothing produced —
  instead of stacking another empty row, so repeated clicks stay one thread
  until a topic is actually sent.
- **`Sidebar`** — the per-user navigation. Chats and Decks tabs (the old All
  decks / Reports split is now the Decks tab, `report`-flagged rows open the
  report's full-document view). Search filters title/slug/theme client-side
  and greps content server-side; the rail collapses to an icon strip and both
  states persist via localStorage. Every row — chat or deck — is a real
  `<a href="#/chat/<id>">` / `<a href="#/deck/<slug>">` so middle-click and
  copy-link work, and carries a hover "⋯" popover: a chat deletes locally, a
  deck opens or deletes server-side (`DELETE /api/decks/:slug`, behind a
  confirm modal). Deck names clamp to two lines so long titles stop truncating
  to initials. The one creation entry app-wide lives here, "+ New chat". The
  footer's bottom-left is a **profile chip** (`ProfileChip.jsx`) — avatar +
  name, avatar-only in the collapsed rail — that opens the **Settings modal**
  (`SettingsModal.jsx`), the ONE management surface. Three sections: Account
  (the person, cloud status/key/routing, logout behind the shared confirm),
  Saved formats (full preset CRUD — create/edit/delete a briefing format
  without any chat, shared with the briefing via a module-level presets store),
  and Identity (the long-term facts — institution and guide — edited inline;
  brand-marks upload kept; the per-submission fields subject/year/semester/
  exam-type/team are asked in the briefing and never stored here). The sidebar
  Settings row opens the same modal.
- **`ChatView`** — the chat window IS the app. A message thread with the input
  bar at the bottom: send a topic, the assistant walks the guided briefing one
  question at a time (each with a default), then a summary card whose "Plan the
  deck" is the only trigger of research and planning; the outline lands back in
  the thread for approval and "Open the deck" reaches the artefact. A
  Chat/Report toggle flips the same input bar between products. The input bar's
  model pill persists the pick on the chat. **Runs survive leaving the chat**:
  a generation's `AbortController` and status live in the module-level
  `lib/runs.js` registry, never in component state, so navigating away
  unmounts the view without touching the run — re-entering adopts the live run
  (busy, live status, working Stop button) and errors are persisted onto the
  chat so a failure that lands while the user is away is shown on return.
  **After the deck is ready the same thread becomes the deck editor**: the
  briefing cards collapse into a compact "Deck briefing" recap block (expandable
  to the full Q&A record), the input stays live, and a message there runs a
  real deck-edit turn through `/api/decks/:slug/chat` (`sendEditTurn`), with
  the applied changes and the fresh slide thumbnails landing back in the thread
  as a persistent turn log (`chat.turns`). A produced *report* chat keeps its
  readable record instead — input disabled with a hint.
- **`DeckDetail`** — theme/style selects, a **Density select + Re-sweep** that
  rewrites every content slide's body at the chosen density (`sweepDeck`, one
  scoped call per slide, grounding still applied), render + `.pptx` download,
  the slide grid with lightbox/inline-editor/presenter ops, a per-slide "make
  it punchier" bolt, a per-slide **type swap** opening a gallery of all 75
  types rendered in the current theme (specimens in `src/specimens.js`, cached
  per theme; compatible types remap locally, the rest get a scoped rewrite),
  per-slide **image upload** to `decks/<slug>/assets/` that sets the slide to
  an image type with the real asset, the Report panel (generate when no
  `report.yaml` exists, otherwise render `.docx`, download, thumbnail strip and
  an "Open report view" door), and the Research card — a compact coverage line
  that opens the full Research view. The density select reads
  `meta.density` (persisted at planning, overwritten by a sweep), so the deck
  reflects the briefing's choice instead of always defaulting to balanced.
  `lib/time.js` supplies the relative timestamps used everywhere.
- **The lightbox is the same slide with the same actions.** The enlarged view
  carries the full per-slide toolbar (edit, punch-up, swap type, add image,
  move, duplicate, delete) for the current slide — no feature exists on the
  small card that vanishes at full size. The swap gallery's 75 tiles render at
  ~200px+ and add a hover dock plus a click-through full-size preview (the same
  cached specimen PNG, no re-render) with the commit happening on the enlarged
  view; the filter box and the current type's "now" badge stay.
- **The chat rail is gone; the thread continues instead.** The old right-rail
  chat on the deck view is deleted, but the deck detail's only whole-deck
  changes are not limited to the theme selector and the Density Re-sweep: once
  a deck is produced, its originating chat becomes the editor (see `ChatView`)
  and every message is a deck-edit turn. The per-deck thread files
  (`chat.jsonl`, `decisions.md`) keep no standalone UI; the deck page stays
  full-width.
- **`ReportView`** — the full-document view of a report: a cover block (title,
  subtitle, subject, guide, team from the merged identity), then every section
  in the fixed graded order with paragraphs and tables rendered as prose, never
  YAML. Render `.docx` / download, a "Generate companion deck" button that
  plans from the report's sections and routes through the outline gate (the
  reverse flow), and — after a render — **the rasterised pages of the actual
  document** under "The rendered document" (LibreOffice → PDF → PNG via
  `reportPreview` in `src/preview.js`), so what the user sees is the real Word
   output. It is the land target of the sidebar's Reports tab and of the home
   "from a brief" flow; a missing report renders an empty state. Each section
    also offers *Add as slide*, which appends the section's prose as a bullets
    slide of the companion deck — the report-as-deck hybrid (F20). Render .docx
    and the Download link are gated by the report's **write state**: a report
    generation in flight for this slug (started from the deck's Report panel) is
    mirrored in the module-level `lib/reportWrites.js` registry (slug-keyed, the
    report counterpart of `runs.js`), and the view subscribes — while the write
    runs, Render .docx / Download / Plan / Add-as-slide disable with the write's
    status and a Stop affordance, so a report being rewritten can never be
    double-rendered. The write and the render share ONE busy state, so a
    "Writing section N of M" can never leave a stuck "Rendering…" behind — the
    registry's `end()` fires the terminal patch that clears it. The Download
    link is derived from server state, not component state: the report GET
    probes whether `out/report.docx` exists, so re-opening the view shows
    Download immediately without a re-render.
- **Deck detail actions.** The header's action row wires the Part-2 features:
  a Dark/Light toggle that remembers `meta.yaml`'s `mode`, PDF and Markdown
  export (`src/export.js`, reusing the LibreOffice converter for the PDF),
  a `.zip` sharing bundle (`POST /api/decks/:slug/bundle`, jszip over the deck
  folder), Clone (`cloneDeck` in the pipeline — content files copied to a fresh
  slug, meta re-stamped), and a Versions popover over the timestamped backups
  written into `decks/<slug>/backups/` on every save. A "+ Add slide" menu
  inserts slides from `templates/*.yaml` (`GET /api/templates`). Ctrl+Z/Ctrl+Y
  walk a 20-deep deck-state undo stack; Ctrl+S re-renders.
- **The outline's generation storyboard (F15).** While a plan generates, one
  tile per planned slide appears in the review, the slide being written
  highlighted as the SSE status frames stream in. This is the light form of the
  stretch canvas builder: a live filmstrip of *rendered* slides as they land
  would need a new SSE phase emitting each validated slide, which remains open.
- **Model pickers filter by mode.** `lib/modelMode.js` is a tiny client
  pub/sub holding LOCAL or CLOUD (default LOCAL), rehydrated at boot from the
  persisted routing preference. `lib/useModels.js` fetches the grouped model
  list once and exposes it filtered to the active mode, so the header toggle
  takes effect in the prompt, chat and report pickers without each re-fetching.
- **Motion.** Every transition rides one easing
  (`cubic-bezier(0.2,0.8,0.2,1)`, `--ease-shell`) — view switches (a keyed
  fade-and-rise), the sidebar collapse, the chat rail, card hover, the carousel —
  animating transform/opacity only, and a `prefers-reduced-motion` media query
  collapses them all to instant state changes.

### The auth gate — local single-install accounts

Accounts are deliberately NOT a multi-user system: they exist so the Cloud-key
section can be gated (the key is the one sensitive thing on the box) and to
have a place for future hosting. The deck/report/preset workspaces require a
session. Everything else — themes, models, identity GET — is open.

**Per-user deck access is one policy.** `canAccessDeck(user, owner)` in
`src/auth.js` is the single decision used by the deck list, the per-slug
detail/render/report gate, the content search and the sweep: owned decks belong
to their owner; ownerless decks (legacy folders, headless CLI runs) are the
operator's — visible and editable only by an admin account, so a fresh account
does not see a stranger's CLI decks as its own. The admin is the seed account
(created by `seedAdmin` with a `role: "admin"`), with `FORGE_ADMIN_EMAIL`
matching as a fallback for accounts minted before roles existed. The CLI is
unaffected — it runs headless and never goes through the server's auth.

`src/auth.js` owns the logic, `app/server` transports it. Passwords are hashed
with `crypto.scrypt` and a per-user random salt; the users file holds only
salt+hash, and the password is never logged, stored, or returned. Sessions are
opaque random bearer tokens held server-side in a gitignored sessions file —
the browser only ever sees the token, and tokens idle-expire after
`FORGE_SESSION_TTL_DAYS` (default 30), refreshed on use and pruned when dead.
`POST /api/auth/login` mints a session, `POST /api/auth/register` does not:
creating an account returns the user without a token and the visitor signs in
explicitly, so registration never silently logs anyone in. `POST /api/auth/logout`
and `GET /api/auth/me` back the header's account entry. `PUT/DELETE
/api/cloud/key` return 401 without a session, and the Settings modal's Cloud
section shows a login prompt until one exists. The AuthModal — reachable from
the landing's Log in / Sign up actions and from the shell — is the register/
login surface (the full-screen LoginScreen was retired when the landing became
the front door); both `config/users.json` and `config/sessions.json` are
gitignored.

**Registration** is open by default for local dev but closes on a public box:
`FORGE_OPEN_REGISTRATION=0` turns `POST /api/auth/register` into a 403 and the
owner's account is seeded at boot from `FORGE_ADMIN_EMAIL` +
`FORGE_ADMIN_PASSWORD` (idempotent — a restart never errors). The AuthModal
asks the server whether signup is open and hides the register tab when it is
not.

**Destructive and config-writing endpoints are gated.** `POST /api/sweep`
(deletes decks, and therefore operator-only), `PUT /api/identity`, brand
`POST`/`DELETE` and `PUT /api/cloud/routing` all require a session — an
unauthenticated visitor can no longer wipe decks or deface the identity/brand.
Heavy specimen renders are gated too, and the render endpoints run behind a
one-at-a-time mutex so a home box with a single CPU never stacks concurrent
LibreOffice/Chrome jobs. Slugs are format-validated (`^[a-z0-9][a-z0-9_-]{0,99}$`)
before the
img-tag exemptions, closing the traversal class in one place.

**Uploads are raster-only and verified.** SVG was dropped from the deck and
brand upload allowlists (an SVG can carry a script into the token-in-localStorage
origin), and every upload is checked against its magic bytes, so a smuggled
HTML file named `.png` is refused. Served assets carry a `sandbox` CSP.

**Headers.** The served UI gets a strict CSP (`default-src 'self'` + inline
styles); API JSON does not. With no `FORGE_UI_ORIGIN` configured, no CORS
headers are emitted at all. `FORGE_TRUST_PROXY=1` opts a reverse proxy into
`X-Forwarded-For` handling for the rate limiter.

### The cloud surface — opt-in hosted models

The app is local-first by default and stays that way: nothing calls a hosted
provider unless the user attaches one. `config/models.yaml` already allowed a
role to opt into an `openai-compatible` provider; the shell now makes that
usable end-to-end.

- **`src/cloud.js`** owns the secret store and the provider surface. Keys
  resolve environment-first, then from `config/local.yaml` — the gitignored
  file the Settings panel writes — so attaching a key never requires exporting
  anything. No code path returns a key value: status is booleans and labels,
  and the connection test reports success/failure text only. A provider's
  model list is the static `models:` array when declared, otherwise it is
  fetched live from `GET {baseURL}/models` (key-gated, best-effort, both the
  `{data:[{id}]}` and string-array shapes) — so a hosted box whose provider
  does not curate a list still gets a working picker.
- **The Settings/Cloud panel** (in the Settings modal's Account section) explains what the
  key is for, shows the provider/baseURL/model list under "Models this host
  has enabled", and offers save, remove and test actions wired to
  `GET/PUT/DELETE /api/cloud/key` and `POST /api/cloud/test`. The write path
  lands in `config/local.yaml`, never the repo.
- **Routing.** A `model` override in a request that names one of a cloud
  provider's `models:` list routes that request to the provider instead of a
  (likely absent) local pull — that is how picking `deepseek-v4-flash` in the
  prompt, chat or report picker sends the work to OpenCode Go. The model picker
  lists the cloud models as a labelled group only when a key is present.
- **Routing preference.** `config/local.yaml` also holds `routing.default`
  (`local` or `cloud`), set from the header's LOCAL/CLOUD toggle or the Cloud
  panel. It decides what "auto" means in every picker: the default label
  reflects it, and an unpicked model routes the *author* role to the attached
  provider's first model. Research, utility and critic stay on their configured
  backends — the toggle moves the user's work, not the plumbing. Cloud research
  is therefore a role-level choice: giving the research role a `provider:`
  switches its depth profile to the deeper cloud budgets (see the per-transport
  split above).
- **The connection test is an authenticated probe.** `/models` lists are public
  on some providers and prove nothing about a key, so the test issues a
  one-token chat call against the provider's first listed model and checks the
  status — a dummy key fails with the provider's 401, a real key reports the
  authenticated model.
- **Cloud structured output.** OpenAI-compatible providers reject
  `response_format: json_object` unless the prompt contains the word "json",
  and guarantee only that output parses — never that it matches the schema
  (unlike Ollama's grammar). The cloud transport prepends a system message
  stating the schema contract verbatim, so every constrained call spells out
  its keys and a strong model can hold the small per-call schemas in context.

### The brand surface — institutional marks, uploaded not committed

`brand/logos/` and `brand/generated/` are gitignored because institutional
marks are trademarks. The Brand marks section of the Settings modal's Identity
panel uploads crest, banner and watermark directly: the server writes the file
into `brand/logos/`
(replacing any earlier extension of that asset), then calls the same
`normalizeBrand()` the `npm run brand` CLI uses — one implementation, two
callers. Remove falls back to placeholders. The report renderer needs nothing
extra: it preserves the donor `.docx`'s own VML watermark byte-for-byte, so
reports already carry the institution's mark.

The three-layer rule is unaffected: the shell is human-owned chrome, and
`decks/<slug>/report.yaml` is written by the report generator exactly as
`deck.yaml` is — nothing in the UI ever specifies geometry.

### Saved briefing formats — presets

`src/presets.js` stores the reusable half of a briefing per user
(`config/presets/<user>.json`, gitignored): team, guide, academic context,
theme, density, branding and slides-per-member. The briefing's first question
offers them, and picking one pre-fills those fields and skips their questions
while the changing bits (title, subject, teacher) stay answerable. The server
CRUDs them behind the same session gate as the deck workspace; "Save as
preset" lives on the briefing's summary card. The skip logic is a client-side
walk over the per-kind question list (`effectiveBriefStep` in
`lib/briefing.js`), and a "change" click on a preset-fixed question un-skips
it for that deck.

### Deployment — the home-server path

The app is built to run on a friend's old Linux box. A Dockerfile (Node 24 +
LibreOffice + Chrome) and `docker/docker-compose.app.yml` pair the app
container with the bundled SearXNG; the API serves the built UI and SPA
fallback from one port; the stateful directories are env-pointed at a named
volume. The monthly sweep (`src/sweep.js`) deletes decks older than
`FORGE_SWEEP_DAYS` unless `meta.keep: true`, runs daily at `FORGE_SWEEP_HOUR`
from the server's own scheduler (env-gated — no env, no sweep), and emails the
owner via `src/mail.js`, a dependency-free SMTP client. Light hardening for a
public box: secure headers, a CORS allow-list (`FORGE_UI_ORIGIN`), rate-limited
auth endpoints, and validated uploads (extension + size) for brand marks and
deck images. `POST /api/sweep` and `npm run sweep` run the sweep manually.

## Multi-tenancy — what one account can reach

The account system began as a gate on the operator's cloud key, and for a while
several surfaces stayed install-wide while looking per-user. On a hosted box
that is not a hardening detail, it is a correctness bug: two students from
different colleges get each other's institution on their slides.

Four things are now per account, and one deliberately is not.

**Identity** (`src/ai/identity.js`) resolves in four layers: the committed
template, the operator's `config/identity.yaml`, the account's own overrides,
then the deck's `meta.yaml`. The account layer needs no plumbing — the deck
folder already records `meta.owner`, so the same read that supplies the last
layer identifies the third. A deck therefore renders with the identity of
whoever owns it, whatever anyone else has since changed in Settings.

**Brand marks** follow identity. Each account normalises into
`brand/users/<hash>/` and its identity points at those paths; an account that
has uploaded nothing falls through to the operator's marks rather than getting
placeholders. `normalizeBrand({ srcDir, outDir, placeholders })` is the one
implementation, called with different directories.

**BYOK keys** were the sharpest edge: they were stored encrypted per user and
then never read, because the model client resolved `env:NAME` against the
install-wide config. Every "bring your own key" generation actually billed the
operator. `resolveProviderKey()` now prefers the calling account's vault entry
for every provider except the shared gateway.

**Routing** (Auto vs Cloud) is per account in `user_prefs`, with the
`config/local.yaml` value as the default for accounts that have never chosen —
and as the whole answer for the CLI, which has no account.

**The shared gateway key is deliberately install-wide.** It is the operator's
key, billed to the operator and rate-limited per user by `src/limits.js`. Only
an admin may set it.

### How the account reaches the model client

`chat()` sits five or six calls below the HTTP layer, and the CLI must keep
working with no account at all. Threading a user id through `pipeline` →
`generate` → `turn` → `chat` → `resolveRole` would put a parameter nobody else
needs into every signature.

`src/account.js` uses `AsyncLocalStorage` instead: one middleware makes the
caller ambient for the request, and anything underneath asks
`currentUserId()`. A detached generation task started inside a handler inherits
the context, which is what makes a multi-minute SSE run resolve the right key.
Outside a request there is no account and every lookup falls back to the
install-wide configuration — exactly the old behaviour.

### Admin is a role, never an address

`isAdmin()` reads `user.role` and nothing else. It used to also return true for
a hardcoded email and for `FORGE_ADMIN_EMAIL`, but registration does not verify
email ownership, so on a public box whoever signed up with that address first
owned the instance. The env var still designates the operator — at boot, where
`seedAdmin()` creates the account or `promoteToAdmin()` promotes an existing
one, and where nothing reachable over HTTP can interfere.

### Media URLs authenticate; they are not public

Rasters, downloads and uploaded assets used to skip authentication entirely,
because an `<img>` tag cannot send an `Authorization` header and the slug was
assumed undiscoverable. A slug is `slugify(title)`, so it was guessable, and
the whole deck store was readable by anyone who could guess a title.

They now authenticate with an httpOnly cookie carrying the same session token,
scoped to `Path=/api/decks` and accepted *only* on those media paths. Every
state-changing route still reads the bearer header and ignores the cookie, so
broadening the credential cannot broaden CSRF exposure. Ownership is then
checked exactly as it is for the deck itself. The cookie is marked `Secure` on
an HTTPS request, which is why the deployment terminates TLS.

## Data locations

| Path | Committed | Notes |
|---|---|---|
| `themes/`, `schema/`, `src/`, `app/` | yes | source |
| `config/identity.yaml` | no | the OPERATOR's install-wide identity default; per-account overrides sit above it |
| `config/identities/<hash>.yaml` | no | one account's identity overrides — institution, guide, brand paths |
| `config/local.yaml` | no | the install-wide provider key + the fallback `routing.default`; per-account keys live encrypted in the DB |
| `config/forge.db` | no | accounts, sessions, per-user BYOK keys (AES-GCM), per-user routing, auto-tier usage |
| `config/users.json`, `config/sessions.json` | no | local accounts (scrypt hashes) and their bearer-token sessions — the auth gate |
| `config/presets/` | no | saved briefing formats, one file per user |
| `config/uploads/` | no | staged briefing documents — upload-only research mode; short-lived (swept after the TTL), resolved by token at planning |
| `brand/logos/` | no | the operator's raw marks — trademarks stay local |
| `brand/users/<hash>/logos`, `.../generated` | no | one account's own marks, uploaded via the Brand panel |
| `brand/generated/`, `brand/fonts/` | no | reproducible via tools |
| `decks/<slug>/deck.yaml`, `meta.yaml` | yes | the deck |
| `decks/<slug>/plan.yaml` | yes | the approved outline |
| `decks/<slug>/research/` | yes | the shared research pass (notes.md + sources.json) both artefacts draw from |
| `decks/<slug>/out/` | no | rendered artefacts |
| `decks/<slug>/assets/` | no | uploaded slide images (gitignored, referenced as `assets/<file>`) |
| `decks/.specimen-cache/` | no | type-swap gallery renders, cached per theme |
| `.plate-cache/` | no | headless-Chrome plate PNGs, keyed by content hash |
| `decks/<slug>/chat.jsonl`, `decisions.md` | no | per-deck thread state |
| `decks/<slug>/backups/` | no | timestamped deck.yaml snapshots — the version history (F14) |
| `decks/<slug>/report.yaml` | yes | the report content (sibling of deck.yaml) |
| `templates/` | yes | reusable partial slides the "+ Add slide" menu inserts |
| `reference/` | no | the report donor `.docx`; gitignored because it carries third-party names, and `FORGE_REFERENCE_DIR` points it at the volume on a hosted box where an admin uploads it |
