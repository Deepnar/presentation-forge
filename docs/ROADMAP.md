# Roadmap

Status of every feature, and what was learned building it. The **Learned**
entries are the point of this file — they record things that were not obvious
beforehand and would otherwise be rediscovered the expensive way.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

---

## 1. Foundation

### [x] Font pipeline
27 Google families / 76 weights, manifest-driven, idempotent.
`tools/install-fonts.mjs` · `tools/fonts.manifest.json`

> **Learned.** The Google Fonts CSS2 API content-negotiates on User-Agent.
> Sending *no* UA returns clean `.ttf` urls; spoofing an old browser returns
> extension-less `/l/font?kit=…` urls that fontconfig silently refuses to index.
> The intuitive move (spoof an old browser to avoid woff2) is backwards.
>
> The machine shipped with only Noto/DejaVu/Liberation — 729 "families" that
> contain none of the typefaces any real design system needs. Worth checking
> `fc-match <name>` returns the name back rather than a fallback.

### [x] Brand asset normalisation
`tools/prep-brand.mjs` — keys out white backgrounds, trims, emits a knockout variant.

> **Learned.** The supplied crest was a JPEG-ish PNG with no alpha and heavy
> white padding (447×447 containing 163×190 of art). On light themes this is
> invisible; on dark themes it is a white box. Alpha keying by *saturation*
> rather than a hard threshold preserves antialiased edges — neutral pixels get
> alpha from their lightness, saturated pixels stay fully opaque.
>
> Keying alone is not enough: the crest's wordmark is dark navy and vanishes on
> dark backgrounds. A single-colour reversed ("knockout") variant is the standard
> brand-guideline answer, and the renderer picks it by background luminance.

### [x] Theme format
`tokens` / `voice` split. Reference implementation: `themes/warm-humanist.yaml`.

> **Learned.** The original `design_system.txt` was a *prompt* — "heavy
> rounding", "Merriweather or similar". That works when a large model writes
> free-form HTML and fails completely as renderer input. The port is not a
> reformat; it is a change of kind, from persuasion to specification.

### [x] Content schema
`schema/deck.schema.json`, 15 slide types, per-type conditional rules.

> **Learned.** Ajv's raw errors ("must match a schema in anyOf") are useless as a
> correction prompt for a small model. `src/validate.js` resolves each error to
> a slide index, its type, and the specific edit needed. This output is a
> product surface, not a debug log — it is what the model reads to fix itself.

### [x] Renderer
`src/render.js` + `src/layouts.js` — 15 layouts, zero literal colours or fonts.

> **Learned.** Keeping every literal out of `layouts.js` is what makes 20 themes
> cost 20 YAML files instead of 20 renderers. The discipline only holds if it is
> absolute — one hardcoded `#FFFFFF` for "just this one case" and the property
> is gone.
>
> Single-series charts must not vary colour per bar: it encodes a distinction
> that does not exist and pulls low-contrast palette entries onto the plot.
>
> Every text element in a stacked layout must be fit-scaled or reserve the real
> rendered line count. The `cards`/`compare` titles and the `stats` value/label
> were not fit — a title long enough to wrap rendered its second line over the
> body, and a wrapping stat value hit its label. Found only by looking at
> rasterised output. Fitted titles now stay contained in their boxes, and the
> heading reserves the number of lines it actually renders.

### [x] Text fitting
`src/fit.js` — heuristic advance-width estimation, shrink-only.

> **Learned.** PowerPoint's own autofit is not applied until a human opens the
> file, so a deck can look correct in LibreOffice and overflow on the projector.
> Sizing must be baked in at generation time. The fitter is deliberately
> pessimistic — slightly small never costs marks, overflow does.

### [x] Preview / rasterisation
`src/preview.js` — LibreOffice → PDF → PNG + 480px thumbs.

> **Learned.** `soffice -env:UserInstallation` needs an absolute `file://` URL,
> and `--outdir` resolves against soffice's cwd, not the caller's. Without a
> private profile it silently no-ops when a desktop LibreOffice is already
> running.

### [x] Locked chrome layer
`src/chrome.js` — applied after the theme draws, on every slide.

