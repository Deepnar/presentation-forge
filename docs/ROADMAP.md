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

### [~] Deck detail view
Grid, theme switcher, render, download, zoom modal.

- [x] Slide grid with type labels
- [x] Theme switcher + re-render
- [x] `.pptx` download
- [x] Lightbox with keyboard navigation (← → Home End Esc) + filmstrip
- [ ] Inline field editing (headline, bullets, card text)
- [ ] Per-slide presenter assignment
- [ ] Slide reorder / delete / duplicate

**Inline editing** is deliberately separate from chat. Clicking a headline and
typing must not wake a 26B model — that path writes `deck.yaml` directly and
re-renders. `POST /api/validate` already exists so the editor can show schema
errors while typing. Chat is for structural change only.

**Presenter assignment** is a free per-slide field, not a computed split. The
real distribution is unpredictable — one person may take one slide or five — so
the model proposes an even split as a starting point and the UI allows
assigning any selection of slides to any member. Reaches the chrome layer via
`identity.team`; `applyContentChrome` currently renders whoever is marked
`presenting`, so this needs a per-slide override to take precedence.

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

### [ ] Chat panel — the AI wrapper
A real conversational surface in the right rail: streamed tokens, stop, retry,
edit-and-resend, visible tool calls, model picker, context-usage indicator.

**Scope: per deck.** Each deck owns its thread. A deck is the unit of work and
the unit of context — a global assistant would need to re-establish which deck is
being discussed on every turn, and cross-deck memory is a liability rather than a
feature (last month's GPU deck should not leak into this month's).

**Memory model — state over transcript.** The naive design replays the whole
conversation and burns context re-deriving what the file already says. Instead,
three tiers:

| Tier | Holds | Lives in |
|---|---|---|
| State | current `deck.yaml` + theme `voice` + `meta.yaml` | the files themselves |
| Recent | last ~10 turns verbatim | `decks/<slug>/chat.jsonl` |
| Durable | extracted standing preferences | `decks/<slug>/decisions.md` |

The key point: **`deck.yaml` is the memory.** After "make slide 4 punchier" the
model never needs to recall having done it — the result is in the file it reads
every turn. Transcript only carries intent that has not yet been materialised
("keep it under 12 slides"), and once such an instruction proves durable it is
promoted into `decisions.md` and dropped from the replay window.

Older turns collapse into a rolling summary rather than being truncated, so a
long session degrades gracefully instead of forgetting its first half.

**Turn primitive.** A turn takes `(current deck.yaml, instruction, context)` and
returns a *validated* new `deck.yaml` plus a diff. This is the same primitive the
vision critic uses — the critic is simply a turn whose instruction came from a
model looking at PNGs rather than from a human. Build it once, in the
orchestrator, before either caller exists.

> **Look-ahead note.** Do not build a one-shot generate-only path. Generation is
> the first turn on an empty deck, not a separate code path.

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

### [ ] Plate-dependent themes (4)
`glassmorphism` · `claymorphism` · `neumorphism` · `aurora-mesh`

Blocked on the HTML plate renderer below. These depend on backdrop blur,
layered transparency and multi-stop mesh gradients, none of which OOXML can
express. Native shapes give a flat approximation that misses the entire point of
the style, so do not ship them as native — that is precisely the
knowingly-temporary version the working agreement forbids.

### [ ] HTML plate renderer
Headless Chrome renders decorative CSS backgrounds to PNG at build time; the
renderer places them as slide background plates with all *text* still native.

Unblocks the four themes above **and** `freeform` slides (§4), so build the
primitive once with both callers in mind: input is HTML + viewport, output is a
cached PNG keyed by content hash. Do not build a theme-only version that
freeform then has to tear out.

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

Depends on the HTML plate renderer (§3). Constrain the model's HTML to a
sandboxed subset — no network, no scripts — since it renders in a real browser.

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
