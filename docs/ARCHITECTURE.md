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

The gallery is at the 20-theme target: one native reference (warm-humanist),
fifteen native design languages (Swiss grid, editorial magazine, Muji,
neubrutalism, Bauhaus, Memphis, Art Deco, dark-neon, Linear, Material You,
flat, retro-terminal, newsprint, Notion, Alegria) and four plated ones. The
fifteen native themes rely on the fitter's family table — its per-family
advance estimates are what keep a one-line title on one line — and on their
section-surface luminance, which the chrome's crest/footer variant derives
from. A theme-contract test loads every theme and machine-checks the split.

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
from angles, radii and topological depth — never from content.

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
a fresh page like the donor's Abstract, and the two page-breaks after the cover
reproduce the donor's blank second page.

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

## The web shell

The browser UI is a shell around the same `src/` pipeline; `app/server` stays a
thin transport and every control maps to a real endpoint. `App.jsx` owns the
deck list (fetched once, re-fetched on a version bump) and routes between
`home`, `deck`, `new`, `outline`, `themes` and `identity`:

- **`HeaderBar`** — wordmark (home link), the sidebar collapse toggle, a Docs
  modal (reads the repo README via `GET /api/docs`) and the GitHub link. When a
  cloud provider is configured it shows the LOCAL/CLOUD toggle, which writes
  the routing preference and flips the client model-mode store so every picker
  filters to that mode; CLOUD is only reachable when a key is attached, and
  without one the button points at Settings/Cloud. The account entry lives
  here too: Login/Register when logged out, name + Logout when in.
- **`ParticleField`** — an ambient canvas dot-field behind the whole shell: a
  fine stipple (more, smaller dots than before) drifts on two-axis sine wander
  so it moves without the pointer, and repels gently around it. Capped at 60fps,
  one static frame under `prefers-reduced-motion`, no loop while the tab is
  hidden or a navigation rail is focused, and nothing at all when a 2d context
  is unavailable.
- **`Sidebar`** — the persistent deck list, grouped by relative date, with a
  real cover thumb per row (`DeckThumb`, fallback tile when no preview is on
  disk). Tabs filter All decks / Reports using the `report` flag that
  `deckMeta()` adds, search filters title/slug/theme client-side, and the rail
  collapses to an icon strip. Both rails persist via localStorage. The Reports
  tab is about the document, not the deck: its rows open the report's
  full-document view even when the deck also has slides.
- **`Home`** — the prompt box is the generate surface. Deck mode streams a
  brief to the outline gate (`POST /api/decks`, SSE); Report mode streams a
  report either from a deck (`POST /api/decks/:slug/report/generate`) or from a
  brief alone (`POST /api/reports`, standalone — no deck required). Suggestion
  pills fill the prompt. Everything that is not the brief lives in the config
  popover behind the sliders button: audience and slide-count presets (deck
  mode) fold into the brief and `maxSlides`; report mode's source, deck picker
  and Full/Brief depth live there too. A "Recent decks" carousel reuses the
  deck list.
- **`DeckDetail`** — theme/style selects, render + `.pptx` download, the slide
  grid with lightbox/inline-editor/presenter ops, a per-slide "make it punchier"
  bolt (a scoped chat turn), the Report panel (generate when no `report.yaml`
  exists, otherwise render `.docx` and download it), and the Research panel
  beside it — a read-only view of `research/notes.md` with an Edit mode that
  saves back, and `sources.json` as a collapsible list. The research surface is
  the trust layer: the user can see and correct what the model writes from,
  and an edit feeds the next generation because the writer reads `notes.md`
  fresh at write time. `lib/time.js` supplies the relative timestamps used
  everywhere.
- **The chat rail only exists on the deck view.** It edits `deck.yaml`, so with
  no deck open it would be dead weight; Home, Identity, Themes, the wizard and
  the outline review are full-width. The rail stays mounted and animates its
  width on the shell's shared easing rather than popping in. The shell's
  content row isolates its stacking context and the header sits on its own
  z-20 layer, so nothing a rail or panel renders can paint over the product
  bar — the top-left escape that once pushed the chat rail over the header is
  structurally unrepresentable.