> **Learned.** Making this a separate pass rather than a theme responsibility
> means a theme *cannot* forget the institution's marks. The marks are the one
> thing that is actually graded, so they must not depend on theme correctness.
> Chrome text colour has to derive from the background the layout painted, not
> from the palette — `ink_muted` is only correct on the standard page.

---

## 2. Web application

### [x] API server
`app/server/index.js` — Express over `src/`, no logic of its own.

> **Learned.** Do not read `process.env.PORT` for a backend that sits behind a
> dev frontend: harnesses inject it for the *frontend*, the API steals the port,
> and the browser hits Express and shows "Cannot GET /". Use a namespaced var.

### [x] UI shell — decks, themes, identity
`app/web/` — Vite + React + Tailwind v4.

> **Learned.** Vite resolves `root` against the cwd, not the config file's
> directory. Running `vite --config app/web/vite.config.js` from the repo root
> serves nothing at `/` until `root` is set explicitly.
>
> Theme cards render a *live specimen* from the theme's own tokens rather than a
> stored screenshot — impossible to leave stale, and free.
>
> Full-resolution slide plates (~1.5 MP) as grid thumbnails will stall a
> browser. With 480px thumbs at ~28 kB, `loading="lazy"` is worse than useless:
> it adds an intersection-observer dependency to save nothing.

### [x] Deck detail view
Grid, theme switcher, render, download, zoom modal, inline editing.

- [x] Slide grid with type labels
- [x] Theme switcher + re-render
- [x] `.pptx` download
- [x] Lightbox with keyboard navigation (← → Home End Esc) + filmstrip
- [x] Inline field editing (headline, bullets, card text)
- [x] Per-slide presenter assignment
- [x] Slide reorder / delete / duplicate

**Inline editing** is deliberately separate from chat. Clicking a headline and
typing must not wake a model — `app/web/src/components/SlideEditor.jsx` writes
`deck.yaml` directly (through the existing validated PUT) and re-renders. A
per-type descriptor map drives the form; every keystroke re-validates the draft
through `POST /api/validate`, so schema errors surface while typing and a bad
save is blocked. Title slides edit `deck.title`/`subtitle` because that is what
the title layout draws. Chart series data is the one deliberate gap — the
editor says so and points at chat.

**Presenter assignment** is a free per-slide `presenter` string, not a computed
split. The real distribution is unpredictable — one person may take one slide
or five — so the field is free text (a datalist suggests team members) and the
UI allows assigning any slide to anyone. The chrome footer reads
`slide.presenter` ahead of whoever is marked `presenting` and the team label.
Being a schema field means the model's ops/catalog know it too, so chat can
propose an even split as a starting point.

**Reorder / delete / duplicate** are pure immutable ops
(`app/web/src/lib/slides.js`, unit-tested): move, deep-copy duplicate, delete
that refuses to empty a deck. Each persists deck.yaml immediately and re-renders
on a short debounce so rapid operations coalesce.

> **Learned.** The slides are raster images, so "click-to-edit" cannot mean
> contenteditable on the slide — the editor is a form modal. The per-type field
> map has to mirror deck.schema.json's own maxLengths or the form can offer a
> field the schema rejects; the schema is the single source both derive from.
>
> The grid must iterate the deck, never the raster previews: right after a
> delete or duplicate the PNG set lags the content by one render, so a fresh
> duplicate would show a stale thumbnail (or a gap). A skeleton fallback for a
> missing frame keeps the count correct before the re-render lands.
>
> A slide card was a single `<button>`; adding interactive children to a button
> is invalid HTML. The card had to become an image-button plus a controls row,
> which is why the whole grid restructure landed with the editing feature.
>
> Empty optional fields are stripped on save, so clearing a field really removes
> it and required fields then fail validation with the reason visible — the
> alternative (save empty strings) renders blank headlines that only the vision
> critic would ever see.
>
> The presenter override is content, not layout: a free string on the slide, and
> the chrome reads it first. Putting it in the schema rather than a UI-only
> overlay is what lets chat propose assignments too.

