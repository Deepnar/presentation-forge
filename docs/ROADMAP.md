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

> **Learned.** Relative navigation must use the functional state updater.
> Reading the current index from the effect's closure loses keystrokes —
> several `keydown` events fire before React re-renders, each computes from the
> same stale value, and a held arrow key silently skips slides. It looks correct
> under single slow presses, which is exactly how it gets missed: stepping from
> slide 5 with three left presses landed on 4 instead of 2.

### [ ] Intake wizard
Collect team, subject, guide, year, brief and sources before generation.
Pre-fills from `config/identity.yaml`, saves back as new defaults.

### [ ] Outline review
The human-in-the-loop guardrail. Model proposes the slide plan; nothing renders
until it is approved or edited. This is what makes free-form structure safe with
a small local model — strictly better than presets, which guess in advance and
are wrong half the time.

### [ ] Chat editing
"make slide 4 punchier", "add a slide on FSR after 6". Edits `deck.yaml`,
re-renders, shows the diff.

---

## 3. Themes

- [x] `warm-humanist` — reference implementation
- [ ] Flat / native-renderable: `swiss-international`, `editorial-magazine`,
      `minimal-muji`, `neubrutalism`, `bauhaus`, `memphis-postmodern`,
      `art-deco`, `dark-neon`, `linear-dark`, `material-you`, `flat-2`,
      `retro-terminal`, `newsprint`, `notion-clean`, `corporate-alegria`
- [ ] Plate-dependent: `glassmorphism`, `claymorphism`, `neumorphism`,
      `aurora-mesh`

> **Note, not yet learned.** The four plate-dependent themes need real backdrop
> blur and mesh gradients, which OOXML cannot express. Plan: pre-render
> decorative backgrounds to PNG with headless Chrome and place them as slide
> background plates, keeping all *text* native so the deck stays editable.

---

## 4. Generation pipeline

### [ ] Local search
SearXNG in Docker + a custom `search()` / `fetch_page()` tool. Fully local,
no API keys.

### [ ] Ollama orchestrator
Plain Node over Ollama's HTTP API — deliberately not LangChain/LangGraph. The
pipeline is fixed, not open-ended, so a framework adds indirection without
adding capability, and small local models need every prompt token visible.

Role split (24 GB VRAM ceiling, `OLLAMA_MAX_LOADED_MODELS=2`):

| Role | Model |
|---|---|
| research / tool-calling | `qwen3-coder:30b-a3b` |
| outline + prose | `gemma4:26b-a4b-it` |
| vision critic | `gemma4:26b-a4b-it` |
| cheap utilities | `qwen3:4b-instruct` |

### [ ] Vision critic loop
Feed rendered PNGs back to a vision model; catch overflow, clipping and
contrast that schema validation cannot see.

### [ ] Freeform slides
`type: freeform` with an `html` field, rendered via headless Chrome. Unlimited
creative freedom for hero slides. Trade-off: rasterised, so not editable in
PowerPoint — correct for one or two slides, wrong for a whole deck.

---

## 5. Reports

### [ ] DOCX renderer
Template-donor approach: strip the body from `reference/IE REPORT …docx`, keep
headers, footers, styles, watermark and media, inject generated content.

> **Note, not yet learned.** Verified the donor is viable — `header1/2/3.xml`,
> `footer1.xml`, `styles.xml` and all five media assets survive extraction.
> Rebuilding a VML watermark by hand is the alternative and is much worse.

Fixed section order (non-negotiable, this is what is graded):
Abstract → Acknowledgement → Introduction → Theoretical Background →
Application → Future Scope → Conclusion → References.

### [ ] Shared research
One brief → one research pass → both deck and report. This is the actual IE
submission workflow.