- **`ReportView`** — the full-document view of a report: a cover block (title,
  subtitle, subject, guide, team from the merged identity), then every section
  in the fixed graded order with paragraphs and tables rendered as prose, never
  YAML. Render `.docx` / download and a *Generate companion deck* button that
  plans from the report's sections and routes through the outline gate (the
  reverse flow). It is the land target of the sidebar's Reports tab and of the
  home "from a brief" flow; a missing report renders an empty state. Each
  section also offers *Add as slide*, which appends the section's prose as a
  bullets slide of the companion deck — the report-as-deck hybrid (F20).
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
have a place for future hosting, and that is all. Everything else stays open.

`src/auth.js` owns the logic, `app/server` transports it. Passwords are hashed
with `crypto.scrypt` and a per-user random salt; the users file holds only
salt+hash, and the password is never logged, stored, or returned. Sessions are
opaque random bearer tokens held server-side in a gitignored sessions file —
the browser only ever sees the token. `POST /api/auth/login` mints a session,
`POST /api/auth/register` does not: creating an account returns the user
without a token and the visitor signs in explicitly, so registration never
silently logs anyone in. `POST /api/auth/logout` and `GET /api/auth/me` back
the header's account entry (Login/Register when logged out, name + Logout when
in). `PUT/DELETE /api/cloud/key` return 401 without a session, and the Identity
view's Cloud section shows a login prompt until one exists. The AuthModal and
the full-screen LoginScreen are the register/login surfaces; both
`config/users.json` and `config/sessions.json` are gitignored.

### The cloud surface — opt-in hosted models

The app is local-first by default and stays that way: nothing calls a hosted
provider unless the user attaches one. `config/models.yaml` already allowed a
role to opt into an `openai-compatible` provider; the shell now makes that
usable end-to-end.

- **`src/cloud.js`** owns the secret store and the provider surface. Keys
  resolve environment-first, then from `config/local.yaml` — the gitignored
  file the Settings panel writes — so attaching a key never requires exporting
  anything. No code path returns a key value: status is booleans and labels,
  and the connection test reports success/failure text only.
- **The Settings/Cloud panel** (bottom of the Identity view) explains what the
  key is for, shows the provider/baseURL/model list, and offers save, remove
  and test actions wired to `GET/PUT/DELETE /api/cloud/key` and
  `POST /api/cloud/test`. The write path lands in `config/local.yaml`, never
  the repo.
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
  backends — the toggle moves the user's work, not the plumbing.
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
marks are trademarks. The Brand section of the Identity view uploads crest,
banner and watermark directly: the server writes the file into `brand/logos/`
(replacing any earlier extension of that asset), then calls the same
`normalizeBrand()` the `npm run brand` CLI uses — one implementation, two
callers. Remove falls back to placeholders. The report renderer needs nothing
extra: it preserves the donor `.docx`'s own VML watermark byte-for-byte, so
reports already carry the institution's mark.

The three-layer rule is unaffected: the shell is human-owned chrome, and
`decks/<slug>/report.yaml` is written by the report generator exactly as
`deck.yaml` is — nothing in the UI ever specifies geometry.

## Data locations

| Path | Committed | Notes |
|---|---|---|
| `themes/`, `schema/`, `src/`, `app/` | yes | source |
| `config/identity.yaml` | yes | remembered defaults, user-editable |
| `config/local.yaml` | no | cloud API keys + `routing.default` — written by the Cloud panel and header toggle |
| `config/users.json`, `config/sessions.json` | no | local accounts (scrypt hashes) and their bearer-token sessions — the auth gate |
| `brand/logos/` | no | raw supplied marks — trademarks stay local; uploaded via the Brand panel |
| `brand/generated/`, `brand/fonts/` | no | reproducible via tools |
| `decks/<slug>/deck.yaml`, `meta.yaml` | yes | the deck |
| `decks/<slug>/plan.yaml` | yes | the approved outline |
| `decks/<slug>/research/` | yes | the shared research pass (notes.md + sources.json) both artefacts draw from |
| `decks/<slug>/out/` | no | rendered artefacts |
| `.plate-cache/` | no | headless-Chrome plate PNGs, keyed by content hash |
| `decks/<slug>/chat.jsonl`, `decisions.md` | no | per-deck thread state |
| `decks/<slug>/backups/` | no | timestamped deck.yaml snapshots — the version history (F14) |
| `decks/<slug>/report.yaml` | yes | the report content (sibling of deck.yaml) |
| `templates/` | yes | reusable partial slides the "+ Add slide" menu inserts |
| `reference/` | no | institutional templates to check against — the report donor; gitignored because it carries third-party names |