> **Learned.** Relative navigation must use the functional state updater.
> Reading the current index from the effect's closure loses keystrokes —
> several `keydown` events fire before React re-renders, each computes from the
> same stale value, and a held arrow key silently skips slides. It looks correct
> under single slow presses, which is exactly how it gets missed: stepping from
> slide 5 with three left presses landed on 4 instead of 2.

### [x] Intake wizard
Collect team, subject, guide, year, brief and sources before generation, then
hand the result to the pipeline as part of the model's brief.

`NewDeck.jsx` is the full entry form: brief, sources, theme, max slides, and an
identity panel (subject, academic year, semester, exam type, guide name +
designation, team label, and a member list with a "presents" tick). The
identity pre-fills from `config/identity.yaml`, saves back as remembered
defaults, and freezes into `decks/<slug>/meta.yaml`. The wizard snapshot flows
to planning (the model sees the subject), and the renderer's existing
meta-over-config merge puts the per-deck team, guide and year on the slides.

> **Learned.** The renderer already merged `decks/<slug>/meta.yaml` over
> `config/identity.yaml`, so "freeze what each deck used" turned out to be just
> *writing the wizard snapshot into meta.yaml* — zero renderer changes needed.
> The presenter on content slides is simply the member with `presenting: true`
> in that snapshot. Identity lives in three places by design: remembered
> defaults (config), per-deck truth (meta), and the model's brief (planning
> prompt). Every field is free text — nothing here can be an enum, because team
> size, designations and years change every submission.

`config/identity.yaml` is *remembered defaults*, not the source of truth: the
wizard pre-fills from it and saves back, so the first run asks everything and
later runs only need the year or subject changed.

### [x] Outline review
The human-in-the-loop guardrail. Model proposes the slide plan; nothing renders
until it is approved or edited. This is what makes free-form structure safe with
a small local model — strictly better than presets, which guess in advance and
are wrong half the time.

`planDeck()` in `src/ai/generate.js` already returns the plan as a discrete,
reviewable artefact (`{title, sections, slides:[{type, section, purpose}]}`).
Shipped as one vertical slice with the generation endpoints and the UI: a brief
form (`NewDeck.jsx`) streams a plan, the review view (`Outline.jsx`) edits and
approves it, and generation streams slide-writing progress into a rendered deck.

> **Learned.** The plan gate had to be a *disk-level* boundary, not just a UI
> stop. A planned deck is `meta.yaml` + `plan.yaml` with no `deck.yaml`, so a
> closed browser leaves the outline reviewable and resumable, and an aborted
> generation can never leave a half-written deck — `deck.yaml` is written only
> after a fully validated run. Orchestration for both callers lives in
> `src/ai/pipeline.js` (`createDeck`, `generateFromPlan`); the server and the
> `forge` CLI are transports over it.
>
> The outline needs an explicit-plan path in the generator. `generateDeck` now
> takes a `plan`, and `sanitizePlan` coerces both the planner's output and a
> human-edited outline through the same shape (type enum, title-slide
> guarantee), so the two can never drift.
>
> SSE had to be chosen once because the chat panel inherits it. It streams
> cleanly over a POST body through the Vite dev proxy; no polling endpoint was
> added. Dropped sockets abort the pipeline via a request-scoped
> `AbortController`, so a vanished client stops burning model time.

### [x] Application shell — collapsible rails
Left navigation collapses to an icon rail; right panel (chat) collapses to an
edge tab. Both states persist. The centre column is the deck grid and must stay
the focus — the rails serve it, not the other way round.

`App.jsx` now has a left rail that collapses to icons (labels/hints hidden,
tooltips instead) and a right rail built as a *generic slot* — an empty panel
that collapses to an edge tab, ready for the chat panel. Both states persist to
`localStorage` (`forge.leftNav`, `forge.rightRail`).

> **Learned.** The right rail is a container, not a feature: it exists so the
> chat panel has somewhere to live, and building it as a slot first means the
> chat panel later is pure content, not another shell refactor. Left-rail
> persistence matters more than it looks — a collapsed-by-default state that
> resets every load makes the icon rail feel like a bug, not a preference.

Depends on nothing; blocks the chat panel, which needs the right rail to exist.

### [x] Chat panel — the AI wrapper
A conversational surface in the right rail: streamed tokens, stop, retry,
edit-and-resend, visible applied changes, model picker, context-usage
indicator.

`src/ai/chat.js` orchestrates one turn over a per-deck thread using the same
`runTurn` primitive the vision critic uses — a chat instruction and a critic fix
are the same turn from different sources. The server exposes it as SSE over a
POST body (`/api/decks/:slug/chat`) plus `GET`/`DELETE` for the thread; the CLI
is `forge chat <slug> "<instruction>"`. The right-rail slot is now `ChatPanel`.

**Memory model — state over transcript.** deck.yaml is the memory. The thread
has three tiers: the deck files themselves, `chat.jsonl` holding the last 10
turns verbatim, and `decisions.md` for standing preferences extracted by the
utility role (tiny bounded schema; one-off requests are never promoted). Older
turns collapse into a rolling summary instead of being truncated, so a long
session degrades gracefully rather than forgetting its first half.

> **Learned.** Three things were not obvious beforehand.
>
> The transcript a turn replays must carry *intent, not history*. The deck file
> is the model's memory, so replaying the whole conversation burns context
> re-deriving what the file already states. History is the rolling summary plus
> recent user instructions, with promoted instructions dropped — they already
> sit in decisions.md, which `runTurn` feeds as system context.
>
> Turn and generate are not "the same path at different input sizes". Planning
> needs its own narrow schemas and writes `plan.yaml`; chat edits a deck that
> must already exist. `runChatTurn` refuses a missing `deck.yaml`, keeping the
> seam explicit rather than accidental.
>
> The deck is the unit of context, and that extends to research: feeding the
> deck's `research/notes.md` into every turn grounds edits in the same material
> the outline was approved on, so a chat edit cannot drift away from the brief.
>
> Verified behaviourally: SSE stream → render → preview round-tripped on a real
> deck; a client abort at 2s stopped the model call with no unhandled error; 11
> consecutive turns produced exactly the last 10 in `chat.jsonl` plus a summary
> record; a durable instruction ("keep it under 12 slides") was promoted to
> `decisions.md` while a one-off edit was not.

---

## 3. Themes

Target is 20, drawn from recognised design languages so the choice means
something to a viewer rather than being twenty arbitrary palettes.

### [x] `warm-humanist` — reference implementation
The format contract every other theme follows. Ported from `design_system.txt`.

### [x] Styles — cross-cutting token variants
`styles/*.yaml` deep-merge token (and voice) overrides over *any* theme, so a
deck renders as **theme × style**. `loadTheme(name, { style })` applies the
merge; `render`, the API and the CLI accept `--style`; a deck may set a default
`style` in `deck.yaml`. `tools/compare.mjs` renders a deck across the full
theme × style matrix as an HTML contact sheet (`npm run compare <deck.yaml>`),
and the deck detail UI has a style selector beside the theme selector.

> **Learned.** A style is a *subset* of tokens that overrides the theme's, so
> the merge must be deep (objects merge, arrays replace) or a one-key style
> drops entire theme blocks. Styles and `voice` merge the same way, which is
> why "compact" can set `voice.density: dense` without restating the theme's
> tone. The `band` anchors live under `grid`, so a style that tightens margins
> should tighten `band` too or the title band no longer matches the margins.

### [ ] Native-renderable themes (15)
Expressible with pptxgenjs shapes alone, so text stays editable in PowerPoint.

`swiss-international` · `editorial-magazine` · `minimal-muji` · `neubrutalism`
`bauhaus` · `memphis-postmodern` · `art-deco` · `dark-neon` · `linear-dark`
`material-you` · `flat-2` · `retro-terminal` · `newsprint` · `notion-clean`
`corporate-alegria`

Mostly YAML now that the format is proven. Build in batches of three or four
and **render each one before ticking it** — a theme that validates but produces
unreadable contrast is not done. Each needs its `surfaces.title` and
`surfaces.section` set explicitly; the derived fallback is correct for
warm-humanist and wrong for anything inverted.

### [x] Plate-dependent themes (4)
`glassmorphism` · `claymorphism` · `neumorphism` · `aurora-mesh`

Each is a YAML theme with `tokens.plate.enabled: true` plus a `plate.html`
template (and `plate.surfaces.title/section` variants) that interpolates the
theme's own tokens as `{{tokens.palette.accent}}` — no hardcoded hex in any
template. All four use real CSS effects on the plate:

- **glassmorphism** — translucent colour blobs blurred behind a frosted
  content-zone panel (`backdrop-filter: blur`); native cards are translucent
  white via `shape.card_fill`, a second glass layer.
- **aurora-mesh** — multi-stop radial mesh built from accent/alt/ink/surface
  tones with a soft white halo behind the content area.
- **claymorphism** — a rounded translucent clay board (inset highlight + soft
  shadow) behind the content, warm clay native cards.
- **neumorphism** — one embossed content-zone field whose dual shadows (light
  top-left, dark bottom-right) are a CSS box-shadow OOXML cannot express;
  native cards are near-invisible so the field's shadows are the surface.

The two renderer affordances this needed were small and shared: `card()`
honours a theme `shape.card_fill` transparency (so native panels can frost or
vanish), and plate templates receive `{{box.*}}` — the content region in CSS
pixels — so a template can panel exactly the area the native content draws.

> **Learned.** Five things were not obvious beforehand.
>
> The content box is the seam: `content()` returns `bottom` and `y` but not
> `h`, so `{{box.h}}` interpolated to `NaN` and every content-zone panel —
> frost, board, embossed field, halo — rendered invisible while the mesh
> background still looked right. The first four themes were "verified" with
> their central effect silently missing; a plate template can only trust a
> value it can prove is real.
>
> fitScale's height budget lets a title wrap to two lines inside the box and
> then breaks a long word mid-word at six narrow flow steps. Forcing one line
> needs a width-based shrink (measured width, pessimistic safety factor), not a
> height probe.
>
> Neumorphism's dual shadows must be proportionate to the field (~1146px) and
> use the ink tone for the dark side: ink_muted is too close to the page gray
> and the whole emboss vanishes at preview resolution. Verified by pixel
> sampling the plate PNG, not just by eye.
>
> A relative cacheDir produces a malformed `file://.plate-cache/…` URL (the
> directory becomes the URL host) and Chrome screenshots a blank dark page.
> Resolve the cache dir absolutely before building the URL.
>
> `surfaces.title` and `surfaces.section` really do need setting explicitly —
> the derived fallback inverts ink/bg for dark and colourful heroes, exactly
> the trap the roadmap warned about. Each theme's title plate, text tokens and
> section surface were designed together.

Verified per theme by rendering `decks/raytracing-ai` through the full
Chrome → pptx → LibreOffice → PNG pipeline and vision-checking with
`mimo-v2.5`: frosted panels and blur (glass), the multi-stop mesh (aurora), the
clay board with inset highlight (clay), and the embossed field with visible
dual shadows (neumorphism) all rendered with native text readable on every
slide.

### [x] HTML plate renderer
Headless Chrome renders decorative CSS backgrounds to PNG at build time; the
renderer places them as slide background plates with all *text* still native.

`src/plate.js` is the primitive, built once for both callers: input is an HTML
document + viewport (1280×720 CSS px, 16:9, at scale 1.5 → 1920×1080), output is
a PNG cached in `.plate-cache/` keyed by sha256 of (html + viewport + scale + a
version tag). No npm dependency — it shells out to `google-chrome-stable`
(`--headless=new --screenshot --window-size --force-device-scale-factor
--virtual-time-budget`), with one restart retry on a crashed tab. The page is
sandboxed by a CSP (`default-src 'none'`, inline styles + local data:/file:
images and fonts only) so scripts and every network scheme are unrepresentable.

Two caller seams, both ending at the same `renderPlate`:
- **Theme plates.** A theme declares `tokens.plate.enabled: true` plus
  `plate.html` (and optional `plate.surfaces.title/section/content` variants),
  referencing its own tokens as `{{tokens.palette.bg}}` — the renderer
  interpolates against the resolved theme (mode-adjusted palette), so the theme
  YAML stays the single source of colours.
- **Freeform.** A slide with an `html` field uses that as its plate, overriding
  the theme. The freeform feature (schema field, model support, whole-deck mode)
  is the next task — the primitive and the override seam already exist.

`render.js` sets the plate as the true slide background (`slide.background =
{ data }`) AFTER the layout runs, so it sits under every shape and the chrome;
the chrome's legibility falls back to the surface's declared `bg` on plate
slides because the flat palette no longer describes what is painted.

> **Learned.** Four things were not obvious beforehand.
>
> The seat is `slide.background = { data }`, not an `addImage` placed first. The
> layouts paint `slide.background = { color }` and pptxgenjs's background setter
> replaces wholesale, so the plate must be assigned after the layout — last
> write wins — and it lands under all shapes for free.
>
> Headless Chrome's `--screenshot` with `--window-size` + `--force-device-scale-
> factor` + `--virtual-time-budget` is a deterministic raster with zero npm
> moving parts — no puppeteer, no playwright. Virtual time settles CSS animations
> and gradient rendering without real seconds. A CSP meta with
> `default-src 'none'` genuinely blocks scripts: a test script that tried to
> paint the page red was a no-op in the output.
>
> `loadTheme` returned a flattened theme with no `tokens` object, so
> `{{tokens.palette.bg}}` interpolation silently failed at first. The resolved
> theme now exposes `tokens` with the mode-adjusted `palette`, so a template sees
> exactly what renders, dark mode included.
>
> The theme groundwork from an earlier session already declared
> `tokens.plate.enabled: false` — the contract was anticipated before the
> renderer existed. The switch is honoured: `enabled: false` (the default) means
> no plate, which is also what keeps every existing deck's render bit-identical.
>
> Verified behaviourally on a fixture deck through the full
> Chrome → pptx → LibreOffice → PNG pipeline: a multi-stop mesh gradient, a
> glassmorphism card with real `backdrop-filter: blur` over two layered
> translucent blobs, a neon glow on dark, and an aurora gradient all rendered
> correctly with native text readable on top (vision-checked). The theme
> interpolation path was verified separately with a scratch theme; both fixtures
> were removed after.

---

## 4. Generation pipeline

### [x] Local search
SearXNG in Docker + `src/search.js`. Fully local, no API keys.

> **Learned.** SearXNG ships with only the `html` output format enabled; the
> JSON API returns 403 until `formats: [html, json]` is set in settings.yml.
>
> Raw results need two passes before a model sees them: dedupe by URL, then cap
> per host — the raw response returns eight pages from one domain and a report
> sourced entirely from one site follows. Extraction matters more than ranking:
> Readability output costs a fraction of the context that raw HTML does, and
> stops the model quoting cookie banners.

### [x] Ollama orchestrator + turn primitive
`src/ai/` — role-addressed client, ops layer, turn primitive, two-stage
generator. Plain Node over the HTTP API; no framework.

> **Learned.** The dominant constraint is not prompting, it is *grammar size*.
> Constrained decoding masks illegal tokens, so a large schema pushes the model
> off distribution — the full failure taxonomy is in `docs/TRAPS.md`. Two stages
> with small schemas beat one call with a large one, and swapping the author
> model to a coder model (JSON in-distribution) mattered more than any prompt
> change. End-to-end: 9 slides, 24s, zero skipped, rendered and inspected.
>
> **Look-ahead applied.** `runTurn` is deliberately the shared primitive for
> chat and the vision critic, so neither needs a new path. `generateDeck` does
> not use it yet — planning and per-slide writing have their own narrow schemas,
> which is the point — so the seam is: turn = *edit an existing deck*,
> generate = *build one from empty*. Chat uses `runTurn`; the critic does too.

Role split (24 GB VRAM ceiling, `OLLAMA_MAX_LOADED_MODELS=2`):

| Role | Model |
|---|---|
| research / tool-calling | `qwen3-coder:30b-a3b` |
| outline + prose | `gemma4:26b-a4b-it` |
| vision critic | `gemma4:26b-a4b-it` |
| cheap utilities | `qwen3:4b-instruct` |

### [x] Vision critic loop
Feed rendered PNGs back to a vision model; catch overflow, clipping and contrast
that schema validation cannot see. This is the thing that closes the loop — a
deck can be perfectly valid YAML and still have a headline running off the slide.

`src/ai/critic.js` is the loop: render → critique each slide PNG against a
small bounded findings schema → convert findings into a `runTurn` instruction →
re-render → re-critique, capped at two rounds. Wired into `generateFromPlan`
and the CLI as `forge generate <slug> --critic`. It reuses the turn primitive
exactly as planned — the critic's instruction is just a turn — so no separate
fix code path exists.

> **Learned.** Per-slide critique (one image per call) is the only reliable
> mode for small vision models — batch several images and they lazily pass the
> whole set. The findings schema must stay tiny (three keys, `maxItems` 3,
> `maxLength` 160); `gemma4:26b-a4b-it` handles it under `format` with an
> image attached, which is the combination that usually fails.
>
> On warm-humanist the fitter is defensive enough that a deterministic overflow
> is hard to force — the critic's real value is catching what the fitter's
> width heuristic cannot (font-metric mismatch, real renderer differences,
> contrast calls). Validated both halves behaviourally: the full loop ran clean
> on a real deck, and `runTurn` applied a valid edit from a critic-style
> instruction. A side effect worth keeping: the loop re-renders each round and
> returns the final preview, so callers show the fixed slides, not the
> pre-critique ones.

Constraints held:
- The critic role is `gemma4:26b-a4b-it-q4_K_M` (local, vision). `qwen3-vl:8b-thinking`
  gives false-clean verdicts — do not use it. Cloud is opt-in via a `model`
  override or a `provider:` on the role.
- Fix loop capped at two rounds. A critic that has not converged twice is
  arguing with itself, and each round costs a full re-render plus one vision
  pass per slide.
- Pixel band-analysis is a good *targeter* but a poor sole judge — it flags
  design-intended eyebrow/heading spacing and card-boundary adjacency.

### [ ] Freeform slides — the "completely free" mode
`type: freeform` with an `html` field, rendered via the HTML plate renderer.
The model writes arbitrary HTML/CSS; no layout vocabulary at all.

Two granularities, both wanted:
- **Per slide** — a mostly-native deck with one or two hero slides.
- **Whole deck** — maximum visual impact, editability deliberately traded away.

Trade-off is real and drives the default: freeform slides rasterise, so nobody
can fix a typo in PowerPoint afterwards. Correct for a hero moment, wrong for a
whole graded submission. The UI must state this at the point of choosing, not
bury it.

**Unblocked** — the plate primitive (§3) already accepts a slide-level `html`
override, so freeform is now: add the `html` schema field and the model prompt
for it. Constrain the model's HTML to the sandboxed subset the primitive already
enforces — no network, no scripts — since it renders in a real browser.

---

## 5. Reports

### [ ] DOCX renderer
Template-donor approach: strip the body from the institutional `.docx`, keep
headers, footers, styles, watermark and media, inject generated content.

> **Note, not yet learned.** Verified the donor is viable — `header1/2/3.xml`,
> `footer1.xml`, `styles.xml` and all five media assets survive extraction.
> Rebuilding a VML watermark by hand is the alternative and is much worse.

The report is the **opposite** of the deck: rigid where the deck is free. No
themes apply. The whole job is matching a template exactly, because that is what
is graded. Reviewing it means reading sections, not looking at slides, so the UI
is a different surface — not the deck grid with different data.

Note the donor `.docx` lives in gitignored `reference/`, so the renderer must
fail with a clear message when it is absent rather than half-working.

Fixed section order (non-negotiable, this is what is graded):
Abstract → Acknowledgement → Introduction → Theoretical Background →
Application → Future Scope → Conclusion → References.

### [ ] Shared research
One brief → one research pass → both deck and report. This is the actual
submission workflow: the same material is needed in both forms, and researching
twice wastes minutes and risks the two artefacts disagreeing on facts.

Implies research output is a first-class artefact (`decks/<slug>/research/`)
rather than a transient value inside a generate call — build it that way from
the start.

### [ ] Report content depth
Reports go deep where decks stay terse. Same content tree, two density budgets:
the deck gets a headline and three supporting sentences where the report gets
four paragraphs and a table. Depth is a parameter on the generator, not a
different generator.
