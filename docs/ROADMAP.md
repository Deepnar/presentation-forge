# Roadmap

Status of every feature, and what was learned building it. The **Learned**
entries are the point of this file — they record things that were not obvious
beforehand and would otherwise be rediscovered the expensive way.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

---

> **Everything still outstanding between here and real users lives in
> [`PRODUCTION.md`](PRODUCTION.md)** — launch blockers, the payments track, the
> journeys nobody has ever run, and the open defect list. This file is the
> per-feature plan and history behind it.

## 1. Foundation

### [x] Font pipeline
21 Google families / 59 weights, manifest-driven, idempotent. The manifest is
derived from the themes and machine-checked (`test/fonts-manifest.test.js`); it
carried six families no theme used and a `used_by` field that had drifted on
eighteen of twenty-seven until 2026-09-03.
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
`schema/deck.schema.json`, 22 slide types, per-type conditional rules.

> **Learned.** Ajv's raw errors ("must match a schema in anyOf") are useless as a
> correction prompt for a small model. `src/validate.js` resolves each error to
> a slide index, its type, and the specific edit needed. This output is a
> product surface, not a debug log — it is what the model reads to fix itself.

### [x] Tier-1 slide-type vocabulary
The six high-impact types from the 50-type plan landed first: `big-number`
(data/stats), `agenda` (foundation), `milestone` (timeline), `pros-cons`
(comparison), `emphasis` (callout), `definition` (definitions). Each is a
schema conditional block (data only), a native layout in `src/layouts.js`, and
auto-derived catalog detail. The catalog now groups types by family so the
planner can navigate the growing vocabulary, and the outline prompt maps each
rhetorical beat to the family that expresses it.

> **Learned.** Three things were not obvious beforehand.
>
> Inter is a wide geometric sans and the fitter measured it as a narrow one —
> the big-number body wrapped to a line the fitter did not budget for, and its
> caption landed on the footer. Rasterising and looking found it, as always.
> The `cards`/`compare`/`stats` lesson generalises: a stacked layout must
> *anchor* to the content box bottom and fitScale its body into a fixed budget,
> never derive a y-offset from a raw `heightOf` — see the TRAPS entry on the
> fitter's units.
>
> `heightOf` is not "height in inches" in the way a layout wants. The fitter's
> `measure` never multiplies the advance by the em size, so its outputs are
> wildly pessimistic against real inches; every layout that computes a position
> from raw fit arithmetic will drift, and the fix is to let `fitScale` own the
> box. (Fixing `measure` itself would re-type every deck and is deferred.)
>
> The family map in `src/ai/catalog.js` already names all 50 planned types, so
> Tier 2-4 additions are schema + layout + editor-descriptor work with no
> catalog changes — the look-ahead the plan asked for.

### [x] Renderer
`src/render.js` + `src/layouts.js` — 21 layouts, zero literal colours or fonts.

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
> pessimistic — slightly small never costs marks, overflow does. (The pessimism
> is now bounded: `measure` scales with the em, so ordinary content fits at its
> nominal size; see the big-sweep font-floor item.)

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

### [x] Research panel — see and correct what the model writes from
`DeckDetail` now shows the deck's research beside the Report panel: the
`research/notes.md` content as a read-only code block with an Edit mode that
saves back, and `sources.json` as a collapsible list. API
`GET/PUT /api/decks/:slug/research`, 404-safe (a deck with no research pass
renders a hint, not an error). An edit is what the next generation reads —
`generateFromPlan` pulls `notes.md` fresh at write time, verified end-to-end by
PUTting a distinctive fact and watching the cloud-written deck use it.

> **Learned.** "404-safe" was the trap worth naming: a missing research dir is a
> *state*, not an error, and a UI that treats it as a fetch failure shows an
> error where it should show "research this deck". The endpoint returns
> `exists: false` and the panel has four states — loading, error, no-research,
> content.

### [x] Intake wizard — superseded by the in-chat briefing
Collect team, subject, guide, year, brief and sources before generation, then
hand the result to the pipeline as part of the model's brief.

`NewDeck.jsx` was the full entry form: brief, sources, theme, max slides, and an
identity panel (subject, academic year, semester, exam type, guide name +
designation, team label, and a member list with a "presents" tick). The
identity pre-fills from `config/identity.yaml`, saves back as remembered
defaults, and freezes into `decks/<slug>/meta.yaml`. The wizard snapshot flows
to planning (the model sees the subject), and the renderer's existing
meta-over-config merge puts the per-deck team, guide and year on the slides.

**Replaced by the chat-first redesign:** the form no longer exists. The same
fields are now asked one at a time inside the chat thread
(`app/web/src/lib/briefing.js` + the ChatView's question cards), writing the
exact same deck params — the conversation is this form's data model, and the
pipeline is untouched. `createDeck` still takes `identity`; the chat just
assembles it.

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
Originally shipped as one vertical slice with the generation endpoints and the
UI: a brief form (`NewDeck.jsx`) streams a plan, the review view (`Outline.jsx`)
edits and approves it, and generation streams slide-writing progress into a
rendered deck.

**Moved into the chat by the chat-first redesign.** The standalone `Outline.jsx`
view is deleted; the outline review is now a card in the chat thread, every
slide reading in plain language — "Stats — big numbers with captions" — from the
`TYPE_DESCRIPTIONS` map in `src/ai/catalog.js` (one source, exposed through
`/api/types`, guarded so the map can never drift from the schema enum). The
purpose stays editable, the type switchable, rows movable; "Approve & generate"
is still the only thing that writes slides. The report→companion-deck flow
routes its pre-made plan into a chat that skips the briefing and lands straight
on this same outline card.

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

### [x] Structural chat commands
The chat's `runTurn` now maps explicit structural instructions — "add a slide
at the end titled X", "delete slide 4", "duplicate slide 2", "move slide 3
after slide 5" — to concrete `deck.yaml` ops. Adds `duplicate_slide` to the ops
layer (a deep copy right after its source), teaches the turn prompt to translate
each command into the matching op rather than paraphrasing it back, and aligns
the server delete guard with the editor's: no op may empty a deck. The deck
detail's own manual move/duplicate/delete buttons already used the same
semantics and are untouched. Covered by `test/ops.test.js`.

### [x] Shell polish — rails, motion, cloud routing, brand surface
A pass of Gamma-like affordances and shell refinement:

- **Chat rail only on the deck view.** The rail edits `deck.yaml`; on Home,
  Identity, Themes, the wizard and the outline review there is no deck to talk
  to, so the rail and its edge tab disappear and the main column goes
  full-width. The rail stays mounted and animates its width on the shell easing
  rather than popping in.
- **Ambient particle field.** Fine stipple (more, smaller dots) drifting on
  two-axis sine wander so it moves without the pointer; cursor repulsion kept,
  capped at 60fps, reduced-motion draws one static frame, and the loop pauses
  on hidden tabs. Instrumented behaviourally: frame counter, pointer stamp and
  pushed-dot count all hold.
- **One easing everywhere.** View switches (keyed fade-and-rise), sidebar
  collapse, chat rail, card hover and the carousel all ride
  `cubic-bezier(0.2,0.8,0.2,1)` on transform/opacity only, with a
  `prefers-reduced-motion` query that collapses everything to instant state.
- **Cloud routing preference.** A gitignored `config/local.yaml` value decides
  what "auto" means in the model pickers. The header shows a LOCAL/CLOUD
  toggle; CLOUD is only reachable when a key is attached, and without one the
  button points at Settings/Cloud. An unpicked author-role model routes to the
  attached provider's first model, while research/utility/critic stay on their
  configured backends. The toggle also drives the pickers' filtering — LOCAL
  shows local models only, CLOUD cloud models only (see the shell follow-up
  item).
- **Brand upload surface.** The Identity view's Brand section uploads
  crest/banner/watermark into gitignored `brand/logos/` and re-runs the shared
  `normalizeBrand()`. Marks are trademarks and stay out of the repo — the
  upload surface is the answer to "can we make them public": no.
- **Gamma-style quick affordances.** Audience and slide-count presets fold into
  the existing brief→pipeline flow (audience becomes part of the brief,
  slide count maps to `maxSlides`); a per-slide "make it punchier" bolt runs a
  scoped chat turn through the same `runTurn` the chat rail uses.

> **Learned.** Two things stood out. The chat rail's "no deck" empty state was
> the giveaway that a rail with nothing to edit is dead weight — a surface only
> earns space when it maps to an artefact. And the cloud routing toggle had to
> be scoped to the author role deliberately: routing every unpicked role to the
> cloud would silently move the internal plumbing (decision extraction, summary
> folding) onto the subscription, which is not what "route my work" means.

### [x] Shell follow-up — config popover, local auth, mode-filtered pickers, report viewer
The Gamma-style surface moved closer to "topic in → deck out with zero
hand-holding":

- **Prompt box config popover.** The audience and slide-count presets left the
  prompt surface for a config popover behind the sliders button; report mode's
  source, deck picker and depth joined it. The sliders button no longer opens
  the New-deck wizard — the top-right "+ New deck" is the wizard entry. The
  main surface is just the brief, the Deck/Report toggle, the model pill and
  the submit arrow.
- **Local single-install accounts.** Register/login/logout with
  `crypto.scrypt`-hashed passwords and server-side bearer-token sessions
  (`src/auth.js`, gitignored `config/users.json` + `config/sessions.json`).
  The header's account entry is Login/Register or name + Logout; the Cloud-key
  section requires a session. Honest scope: accounts exist for the key gate and
  future hosting, not multi-user.
- **LOCAL/CLOUD toggle filters pickers.** A client model-mode store
  (`lib/modelMode.js` + `lib/useModels.js`) makes the header toggle actually
  switch every model picker — LOCAL shows local models, CLOUD shows cloud
  models. CLOUD is unreachable without a key (hint points at Settings).
- **Reports tab opens the document.** Clicking a report in the sidebar opens a
  full-document view — cover block from the merged identity, then the fixed
  graded section order with paragraphs and tables as prose, Render .docx /
  download, and an empty state. Report-only decks and decks-with-slides both
  land here from the Reports tab.
- **Rail containment.** The content row isolates its stacking context and the
  header sits on its own z-layer, so the chat rail can never paint over the
  product bar.

> **Learned.** Two things. "Chat with the doc" never existed in the repo — the
> rail already said "Chat with the deck" — and CDP bounding-box measurements
> showed zero overlap at every viewport; the user's screenshot was a transient
> hot-reload state, not a live regression, but the stacking-context hardening
> makes the whole class of escape unrepresentable rather than just unreproduced.
> And "the toggle doesn't do anything" was a real bug hiding in plain sight:
> the routing preference changed server-side but every picker still rendered
> both groups, so the mode read as cosmetic. Client-side filtering (a pub/sub
> over the already-grouped `/api/models` response) made it honest without a
> server round-trip per toggle.

### [x] Chat-first creation — the conversation is the app
The biggest UX change since the Stitch shell: the app is a chat window, not a
form. Landing is log-in/register; the deck workspace is per-user; a topic sent
in the thread walks a guided briefing one question at a time and ends in a deck.

- **Auth-first, per-user workspace.** Every `/api/decks` and `/api/reports`
  route requires a session (the 401 gate sits at the top of the server), new
  decks stamp `meta.yaml` with the owning email, and the list, search and each
  per-slug route enforce that ownership. Ownerless legacy decks stay shared.
  Raster/download GET routes are exempt from the gate because an `<img>` cannot
  send a bearer token — and their slugs are only discoverable through the gated
  list, so the exemption leaks nothing in the UI.
- **The chat window IS the app.** `ChatView` replaces Home: a thread with the
  input bar at the bottom. "New chat" opens an empty thread ("What would you
  like to present today?"). A topic (with optional extra text) starts the
  briefing; everything defaults unless the user says otherwise.
- **Guided briefing, one question at a time.** Title (pre-suggested from the
  topic), team (name + roll, tick who presents — adding a member is a pure
  local state change, verified at zero network requests), guide, subject/
  academic, the theme chosen from a **visual gallery** (mini specimens drawn
  live from each theme's own tokens — the "see the theme, not just names"
  requirement), slide count, slides-per-member, word density and a research
  pass. Only the summary card's "Plan the deck" starts research/planning.
  The old `NewDeck.jsx` wizard form is deleted; the briefing writes the same
  deck params the pipeline always consumed.
- **Outline gate in the thread.** The standalone `Outline.jsx` view is deleted.
  Each slide card reads in plain language (`TYPE_DESCRIPTIONS` in
  `src/ai/catalog.js` — "Stats — big numbers with captions"), purpose editable,
  type switchable, rows movable, "Approve & generate" the only writer. The
  report→companion-deck flow routes its pre-made plan into a chat that skips
  the briefing and lands straight on this outline.
- **Chats persist per account** in localStorage (`lib/chats.js`) and link the
  deck they produce; the sidebar is a Chats/Decks pair with one "New chat"
  creation entry. The deck detail's six-action row folds into a single Export
  menu (PDF / Markdown / Bundle / Clone / Versions / Dark mode) — Render and
  `.pptx` stay primary.

> **Learned.** Six things were not obvious beforehand.
>
> The briefing is a deterministic client state machine, not a model turn. The
> conversation is the wizard's data model re-expressed — asking a local model
> to "ask questions" would have been slower, flakier and untestable; the
> questions, defaults and free-text answers all live in `lib/briefing.js` and
> only the summary's Plan button touches the network. The member-add bug
> ("adding a member starts work") was never a real code path — the briefing is
> pure local state by construction — but the CDP assertion (network counter
> flat across an add) is now the guard that proves it.
>
> Per-user work needs a disk boundary, not a UI filter. A sidebar that hides
> another account's decks is cosmetic if the same deck is reachable by URL. The
> separation is three layers: the 401 gate (nothing deck-shaped without a
> session), the per-slug ownership check (an owned deck answers "no such deck",
> not "not yours", so a stranger cannot even learn a slug exists), and the
> list/search owner filter. The legacy-deck decision is explicit: ownerless
> `meta.yaml` = shared demo/CLI deck; a fresh account sees them, and its own
> creations stamp its email.
>
> localStorage is the right home for chats. The conversation is pure view
> state; the artefact it produces (deck.yaml) is server truth. Persisting the
> thread server-side would have needed a chat model, migrations and per-user
> routing for zero benefit — a chat's deck link is the durable record. The
> StrictMode double-mount of the boot effect is guarded by reading storage
> rather than React state, or the first login would mint two empty chats.
>
> A theme gallery built from live tokens beats thumbnails or names. The
> existing `/api/themes` specimen render (already used by the Themes gallery)
> scaled down to a mini card for the briefing — impossible to be stale, free to
> build, and it satisfies "I see the theme, not just names" without a stored
> screenshot pipeline. The selected card's accent ring sits below the scroll of
> the compact grid for the default theme (warm-humanist sorts last); acceptable,
> but auto-scrolling the selection into view is a natural follow-up.
>
> Type descriptions belong beside the schema, not in the UI. `TYPE_DESCRIPTIONS`
> in the catalog is derived-checked against the enum (it throws on a missing
> entry), so the outline can never show a type the schema does not know or leave
> one reading as a bare enum value. The `/api/types` payload now carries them.
>
> A React dev-only duplicate-key warning ("two children with the same key, `%s`")
> appeared once across several full end-to-end runs and defied reproduction
> until the deck detail's presenter picker was exercised with the default
> identity team (config/identity.yaml carries placeholder members whose `name`
> is `""`). The picker rendered one `<option key={m.name}>` per member, so every
> empty-name member collided on the same key — and the empty string is exactly
> why the message read as the literal `%s`. Fixed by filtering empty-name
> members out of the presenter options and keying the rest by index.
> Behaviourally validated: the warning no longer appears on any surface.

### [x] Chat-first batch 2 — the user review round
The follow-up pass over the chat-first redesign, nine fixes from the user's
review:

- **Dividers are never assigned.** `title`/`section`/`chapter`/`closing` are
  structure, not somebody's slide. The writer's ops grammar excludes
  `presenter` for divider types (`buildOpsSchema` gains `excludeProps`), the
  pipeline strips any stray value after generation, and the chrome footer stops
  drawing a presenter line on divider surfaces. Content slides get the real
  presenting-members list so assignment stays in the team. The briefing's
  "slides per member" now means content slides.
- **Sections scale with the team, both artefacts.** One major part per
  presenting member, `clamp(members, 3, 8)` for a deck and floored at the
  four-section graded core for a report; the planners' section caps are
  tightened to the same number so the grammar cannot overshoot. The count
  derives from the merged identity's team — no separate input.
- **Deeper research.** The single SearXNG query became `deepResearch`: 2-4
  subtopic queries from the research role (fallback to the brief alone), a
  higher read budget per query, then a follow-up query per richest source.
  ~21 pages in a real run instead of five.
- **Content quality.** The writer prompt demands concrete claims drawn from the
  research and forbids invented figures and invented image paths; the grounding
  guard stays active and was verified live (a grounded "60%" passed, fabricated
  stats flag).
- **More briefing questions.** "Who is this for / what should they take away"
  (audience) and "which parts matter most" (emphasis) fold into the planning
  brief; blanks keep the fast path fast.
- **A real team editor + saved defaults.** The team card is a proper form
  (headers, rows, add/remove, Enter-to-add, live count); "Remember as
  defaults" on the summary card writes the repeated set to config/identity.yaml
  and pre-fills the next briefing from it.
- **Runs survive navigation.** A generation's controller and status live in a
  module-level `lib/runs.js` registry, so leaving the chat for the Identity tab
  unmounts the view without touching the run; re-entry adopts the live run and
  errors persist onto the chat.
- **Report chats auto-name.** The same topic→title rename as deck chats
  (report title flows through the SSE result), plus the root cause: `chatName`
  used `??`, so an empty title never fell through to the topic.
- **Sidebar row menus + delete deck.** Every chat/deck row gains a hover "⋯"
  popover — chats delete locally, decks open or delete server-side behind a
  confirm modal (`DELETE /api/decks/:slug`, a new endpoint gated by the
  per-slug ownership check).

> **Learned.** Six things were not obvious beforehand.
>
> "Unrepresentable beats scrubbed" holds here too: removing `presenter` from the
> divider grammar is what actually stopped the model assigning dividers — a
> prompt rule alone was too soft for a verbose cloud model. The chrome footer
> had to learn the same rule independently, because the *fallback* (the whole
> presenting team joined) would still have painted names on dividers.
>
> The cloud outline is verbose: a large-team plan runs to ~7K output tokens and
> the old 8192 `num_predict` occasionally truncated it mid-JSON
> (done_reason=length with the closing brace missing — the exact TRAPS failure).
> Raising the cap to 12000 plus demanding one-sentence purposes fixed it; the
> cap only ever bites a cloud run, since the local grammar keeps output bounded.
>
> A model will invent images. With no image-supply mechanism (F13 was unbuilt
> at the time; auto supply now exists and is opt-in per deck), a
> cloud writer put `https://example.com/x.jpg` in an image field, and the
> renderer crashed at write time reading the joined bogus path. `resolveAsset`
> now returns null for URLs and missing files, and every image layout already
> drew a placeholder for null — one grey box, never a dead deck.
>
> Runs-as-module-state is the correct seam for "background" work in a SPA whose
> views unmount: the component subscribes to a module-level registry rather than
> owning the abort controller, so navigation is a subscription change, never a
> cancellation. The server side was already abort-on-disconnect; the bug was
> purely that the UI abandoned its own progress display.
>
> `??` is the wrong fallback for empty strings. `chatName(title ?? topic)` never
> fell back for `title: ""`, so report chats — which name from the topic before
> any title exists — stayed "New chat" forever. `(title?.trim() || topic)` is
> the pattern.
>
> Section-count scaling has a budget interaction: the planner produces "about N"
> sections but will legitimately use fewer when the slide budget is small — a
> 10-slide deck from an 11-person team planned 4 sections, not 8. The cap is the
> contract; the count is a target the model reconciles with `maxSlides`.

### [ ] (stretch) Canvas slide-builder

*Priority: stretch, and not on the path to launch. Blocked on the same
front-end direction as the app sweep — it is a new surface, not a fix.*

Live slides appearing as they stream (status → plan → slides) as a
filmstrip/storyboard the user can point the model at. Not built this session —
the chat rail already streams a rendered thumbstrip after each turn, and the
Outline view shows the plan; a full live filmstrip of slides *while they are
being written* would need a new SSE phase in `generateFromPlan` that emits each
validated slide as it lands, plus a storyboard view. Design note: it belongs
over the existing `status: writing` events, not a new pipeline.

### [x] The big sweep — explicit controls, real research, deployable
The user's wish list, shipped in priority order: explicit deck-level controls
instead of the removed chat rail, a proper research engine, and a home-server
deployment path.

- **The deck-detail chat rail is gone.** The one place whole-deck model edits
  applied is deleted (`ChatPanel` removed); deck-level changes now exist only
  as explicit controls. Theme stays, and a new **Density select + Re-sweep**
  rewrites every content slide's body at Sparse/Balanced/Dense from the same
  plan and research, keeping types, presenters and structure (`sweepDeck` in
  `src/ai/generate.js`; per-family content budgets in the catalog; grounding
  still applied; failed rewrites keep the original with a visible problem).
- **Saved briefing formats (presets).** The briefing's first question is now
  "use a saved format?" — a preset pre-fills team, guide, academic, theme,
  density, branding and slides-per-member and skips those questions, so an "IE
  preset" only asks for the changing bits. CRUD behind the session gate,
  stored per-user in gitignored `config/presets/<user>.json`.
- **No-branding mode.** A branding question (full / minimal / none) lands in
  meta.yaml's chrome block; chrome.js honours it — "none" strips banner, crest
  and presenter footer, keeps slide numbers, and the layout's top-right
  reservation is skipped so content gets the full width.
- **Report chats ask questions too.** Reports walk the same one-question
  briefing with report-relevant questions (depth full/brief replaces the slide
  count; density and branding carry over); a report summary card with "Generate
  the report" is the only thing that starts writing. Density flows into the
  report writer as prose guidance on top of depth.
- **Research is a proper surface.** The small panel is a compact card that
  opens a full Research view: notes as readable prose, sources as a table
  (domain, kind web/paper, URL, words), and a coverage summary (count, distinct
  domains, academic vs listicle, papers, single-source domains) computed in
  `src/ai/research.js` so the CLI shares it.
- **Reports preview as real Word pages.** Rendering a report.docx also
  rasterises it (LibreOffice → PDF → PNG, the deck's own pipeline) and the
  report view shows the pages under "The rendered document" — what you see is
  the actual output, watermark and tables included. The deck page's report
  panel shows a thumbnail strip and an "Open report view" door.
- **The type-swap gallery.** Every slide card gains a swap control that opens
  a scrollable gallery of all 75 types rendered as mini previews in the current
  theme (specimens assembled from the demo decks in `src/specimens.js`, cached
  per theme). Compatible types remap instantly (bullets → numbered-list, cards
  → feature-grid); the rest get a scoped model rewrite grounded in research.
  Section and presenter always survive. Image slides in the gallery show an
  "add image" door.
- **The research engine actually researches.** A brief expands into 5-8 angle
  queries (keywords, science, practical, regional, data, counterpoint) via the
  research role; after the pass, a diversity guard runs targeted follow-ups
  when the notes are one-domain or have no academic voice, and an examiner-gap
  pass searches what a strong submission would be missing. A **papers** toggle
  adds arXiv + Crossref (deduped, relevance-ranked, arXiv IDs and DOIs in
  sources.json, top papers' full text pulled into the notes). Jina Reader is
  the second extraction path for JS-heavy pages, gated behind `RESEARCH_JINA=1`.
- **Images: upload, attach, never invented.** An image button uploads to
  `decks/<slug>/assets/` (validated extension + size) and sets the slide to an
  image type with the real asset, no model involved. Model output that invents
  an image URL is sanitised in both the type swap and density sweep — the URL
  is stripped and recorded as an `[image]` note, which the deck page turns into
  an "add image" badge.
- **Deployable on a home Linux server.** A Dockerfile (Node 24 + LibreOffice +
  Chrome) and `docker/docker-compose.app.yml` pair the app with bundled
  SearXNG; the API serves the built UI and SPA fallback on one port; decks,
  brand, config and the plate cache live in a named volume. A monthly sweep
  deletes decks older than `FORGE_SWEEP_DAYS` (unless `meta.keep: true`), runs
  daily at `FORGE_SWEEP_HOUR`, and emails the owner via a dependency-free SMTP
  client (`src/mail.js`). Light hardening for a public box: secure headers,
  CORS allow-list, rate-limited auth endpoints, validated uploads.
- **Six new themes, two siblings sharpened.** brutalist-paper, isometric-dark,
  editorial-serif-light, chalkboard, mono-terminal-light and minimal-warm fill
  visual gaps and each is verified distinct; bauhaus's divider is now the
  primary-triad yellow (was the same red as swiss-international) and
  editorial-serif-light's title is ink-blue (was orange beside minimal-warm).
- **The report title is bold and centred.** The cover's first line was plain
  body text — it now uses the largest centred bold treatment on the page.

> **Learned.** Eleven things were not obvious beforehand.
>
> `res.sendFile` refuses files under a dot-directory by default (the specimen
> cache lives in `decks/.specimen-cache/`) — a path that passes `stat` still
> 404s from `send`. `{ dotfiles: "allow" }` is required, and the failure looks
> like a missing file with no hint.
>
> A React component can reference an undeclared prop and build clean, then
> crash the whole app on mount — `onOpenReport` was used but not destructured,
> and the deck detail went blank. Vite build and the unit tests cannot see a
> runtime prop bug; only a headless-Chrome session can. That is now a permanent
> CDP check.
>
> The density sweep cannot be one big call. One scoped call per content slide,
> each with the slide-type-only catalog and its density budget, keeps the
> grammar small — the whole reason two-stage generation works. A single
> rewrite call over the whole deck would be the old large-grammar failure.
>
> The cloud model will still invent an image URL no matter how firmly the
> prompt forbids it. The fix is structural, not prompting: strip any external
> URL from a model-produced slide and record it as an `[image]` note. The
> prompt is the first line of defence; the sanitizer is the boundary.
>
> Converting a slide to an image type with no real image is inherently invalid
> (the schema requires the field) — so the conversion refuses and keeps the
> original, which is the honest outcome. The image flow therefore sets the
> slide to an image type directly with the uploaded asset, never via the model.
>
> Presets are a "skip the fixed questions" feature, not a template engine. The
> briefing walk skips preset-fixed questions (team, theme, density, branding,
> slides-per-member) but leaves the changing bits (title, subject, teacher)
> answerable — and a "change" click on a preset-fixed question un-skips it for
> that deck without abandoning the format.
>
> Report depth and density are two axes, not one. Depth (full/brief) bounds the
> schema; density (sparse/balanced/dense) is prose guidance layered on top. A
> brief-dense report reads differently from a full-sparse one, and both are
> expressible.
>
> arXiv + Crossref are genuinely usable with zero keys, but the paper full text
> only reliably comes from arXiv HTML — Crossref abstracts are often absent.
> `paperFullTexts` targets arXiv pages first and the whole papers feature is a
> fast-path-off toggle because two public APIs plus two full-text fetches add
> real time to a research pass.
>
> The theme gallery's "looks similar" problem is real and measurable: a
> 20-theme contact sheet at thumbnail resolution shows sibling pairs
> (bauhaus/swiss both red dividers, editorial/material-you both dark maroon
> titles). The fixes were small and surgical — change the divider colour to the
> design language's own secondary, not a new identity.
>
> A whole-deck render across 20 themes for visual auditing is slow enough that
> it outlives a 5-minute shell timeout; rendering one representative deck per
> theme into a contact sheet image is the audit primitive.
>
> The monthly sweep's email must send even when nothing was deleted — otherwise
> "the sweep ran" is indistinguishable from "the sweep never ran", and the
> owner cannot trust the server is holding recent work only.

### [x] Font floor — never ship a tiny font, flag instead (big-sweep item 16)
"the font is usually small" in generated decks. Two causes, both fixed in
`src/fit.js` and the stacked layouts:

- **The fitter's `measure` forgot the em factor.** It returned
  `length × advance` with the advance a bare em fraction, so it estimated
  ~5.7× wider than reality at 13pt. Every fitter consumer inherited that: a
  146-char body "measured" ~81in, `lineCount` over-counted, `heightOf`
  over-estimated, and the fitter shrank fonts that were already readable —
  a three-bullet slide rendered at 8pt. `measure` now multiplies the advance
  by the em, and Black/ExtraBold faces estimate wider (Merriweather Black
  stat digits like "53 kWh" wrapped at the width a 0.495 em advance
  predicted fits one line; the real average is ~0.60 em). Ordinary content
  now renders at its nominal size.
- **No floor existed below which shrinking was refused.** Every role now has
  a readable floor (body 14pt, caption 12pt, subhead 14pt, stat 24pt, ...)
  and the fitter clamps at it, reporting `body would need 9.9pt — floor 14pt`
  into the render `problems[]` instead of rendering smaller. The fix for a
  flagged slide is LESS TEXT via the density sweep, never a smaller font. A
  theme whose nominal is already below the floor keeps its design size — the
  floor is a shrink stop, never a grow (warm-humanist's 13pt body renders at
  13pt, never below).

The stacked layouts that reserved a fixed one-line guess and shrunk
titles/labels into it (the classic ~8pt card title) now size the box to the
content's real line count (`linesBox`); flow cards drop bodies at five or
more steps, matching the vertical branch's existing capacity rule. Floor
events flow out of the fitter through a per-slide sink the renderer drains
into `problems[]` — no call-site changes across ~140 fit sites.

> **Learned.** Five things were not obvious beforehand.
>
> The "small font" report was one root cause, not many: the em-less `measure`
> made the fitter think ordinary content needed ~5.7× the box it does, so it
> shrank fonts that were already readable. The floor without the measure fix
> would have flagged almost every slide (the pessimistic estimate says even
> short bullets overflow); fixing the measure first meant the floor only ever
> fires on genuinely long content. The two changes are a pair.
>
> A `min(nominal, floor)` floor is a shrink stop, not a grow. A theme that
> chooses a compact 11.5pt mono body stays 11.5pt; the floor prevents the
> fitter from going below it and flags when content cannot fit there. Growing
> text past the theme's design would break the shrink-only contract and every
> layout budget that assumes it.
>
> Merriweather Black is ~0.60 em average, not 0.495 — and weight is the thing
> the fitter ignored. Without a weight factor the stat value "53 kWh" wraps
> at a size the heuristic promises fits one line, and the wrap lands the
> unit on the label below. Black/900 faces now measure 1.25× the regular
> advance.
>
> Floor events need a sink, not 140 call-site edits. The fit functions have
> no idea a per-slide `problems[]` exists, so the events collect in a
> module-level array (safe because layouts render synchronously) that the
> renderer drains after each layout, deduped by message because `fitScaleAll`
> refits every member.
>
> Layouts that enforce "one line at any size" ARE the small-font bug. The
> `cards` layout shrank long titles to 0.55 scale (~8pt) to keep them on one
> line; once the floor forbids that shrink the title wraps into the body, so
> the only honest fix is giving the title its real line count and pushing the
> body down. Sized-to-content zones are what make the floor affordable.
>
> Verified by rasterising the batch decks, the real cloud decks and the
> 26-theme matrix: normal slides render at their nominal size, and only
> genuinely-long slides (verbose card bodies, 3+ line checklist items, dense
> flow steps) flag. `mimo-v2.5` confirmed the flagged slides keep readable
> fonts and the previously-colliding card titles/labels are clean.

### [x] Presenter distribution — contiguous, balanced, centralised (big-sweep item 17)
"some people were given 2 slides and some had one slide here and then another
slide again later." Presenters used to be assigned by the writer model one
slide at a time ("picking the next one in the presenting order"), which
scattered. Now a single `distributePresenters(slides, members)` in
`src/ai/team.js` is the one source of truth:

- Dividers (title/section/chapter/closing/epigraph) never carry a presenter.
- Content slides group by their `section`; whole sections are assigned to
  presenting members IN ORDER, so a member's slides are one contiguous block
  (their section's divider opens it, the next divider closes it).
- With more sections than members, whole sections partition into contiguous
  blocks sized within one slide of each other where the section sizes permit —
  a section is never split.
- With at least as many members as sections, the CONTENT SLIDES themselves are
  the unit: every member gets at least one slide when the count allows, block
  sizes stay within one slide of each other, and a member with no section of
  their own takes a contiguous share of a neighbouring section's slides rather
  than staying silent. The exception is exactly as many members as sections and
  no briefing target — then member i takes section i, whole.
- The briefing's slides-per-member answer overrides the automatic per-member
  target in BOTH branches but still produces contiguous blocks; it now flows
  structurally through meta.yaml (`slidesPerMember`) instead of a sentence
  inside the brief, and a surplus distributes at balance ≤1 rather than piling
  onto the trailing members.

The writer no longer sees the `presenter` field at all — it is removed from
its ops grammar, and the distribution is force-applied after generation. Chat
turns can still edit a presenter by hand (their grammar keeps the field).

> **Learned.** Three things were not obvious beforehand.
>
> "At least as many members as sections" is NOT "member i takes section i".
> The first version assigned sections to the first N members and silently
> stranded the rest, and ignored slides-per-member entirely — an 11-member team
> with 7 sections shipped to 7 presenters and left 4 at zero even when the
> briefing asked for one slide each. When members outnumber sections, the
> slides are the unit and sections may split between adjacent members; the
> equal-counts case keeps the per-section rule.
>
> "Contiguous" had to be defined against the dividers. A member owns a run of
> sections, and the section dividers between them carry no presenter — so
> contiguity is checked over the content sequence with dividers stripped, not
> as an unbroken run of names in the flat slide list. A test helper that
> naively run-length-encoded the full assignment (treating a divider null as a
> break) reported "four blocks" for a perfectly contiguous 3-member split.
>
> "Unrepresentable beats scrubbed" holds for presenters too: removing the
> field from the writer's grammar stopped the model scattering assignments,
> and the deterministic post-pass is the belt-and-braces that guarantees the
> shipped deck matches the split. Same lesson as the divider-grammar fix.
>
> The split must run where the deck SHIPS, not only in the write half. The
> write half checkpoints deck.yaml per slide during the write loop and only
> assigns presenters in memory at the very end — so a deck that reached
> finalize via the resume shortcut (or a direct finalize of a hand-written
> deck.yaml) re-read a presenter-less file and shipped every content slide
> "auto". The assignment is now the shared `assignPresenters(deck, identity,
> slidesPerMember)` in team.js, called by generateDeck, the resume
> continuation AND finalizeDeck before flip-to-ready (re-applied after the
> critic path, which rewrites through the ops layer). Verified on the user's
> 11-member deck: resume → finalize assigned all 11, dividers clean, and the
> finalize-path unit test locks it in.
>
> Verified end-to-end with the cloud model: an 11-member team and a 3-section
> deck produced blocks 3,3,2 — contiguous, balanced to within one slide, no
> dividers assigned, and the presenter name renders in the chrome footer of
> each section's content slides.

### [x] Post-sweep UX fixes — hash routing, the thread-as-editor, judgeable galleries
The user-review round after the big sweep, four fixes:

- **Browser back navigates the app.** The SPA's views were pure React state, so
  back exited the site. `lib/router.js` maps every view to a hash
  (`#/chat[/<id>]`, `#/deck/<slug>`, `#/report/<slug>`, `#/research/<slug>`,
  `#/themes`, `#/identity`) and the shell pushes one on every navigation; a
  single `hashchange` listener is the only consumer of the URL, so back walks
  the route the user walked forward and `#/deck/<slug>` reopens that view on
  reload. In-app toggles never push. Deep links land after login (auth still
  gates per-user slugs).
- **The chat becomes the deck editor.** "Once the deck is prepared, the deck is
  made and I can't chat, so it's kinda useless" — after "Open the deck" the
  same thread keeps working: the briefing cards collapse into a compact "Deck
  briefing" recap (expandable to the full Q&A record, so nothing said is
  lost), the input stays live, and a message runs a real deck-edit turn through
  the same `/api/decks/:slug/chat` the deleted rail used, landing the applied
  changes and fresh slide thumbnails back in the thread as a persistent turn
  log. A produced report chat stays a readable record (input disabled with a
  hint).
- **The type-swap gallery is judgeable.** 75 tiny tiles were too small to
  decide on. Tiles render at ~200px+, hovering a tile enlarges it in a dock
  under the grid, and clicking a tile opens a full-size preview (the same
  cached specimen PNG — no re-render) where the commit happens. Filter and the
  current type's "now" badge stay.
- **The enlarged slide view carries the slide's actions.** The lightbox was
  navigation-only while the small card had edit/reorder/punch/swap/image/
  duplicate/delete. The lightbox now has the same toolbar for the current
  slide; edit/swap/image close the viewer for their modal, punch/move/
  duplicate/delete run in place.

> **Learned.** Four things were not obvious beforehand.
>
> Hash routing is a single-consumer system. A `hashchange` listener that
> applies the hash to state works for both navigation pushes and back/forward
> restores with no push-vs-pop bookkeeping — as long as every navigation goes
> through one `navigate()` and the listener is the only thing that writes view
> state. Two edge cases still bite: an empty hash needs a boot `replaceState`
> (not a push) so the root has no spurious history entry, and a chat-id deep
> link on a cold start resolves in the *chats* effect, which runs before the
> boot effect parses the hash — so the chats effect reads the hash directly
> instead of waiting for a ref the boot effect fills later.
>
> The deck-editing machinery never went away — only its UI did. The big sweep
> deleted the chat rail but `/api/decks/:slug/chat` (`runChatTurn`) stayed, so
> "the thread edits the deck" was wiring an existing endpoint to the existing
> input bar plus a turn log. The chat is the natural home for the record the
> user asked for: the briefing Q&A already lives in the thread, so the editor
> surface keeps it as an expandable recap instead of losing it.
>
> React maps `onMouseEnter` to `mouseover` delegation; a synthetic
> `mouseenter` event never fires it. A CDP hover test must move the real
> pointer (`Input.dispatchMouseEvent`) — and a "busy turn finished" wait must
> key on a precise DOM signal (the Stop button disappearing), not on text that
> can be matched by an earlier user bubble, or every "after" assertion runs
> while the model is still working.
>
> The lightbox was the same slide, just bigger — the gap was that none of the
> card's actions were reachable at that size. Modal-owning actions (edit, swap,
> image) close the viewer so their dialog owns the screen; in-place actions
> (punch, move, duplicate, delete) keep it open. Move follows the slide to its
> new position by adjusting the lightbox index.

Verified end-to-end in headless Chrome (CDP): routing round-trips chat → deck →
themes → back/forward → reload-restore, an unknown hash lands on chat; a real
cloud "make slide N punchier" turn from the chat thread changed deck.yaml and
refreshed the thumbnails; the swap gallery's dock, full-size preview and filter
behave; every lightbox action works from the enlarged view (a real punch turn
changed the deck). `mimo-v2.5` confirmed the lightbox toolbar, the gallery
dock/preview and the chat-editor surface render correctly.

### [x] (stretch) F13 image search — CC image lookup for model-emitted descriptions
The `[image]` notes the writer now emits (and the sanitizer preserves) are the
designated seam for supply: a slide that WANTS an image has a description the
app could search for, opt-in.

**Built as `Image supply — auto, not just upload` in section 9** — that entry
carries the record. Two things this entry predicted turned out wrong and are
worth keeping: the Unsplash Source API named here is **retired** (503 to
everything), and a SearXNG image category **cannot** be the source because
SearXNG drops the licence from every result row, including its own Openverse
engine. The sources are Wikimedia Commons and the Openverse API direct.

### [x] Per-user deck isolation — ownerless decks are operator-only
A fresh account saw two dozen stranger decks because legacy CLI and test decks
carry no `owner` in meta.yaml and the per-user gate treated them as shared. The
ownerless legacy store is now the operator's:
- **One policy, everywhere.** `canAccessDeck(user, owner)` in `src/auth.js` is
  the single decision: owned decks belong to their owner, ownerless decks to
  the admin (seeded with a `role: "admin"`, with a `FORGE_ADMIN_EMAIL` fallback
  for accounts minted before roles existed). The deck list, the per-slug
  detail/render/report gate, the content search and the sweep all route through
  it, so list and access can never disagree.
- **The sweep is operator-only too** — it deletes whole decks including
  ownerless ones a regular account cannot even see, so a non-admin must not be
  able to fire it.
- **CLI decks stay usable headless.** The CLI never touches the server's auth,
  so an ownerless deck created by `forge` keeps working for whoever runs it; the
  web admin sees it, nobody else does.

> **Learned.** The auth model had no roles — admin was "the account minted by
> seedAdmin", which is just another record. Rather than bolt an `isAdmin`
> special-case onto every caller, the role became a first-class field on the
> user (with an env-email fallback for existing installs) and the policy a
> single pure function. That is the difference between "the list hides it but
> the slug still loads" and one gate everyone passes through.

### [x] Shell redesign — warm charcoal, real depth, working anchors
The "feels dead" review landed two specs: a visual plan (warm palette, depth
tokens, motion, self-hosted type) and a structural critique (ten fixes, from
dead anchors to the raw-markdown Docs modal). Both shipped in one pass:
- **Paint.** Warm neutral ramp (`#141110` base → `#2f2822` hover), accent
  brightened to `#e0705a` with real tint/glow materials, amber kept sparingly,
  crimson danger, sage success. An elevation scale (`--shadow-card/-hover/-float`),
  a one-step-stronger field fill, `::selection` in accent, warm scrollbar, and
  one radial ember glow per hero.
- **Motion** on a single 220ms easing: staggered entrances (40ms steps, capped
  at 12), hover lift with a growing shadow, count-ups on the coverage metrics,
  typing dots on chat status, press-scale 0.98, rising toasts, a 6s glow
  breathe. The particle field drifts as embers (opacity 0.16–0.40, accent share
  0.22, 150px repulsion) with a 1.5× boost on login.
- **Type.** Inter variable + Plex Mono load self-hosted via `@fontsource` (no
  CDN — the `font-feature-settings` are no longer a no-op); a scale floors body
  at 15px and captions at 12px, titles step up to display/heading sizes.
- **Structure.** Chat/deck/nav rows and the wordmark are real `<a href="#/…">`
  anchors, so middle-click and copy-link work. The chat greeting is one centred
  column (hero + chips + composer) with the void removed. The Docs modal is
  gone; `#/home` is a designed landing tour (pipeline flow, live theme
  carousel, local-vs-cloud, capability grid). Theme cards set the default (with
  toast + undo, search, default badge). Slide cards get a hover-reveal toolbar
  with styled tooltips and crimson delete in the menu. Empty states use the
  shared `Empty` with in-state CTAs, ProseNotes strips `**` leaks, and auth
  errors land inline under the offending field.

> **Learned.** Two not-obvious things.
>
> Centring content taller than the viewport with `justify-center` clips the top
> — the classic flexbox centering overflow. The fix is `margin: auto` on an
> inner wrapper with a scrollable parent, which centres when there is room and
> scrolls when there is not. The first CDP screenshot of the "recentered"
> greeting showed the hero heading sliced off; `m-auto` fixed it.
>
> `textarea` cannot be self-closing JSX. Extracting the composer into a shared
> variable for the greeting column and the pinned footer surfaced a `<textarea
> …/>` that rolldown rejected as "adjacent JSX elements" — a parse error that
> reads like a structure bug, because the real tell (the tag type) is not in
> the message.

The UI currently turns the note into an "add image" prompt; an automated
lookup would close the loop. `searchPapers` in `src/papers.js` is the pattern —
a public API with no keys, folded into the research pass.

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

### [x] Native-renderable themes (15)
Expressible with pptxgenjs shapes alone, so text stays editable in PowerPoint.

`swiss-international` · `editorial-magazine` · `minimal-muji` · `neubrutalism`
`bauhaus` · `memphis-postmodern` · `art-deco` · `dark-neon` · `linear-dark`
`material-you` · `flat-2` · `retro-terminal` · `newsprint` · `notion-clean`
`corporate-alegria`

All fifteen are native (no plate — `tokens.plate.enabled: false`), so every
slide's text stays editable in PowerPoint. Each design language is a real
token set, not warm-humanist with a new accent: Swiss grid discipline,
Playfair Display magazine typography, Muji restraint, neubrutalism's hard
shadows and black borders, Bauhaus primary geometry, Memphis teal/magenta
play, Art Deco gold and black, dark-neon glow, Linear's hairline product UI,
Material tonal surfaces, flat indigo, retro-terminal green-on-black mono,
newsprint serif, Notion's neutral workspace, Alegria's bright corporate
optimism. Dark-neon's glow is carried by a soft outer shadow in the accent
colour — a native shadow reads as glow, so even it needed no plate.

The gallery now sits at the 20-theme target: warm-humanist + the four plate
themes + these fifteen.

> **Learned.** Four things were not obvious beforehand.
>
> The fitter's family table silently decides whether a theme works. The newer
> gallery's geometric sans (Manrope, Poppins, Outfit, Space Grotesk, DM Sans,
> IBM Plex Sans) fell back to Inter's narrow advance, so a one-line card title
> in those families wrapped into its kicker — a muji card did exactly this.
> They now estimate ~8% wider. The fit is the theme's hidden dependency.
>
> Chrome's footer/crest contrast lives near a knife edge for mid-tone accents.
> The chrome derives its legible variant from `luminance(bg) < 0.45`; a teal
> at 0.52 gave gray-on-teal footer text. Memphis's teal had to be darkened to
> #008A8A to cross the threshold. A theme author must think in luminance, not
> hue, for its section surface.
>
> Mono is a force multiplier for the flow-ltr capacity limit. Retro-terminal's
> IBM Plex Mono body text at six narrow steps truncates where warm-humanist's
> Inter barely fits — the wide advance means fewer characters per line and
> more overflow. The theme shrinks its body to compensate; the layout limit
> itself remains a layout concern.
>
> A theme-contract test (load every theme, assert the surface/type keys, and
> machine-check that `voice` contains no hex or font vocabulary) costs nothing
> and turns the three-layer rule into a guard. The `tools/compare.mjs` contact
> sheet is the one-pass structural check: all 20 themes × 3 styles rendered
> with zero errors.

Every theme was rendered on `decks/raytracing-ai`, rasterised and
vision-checked with `mimo-v2.5` (title, section, compare, cards and stats),
with a second deck spot-check for dark-neon. Contrast and overflow defects
found and fixed: a muji card title wrapping into its kicker (fitter), the
Memphis section footer/crest contrast (accent luminance), and the
retro-terminal section standfirst (green-on-green).

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

### [x] Theme polish — the shared surfaces and the four workhorse themes
The user's review called the themes "not that beautiful... all the same
philosophy — nice but repetitive." The honest scoping split it in two: a token
and shared-layout polish pass now, and layout-LEVEL distinctness for flagship
themes deferred to a dedicated themes session (design in HANDOFF).

The polish round fixed what the vision audit found:
- **Stats layout** (shared, every theme): the block piled its columns in the
  top half of the slide and a 3-line label collided with its sub-annotation.
  Columns are now measured at their fitted size against a ~10% narrower width
  (the wrap heuristic runs optimistic for long labels), the sub sits below the
  label's real rendered lines, the whole block centres in the content box, and
  the accent cycling drops `ink` so a near-white figure no longer lands on a
  dark theme.
- **Section divider** (shared): a short light-tint accent rule under the number
  turns a bare text block into a designed break, and gives dark-neon its neon
  moment and swiss its hairline.
- **Title composition** (shared): tightened by 0.2in, cutting the flagged
  dead space between the banner and the headline.
- **warm-humanist** — softer card shadow; **swiss-international** — hairline
  card outlines (the style is the grid, not shadows); **dark-neon** — brighter
  muted text for caption/footer legibility; **glassmorphism** — more saturated
  blobs, a see-through frost, and a title scrim so white text stops competing
  with the gradient.

> **Learned.** The themes' sameness is mostly NOT the tokens — it is that one
> shared layout system draws every theme's cards, stats and dividers, so all 26
> read as the same skeleton in different paint. Palette swaps cannot fix that;
> only layout functions that branch on the theme can. The polish pass improved
> the shared surfaces instead, which raises every theme at once and is the
> honest precondition for the layout-level work.
>
> The stats sub-collision was the same fitter optimism that hit stat digits:
> `lineCount` undercounted a 3-line label, the sub was offset below the
> undercount, and the two met. Measuring the label against ~10% less width
> over-reserves the box by construction, exactly the fitter's established
> "pessimistic safety factor" pattern.
>
> Verified by rendering the raytracing deck in all four themes and checking
> with `mimo-v2.5`: the collision is gone, glass reads as glass, hairlines and
> shadows land, all four themes rated 8.0-8.5 with no regressions.

### [x] Themes distinctness — background layer, layout flagships, 12 new themes
The "all the same philosophy" review split into a token-polish pass (above) and
this layout-level distinctness pass. Three pieces landed:

- **Per-theme background layer.** A theme-owned `tokens.background.decor`
  block paints native shapes + transparency behind the content box — a corner
  halo, edge bar or hairline grid. The plan assumed pptxgenjs gradient fills;
  those are silently dropped (the shape writes no fill element at all), so the
  layer is built from shapes alone, with mesh/gradient themes using the plate
  path. `drawBackground()` in render.js reads it; nothing in deck.yaml can.
- **Three layout flagships.** `tokens.editorial` gives editorial-magazine a
  two-column bullets split (≥4 items) and a display-size drop cap on the
  definition slide; `tokens.bauhaus.block` draws the red-circle/black-triangle
  geometric block behind section and chapter headlines; neubrutalism's hard
  shadow was already token-carried (its `opacity: 100` was an off-chart alpha
  bug, now 1). Each flag falls back to the default when absent, so the other
  themes are untouched.
- **Twelve new themes, 38 total.** corporate-clean-blue, nature-organic,
  blueprint, high-contrast-mono, risograph, letterpress, paper-pastel,
  soft-glass-light (plate), sunset (plate), gradient-mesh-dark (plate),
  retro-crt (plate), sci-fi-hud. Each carries the full token + voice contract.

`tools/themesheet.mjs` renders the specimen deck's *first content slide* (the
title slide is full-bleed and skips the background layer — a sheet built on it
makes every theme look dark) into one labeled PNG, with a `--score` mode that
reports the closest theme pairs by mean per-pixel difference. That scorer
surfaced corporate-alegria × swiss-international at 0.429 — genuinely
indistinguishable — and they were differentiated (duo-wash vs hairline grid).

> **Learned.** A background layer must be theme-owned tokens, verified by the
> theme-contract test (decor shape/geometry/hex checked per theme). The
> distinctness audit is a two-stage thing: a cheap pixel scorer to surface
> near pairs, then a vision model pointed at exactly those pairs at readable
> size — a 38-theme sheet at one-per-row is too small for a vision model to
> tell twins apart, while the numeric scorer catches them instantly.

### [x] Readability batch — calm HUD background, resizable flow, per-theme text contrast
The user-review round over the HPC deck, four fixes:

- **Sci-Fi HUD background decoupled from the grid.** Five full-height cyan
  verticals plus two horizontals on every slide read as dense line noise
  behind all content. The decor is now a thin magenta scan bar, three short
  registration ticks and one baseline; the corner brackets and mono labels
  carry the HUD identity, not a grid.
- **Horizontal flow is a milestone rail, not cramped cards.** The ltr flow
  drew one row of narrow cards hugging the heading — at five steps each card
  was ~1.4in wide, bodies were dropped entirely and the lower ~40% of the
  slide sat empty. The new design runs a baseline rail across the slide with
  numbered accent chips on it, titles above, bodies filling the zone below,
  so every step renders title AND body at any step count and the layout
  spans the full content height.
- **Text never sits on a rule fill.** The geometry layouts drew pill/chip/
  avatar text on `theme.palette.rule` fills. `rule` is a hairline colour and
  in isometric-dark it is `#FFFFFF1C` — a translucent white whose stripped
  hex renders as a solid near-white fill that swallowed the near-white `ink`
  text (the invisible slide-11 pills after a theme switch). Five sites
  (layered-architecture pills, ranking chips, before/after pills,
  branching-flow labels, avatar placeholders) now fill with `surface` and use
  `rule` only as a 1pt outline, so text resolves as ink-on-surface per the
  layer contract. `tools/contrast-audit.mjs` rasterises the geometry slide
  types in every theme into per-type contact sheets — the primitive for the
  38-theme sweep.

> **Learned.** Two things were not obvious beforehand.
>
> A contact sheet is a *targeter*, not a verdict. The 38-theme sheets flagged
> neumorphism, retro-terminal, sci-fi-hud and chalkboard for "invisible text"
> — full-resolution re-renders showed all four were downsampling artifacts
> with perfectly legible text. Only isometric-dark (the rule-fill bug) was
> real. Small-cell audits earn a full-res confirm before any fix.
>
> The fitter's floor is the right gate for "does this layout look good": the
> old flow cards dropped bodies at five steps for a reason (a sentence cannot
> render readably in a 1.4in card at the body floor), and the milestone-rail
> redesign fixed the COMPOSITION rather than fighting the floor — the body
> simply gets a zone wide enough for it. Same lesson as the font-floor item:
> give the content a box that fits it, don't shrink the text.

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

### [x] Freeform slides — the "completely free" mode
`type: freeform` with an `html` field, rendered via the HTML plate renderer.
The model writes arbitrary HTML/CSS; no layout vocabulary at all.

Two granularities, both wanted:
- **Per slide** — a mostly-native deck with one or two hero slides.
- **Whole deck** — maximum visual impact, editability deliberately traded away.

Trade-off is real and drives the default: freeform slides rasterise, so nobody
can fix a typo in PowerPoint afterwards. Correct for a hero moment, wrong for a
whole graded submission. The UI must state this at the point of choosing, not
bury it.

Built on the plate primitive (§3), which already accepted a slide-level `html`
override. `type: freeform` requires a non-empty `html` field in the schema and
every other type forbids it, so the freeform grammar never leaks into native
slides (the catalog and the ops schema derive from the schema branch, so the
model sees it as an ordinary type). The writer prompt is the one deliberate
exception to the no-layout rule: for a freeform slide it explains the 1280×720
canvas, the sandboxed subset (inline CSS only — scripts and every network
request are blocked by the plate CSP), legible text sizes, and the chrome
overlay margins. The outline review offers the type with the rasterisation
warning, plus a whole-deck conversion that confirms the same trade-off; the
slide editor edits `html` directly.

> **Learned.** Two things were not obvious beforehand.
>
> Chrome's legibility on a freeform plate can only be known from the raster —
> the theme's flat palette says nothing about arbitrary HTML. `render.js`
> samples the plate's own top-right corner luminance (sharp, a small crop) and
> lets the crest/footer pick their variant from the pixels actually painted,
> which also sharpened the plated themes. The first version silently did
> nothing: `toBuffer()` returns a Buffer and destructuring `{ data }` off it
> yields undefined, so the helper always fell back. The threshold and the crop
> region matter too — sampling a wide corner let a bright chip push a dark hero
> plate across the line.
>
> "Other types forbid it" is a schema rule, not a prompt rule: html lives only
> in the freeform branch, and a slide-level `else: not required html` makes the
> mistake unrepresentable for every other type. The sandbox holds where it
> matters — a test page whose `<script>` tries to paint itself red renders
> blue.

Verified by rendering a deck mixing a native title/section with a freeform hero
through Chrome → pptx → LibreOffice → PNG: the hero's gradient, frosted chip,
headline and paragraph all present, native neighbours untouched, chrome footer
(presenter, slide number) overlaid, crest variant now chosen from the plate's
luminance. The sandbox is proven by the same test that guards the CSP.

---

### [x] Content grounding — the hallucination guard
After generation, `src/ai/grounding.js` compares each slide's figures, dates
and names against `research/notes.md` and flags anything it cannot find — into
the slide's `notes` field and the render result's `problems[]`. It only flags,
never rewrites a number to pass. Wired into `generateFromPlan` (and re-run on
the critic's output when the critic rewrites the deck); the CLI prints the
problems.

> **Learned.** Two things were not obvious beforehand.
>
> Names are the noise source. A card title or stat label like "Early Innovator"
> is not a claim, and flagging every capitalized phrase the research lacks makes
> the guard cry wolf. Names are only extracted from fields that carry a real
> figure — a name tied to a number is a claim, a bare label is not. With that,
> a properly grounded cloud deck produces zero findings.
>
> The guard's real test is a fabricated stat, and the cloud model obliged: a
> stats slide prompted with "growing at a 4.2% annual rate" emitted "4.2%" and
> a year "2030" that the notes never stated. Both flagged into the slide's
> notes. The notes themselves are the UI — the speaker sees exactly what to
> verify, in the deck file the deck detail already shows.
>
> A relative chart's coordinates are derived, not claimed. A chart drawn on a
> "% of baseline" axis (unit "% of X" or a "(relative)" category) encodes its
> claims as percentages: value 125 on "% of MPI+OpenMP" means "25% higher",
> value 55 means "45% lower". The notes state the percentages, never the
> normalised coordinates, so flagging 125 as ungrounded was a false positive
> (the DIOMP chart shipped six phantom `[grounding]` notes). `flattenSlide`
> now resolves such values to their delta-from-baseline and grounds that,
> dropping the 100-baseline origin; a fabricated coordinate whose delta is
> absent still flags (E1 intact). `deckFigures` keeps the raw values so the
> Research view lists what the geometry draws.

### [x] Content trim — the floor flag fixes instead of reporting
The fitter's role floor flagged slides whose text would need to render below
the readable floor ("body would need 11.4pt — floor 14pt") and the overfull
content shipped anyway. `src/ai/trim.js` closes the loop with a deterministic,
schema-driven pass at the end of generation and after density sweeps:

- The per-type trim metadata (which arrays are drop-able down to their
  `minItems`, which strings are shortenable, nested objects and array items
  included) derives from `deck.schema.json`, so a new type gets a sensible
  trim for free.
- Each `trimSlide` step is one small, deterministic edit — drop the last
  element of the array with the most slack over minItems, else shorten the
  longest prose at a sentence boundary with an ellipsis, headline last.
  `trimDeckToFit` re-renders between steps (in-memory, no pptx written), so
  content is only cut as far as the box actually demands; the flag survives
  only when trimming cannot reach the floor.
- `render()` now accepts an in-memory deck + explicit `deckDir`, which is what
  lets the audit loop run without touching the persisted deck until it
  converges, and a `write: false` flag skips the pptx write for audits.

> **Learned.** Three things were not obvious beforehand.
>
> A trim that converges needs a per-round step budget far above the obvious
> one. The loop trims one step per overfull slide per round and re-audits, so
> a dense compare slide (two sides + verdict + headline + standfirst) needs a
> dozen-plus steps; capping at 5 rounds left a slide flagged at 12pt that was
> two cuts from clean. The audit renders are cheap (plates cached, no pptx
> write), so 24 rounds cost about a second and the loop exits early when clean.
>
> "Drop items before shortening" is the right priority but the wrong granularity
> for arrays of prose. Dropping a bullet removes a whole line; shortening the
> longest bullet saves a third of it — the former converges faster and the
> ordering keeps the trim honest about what "lowest value" means (trailing
> items go first).
>
> The schema walker must keep the object prefix. The first version flattened
> nested strings to bare field names ("body" instead of "left.body"), which
> would have trimmed the wrong slide on a compare deck. Array-of-strings fields
> also need registering as shortenable strings, or bullets never shorten after
> hitting their minItems.
>
> Verified on the real First-Impressions deck (10 floor problems → 0) and a
> fresh cloud generation (18 steps, one stuck slide that two more steps
> cleared); `mimo-v2.5` confirmed the trimmed agenda, feature-grid, compare and
> stacked-list slides render clean at readable sizes with ellipses on word
> boundaries. One honest residual: the trim cuts content, it does not rewrite
> it — a trimmed agenda can keep a subtitle that still mentions the dropped
> items.

### [x] Data-affinity steering — data beats become charts
The chart type (and its scatter/radar/stacked-bar kinds) existed in the schema
and renderer for two batches, and the writer never chose it — a data-rich deck
used 17 types and zero charts, because the outline prompt described types
generically and "a number → data family" let stats/big-number/cards absorb
every quantitative beat. Now:

- `catalog.js` counts the research's numeric facts (numbers with units or
  percentages, and 3+ digit figures, deduplicated) and `dataAffinityNote`
  rides the planner and writer prompts when there are ≥2: data beats become
  `chart` slides, with the kinds named and matched to the comparison (scatter
  for correlations, radar for multi-attribute profiles, stacked-bar for
  composition over time, bar/line/area for trends).
- The chart specimen audit surfaced a real rendering bug: `stacked-bar` wrote
  OOXML grouping `clustered` because pptxgenjs honours `barGrouping`, not
  `barStacked` — the ignored option made every "stacked" chart render as
  grouped bars. The layout now passes `barGrouping: "stacked"`, guarded by a
  regression test that unzips the rendered pptx and asserts the chart part's
  grouping element.

> **Learned.** Two things were not obvious beforehand.
>
> Steering works by naming the kinds, not the type. "Prefer chart" alone is
> weak for a model that already has stats/big-number/cards; spelling out which
> chart kind matches which rhetorical comparison is what converts a beat into a
> real chart choice. The planner produced five chart slides from a data-rich
> brief the first time it saw the note.
>
> pptxgenjs silently drops unknown options. `barStacked` was never a real
> option, the chart wrote `clustered`, and nothing complained — the bug was
> only visible by unzipping the pptx and reading the grouping element, which is
> now a permanent regression test. "The chart renders" must mean "the chart's
> grouping is stacked", not "a chart appeared".
>
> Verified end-to-end with the cloud model: a data-centre brief (4.5% of global
> electricity, 25-35% annual growth, PUE 1.036) planned five chart slides and
> generated four real ones (line, bar, hbar, bar), all rendered correctly and
> vision-checked with `mimo-v2.5`.

### [x] Per-transport capability split — cloud is not hobbled by local limits
Every place a LOCAL-model limit (output caps, prompt conservatism, context
window) constrained the pipeline used to apply to the cloud transport too.
The cloud path now gets the full capability, split by transport rather than
one-size-fits-all:

- **Per-transport role overrides.** A role may declare `transports.cloud` (and
  optionally `transports.local`) in `config/models.yaml`; `applyTransport` in
  `src/ai/ollama.js` merges the block for whichever backend the role resolves
  to, replacing nested blocks wholesale. The cloud author gets a 24000-token
  output cap (the local 12000 kept) and a 240000-char research excerpt (the
  local 80000 kept) — a long cloud outline is no longer cut mid-JSON.
- **Length auto-bump.** A non-streamed completion that reports
  `done_reason=length` retries the same request with the cap doubled, up to a
  `num_predict_bump_ceiling` (default 64000). A runaway grammar still fails
  cleanly at the ceiling; a legitimate large output gets room. Streamed calls
  are exempt — tokens already delivered cannot be unsaid. The truncation
  error now states the effective cap and transport instead of asking the
  human to guess the role's `num_predict`. So the UI's "Retry planning" card
  now succeeds where it used to fail identically.
- **Cloud research is strictly deeper.** The research role's `research:` block
  sets the depth budget per transport: the cloud override runs more angle
  queries, higher source and read caps per query, more examiner-gap follow-ups,
  and more papers with the arXiv/Crossref upstream windows scaled to match.
  `excerptResearch` takes an explicit cap, resolved against the author's
  transport (`researchExcerptCap`), so a cloud author reads the deep notes.
  A verified cloud pass over one brief returned 79 sources across 56 domains
  with 10 papers (940 KB of notes).
- **Full-strength synthesis on cloud.** The writer prompt is tuned for small
  local models; when the author resolves to cloud, the planner, slide writer,
  density sweep, type swap and chat turns add a synthesis note demanding
  claim-first prose with evidence, real hooks in standfirsts, and figures from
  the notes — local keeps the conservative prompt. Grounding still runs
  afterwards either way.
- **The writer sees the field caps.** The full-strength prompt pushed the
  cloud writer past per-field schema caps (layers[].body ≤80, elements[].body
  ≤100) and overflowed slides became placeholders. The catalog now states
  every string's maxLength inside arrays and nested objects, so the model has
  the real budget.
- **The rest of the caps sweep.** Chat turns inherit the author transport's
  overrides through `runTurn` → `chatJSON`, so they are covered by the same
  `transports.cloud` block. The caps that deliberately do NOT get a cloud
  override are ones that exist for a reason other than a local-model limit:
  the critic's findings schema stays tiny because large grammars degrade
  constrained decoding (TRAPS), the report's paragraph caps are the
  depth/density contract (a user parameter, not a transport limit), and the
  outline's `purpose`/`maxSlides` bounds are structure the planner already
  works within.

> **Learned.** Three things were not obvious beforehand.
>
> Routing only routes the AUTHOR role by design, so "cloud research" is not a
> toggle — the research pass deepens when the research role itself is
> configured with a `provider:`. One-line override; the committed default stays
> local-first. The excerpt cap follows the author's transport (resolved by the
> same routing decision `chat()` makes) because the excerpt is read by the
> author, and capping it to the research role's transport would overflow a
> local author with a cloud research artefact.
>
> A verbose writer WILL overflow tight schema caps even when told to be
> specific — the fix is showing it the caps, not weakening the instruction.
> "Array of {label, body, items} (min 3, max 7)" hides that body is 80 chars;
> "layers[] body ≤80 chars" is actionable. The same plan went from 12/17 to
> 15/17 slides written after the caps entered the catalog.
>
> Grounding's normalize() stripped the decimal point and the commas, so a
> figure like "18.84 GW" could never match "18.84 gigawatts" in the notes and
> every decimal a cloud writer quoted flagged as fabricated. Keeping the dot
> and checking the comma-collapsed form made the guard trustworthy again — the
> synthesis pass only works if the numbers it is told to quote actually verify.
> The one honest residual: a derived figure (₹3.61 − ₹2.25 = ₹1.36) flags,
> because grounding cannot do arithmetic, only match text.

---

## 5. Reports

### [x] DOCX renderer
Template-donor approach: strip the body from the institutional `.docx`, keep
headers, footers, styles, watermark and media, inject generated content.

> **Learned.** Six things were not obvious beforehand.
>
> The `docx` package is generation-only — it cannot open or parse an existing
> `.docx` — so the donor approach needs real zip read/write. jszip (already a
> transitive dependency of docx) became the tool, and `word/document.xml` is
> rebuilt by string surgery: keep the donor's `<w:document>` opening tag and
> the body-level `<w:sectPr>` verbatim, replace only what sits between
> `<w:body>` and the sectPr. That sectPr carries the header/footer references
> and the page geometry; losing it loses the chrome. Every other part survives
> byte-for-byte, which is what makes the watermark and banner "free".
>
> A table cell whose `<w:pPr>` sits outside `<w:p>` is silently dropped by
> LibreOffice — the whole Table of Contents rendered as a bare heading for an
> entire pass. Cells must wrap `pPr` + run in `<w:p>`; the names/content tables
> had it right, only the TOC generator did not.
>
> The static TOC needs real page numbers, so the render is two-pass: first
> pass to a temp .docx, LibreOffice → PDF, pdftotext, find which page each
> numbered heading lands on, then rebuild with those numbers. The pass document
> must not live in the converter's outDir — `libreofficeToPdf` clears it.
>
> Page numbers are engine-dependent. The donor's own hand-typed TOC (4,4,4,5,
> 7,8,9,9) is stale against LibreOffice's pagination of the same file; the
> two-pass numbers are at least internally consistent with the render we ship.
> A heading the pass cannot find shows an em dash and a problem entry, never a
> wrong number.
>
> The cover is identity-driven (meta.yaml over config/identity.yaml), so a
> blank guide/subject/team leaves it sparse — that is content, not a rendering
> defect. With a full identity snapshot the cover is visually
> indistinguishable from the donor's, chrome included (vision-checked).
>
> LibreOffice renders Word's VML watermark from the header parts correctly, so
> "keep the donor's headers" genuinely beats rebuilding a watermark by hand.

Note the donor `.docx` lives in gitignored `reference/`, so the renderer must
fail with a clear message when it is absent rather than half-working — it does:
`resolveDonor` throws unless exactly one `.docx` is present in `reference/`.

Fixed section order (non-negotiable, this is what is graded):
Abstract → Acknowledgement → Introduction → Theoretical Background →
Application → Future Scope → Conclusion → References.

The renderer (`src/report.js`) emits exactly that order regardless of the
order the content file lists them in, numbering the present sections 1..N.
Sections with no content are skipped gracefully, never a bare heading.
Content is schema-validated `decks/<slug>/report.yaml` (sibling of deck.yaml,
so shared research feeds both). CLI `forge report <slug>`, API
`GET/PUT /api/decks/:slug/report` and `POST .../report/render`.

### [x] Standalone reports — no deck required
A report no longer needs a deck. `brief → research → report.yaml → .docx` runs
standalone: the fixed graded section order IS the structure, so no outline gate
applies, and the generator's `requirePlan: false` derives its plan from the
brief and research. The deck list shows report-only folders (`deck: false`) and
a Report view renders/downloads the `.docx`. CLI `forge report-new`, API
`POST /api/reports` (SSE).

### [x] Deck-from-report — the reverse flow
The companion direction: an existing `report.yaml` (and its shared research)
plans a deck outline, which routes through the ordinary outline gate and
`/generate` path — so the deck and report agree by construction. The report's
own sections become the planning brief (`reportBrief`). CLI
`forge deck-from-report <slug>`, API `POST /api/decks/:slug/report/deck` (SSE),
plus the Report view's "Generate companion deck" button. Verified end-to-end on
`decks/solar-water-pumping-for-irrigation` (a standalone report that gained a
rendered 18-slide deck through this flow).

> **Learned.** The cloud transport was the hidden cost of making the standalone
> report work at all: OpenAI-compatible `json_object` is not Ollama's grammar.
> The provider 400s unless the prompt contains the word "json", and even then
> only guarantees output parses — the section writer returned
> `{"introduction":[…]}` where the schema demanded `{"paragraphs":[…]}`. Both
> are fixed at the transport (`cloudMessages` prepends a message stating the
> schema verbatim), which is where the report generator failed, not in the
> report generator itself.

### [x] Shared research
One brief → one research pass → both deck and report. This is the actual
submission workflow: the same material is needed in both forms, and researching
twice wastes minutes and risks the two artefacts disagreeing on facts.

The orchestration is now complete. `forge report <slug> --generate` draws
`decks/<slug>/report.yaml` from the same `research/notes.md` and the same
approved `plan.yaml` the deck was built from (generator: `src/ai/report.js`,
`generateReport`). The existing outline gate is the human gate for both — the
report is never generated before the plan exists, and it renders only on the
explicit `forge report` step. The API mirrors the CLI with
`POST /api/decks/:slug/report/generate` (SSE, abort-on-disconnect).
`--depth full|brief` is remembered in `meta.yaml`. Verified end-to-end on
`decks/green-hydrogen-production-how-electrolysis-t-2`: one brief, three
explicit sources, one research pass, and a 21-slide deck plus a full-depth
8-section report that agree on spot-checked facts (1789, 1.23 V, 53 kWh/kg,
180 GW by 2030).

> **Learned.** Three things were not obvious beforehand.
>
> The research artefact is first-class but its size is unbounded — one pass
> returned 138 KB of notes, ~40K tokens against the author role's 32K window.
> Feeding that whole artefact into every model call overflowed context and
> the model collapsed to a one-token reply. The artefact stays whole on disk;
> the model sees a bounded excerpt (`src/ai/research.js`, `excerptResearch`).
> Without the cap, planning itself fails, which looks like a model problem and
> is a context problem.
>
> Supplied sources silently skipped research: `forge new <brief> --sources
> <url>` without `--research` produced a deck with no research/ dir, and the
> report generator then failed with "no research/notes.md" for a reason nothing
> explained. Sources now imply a research pass.
>
> "One brief generating both" does not need a second human gate. The outline
> gate already blocks rendering until a human approves; the report generator
> simply refuses to run without an approved `plan.yaml` and `research/notes.md`,
> so the seam stays a disk boundary like the deck's planning status.

### [x] Report content depth
Reports go deep where decks stay terse. Same content tree, two density budgets:
the deck gets a headline and three supporting sentences where the report gets
four paragraphs and a table. Depth is a parameter on the generator, not a
different generator.

The renderer was already depth-agnostic, so depth lives entirely in
`src/ai/report.js` as the per-section schema bounds and the writer prompt.
`--depth full|brief` (or the API body) selects the budget, remembered in
`meta.yaml`: full writes three-to-six paragraphs (target four) and a table
where one earns its place; brief writes a headline statement plus three short
supporting sentences and never a table — 8 KB vs 33 KB for the same report.
Both draw unchanged through `src/report.js`.

> **Learned.** Two constrained-decoding traps, both found by watching a real
> run fail. A string item with `maxLength: 2000` silently kills Ollama's
> grammar (1999 works) — no error, just unconstrained output that fails
> validation; full-depth paragraphs now cap at 1500, guarded by a test that
> walks every schema. A hard 240 cap on brief sentences truncated them mid-word
> and the pressure pushed the model into garbage characters (Chinese runs, a
> citation echo); 450 fits a complete sentence while staying visibly lighter.
> Brief depth also caps References at six entries, because a twelve-source list
> is not a brief report.

## 6. Full slide vocabulary

### [x] The complete 50-type vocabulary
Every type in the product plan's Part 1 now lives in the schema, the catalog
and the renderer — the six Tier-1 types shipped earlier plus the remaining
types in batches by family. The enum holds 75 types (the 16 pre-plan types, the
six Tier-1 additions, and the rest of the plan's families), each with its own
conditional schema block, a native pptxgenjs layout, a SlideEditor descriptor
and a demo deck that was rendered, rasterised and vision-checked with
`mimo-v2.5` before the batch shipped. The chart kind enum gained `scatter`,
`radar` and `stacked-bar`, and a cross-cutting `speaker_note` field draws a
note bar above the chrome footer on standard content slides.

Family batches (each committed and pushed with its own vision check):
1. **Foundation + List & Grid** — chapter, closing, numbered-list, checklist,
   feature-grid, grid-items, icon-list, stacked-list
2. **Data & Stats + charts** — kpi-dashboard, data-cards, progress-bars,
   ranking-list, metric-comparison, sparklines; scatter/radar/stacked-bar
3. **Comparison** — before-after, framework, matrix, scorecard, vs, side-by-side
4. **Process & Flow** — cycle, funnel, pipeline, dependencies,
   branching-flow, layered-architecture
5. **Timeline + Quote** — roadmap, journey, chronology, testimonial,
   pull-quote, epigraph
6. **Callout + Image + Table** — warning, tip, takeaway, image-grid,
   hero-image, split-screen, data-table, decision-matrix
7. **Diagram-ish** — diagram (vertical/horizontal/radial), pyramid, venn,
   hierarchy, concept-map
8. **Definitions + Team + Special** — glossary, faq, team-grid, attribution,
   contact, equation, bibliography, data-source; plus the speaker-note bar

> **Learned.** Eight things were not obvious beforehand.
>
> pptxgenjs scatters read their x coordinates from a synthetic first "X-Axis"
> series (`data[0].values` are the x positions, every other series supplies y).
> Feeding plain `{x, y}` objects wrote a scatter chart with zero series and an
> empty plot — verified by unzipping the pptx, never by eye.
>
> `tree.push({ children: [...].map(build) })` evaluates the children map
> BEFORE push runs, so a self-indexing tree builder appends grandchildren
> before their parent and every index desyncs — the hierarchy type rendered
> post-order and collapsed until the parent was pushed first.
>
> Rotated text wraps within the box's logical width before rotation. A narrow
> vertical box meant for a rotated axis label wraps the string mid-word; the
> box must be sized to the text's measured width, then rotated around its
> centre.
>
> The fitter's height budget is optimistic for stat digits: "99.9%" at 54pt
> "measured" one line and wrapped in LibreOffice, its `%` landing on the label
> below. `fitOneLine` (a width-based shrink with a pessimistic safety factor)
> now guards every stat value; it lives in `src/fit.js` and is the one-line
> guarantee the whole data family leans on.
>
> A vertical flow card needs ~0.75in for a readable title + body. Six cards
> cannot fit above the chrome footer at any readable size, so the TTB layout
> renders title-only at five or more steps — a tiny unreadable body is worse
> than none, and the plan's "cap TTB at 5" became "drop the body, keep the
> card".
>
> LibreOffice clears its outDir when converting, so an export that hands it the
> same directory as the freshly rendered pptx deletes its own input — the PDF
> export converts in a subdir and renames the result up.
>
> The `grid-items`, `ranking-list`, `faq` and other dense rows need a one-line
> fit or a real rendered line count, exactly like the Tier-1 lesson: every
> stacked element is either fit-scaled or reserves its measured lines.
>
> Demo decks live per batch (`decks/type-batch1..8`) so a regression re-render
> is one command per family, and the vocabulary test (`test/vocabulary.test.js`)
> validates every type's payload, rejects wrong shapes, and guards the
> `maxLength < 2000` grammar threshold.

### [x] Slide-vocabulary UI + editor
The inline editor gained descriptors for all 75 types, including composite
field editors for nested types (matrix axes, roadmap phases with items,
recursive hierarchy children, per-column data-table cells) and number/select/
boolean field kinds.

## 7. Part-2 features

The plan's F3–F20 shipped in a focused tranche (F1 grounding, F2 research
panel, F12 report viewer and the shell features were already done):

- **F3** outline drag-and-drop reorder (HTML5 drag over the plan rows)
- **F4** deck cloning (`POST /api/decks/:slug/clone`, `cloneDeck` in the
  pipeline, "Clone" button in the deck detail that opens the copy)
- **F5** slide templates (`templates/*.yaml` + `GET /api/templates` + the
  detail view's "+ Add slide" menu)
- **F6** vertical-flow capacity fix — title-only cards at 5+ steps, fit-scaled
  titles otherwise (was colliding with the chrome footer)
- **F7** keyboard shortcuts — Ctrl+K focus deck search, Ctrl+N new deck,
  Ctrl+S re-render, Ctrl+Z/Ctrl+Y undo/redo, Escape closes modals
- **F8** PDF + Markdown export (`src/export.js`, `--format pdf|markdown` on
  the render CLI, `POST /api/decks/:slug/export`, PDF/.md buttons in the UI)
- **F9** undo/redo in the deck editor — a 20-deep deck-state stack walked by
  Ctrl+Z/Ctrl+Y, saving and re-rendering like any mutation
- **F10** better empty states — the chat rail's first-run card with suggestion
  pills ("Add a stats slide about the key figures", …)
- **F11** sharing bundle — `POST /api/decks/:slug/bundle` zips the deck folder
  (content files + pptx) via jszip for download
- **F14** version history — timestamped `backups/deck.*.yaml` snapshots on
  every save, a Versions popover listing them with Restore
- **F15** canvas slide-builder (light) — a storyboard strip in the outline
  review highlights each slide as the SSE stream writes it. The full live
  per-slide rendering filmstrip remains future work (see Handoff).
- **F17** per-deck dark mode — `meta.yaml`'s `mode` is the render default, and
  the detail view toggles and remembers it
- **F18** generation error recovery — a per-slide retry with the catalog
  re-stated, then a placeholder bullets slide so a bad slide never leaves a gap
- **F19** full-text deck search — `POST /api/decks/search` greps deck.yaml;
  the sidebar's search merges content hits under the title filter
- **F20** report-as-deck hybrid — "Add as slide" per report section appends a
  bullets slide to the companion deck

Hosting-readiness (Part 3, deployment itself shelved by the user): stateful
directories (`decks`, `themes`, `brand`, `config`) and the plate cache are now
env-overridable (`FORGE_*`), the plate cache and Chrome binary were already
env-driven, and there are no secrets or machine paths in source.

Not built: **F16 i18n** (locale number formatting + RTL — design noted in
Handoff). **F13 image grounding** is now built — see `Image supply — auto, not
just upload` in section 9.

> **Learned.** The deck's PUT endpoint is the natural version-history seam:
> snapshot the current deck.yaml before every overwrite, so undo-per-turn (chat)
> and undo-per-session (F9) get a permanent sibling for free. And `readdir`
> with `{ recursive: true }` made the sharing bundle a five-line zip instead of
> a walk — worth remembering for any folder export.

### [x] Chat/deck UX fixes — the user review round
Four user-reported defects, each with a verified root cause:

- **Cross-tab chat desync.** Chats live in localStorage keyed by account, and
  no tab listened for the other tabs' writes, so a middle-clicked copy drifted.
  The shell now listens for the `storage` event on its chat key and reloads the
  list (keeping the active chat unless the other tab deleted it), so creating,
  editing and deleting in one tab is live in every other.
- **"New chat" stacking empty rows.** Repeated clicks minted a fresh thread each
  time. `newChat` now returns to the account's existing EMPTY chat of that kind
  (nothing sent, nothing produced) until a topic is actually sent. The Ctrl+N
  handler reads the list through a ref so its once-bound closure cannot miss the
  reuse.
- **Deck density showed "balanced" regardless of the briefing.** `createDeck`
  never wrote the density into meta.yaml, so the detail view's control fell
  back to balanced. Density now flows from the briefing (and a `--density` CLI
  flag) into meta at planning time; the sweep still overwrites it.
- **Structural slides counted against the per-member budget.** The outline
  schema capped TOTAL slides at max-slides, so 11 members × 1-per-person with 11
  max produced a plan with no title, dividers or closing — the structure was
  squeezed out by the cap. The budget now counts CONTENT slides only: the
  schema reserves headroom, `planDeck` post-processes every plan to open with a
  title, divide each content-bearing section and close, and trims content to the
  team-sized budget (N members × M each, capped by max-slides) so one-per-member
  hands every member exactly one slide.
- **Generation silently dropped plan slides.** A writer that emitted no usable
  append op (or threw — truncated JSON) filtered to an empty op list, applied as
  a no-op and vanished without a retry or placeholder, shrinking the promised
  count and stranding a member. The write loop now retries once, then writes a
  validating placeholder — a degraded slide beats a missing one, and a divider
  spec never degrades into a content slide.

Verified end-to-end through the UI with a real cloud generation: two-tab live
sync (create/rename/delete), repeated New-chat stays one empty row then a fresh
one after a topic, a dense deck opens with the Dense control, an 11-member ×
1-per-person × 11-max deck plans and generates title + 8 dividers + closing +
exactly 11 content slides with M1–M11 exactly once each, and a "make slide N
punchier" turn in the post-ready chat rewrites deck.yaml and refreshes the
thumbnails.

> **Learned.** Two not-obvious traps.
>
> The writer's "silent drop" failure mode hides behind validation: an empty op
> list passes `applyOps` as a no-op and the unchanged deck still validates, so a
> lost slide is indistinguishable from success. Success must be defined as "a
> NEW valid slide was appended", not "the deck is still valid".
>
> A placeholder that must validate is itself constrained by the schema: bullets
> requires two items (minItems 2) and a hard 60-char headline slice ships
> clipped mid-word on the rendered slide. The vision critic caught the clipping
> that no unit test could — the rendered PNG is the only real proof of a slide.

### [x] Product framing + entry flow — bulk by machine, polish by you
Two user instructions in one round: the product message was reframed to the
honest positioning, and the app's front door moved from a bare login to the
landing page.

- **Framing everywhere.** Every surface that describes the product now says
  "the app does the bulk — research, structure, draft content, render — you do
  the final touches: verify the facts, tune the words, make it yours", with
  "Bulk by machine, polish by you" as the short form. Updated the `#/home`
  hero/tagline/how-it-works/capability copy, the auth modal (the login screen's
  tagline moved here when the full-page LoginScreen was retired), the chat
  welcome + footer hint, README + LOCAL_SETUP taglines, the sidebar empty
  states and the report view's no-report hint.
- **Landing-first entry.** An unauthenticated visitor lands on `#/home` — the
  landing page is the front door, whatever the hash (an auth-gated deep link
  still redirects to it, and its hash survives so login can honour it). The
  landing carries the auth: a slim Log in / Sign up header bar, and the hero's
  "Start a chat" opens the register modal. Auth actions all open the same
  `AuthModal` (now with the registration-closed handling the old LoginScreen
  had). The full-page `LoginScreen.jsx` was deleted — its tagline and role were
  folded into the landing + modal.
- **New chat is the constant landing.** Post-login and post-register the app
  routes to a fresh New chat every time — reusing the account's empty thread,
  minting one when none exists — never the last route, never the decks list.
  Only an explicitly-opened artefact deep link (`#/deck/<slug>`,
  `#/report/…`, `#/research/…`) is honoured instead; a chat id in the URL is
  the last route, not a deep link, so it resets to a bare `#/chat`. Logout
  resets the hash to `#/home`, so the next login lands on New chat. This
  supersedes the earlier "reopen at last position" idea; the mid-session
  back/forward restore is untouched.

> **Learned.** Two not-obvious traps.
>
> "Always land on New chat" is a chats-effect concern, not a boot-effect
> concern. The boot effect that applied the hash on login had to stop being the
> place that decided the landing: a chat id left in the URL by a previous
> session is the "last route" the user explicitly rejected, so it must reset —
> but a deck/report/research slug is a genuine deep link that must survive.
> Distinguishing the two in the boot effect (honour only artefact slugs,
> replaceState everything else to a bare `#/chat`) is what makes "always New
> chat" and "deep links still open" both true.
>
> Registration never hands out a session (by design), so "register from the
> landing → New chat" is really register-then-log-in. The landing's register
> modal correctly lands on the login form after creating the account; the New
> chat routing kicks in on the actual login. The verify flow must do both
> steps.

### [x] Report button states — a shared write state, no double-render mid-write
"the Render .docx button comes even when the thing is loading saying 'Writing
section 8 of 8'." A report write (streaming server-side writer) and the report
render are independent long jobs, and the Render .docx button only knew about
the render's own busy state.

- **A shared report-write registry.** `lib/reportWrites.js` mirrors `runs.js`
  but is keyed by slug (the ReportView has no chat id): `begin/update/end` plus
  subscribe. The deck's ReportPanel `generate` registers the write and streams
  its status into it; the ReportView subscribes for its slug.
- **ReportView respects the write.** While a write for the slug is in flight,
  Render .docx is disabled with its spinner showing (during both write and
  render), the Download link is hidden, "Generate companion deck" and "Add as
  slide" are disabled, the write's status line shows with a Stop that aborts
  through the registry. A remounted ReportPanel re-adopts an in-flight write so
  navigation mid-write can't re-enable its buttons.
- **Download only after a render exists.** The Download report.docx link is
  gated on the render's `result`, confirmed absent before any render; it is
  also hidden while a write is in flight. The one-click "render and download"
  still works: renderDoc's synthetic-anchor click fires the browser download on
  completion (verified via CDP that a single click both renders and downloads).

> **Learned.** Two things were not obvious beforehand.
>
> The ReportView can be open for a slug whose report is being *rewritten* (a
> regenerate) — that is exactly the mid-write double-render the user hit. A
> per-component `busy` flag cannot see a write started elsewhere; only a
> module-level, slug-keyed registry that survives navigation can, and the
> ReportView must adopt it on mount, not just subscribe from then on — a write
> started before the view opened must be visible immediately.
>
> "Download only after render" is two rules, not one: gate the link on the
> render result (absent before any render) AND hide it during a write. The
> first alone would still offer a stale .docx while the report was being
> rewritten.

### [x] User-testing batch 2 — selection, coherence, placeholders, polish
The second user-testing round's findings, shipped in priority order:

- **Report bugs.** The ReportView's busy state is one shared state across the
  render and the report-write subscription (the write registry's `end()` now
  fires the terminal patch that clears it, so "Writing section N of M" can
  never leave a stuck "Rendering…"); the Download link derives from a server
  probe of `out/report.docx`, so reopening shows it without re-rendering. The
  renderer's doubled page breaks (cover → TOC → section 1) produced blank
  pages 2-3; exactly one break per boundary with no pageBreakBefore on section
  1, verified blank-free by rasterising a real report.
- **Chat slide-selection panel.** After a deck is ready a ~40% side panel shows
  every rendered slide; selecting one or many names them by index + content
  excerpt in the turn context, and the deck view's lightbox focus flows into
  the chat via a module-level `deckContext` store so "make THIS punchier"
  resolves to the slide the user was looking at. Per-slide punch-up and type
  swap work over the selected set.
- **Briefing reaches the planner verbatim.** Every answered briefing question
  (team, guide, academic, audience, emphasis, theme, density, branding, count)
  ships as an explicit "The user answered: …" block, and the planner is told to
  always produce title → intro → body → conclusion, whatever the brief says.
- **Coherence pass.** `src/ai/coherence.js` reviews the finished deck (after
  generation and after a sweep) for topical drift and data-without-a-point,
  rewrites flagged slides through `runTurn`, and re-grounds + re-trims the fix.
  The writer prompts carry the framing rule ("if a researched fact doesn't
  serve THIS deck's argument, don't use it"). Verified on the soft-skills deck:
  the flight-attendant chart became "The Face Is Read Before a Word Is Spoken".
- **Placeholder gate.** `src/placeholders.js` recognises placeholder slides by
  marker text; the render gate refuses a deck that still carries one, the
  problems list flags them, and the deck view shows a per-slide Regenerate
  panel + card badges. Existing placeholder decks were swept via cloud turns.
- **Content floor + guidance.** List types now require 4 items minimum (the
  schema floor the trim pass can no longer cut below), and every type carries a
  "use when" line in the catalog so selection is grounded in intent, not names.
- **Auth + shell.** Split-screen sign-up/login with one strong landing CTA;
  logout moved to a bottom-left profile chip opening a centred identity/cloud
  modal behind a shared confirm; slash commands (/theme, /density, /slides,
  /papers, /report, /help) parsed before the turn; per-step SSE telemetry for
  every long action; an auto-growing composer; neutral theme cards; hosted
  model auto-fetch from `{baseURL}/models`.

> **Learned.** The coherence failure was a FRAMING failure, not a data failure
> — the flight-attendant stats were genuinely grounded, so grounding could not
> catch them. Coherence needs a different check than grounding: not "is the
> fact true" but "does this slide earn its place in THIS deck". That is a
> reading-comprehension call, so it is a model review with the critic's small
> schema, and the fix instruction must name the exact reframe or the rewrite
> drifts again.
>
> A placeholder's worst property is that it VALIDATES. "Details in the full
> briefing." passed every schema check and looked deliberate on the slide, so
> no validator could flag it — the marker had to become recognisable text plus
> a gate at the one place a deck ships (the render), plus a visible
> regenerate affordance. Detection by marker text, not by a flag field, is what
> let old decks be swept: their placeholders carry the historical phrasing.
>
> "Busy" across two subsystems (render + write) needs one shared terminal
> event. The write registry's `end()` used to delete the store entry without
> notifying subscribers, so a ReportView watching a write never learned it
> finished and stayed disabled with a stuck status. Firing `{finished:true}`
> before the delete is the whole fix; the UI unify follows from it.
>
> Raising the bullets floor in the SCHEMA (minItems 2→4) is what stopped the
> trim pass over-cutting — the trim drops to minItems, so a 2-item floor was a
> licence to ship two bullets. The floor in the writer's budget prompt alone
> was advisory; the schema makes it a hard contract the writer and the trim
> both respect.

### [x] Upload-only research mode — the user's file is the source of truth
The user's own document as the sole content source, with search turned off
entirely. The briefing's research question is now a three-way choice — Web
search (default) | My uploaded file (no search) | No research — and the
upload path is a new seam, not a fork:

- **`src/ai/upload.js`** ingests a document (md/txt read directly with a
  binary sniff; docx/pdf via LibreOffice headless to text) into the markdown
  that becomes `research/notes.md`, stages it by token (`config/uploads/`,
  gitignored, swept after 48h) so a large file never round-trips through the
  browser or localStorage, and resolves the token at planning. Size (25 MB)
  and word (60k) caps reject before anything is staged.
- **The pipeline skips the web pass entirely** when `researchSource: "upload"`:
  no SearXNG, no arXiv/Crossref, no Jina. `createDeck` and `createReport` both
  write the file verbatim to notes.md and a `kind: "user-provided"` source
  into sources.json, so grounding is strict fidelity against exactly what the
  user gave. Legacy callers keep their meaning: `research`/`papers`/`sources`
  still select the web mode.
- **The whole surface rides the existing contract.** The file is editable in
  the Research panel before generating (notes.md was always editable); the
  report-from-deck path reads the same notes; grounding's flagged-claim line
  names "your uploaded file" instead of "research/notes.md" so the fidelity
  contract is explicit. CLI: `forge new/report-new <brief> --upload <file>`.
- **Verified behaviourally.** Uploaded md and docx both: plan → deck → report
  with zero research web calls (proved by pointing SEARXNG_URL at a dead port
  and by notes.md being byte-identical to the file with no URLs in sources).
  Real file figures (42,000 crore, 7.5 kW, 4.2 ₹/unit, 60% subsidy, 30.8 lakh,
  9 bn L) pass grounding; derived numbers the file never states (6.8−4.2 = 2.6,
  4 t × 30.8 lakh = 12.3 Mt) are flagged. Empty/binary/huge/unsupported uploads
  and the unauthenticated case all reject cleanly; a docx carrying an image
  converts with text preserved.

> **Learned.** "The file is the source of truth" fell out of existing machinery
> almost for free — the whole pipeline already treats notes.md as the ground
> truth and the user already owns it. The new work was the intake (convert +
> stage + resolve), not the research: making notes.md the file meant zero
> changes to planning, writing or grounding. Two things the seam had to get
> right: the strict-fidelity message in grounding (naming the user's file makes
> the contract visible in the slide notes), and the three-way briefing choice
> replacing a boolean (a file-less "upload" choice would have silently planned
> without research — the card's Finish button stays disabled until a file is
> attached).
>
> The self-audit that followed shipped three fixes that had nothing to do with
> uploads: a ReferenceError that made every generation's SSE result frame fail
> (`r.problems` where no `r` existed — decks were written and rendered, then
> the frame died), a swallowed body-parser 413 that turned oversized uploads
> into a false "the file is empty" 200, and the framework layout's connector
> hairlines starting at the ellipse centre and running through the concept
> title. See TRAPS for the reusable versions.

### [x] Deck-quality round 3 — no stranded members, 75-type audit
The user-testing round's five findings. Two were design confirmations (the
first section divider after the title is intended; the "no connection" feel
was the stranded member plus thin sections, not a separate defect). Two were
real work:

- **The plan can now only SHRINK a deck — the thin-outline bug.** `planDeck`
  trimmed content to the budget but had no way to GROW a plan that came up
  short. An 11-member team with slides-per-member 1 planned 10 content slides
  (8 sections, one slide each) and the deck jumped from the 10th member's
  takeaway straight to the closing — Dhwani presented nothing. `mintContentSlides`
  now enforces the content-count contract: at least N × M content slides when
  the briefing fixes M per member, at least one per member when it does not.
  The deficit is minted into the trailing content-bearing sections (bounded by
  the same contentCap the trim enforces) before `ensureStructuralSlides` runs.
  Verified end-to-end on a real cloud generation: 11 members → title + 8
  dividers + exactly 11 content slides + closing, every member once, Dhwani on
  slide 20.
- **The 75-type layout audit.** Every type was rendered from the specimen deck
  in three themes (warm-humanist, swiss-international, dark-neon), rasterised,
  and read by `mimo-v2.5` for density, zoning and text fit. The verdict list
  (75 rows: OK / fixed) is committed as `docs/slide-type-audit.md`; the pass
  itself is reproducible via `tools/slideqa.mjs` (per-type PNGs + labelled
  contact sheets + the renderer's own problems). **Ten layouts were genuinely
  broken** and reworked: vertical `flow` was six thin full-width stripes with
  bodies dropped (now a numbered spine — chip on a central rail, title and
  body flowing right, bodies rendered whenever a row holds a title plus one
  line at the floor); `timeline`, `pipeline` and `funnel` hugged the heading
  and left the lower half empty (each now centres its block); `cycle` sat in
  the lower 60% (the ring starts below the heading); `dependencies` drew edges
  on top of nodes so Enrichment→Alerts slashed across Storage (edges draw
  behind the boxes, and layers order by their dependencies' barycentre —
  `diagram` got the same ordering); `concept-map` leaf labels shrank to ~8pt
  and collided (leaves are now pills sized to their own measured text, fanned
  so footprints never overlap); `matrix` rotated y-axis labels wrapped
  ("Impact" became Imp/act — the box was measured on the untransformed string);
  `contact` pinned a small card below the heading (the card now spans the
  content width, heading-to-footer). **Twenty-six types were sound layouts the
  writer was under-filling** — a new `TYPE_BUDGETS` map in `src/ai/catalog.js`
  tells the writer how much each layout invites (4 stats on the four-up grid,
  5-8 rows on a full-width table, a body per framework element), so the model
  fills what the layout is built to hold.

> **Learned.** Three things were not obvious beforehand.
>
> The budget is a two-way door. The trim exists because a model overshoots;
> the mint exists because it undershoots — a thin outline (fewer sections than
> people, one slide per part) is the same failure as a fat one, and a planner
> that can only shrink ships stranded members. The content-count contract must
> be enforced in the plan, not at distribution: `distributePresenters` balances
> what EXISTS but cannot conjure a missing slide.
>
> "Richer content" is a catalog concern, not a layout concern. A half-empty
> slide is usually the writer filling the schema minimum, and the honest fix is
> telling the model what the layout invites (the catalog rides every writer
> prompt), not rewriting the drawing code. The audit's verdict split — 10
> layouts reworked, 26 budgets enriched — is the proof: most "sparse" flags
> were content, most "broken" flags were zoning.
>
> A vertical flow's body capacity is "title plus one line at the floor", not a
> fixed step count. The old full-width cards needed ~0.75in per row and dropped
> bodies at five steps; the spine spans the full width, so a line is cheap and
> six short-body steps fit. The same change turned a capacity bug into a
> content question, which is where it belongs.

### [x] Deck-quality round 4 — the speaker script, geometry honesty, a calmer action row
The user-testing round's four findings. One was a UI defect with a found root
cause, one was a new feature the user described in their own words, one was a
design rule that grew out of "the ups and downs mean nothing", and one was
"the top row is confusing" with a concrete spec.

- **The lightbox scroll jump.** Clicking a slide while scrolled down opened the
  lightbox above the visible area and scrolled the page toward the top (CDP
  measured main.scrollTop falling 1773 → 628). Root cause: `main`'s `view-in`
  animation used fill-mode `both`, which retains the animated `transform`
  (even the identity matrix) after it finishes — and any transform on a scroll
  container makes it a containing block for `position: fixed` descendants. The
  overlays (lightbox, editors, swap gallery) mount inside `main`, so they
  positioned against scrolled `main` instead of the viewport. `backwards`
  fills only during the animation; afterwards the computed transform is `none`
  and fixed overlays return to the viewport. Verified: scroll to the last
  slide, click, scrollTop unchanged, overlay covers the exact viewport.
- **The speaker-script generator.** "Make a proper script too, at the end if
  the user wants, so if the person is unable to tell from the ppt the
  connection, the script fills in the gaps." `src/ai/script.js` writes
  decks/<slug>/script.md — one small-grammar call per slide producing 60–90
  seconds of spoken prose in the presenter's voice, bridging the slide's
  bullets to the deck's argument and naming the "so what" the coherence pass
  only implies. It is a button, never automatic: Export's "Speaker script"
  item and a deck-detail Script panel both generate on demand, and a per-slide
  Regenerate rewrites just that slide's words after an edit. Per-slide blocks
  are delimited by invisible `<!-- slide:N -->` markers so a regen replaces
  exactly its own block; the file is rebuilt from deck order, so a deleted
  slide drops its block. CLI `forge script <slug> [--slide N]`, API
  GET/POST `/api/decks/:slug/script` (SSE), download title-named via the
  existing route (now with a deck-root fallback), bundled in the .zip.
- **Geometry honesty — a shape may only look like a measurement when it is
  one.** The journey layout placed points by qualitative `sentiment` and drew
  a sawtooth, so the ups and downs implied magnitudes the content never
  stated; the funnel's bars narrowed index-linearly regardless of any value.
  The rule now: journey stages carry an optional numeric `value` — every
  stage valued draws a real line (each value captioned), any unvalued stage
  renders a flat milestone rail (sentiment colours nodes categorically, never
  position); the funnel's taper comes from real numbers only when every stage
  carries one, otherwise equal-width steps. Qualitative types keep their
  designed treatments — rails, flows, pyramids, venn, hierarchies stay
  beautiful and clearly illustrative, never metric-looking. Grounding now
  walks numbers as claims (a chart value missing from the research flags like
  any fabricated figure; the one structural integer field, `depends_on`,
  stays excluded), and the research view lists every figure the deck's data
  slides claim so the cross-check happens before presenting. The slide editor
  gained real data editors for chart (kind/categories/series values) and
  journey (per-stage value), so flattening a journey or fixing a chart figure
  is a hand edit, not a chat turn.
- **The deck-detail action row.** Five questions in one row ("why render if
  it's rendered", "how is re-sweep different from render", "how is the pptx
  different from export", "what is all this in Export", "why does the report
  panel have its own render/download") answered by construction: Render is
  disabled "Up to date" until deck.yaml (or the theme/style/mode override)
  changes, with an accent dot when a render is pending; Re-sweep enables only
  when the chosen density differs from the density the content was last
  written at; Export holds exactly PDF / Markdown / Bundle / Speaker script;
  clone/versions/dark-mode move behind an ellipsis menu; and the report panel
  has one action — "Generate report" / "Generate / Update report" — that
  writes, renders and downloads the .docx in one click, the separate
  "Render .docx" step gone.

> **Learned.** Five things were not obvious beforehand.
>
> A retained transform — even the identity matrix — on a scroll container is
> a real containing block for fixed descendants, not a theoretical one.
> `animation-fill-mode: both` on a view-transition keyframe that animates
> `transform` is exactly the trap: the element ends up holding the identity
> transform, and every `position: fixed` modal inside it silently stops being
> viewport-relative. `backwards` is the right fill for a one-shot entrance
> animation; `both` is for a state you actually want to persist.
>
> The speaker script is the coherence pass's natural downstream: coherence
> asks "is there a 'so what' the presenter can voice" and the script is where
> that voice lives. The prompt's job is to say what the slide does NOT carry —
> write in the presenter's voice, never read the slide, voice the connection
> the bullets only point at, ground every figure in the notes. A per-slide
> model call stays on the small-grammar rule, and 1999 chars is comfortably
> enough for 180–250 spoken words.
>
> A journey with sentiment but no values is not "a journey with missing
> values" — it is a qualitative journey, and the honest layout is a flat
> rail with categorically-coloured nodes, not a degraded chart. The user's
> framing made the distinction sharp: non-numeric decks SHOULD look designed,
> they just must not fake measurement. That is why sentiment colours nodes
> and never positions them.
>
> "The graphs are reflective of real numbers?" is a cross-check the user
> wants to do BEFORE presenting, so it needs a surface, not a rule: the
> research view now lists every figure the deck's data slides claim as plain
> mono chips against the source table. Grounding's part was one line — treat
> numbers like any other claim — and the one structural exception (integer
> dependency indices) is the only reason the walker needed to know a field
> name at all.
>
> Dirty state for Render has a server half and a client half: deck.yaml vs
> deck.pptx mtimes are the disk truth, but theme/style/mode changes never
> touch deck.yaml, so the UI must flip the flag itself. And "re-sweep was
> clickable when nothing changed" had a one-line fix — gate it on the chosen
> density differing from the density the content was last written at — which
> is also the honest definition of what the button does.

### [x] Settings redesign — the profile modal is the settings surface

The user's request: "what we have for identity changes to something a person
can make and keep and SAVE PRESETS even without making a new chat." Identity
split into what stays long-term and what changes per submission:

- **Settings = one surface.** The profile-chip modal (bottom-left) IS Settings
  now, not a read-only identity card with an "Edit in Identity" dead-end door.
  Three sections: **Account** (the person, cloud status + model count + key
  management + routing, logout behind the shared confirm), **Saved formats**
  (presets: full create/edit/delete WITHOUT a chat — fields name, team with
  presents, slides per member, max slides, density, theme, branding — with the
  same "Save as preset…" still offered from the briefing summary), and
  **Identity** (ONLY the long-term facts — institution name/short/department/
  university and guide name/designation — edited inline in the modal, plus the
  brand-marks upload kept). The old `views/Identity.jsx` is deleted; the
  sidebar's Identity row becomes a Settings shortcut that opens the same modal,
  and the `#/identity` route is removed (an old hash resolves to chat).
- **The briefing's preset contract narrowed.** "Use a saved format?" still
  lists the user's presets — now via a module-level store (`lib/presets.js`)
  shared with Settings, so a format created in the modal is live in the chat
  without a reload. A preset fixes team, maxSlides (new), slidesPerMember,
  density, theme, branding — and NO longer guide or academic. The guide comes
  from identity (a long-term fact); subject/year/semester/exam-type/team are
  per-submission, asked in the chat, and frozen into each deck's meta.yaml as
  before. "Remember as defaults" is gone: it wrote team/academic back into
  identity, which is exactly the coupling the redesign removes.
- **Migration — briefing-only, not a seeded default preset.** The simpler of
  the two options: existing `config/identity.yaml` keeps institution + guide,
  and any old team/academic/guide defaults in it are dropped the next time
  identity is saved from Settings (the save writes only the long-term fields).
  Old preset files carrying `guide`/`academic` migrate on read — `listPresets`
  sanitizes stored items to the new key set, no separate step.

> **Learned.** Three things were not obvious beforehand.
>
> A settings surface that lives in a modal needs a shared presets store, not
> per-component fetches. The chat and Settings both render the preset list; if
> each fetched once on mount, a format created in Settings would be invisible
> to an already-open briefing until a reload. A tiny pub/sub cache (the
> `modelMode` pattern) lets Settings write through it and the chat subscribe,
> so the "Use a saved format?" list is live by construction. The api layer
> was already there — `lib/presets.js` is pure view-state plumbing.
>
> Deleting the Identity VIEW had to preserve the cloud key manager and the
> brand upload, or both silently lost their only UI. The spec listed "cloud
> status + model count" for Account and institution/guide for Identity, but
> the old view's Cloud section (key save/test/remove/routing) and Brand
> section are real features the header's CLOUD button and the renderer depend
> on. The modal keeps them — cloud management under Account, brand marks under
> Identity — rather than shipping a regression hidden by "the modal is the
> surface now".
>
> The briefing walk's skip logic needed maxSlides added to `PRESET_KEYS`, and
> nothing else. The preset question, the skip, the change-to-unskip and the
> echo all already keyed off that constant; growing it was the entire briefing
> change. The per-submission fields were never in `PRESET_KEYS` (guide and
> academic were only ever pre-fills), so removing them from the preset payload
> left the walk order untouched.

Verified end-to-end in headless Chrome (CDP): a preset created entirely in
Settings (no chat) appears in a fresh chat's "Use a saved format?", picking it
pre-fills the team and skips the fixed questions to land on the title; the
Identity section shows only institution/guide and saves them to
config/identity.yaml (old per-submission fields absent); the briefing list
picks up a Settings-created preset without reload. `mimo-v2.5` confirmed all
four surfaces render clean (settings modal, preset list, post-pick thread,
identity panel). 316 tests pass.



## 8. Generation robustness — resumable runs, honest fit, and the slide-quality rules

Four queued items from the 2026-08-16 HPC-deck review (handoff A/B/C/E) plus the
E1–E4 slide-quality rules. All shipped in one batch; each has its own commit.

### [x] JSON-parse tolerance for model output (handoff A)

The cloud transport's `json_object` guarantee is "parses", never "matches the
schema", and the model still wraps output in fences or leaves a trailing comma.
The old `extractJSON` tried only the first brace and gave up after one failed
balanced scan, so visibly-correct ops JSON threw "Model did not return JSON".

- `salvageJSON` (ollama.js) now strips every fence (any language tag), tries
  every plausible `{`/`[` start position — so leading prose containing a brace
  cannot mask the real document — repairs trailing commas, and returns an
  `attempts` log the error message shows, so a failure is diagnosable.
- `MAX_REPAIR` is per-transport: the cheap cloud retry loop gets 4 rounds, the
  slow local grammar path keeps 2.
- Guarded by `test/json-salvage.test.js` (fences, upper-case tags, trailing
  prose, brace-bearing prose, trailing-comma repair, attempt logging).

> **Learned.** The failure the user saw was *not* a JSON-parse failure of a
> well-formed document — the model had emitted a genuinely malformed response
> and the parse correctly refused it. Hardening the salvager is still right
> (fences/trailing commas happen), but the bigger win was making the error
> name its attempts, so "did not return JSON" stops being a black box. The
> first-300-chars in the old error made the output *look* valid and the parse
> look broken.

### [x] Resumable generation — the "refresh restarted from slide 1" fix (handoff B + C)

A dropped SSE connection used to abort the pipeline (abort-on-disconnect), so a
reload killed the run mid-write, left `meta.status` "planned", and the only
offered action was a fresh generation from slide 1.

- **Write half / finalize half.** `generateFromPlan` split into
  `writeDeckContent` (checkpoints deck.yaml per slide, persists the approved
  outline to plan.yaml *first*, writes `.run.json`, sets `meta.status`
  "writing") and `finalizeDeck` (grounding + field-length + trim + coherence +
  render, flips to "ready", clears the checkpoint). Both are standalone, so
  resume and finalize re-enter only the needed stage.
- **Server runs survive the socket.** The generate endpoint tracks runs by slug
  in an in-memory registry; a client disconnect no longer aborts. A reconnect
  (or a second approve) attaches to the SAME run and streams its events —
  dedupe instead of restart. Stop is the one explicit abort (`POST
  /generate/stop`), and the checkpoint survives it.
- **The UI offers the honest three.** `GET /api/decks/:slug` folds the registry
  over the on-disk checkpoint and reports `{active, written, total,
  resumable, needsFinalize}`. ChatView and DeckDetail render a run banner:
  watch a live run, resume a partial one, or finalize a complete-but-unfinalised
  deck ("the deck is N/M written — finalize it" instead of a silent re-run or a
  stuck Working…). ChatView auto-reconnects to a live run on reload.
- CLI: `generate --resume` and a new `finalize` command.
- Guarded by `test/resume.test.js` (abort leaves a checkpoint, resume continues
  from it, only the remaining slides re-run the writer) and the live finalize
  run against the HPC deck.

> **Learned.** The abort-on-disconnect instinct is backwards for generation:
> dropping the socket is the *common* case (reload, tab switch), and killing a
> long model pipeline for it destroys work the deck.yaml checkpoint had already
> secured. The SSE socket is a status channel, not the run's life support —
> hold the run in a registry, re-attach the socket on reconnect. And "status
> planned + complete deck.yaml on disk" is a real state a user can land in
> (the run died between the last slide and finalize); the watchdog that offers
> finalize is what makes it recoverable rather than a confused re-run.

### [x] Empty charts must never ship (handoff E1)

Slide 16 of the HPC deck was an honest-but-unpresentable `chart` with
`values: []` and a standfirst saying so. Fixed three ways, so it is
unrepresentable at every entry point:

- **Negative steering.** `dataAffinityNote` now speaks for the no-numbers case
  too: "fewer than 2 numeric facts — do NOT choose chart; present the material
  with framework/cards/compare/flow". Previously it returned null below the
  threshold, i.e. said nothing.
- **Planner coercion.** `planDeck` coerces any proposed `chart` to `cards`
  when the research carries < 2 numeric facts, before the outline is shown.
- **Schema backstop.** `chart.series[].values` and `categories` now require
  `minItems: 1`, so an empty chart fails validation and the render gate
  refuses it (verified: the HPC deck's render was refused until slide 16
  became a cards slide).

Guarded by `test/chart.test.js` (validation rejects empty values/categories,
planDeck coerces below the threshold and keeps charts above it). Cloud planner
tests: a no-numbers brief produced zero chart types, a data-rich one produced
four.

> **Learned.** The writer was being honest and the validator was silent — the
> empty chart validated fine. "Honest but un-presentable" is a *category* of
> failure the schema must make unrepresentable, not a behaviour to discourage
> in the prompt. The steering is the first line; the schema minItems is the
> one that actually refuses to render.

### [x] No mid-sentence ellipsis — rewrite, don't cut (handoff E2)

Slides 6/10/11 shipped "MPI ranks own NUMA domains, OpenMP…" and "(DAG) the…":
the writer overfilled fields, the deterministic trim cut at a word boundary and
appended "…". Two fixes, and the trim can no longer produce the defect:

- **The FIELD-LENGTH pass** (`src/ai/fieldlength.js`), run in finalize and
  after a density sweep, *before* the trim: renders to find floor-flagged
  slides, walks each slide's fields against their per-field schema caps
  (`test/fieldlength.test.js` asserts the catalog states caps per field —
  framework concept.body ≤ 120, flow step body ≤ 120 — not just per type), and
  sends a scoped model call per slide: "rewrite each flagged field as one
  complete sentence ≤ its cap — no ellipsis". Two attempts; only what it cannot
  fix reaches the trim.
- **Sentence-boundary-only trimming.** `shortenString` now cuts only at a real
  sentence end (`. ? ! ;`) inside the window; with no sentence boundary
  reachable it returns null and the fitter's floor flag reports the slide
  instead. "The…" is no longer producible by the trim, whatever the writer did.

Verified on the HPC deck: finalize turned every "…" field into a complete
sentence; the re-render has no ellipsis anywhere.

> **Learned.** The trim was the second offender, not the writer alone: the
> field-length rewrite *succeeded* and then the trim re-cut the repaired text
> to "…" because the layout still could not hold it. Repairing upstream while
> the last-resort cutter still produces the banned artifact fixes nothing. The
> floor flag ("would need Xpt") is the honest fallback and is exactly right to
> keep — a flag is preferable to a fragment.
>
> The rewrite also had to accept the local model's op drift (a full `slide`
> object on an `update_slide`, no index): a model that writes the whole slide
> correctly is not a failure to discard. `slideFromOps` in ops.js is the shared
> tolerance point for sweep, convert and field-length.

### [x] Framework/diagram layouts must not hide text (handoff E3)

Slide 6's framework drew the central oval over the element boxes; slide 14's
diagram stacked six nodes so each box clipped the next.

- **Framework.** The ring radii are now checked against both clearances — each
  card's inner corner must clear the ellipse, no two cards may overlap — at the
  largest size the box allows, with ~0.3in of air between cards and oval. When
  no ring can fit, the layout falls back to a stacked concept panel + card grid
  (non-overlapping by construction). The ellipse is wide enough for a mono
  concept title at the subhead floor.
- **Diagram.** Node size derives from the layer spacing (never a fixed 1.0in
  box that overlaps a dense stack); a chain graph with too many layers for the
  vertical run auto-routes horizontally; edges draw before nodes (routed
  behind boxes) and start at a node's edge, not its centre; when rows are too
  thin for a body line at the floor, nodes render label-only — the same deal
  the flow layout strikes for six steps.

Verified by pixel analysis (0.3–0.6in gap between card text and the oval on
slide 6) and mimo-v2.5 reads of slides 6/10/11/14/16.

> **Learned.** A vision model's "these shapes overlap" verdict at tight-but-
> legal spacing is a false positive — it called a clean 0.3–0.6in gap an
> overlap three times, and quoted text that is not even on the slide. Pixel
> analysis is the ground truth for geometry; the vision model is a useful
> *targeter*, not the verdict. (TRAPS already says distrust-the-model-first;
> this is the concrete case.)
>
> A dense graph's honest answer is fewer words, not a smaller box: capping the
> diagram node height to the layer spacing stopped the overlap but squeezed
> bodies to nothing — the layout had to *drop* the body (label-only) rather
> than ship a 6.8pt line.

### [x] Raise the budget floor for thin types (handoff E4)

At dense, several types still read thin because the writer filled the schema
minima: a 2-step flow on a six-step slide, a 2-node diagram. `TYPE_BUDGETS`
gained entries for ~30 types that previously fell back to the family budget —
cards, compare, stacked-list (columns, so bodies must be one crisp sentence),
diagram (connected nodes), venn, hierarchy, pyramid, matrix, before-after, vs,
kpi-dashboard, data-cards, progress-bars, ranking-list, metric-comparison,
sparklines, the callout family, quote/testimonial, team-grid, image-text,
split-screen, side-by-side. Verified: the HPC deck's flow slide now carries six
steps.

> **Learned.** A layout that *is* the empty space needs its own budget line.
> The generic family budget ("6-8 items…") did not tell the writer the diagram
> is built for a connected graph or that stacked-list is five narrow columns
> where bodies must be short — a one-line per-type budget is what makes the
> writer fill the layout it is given.

316 → 341 tests.

---

## 9. Backlog — told but deferred (not the next super-fancy tour session)

These were named explicitly and are deliberately **not** part of the next tour redo, but they must not be lost. They live here so a future session can pull the right one without re-asking.

### [x] Image supply — auto, not just upload

*The entry said **unstarted**. It was not: `src/ai/images.js` had existed since
`f63ff07` and was wired into `finalizeDeck`. It could not do what it claimed,
which is a more expensive state than unstarted, because the call site read as
working.*

Today: upload an image → `assets/` → the slide is set to an image type with the real asset; invented URLs are stripped to `[image]` notes. What’s missing is **Gamma-like auto images**: when the writer wants an image, the system should find one, not just flag it. Design in `docs/HANDOFF.md` next-session notes: Unsplash Source / SearXNG image category, opt-in per deck, CC licence, cached in `decks/<slug>/assets/auto/`, `resolveAsset` prefers it, never invented. No model writes a URL.

**Four defects in the shipped version, each verified against the live upstreams
rather than reasoned about.** Its Unsplash fallback answers **503** to
everything — `source.unsplash.com` is retired, so the module listed two sources
and had one. Its primary source went through SearXNG, which **drops the licence
from every result row** including its own `openverse` engine, so nothing
recorded a licence and the images were ordinary copyrighted stock. It passed the
writer's descriptive phrase through verbatim, and both upstreams AND their
terms: `"electrolysis cell diagram"` returns **0** where `"electrolysis"`
returns 240. And it set `slide.image` on whatever type carried the note, but
`image` / `image-text` / `hero-image` / `image-grid` all **require** that field
— a validated deck can never contain one that is missing it — so every seat it
filled was on a type whose layout never draws one.

**Now.** `src/ai/images.js:1` is rewritten around the two upstreams that state
a licence themselves. **Wikimedia Commons first** (`commonsSearch`): it carries
`AttributionRequired` per file, has no punitive rate limit, and is deep in the
technical figures an academic deck asks for where the photo aggregators are
empty; `iiurlwidth` also rasterises SVG server-side, so a vector diagram
arrives placeable. **Openverse second** (`openverseSearch`) for photographic
breadth, budgeted by `makeBudget` because its anonymous allowance is 20/min and
200/day and it reports the remainder in
`x-ratelimit-available-anon_sustained`; `OPENVERSE_API_TOKEN` raises the
ceiling and is optional.

`licenceTier` ranks rather than filters — public domain and CC0 (nothing owed),
then CC BY, then CC BY-SA — with NC, ND and unreadable licences refused
outright. Ranking is what "widest pool, no legal issues" means in practice: the
live run picked a public-domain US Department of Energy photograph over the CC
BY-SA candidates without being told to. `queryLadder` widens in defined steps
(full phrase → drop the picture-kind words → the two most distinctive → the
single most distinctive) and stops at the first rung that lands.

`seatImage` is lossless or it does not act. An optional seat (`testimonial`,
`compare`, `before-after`) is filled in place; anything else is promoted to
`image-text` only when its list fits that type's four-line body. `imageSeat`
derives the seats from the schema, so a new image-carrying type is seated the
day it is added.

Every supplied file is recorded in `assets/auto/credits.json` and rendered into
the deck's `CREDITS.md`, split into what must be credited and what is listed
for provenance only. Opt-in per deck: `meta.imageSupply`, asked in the
briefing's required tier directly beneath research, `--images` on the CLI,
`imageSupply` on `POST /api/decks`. Guarded by `test/images.test.js` (27
tests), and what could not be supplied lands in `problems[]` with its reason,
so the slide keeps its `[image]` note and the manual upload door.

> **Learned.** Five things, and the first two are the reason this took a
> rewrite rather than a patch.
>
> **A wired call site is not a working feature, and it is worse than an empty
> one.** The handoff had this item as "unstarted, no decision" — the cheapest
> possible read. The module existed, was imported, was called in `finalizeDeck`,
> and returned an empty array every time, because its only live source returned
> results whose licence it could not read and its fallback host was gone. Two
> sessions of planning treated it as greenfield. Checking whether the named seam
> already exists costs one grep.
>
> **Verify a documented API by calling it, not by trusting the doc.** Two of the
> four defects were upstream facts no amount of code reading finds:
> `source.unsplash.com` is retired, and SearXNG normalises the licence away. The
> roadmap entry, written from the docs, named both as the design. One `curl`
> each would have caught them at design time.
>
> **The schema cap is not the fit constraint.** `image-text` lets `body` run to
> 180 characters and draws it in HALF the width a full-bleed list gets. Four
> bullets comfortable as `bullets` overflow as `image-text` with every cap check
> green — measured, the promotion took the fit sweep from 5 problems to 20
> across 13 themes. The supply now sweeps its own result over
> `COVERING_THEMES` and gives the picture back on any slide that does not fit.
> The test has to be "does it fit cleanly", not "did it get worse": a promotion
> changes the slide's type and so changes which FIELD the fitter names, and a
> slide that failed on `bullets` and now fails on `body` has an unchanged
> problem count while being no less broken.
>
> **Audit against a real deck or the gate is measuring the fixture.** Two bugs
> only appeared on `decks/perovskite-solar-cells-stability-challenges-2`. The
> whole-deck validation gate refused every supply on every real deck, because a
> real generated deck arrives already carrying schema errors (`loadDeck` warns
> on an over-long field rather than refusing) and the gate read those as the
> touched slide's fault. And the first fit-gate test PASSED against a broken
> gate, because the synthetic fixture had no `speaker_note` — the note reserves
> 0.7in and is what tips this slide over. Same blind spot `themematrix --notes`
> was built for, met again from the other direction.
>
> **The cache is a licence store, not just a byte store.** A cache hit returned
> `credit: null`, which would leave a CC BY image in a deck with its attribution
> nowhere — the exact breach the tier ladder exists to prevent. The resumed
> finalize, the re-render and the critic pass all re-run the supply, so the hit
> is the NORMAL path, not a repair. `credits.json` is now what the cache reads
> back from, and it merges rather than overwrites so a part-cached run keeps the
> credits it did not re-fetch.

> **Look-ahead.** `(stretch) F13 image search` in section 2 is the same feature
> under its older name and is closed by this; its predicted design (Unsplash
> Source, SearXNG image category) is exactly what the live checks disproved.
> `(stretch) Canvas slide-builder` is unaffected. The open follow-up this
> creates: **nothing surfaces `CREDITS.md` in the UI or the report.** The file
> is written and the deck page does not link it, so a CC BY image's attribution
> depends on the user finding the file. That is the next honest step, and it is
> why the licence ladder prefers public domain rather than treating all tiers as
> equal.

### [x] Rate limits and quotas under real load

*No model. Named as untouched for three sessions — `src/limits.js` had never
been driven by more than one request at a time.*

Driven two ways: the real HTTP routes on an isolated instance (own DB, own decks
dir, `FORGE_AUTO_WINDOW_REQUESTS=2`), and the primitives directly.

**The result was not the expected one, and the honest version matters.** The
enforcement was CHECK → `await` → RECORD, which reads as a textbook TOCTOU. Over
HTTP it is not: 10 and then 30 simultaneous `POST /api/decks` admitted exactly 2
against a budget of 2, on the *pre-fix* code. Everything between the check and
the record is synchronous (`node:sqlite` is), so the pair spans one microtask and
each request's handler completes it before the next request's I/O event is
dispatched. The cap was safe **by accident, not by construction**.

The accident ends when two callers reach the check in the same tick: ten
same-tick callers against a budget of two were all admitted and all billed. Any
batch, retry loop or in-process fan-out is that shape, and so is the code the
first time somebody puts an `await` between the two calls — a harmless-looking
edit that silently removes the only thing holding the cap.

`reserveAuto` decides and spends in one synchronous step, inside an IMMEDIATE
transaction for the case JS cannot cover (two processes, one database file). The
four routes call it once instead of `enforceAuto` + `recordAutoFor`. A refusal
writes nothing. Re-driven after the change: 2 of 10 and 2 of 30, unchanged.

> **Learned.** The interesting finding was that the bug did not reproduce.
> Single-threaded JS made a check-then-act pair atomic *with respect to HTTP
> requests* because nothing between them yielded to the event loop — which is
> true, load-bearing, undocumented, and one `await` away from being false. A
> hazard that is currently harmless is still worth removing when the thing
> guarding it is that a future edit will not do the obvious. Also: "it does not
> reproduce" is a result to report, not a reason to quietly claim the fix.

### [x] `needsFinalize` was true for every finished deck

*No model. Found while verifying the credits panel, which it was hiding.*

`generationStatus` derived `total` from plan.yaml when no `.run.json` exists and
`written` from deck.yaml, so `written >= total` — `complete` — for every deck
that had ever finished. `app/server/index.js` read that as
`needsFinalize: complete && !active`, which is a description of a normal deck.

**Not cosmetic.** `DeckDetail` auto-runs finalize on the flag (a deliberate
watchdog: "reaching this state is always an accident"), so opening a finished
deck re-ran grounding, the coherence model call, image supply, the render and
the preview — and its banner returned before every panel below it, which is why
the credits block looked broken.

`meta.status` already carried the answer: `writeDeckContent` sets `"writing"`
and `finalizeDeck` flips it to `"ready"`, so a deck stranded between the two is
exactly the watchdog's case. `generationStatus` now reports `finalized` and
`unfinalised`; the server gates on `unfinalised`. Absent meta stays unfinalised
(the old behaviour) — an unneeded finalize costs a run, a withheld one leaves a
deck nobody can use. `test/generation-status.test.js` was run against the
pre-fix code first and failed on exactly the two finished-deck cases.

> **Learned.** A derived boolean that is true of every healthy object cannot
> detect a broken one. `complete` was arithmetic about slide counts and was
> being asked a question about intent. The check worth running on any fault flag
> is what it reads on something that is completely fine — six of the seven decks
> on the box answered that immediately.

### [x] Image credits, surfaced — the file exists and nothing points at it

Auto supply wrote `decks/<slug>/CREDITS.md` and `assets/auto/credits.json` and
**no surface mentioned either**, so a CC BY image's attribution reached nobody.
Four seats now, not the three the entry named — the fourth was found by asking
where a credit actually has to survive.

`src/credits.js` is the shared record: `readCredits`, `writeCredits`,
`creditText`/`creditMarkdown`, `sourceLabel`, `isCitable`, `creditsSlide`. It
sits in `src/` rather than beside the supply because `src/ai/report.js` already
imports `src/report.js`, and a renderer reaching back into the model layer would
close that loop.

- **The deck page** (`DeckDetail`) — the short form beside `problems[]`, read
  from disk on the deck payload rather than only off a finalize result, because
  a reloaded page never saw that result.
- **The research view** (`ResearchView`) — the full table beside the sources
  table, which is the same question: provenance. Every credit, with the ones the
  report omits marked "not cited in the report", so an absence is explained.
- **The report** (`src/report.js`) — an `Image Credits` appendix, **citable
  sources only**. It rides `present` rather than joining `REPORT_SECTIONS`:
  that list is the structure the planner writes prose into, and asking a model
  to author the provenance of files it never saw is how invented citations get
  in. Riding `present` is enough for the TOC row and the two-pass page locator.
- **The deck itself** — an `attribution` slide, built only from images that owe
  attribution, appended after presenter assignment (back matter takes no
  presenter) and outside `maxSlides` (a required credit is not content competing
  for a slot). This is the seat the entry listed third and the only one that
  survives the `.pptx` leaving the app.

`isCitable` splits provenance a report can name from a stock photograph.
Openverse aggregates 52 providers and 42 are museums, national libraries,
archives, government agencies and scientific registers; the consumer upload
platforms are the short, stable half, so they are the list.

Verified end to end, not asserted: a real `.docx` rendered through the donor and
read back with `pdftotext` (TOC row numbered and paginated, both citable credits
present, the Flickr one correctly absent); both web surfaces driven in a real
browser in light and dark; the credits slide rendered and rasterised.

> **Learned.** Three things.
>
> **A denylist was right where an allowlist looked safer.** Naming the 42
> institutions would have read as the careful choice and would silently drop a
> legitimate museum the day Openverse adds one. A missing credit is worse than a
> generous one, so the list is the ten consumer platforms and it fails open. The
> cost is named rather than hidden: `flickr` carries real government photostreams
> and the provider name cannot tell them from everything else, so those are
> excluded from the report and still shown in the app.
>
> **The schema cap decided who got credited.** `attribution.name` caps at 30 and
> "National Renewable Energy Laboratory" is 35, so the first render credited
> "National Renewable Energy Lab…" — which is not an attribution. `contribution`
> had 60 characters and 25 of them spare. A long creator now takes the roomier
> field and the source takes the label. **Only the render showed this**; the
> slide validated, the tests passed, and the object looked right.
>
> **A finished deck reports `needsFinalize`.** `generationStatus` derives `total`
> from plan.yaml when no `.run.json` exists, so `written >= total` for every
> completed deck and `DeckDetail` renders "Finishing this deck…" and returns
> before any panel below it. It cost an hour of thinking the credits panel was
> broken. Pre-existing and out of scope here; `meta.status === "ready"` is the
> signal that already exists and is not consulted.

### [x] Research — truly better, not just deeper caps

`src/ai/research.js:271` was `deepResearch` 5-8 angle queries + follow-ups + gap pass, `arXiv/Crossref` opt-in, Jina second path, bounded `excerptResearch` per transport. Audience/emphasis/thesis/evidence lived in `briefingAnsweredText` but never steered queries — `expandQueries` saw only `brief`.

Now **directed**: `src/ai/research.js:123` `expandQueries(brief, {briefing})` receives verbatim `thesis/audience/emphasis/evidence` and is told `Include the evidence figures (numbers, scheme names from the briefing) in at least one data-angle query` with `3-8 words, never a single generic word and never the whole topic verbatim`; `src/ai/pipeline.js:72` `runResearch(brief, sources, onProgress, {papers, briefing})` threads it from `createDeck:237` `briefing`. `deepResearch:271` keeps the generic evidence-coverage post-pass: `evidenceFacts` (phrases with `\d`) vs `missingFacts` against `notesSoFar`, then `evidence ↳ <fact> <topic>` re-queries (max 3). No topic-specific hardcoding — the briefing is the source of truth, the code is generic (`src/ai/ollama.js:558` already fixed `TCET 400 System message` by merging the `Respond in JSON` note). SearXNG `http://localhost:8888` `src/search.js:1` remains the retrieval layer; topic-generic queries like `MNRE solar microgrid` still depend on engine config, but evidence steering guarantees the data-angle query carries the figures the plan needs.

> **Learned.** Hardcoding a topic filter (`microgrid|mnre|kusum|rural|diesel` in `absorb`) fixes one deck and breaks the next — the three-layer rule applies to research too: the code must not know the topic, the briefing does. `expandQueries` falling back to `[brief]` when the model is absent (`catch { return [brief] }`) was the real thin-deck cause on this machine (`qwen3-coder:30b` not installed, `installed:qwen3.8:27b` → fallback missed, `brief` verbatim `Solar Microgrids for Rural Electrification in India` → `SOLAR` university) — the prompt fix is the generic defence, not a per-topic allow-list. Keeping `deepResearch` pure dedupe (`absorb` just dedupes) and pushing evidence-awareness to query generation + post-pass keeps the pipeline honest.

### [x] PPT themes — cull and sharpen, not just selector polish

38 themes, selector `h-[220px]` + search + visual picker done, but themes themselves were uneven: 5/38 `bg-accent <3` (neubrutalism 1.36 yellow on cream), 3 `section bg` mid-tone `0.45±0.10` chrome risk (`paper-pastel` 0.493, `blueprint` 0.468, `art-deco` gold 0.384), 17 `accent-on_accent <4.5` (art-deco 2.42, claymorphism 2.95, soft-glass 2.78 …), 2 illegal `shadow.opacity` (`notion-clean` 3 →0.08, `retro-terminal` 16 →0.16), 1 missing `shadow` (`neumorphism`), and warm-paper (`editorial-magazine ↔ serif-light` 9.5) + dark-product (`isometric-dark ↔ linear-dark` 30.2) near-duplicates.

Now audited all 38 via luminance + `WCAG contrast` + `tools/themesheet.mjs` scoring: fixed 16 `on_accent` to best of white/black/ink (`bauhaus` #FFFFFF→#0A0A0A etc., `material-you` 3.90→5.08 …), fixed `accent_alt` duplicates (`art-deco` #201D18→#6E5A12, `risograph` #1F2A44→#3A4764), fixed `shadow.opacity`, added missing `neumorphism` shadow, darkened `aurora-mesh` `accent #7B5CF5→#6B3CE8` (white 4.48→5.8), `paper-pastel` `accent #9CC4A7→#6E9A84` (section `0.493`→`0.27`, `bg-accent` 1.76→3.5), differentiated `editorial-serif-light` `#B3471F→#8A3B2E`, `isometric-dark` `#3D9BFF→#2E7FFF` vs `linear-dark` `#5E6AD2→#7C5CFF`. All 38 now pass `accent-on_accent ≥4.5` or note intentional (neubrutalism yellow stays 1.36 for shape fill, not text), section `bg` out of `0.45±0.10` (except intentional plate themes), and no `opacity>1`.

> **Learned.** A theme's `on_accent` is not `white` by default — mid-tone `accent` (≈0.3-0.6 lum, terracotta, mint, violet) needs dark ink for contrast; picking `best of white/black/ink` beats hardcoding. `bg-accent <2` for yellow on cream is a false alarm if accent is only for shape fill, not text — the gate is `accent-on_accent`, not `bg-accent`. The warm-paper and dark-product clusters are visually identical at thumbnail size (9.5 avg RGB distance) but the fix is a hue shift in `accent`/`section bg`, not a new palette — small surgical hex changesbeat a rewrite. `shadow.opacity` 0-1 in `pptxgenjs` (100 is off-chart) is a silent bug that only shows as missing shadow at preview.

### [x] PPTs themselves — better by default

Density sweep, trim-to-fit, coherence, speaker script and image sanitizer were already in `src/ai/pipeline.js:520` `finalizeDeck`. What was missing was a **deterministic quality gate** for `8 bullets in a row` or `data without a chart`. Now `src/ai/quality.js:1` `analyzeQuality(deck, research)` flags both generically (no topic hardcoding): 5+ consecutive same type or same family, one type/family owning >60% of content (`bullets` on a 12-slide deck), and research carrying `>=5` numeric facts (`src/ai/catalog.js:373` `numericFactCount`) but deck using zero `chart`/`stats`/`big-number`/`kpi-dashboard` etc. `analyzeQuality` ignores dividers (`title/section/chapter/closing/epigraph`), so a deck of `title + 3×section + closing` correctly shows 0 content and is not flagged as monotonous. `src/ai/pipeline.js:622` `finalizeDeck` runs it after `coherencePass` and merges `qualityProblems` into `problems[]` (visible in `DeckDetail` problems list, no model rewrite — flag is the feature). Guarded by `test/quality.test.js:1` (5 streaks, family streak, dominance, data-blind).

> **Learned.** A deterministic flag beats a model rewrite for monotony: a reviewer model can itself be monotone, and a second model call to fix `bullets` often re-emits `bullets`. Counting types/families against the deck's own `familyFor` is the honest check, and the planner already owns the prompt `Vary the types across families. A deck of nothing but bullets is a failure` (`src/ai/generate.js:168`) — the gate is the backstop when it is ignored. Data-blind is the same pattern as `F18` empty-chart guard: make the mistake unrepresentable via `numericFactCount` vs `DATA_TYPES`, not via prompting.

### [x] Briefing — fewer, sharper questions that actually steer the deck

`app/web/src/lib/briefing.js:8` was a 13-question walk (preset, title, team, guide, academic, audience, emphasis, theme, maxSlides, slidesPerMember, density, branding, research). Audience/emphasis were tightened but still one blob; `maxSlides`/`slidesPerMember`/`density`/`branding` are low-signal for most users yet occupy 4 turns; no thesis or evidence.

Now a **thesis-driven 9/10-question walk**: Deck `preset→title→thesis→audience→emphasis→evidence→theme→density→research` (Report `preset→title→thesis→audience→emphasis→evidence→depth→density→branding→research`). `team`/`guide`/`academic` removed from the walk — they live in `Settings` identity + `PRESET_KEYS` (`app/web/src/lib/briefing.js:56` → `["team","density","theme","branding"]` with legacy collapse), `maxSlides`+`slidesPerMember` collapsed into `density` (auto `targetSections` + `teamSize`). `briefingAnsweredText:132` now emits `- Thesis:` and `- Evidence / constraints:` verbatim to `planDeck` (`src/ai/generate.js:192`), `ChatView.jsx:321` augments `brief` with thesis/evidence notes, and `src/ai/research.js:146` `expandQueries` prompt is told `Thesis/Audience/Emphasis/Evidence may be in TOPIC — use to steer angles`. `src/ai/generate.js:143` planner rules name thesis as the deck's central claim and evidence as never-invent. `app/web/src/lib/chats.js:60` migrates `thesis`/`evidence`, `app/web/src/views/ChatView.jsx:1484` renders `FreeTextCard` for both, report path mirrors deck.

> **Learned.** Three things were not obvious beforehand.
>
> The briefing is the cheapest place to buy quality: one `thesis` sentence replaces a paragraph the planner otherwise has to infer, and one `evidence` line (`MNRE 42,000 crore … 4.2 Rs/LCOE, storage 60% capex`) gives grounding a closed set to check and research a target to hit. A generic `audience`/`emphasis` blob that mixes takeaway, background and importance forces the model to parse; three short answers (`who + what they know`, `which ideas own slides + why`, `what must NOT be invented`) stay verbatim without summarising.
>
> `PRESET_KEYS` is a skip list, not a storage list. Removing `team`/`guide`/`academic` from the questions does not remove them from the preset payload — a preset still stores `team` for `Settings` and `density/theme/branding` for the walk. Keeping `maxSlides`/`slidesPerMember` in `presetPayload` preserves old presets while the walk no longer asks them; the `effectiveBriefStep` skip then only needs `["team","density","theme","branding"]`.
>
> Studying the TCET smoke test (`qwen3.6` auth now `ok`, `src/ai/ollama.js:558` `cloudMessages` had to merge the `Respond in JSON` system note into the existing system message or `TCET 400: System message must be at the beginning` on every `format` call) showed the real gap is research, not briefing: a brief starting with `Adoption of Solar…` returned `adoption.com` pages and a `SOLAR university` page set, and a plan with `thesis:"Solar microgrids can cut diesel costs by 40% …"` + no research still minted only `title+3×section+closing` (5 slides) before the trim/mint — the thin-outline bug is a research-coverage problem, which is why `Research — truly better` is the immediate next session.

These were **not** the next super-fancy tour; the tour stays separate. Briefing + Research + PPTs themselves + PPT themes are now done, and `Image supply — auto` has since run too. No rendering in this session per user — verification is user-side.

353 tests.

---

## 10. Product-quality round — hosting, then the things that still do not feel good

Opened when the project was audited for public hosting. The hosting half is
done; the quality half is the standing list, written down so nothing named in
conversation is lost. Order is not priority — the priority note is on each item.

**Testing constraint, applies to the whole section.** Generation must run
against the shared gateway only, with the key supplied through the env file.
The local Ollama install and its GPU are committed to other work and must not
be touched. Every item below marked *needs a model* is therefore blocked until
the key is present, and the visual items are deliberately separated out because
they need only the renderer.

### [x] Hosting readiness — tenancy, credentials, and an image that renders correctly

See the commits from `paths:` through `docs:`. Per-account identity, brand and
BYOK keys; admin as a role rather than an address; media routes authenticated
by session cookie; the shared gateway key and the routing default gated;
container fonts and brand-path resolution fixed; CI added; `docs/DEPLOY.md`.

> **Learned.** Two of the worst faults were invisible rather than loud. BYOK
> keys were stored encrypted and never read, so every "bring your own key"
> generation silently billed the operator. The container shipped without the
> theme typefaces, which the `.pptx` hides completely — OOXML stores font names,
> so the downloaded file is correct on a machine that has them, and only the
> server's own renders were wrong. Both had been in place for a while.

### [x] Chart series must carry data, not decoration

`src/chartpalette.js`. Series colours came from `ink_muted` and `rule`, which
are secondary text and a hairline. On `high-contrast-mono` a four-series chart
drew three identical blacks and one white one that vanished.

### [x] Theme cards must show the theme

`tools/gallery.mjs`, `ThemeMiniCard`, `Themes.jsx`. Every card was one
rectangle of the title colour, so choosing a theme was guessing from a name.

### [x] The glow family — eight themes rebuilt

Named directly: the glow-and-blur family read as one idea repeated.

`glassmorphism` and `soft-glass-light` were frosting a blur, which leaves
nothing to frost — both now put hard-edged shapes behind the glass, circles on
a cool ground and warm bars at right angles respectively, so they are not one
design in two palettes. `aurora-mesh` and `gradient-mesh-dark` use a single
masked curtain whose colour travels along its length. `sunset` is a layered
sky with the bright end at the horizon. `claymorphism` swapped glow for
extrusion. `neumorphism` had radial glows on its heroes, which is the opposite
of soft UI, and now lights across the surface rather than out of it.
`isometric-dark` gained a third grid axis, a painted ground, and legible ink.

> **Learned.** Three things, all found by rendering rather than by test.
>
> Stacked radial gradients read as circles however carefully the falloff is
> eased, because a circle is what they are — a row of soft circles is what
> every CSS mesh generator produces. A continuous shade change needs *one*
> element with one gradient across it, shaped by a mask rather than by fading
> the colour out: fading dissolves the hue into the ground before it reaches
> the edge, and the travel is the point.
>
> A theme's summary is not documentation, it is a promise that can go stale.
> `gradient-mesh-dark` described plum-through-teal-to-amber with neither plum
> nor amber in its palette; `sunset` promised a violet it did not have.
>
> Contrast has to be measured on the rendered pixels, not judged. `sunset`
> looked good and put its title at 2.2:1 and its subtitle at 1.2:1;
> `isometric-dark` shipped a title slide that rasterised pure white under
> near-white ink at 1.2:1, because its plate drew lines onto transparency and
> never painted a ground. Neither was visible as a defect until measured.

### [x] Institutional chrome — the crest on a coloured surface

Resolved by the owner of the mark: the crest is the real full-colour crest on
every surface, never a black or white knockout. Checked against the darkest
themes before removing the substitution — the shield carries unaided. The
knockout variants are still generated for an identity that asks for one.

> **Learned.** The renderer had three separate faults stacked under one
> complaint: a luminance threshold picking the worse mark, a `luminance()` that
> omitted the sRGB gamma step so its contrast figures were wrong, and a plate
> sampler that collapsed the ground to pure black or white and threw the hue
> away. Measuring correctly still produced the wrong *product* answer, because
> which trade to make was never the renderer's call.

### [x] Theme variation — one composition, thirty-eight times

*Priority: high. Renderer only, no model.*

Named directly: the glow-and-blur family reads as one idea repeated —
`glassmorphism`, `aurora-mesh`, `gradient-mesh-dark`, and the others that lean
on a soft luminous plate. `claymorphism` is disliked outright. Underneath that
is the broader complaint: 38 themes do not feel like 38 designs.

*Priority: high. Renderer only, no model. The largest remaining theme item.*

With the glow family rebuilt, this is what is left of "38 themes do not feel
like 38 designs", and it is the harder half. The contact sheet from
`npm run gallery` shows why: most themes differ only in palette and typeface,
because the body layout is identical in all of them — the same headline,
standfirst and bullet column. The eight plate themes now differ in what their
background *is*; the thirty native ones are still one layout in thirty
colourways.

Real variation lives in what a theme is currently barely allowed to touch:
where the content box sits, whether a rule or a block opens the slide, how a
section divider is composed, whether type is set flush or centred.
`tokens.editorial` and `tokens.bauhaus` already prove per-theme layout flags
work; there is no reason for there to be only two of them.

So this is not a palette pass. It is: decide which themes are genuinely
distinct designs and which are duplicates to cull, then give the survivors
layout-level differences rather than colour-level ones.

Four were culled as duplicates of a survivor rather than designs of their own:
`flat-2` (Inter on white with one blue accent — `notion-clean`), `minimal-warm`
(cream paper, serif display, terracotta — `warm-humanist`), `dark-neon`
(near-black and cyan in Space Grotesk — `sci-fi-hud`, which carries the HUD
linework) and `retro-terminal` (green phosphor on black — `retro-crt`, which
carries the scanlines and glow). The near-pairs that remain — brutalist paper
against neubrutalism, the two corporate blues, newsprint against editorial
serif — keep their places and are separated by composition and typeface, which
is the point of the item.

`src/composition.js` and `tokens.layout` are the result: six axes (title
composition, divider composition, heading alignment / opening mark / rule,
content frame, list marker and columns, drop cap), each an enum whose first
value is the behaviour that preceded it. Applied in the opening mark, the
heading block and the content frame — the three things 67 of the 74 layouts
share — so one flag restyles all 75 types. Thirty-four themes now carry
thirty-four distinct compositions; `notion-clean` declares nothing, because a
vocabulary needs a plain member.

`tools/themematrix.mjs` and `test/themematrix.test.js` came out of it and
outlast it: the whole 34 × 75 product renders in about three seconds with
`write: false`, and the test holds the fit-failure set where it is, failing in
both directions so the debt list cannot grow or rot.

> **Learned.** The refactor's safety property was worth proving rather than
> asserting: rendering six themes before and after and diffing the slide XML
> showed byte-identical output, which caught the one real difference —
> pptxgenjs writes an explicit `algn="l"` when alignment is passed, so the
> default path must omit it rather than pass "left".
>
> Three defects surfaced that had nothing to do with composition and had been
> shipping for a long time. Every chart slide in every plate theme rasterised
> on white, because pptxgenjs numbers a background image's relationship
> without counting chart relationships and a background assigned after
> `addChart` is written as a second `rId1`. A numbered list rendered "1. 1. 1."
> for the same class of reason — `startAt="1"` on every paragraph. And a word
> wider than its column hyphenates itself at the raster while every fragment
> fits the box, so the fitter never sees it. All three are in `docs/TRAPS.md`.
>
> A narrowing frame is not uniformly affordable. `sidebar` works for text-led
> types and destroys any type whose body is a row of four or more peers, and
> the failure is invisible to the fitter — the words break in the middle
> instead of overflowing. The fix is a per-type opt-out, not a per-theme one:
> the theme's opening mark and heading treatment still apply, so the deck
> stays one design.
>
> Two layouts budgeted a card title at one flat line and shrank anything
> longer to the readable floor. That was survivable at full width and fatal at
> nine tenths of it — narrowing the measure took `before-after` from three
> failing themes to eleven. `linesBox` already existed for exactly this.
>
> Contrast has to be measured on the tokens as well as the pixels.
> `chalkboard` set its section number at 1.33:1 and `claymorphism` its divider
> headline at 2.95:1; both had been there since the themes were written, and
> neither is visible as a defect until a number is put on it.
> `test/contrast.test.js` now holds the floors and names the twenty-four
> surfaces that clear 3:1 but not 4.5:1 as debt for the audit below.
>
> Look-ahead: the matrix sweep and the contrast test are the deterministic
> half of "Every theme against every slide type" further down this section,
> built here because the composition work needed the gate anyway. That item is
> now the visual half plus the named debt, not a from-scratch job.

### [x] `flow`'s vertical spine is one line from failing

*Priority: medium. Renderer only, no model.*

Found while widening plate-theme margins: the six-step `ttb` flow fits its step
bodies so tightly that roughly 0.02in of content width decides whether they
clear the readable floor. The layout drops a body rather than shrinking it
below the floor, which is the right call — but a budget that fine means any
future content or margin change silently costs a slide its text.

`npm run themematrix` now names the themes exactly: `chalkboard`,
`editorial-serif-light`, `high-contrast-mono` and `minimal-muji`, recorded in
`test/themematrix.test.js`'s debt list, which is where the fix should be
verified. `before-after` and `team-grid` had the same defect and were fixed by
sizing the box to the real line count (`linesBox`); the flow spine is the same
shape of problem and probably the same shape of fix.

Fixed, along with `branching-flow`, which emptied the debt list: **all 34
themes now seat all 75 slide types at a readable size.**

> **Learned.** The first attempt made it worse, and only the text check said
> so. Tightening the constants stopped the bodies shrinking below the floor and
> started them *dropping* instead — a reported failure became fifteen words of
> silent loss. A layout that drops content to satisfy the fitter has not been
> fixed; it has been made quieter.
>
> The working fix stops using constants at all. One title line and one body
> line are measured at the size each would really render at — the fitter never
> shrinks past its floor and never grows a theme already below it — the slack
> is spent on the gutter, and the title takes its nominal line when the row can
> spare it. One step of headroom above the floor line, because `fitScale`
> searches in 4% steps and a box exactly one floor-line tall makes the search
> land just under it.
>
> `branching-flow` was two wrong numbers rather than one. A rhombus's largest
> inscribed rectangle is HALF its bounding box, and the decision label was
> given a box wider than that — so it ran out through the slanted edges as well
> as shrinking below the floor. The shape now grows until its inscribed box
> holds the label.
>
> Every one of the twelve debt entries turned out to be a hardcoded constant
> deciding whether text survived, not a budget anyone had chosen. None was
> visible as a number until the sweep printed it.

### [x] Every theme against every slide type

*Priority: high. Renderer only, no model — `src/specimens.js` supplies content.*

34 themes × 73 types has never been looked at as a whole. The deterministic
half now exists and runs in about three seconds:

- `npm run themematrix` renders every theme against every type with
  `write: false` and reports every fit-floor failure; `test/themematrix.test.js`
  holds the set, which is now **empty**. With `--notes` it holds two, both
  `feature-grid` on `minimal-muji`, the tightest theme in the gallery.
- `test/contrast.test.js` holds the title and divider surface pairings and
  names those that clear 3:1 but not 4.5:1 — nineteen now, and
  `tools/contrast-debt.mjs` says which of those are reachable at all.
- **[x] The caps now match what the layouts can seat.** `capstress` reported
  114 fit failures across the covering themes — fields asking for 6-13pt where
  the floor is 12-14. `tools/capfit-apply.mjs` moved 27 type-specific caps to
  their measured values and narrowed 6 shared `headline` declarations per type,
  and the failures fell to 12. A second `capfit` pass over the corrected schema
  reports **zero** fields whose cap the layouts cannot seat, so the measurement
  has converged.
- **The 12 that remain are a different question, and worth not confusing with
  the first.** `capfit` measures one field at a time with the others at their
  own measured scale; `capstress` puts *every* field at its cap at once. The
  residual — `side-by-side` and `bibliography` on four themes each, plus
  `framework`, `tip`, `funnel` and `before-after` — is that joint condition.
  Chasing it to zero would cut fields that are fine in isolation to pay for a
  slide where every field is simultaneously maximal, which is not the slide a
  model writes. Left deliberately.
- `npm run textcheck` rasterises and reads the text back; clean on the specimen
  and on the real generated deck.
- `tools/contrast-audit.mjs --types a,b` sheets any type across every theme,
  and `tools/slideqa.mjs` emits per-slide PNGs plus chunked contact sheets.
- `npm run capstress` renders types at their SCHEMA CAPS and rasterises them,
  which is the payload a model actually writes; `--scale 0.01` renders them at
  one character, which separates a layout that cannot hold anything from a cap
  that is merely generous.
- `npm run drawcheck` marks every field the schema declares and reads back what
  the layout emitted, because text that is never drawn is never fitted and so
  no sweep above can see it. Its second list — the fields the specimen does not
  populate — is the half nothing else can report.
- `src/geometry.js` runs inside every render, so `themematrix` also answers "is
  this box on the slide": non-positive extents for any shape, the canvas edges
  for text and images. It found 105 problems the first time it ran.

**The contrast list is mostly not payable, and that is now measured.**
`tools/contrast-debt.mjs` splits the twenty-four three ways under one
constraint — `muted` is a dimmed `ink`, so it may move toward ink but may not
cross the ground and come out dark on a saturated divider beneath white
headline type. Twelve cannot be fixed by any token edit: their ink is already
pure white and pure white does not clear 4.5:1 against those grounds. Seven are
reachable only by making muted the same colour as ink. Five were genuinely
payable and are paid. **The nineteen that remain are a question about nineteen
divider backgrounds — the theme's identity — and want a decision, not a nudge.**

**The visual half, first pass at the corrected caps (2026-09-03).** Contact
sheets of the 26 diagram and dense-data types across `minimal-muji` and
`gradient-mesh-dark`, then full-size on anything suspicious.

- **`venn` printed its three item stacks through each other** and every check
  was clean on it — see the TRAPS entry. Fixed: the layout had a horizontal
  room constraint and no vertical one, on the axis a three-circle Venn overlaps
  by construction.
- **`scorecard` and `matrix` looked broken in a cell and were not**, at least
  not in the way the cell suggested — `scorecard` reads perfectly at full size.
  That is the contact-sheet lesson below, paid again.
- **[x] `matrix`'s rotated axis labels** — the `tracking` unit bug, done in its
  own round with a baseline as this entry asked. `measure()` read the token's
  tracking as a percentage of the em where the renderer applies it as points,
  and `ADVANCE` is a lowercase average while `eyebrow` transforms to caps — a
  tracked all-caps label measured 52% short. Correcting it surfaced two caps
  `capfit` had been hiding and moved `capstress`'s joint count from 12 to 17,
  both predicted here.
  The label sizing needed its own fix on top: the box was `measure * 1.1` and a
  box's insets are a constant ~0.1in, so a single unbreakable word still
  wrapped. `matrix` is out of the landing showcase's HELD_BACK list, which is
  now empty.
- Everything else on those sheets — `funnel`, `dependencies`, `branching-flow`,
  `layered-architecture`, `roadmap`, `chronology`, `pyramid`, `hierarchy`,
  `data-table`, `decision-matrix`, `chart`, `kpi-dashboard`, `data-cards`,
  `metric-comparison`, `glossary`, `bibliography` — reads correctly at caps.

**All eight covering themes swept (2026-09-03).** Contact sheets of the 26
diagram and dense-data types per theme, full-size on anything suspicious. Both
`venn` and `matrix` were fixed in this pass and re-checked across the set;
everything else reads correctly at the caps. `matrix` is out of the landing
showcase's HELD_BACK list, which is empty again.

This box is ticked. What a later pass would add is the other 26 themes, and the
entry's own answer to that stands: they are the same code in different colours,
which is what `COVERING_THEMES` is for. **Render each type at its schema caps before looking**:
every defect the fixed-scale pass found that the sweeps were clean on came out
of doing that, and none of them was visible with the specimen's own payloads. Expect the algorithmic diagram types and the
dense data types to be where the failures are; the composition pass already
found that a narrowed measure breaks words inside cards, kpi tiles and team
grids without the fitter noticing.

A third instrument now exists — `npm run textcheck` — which rasterises to PDF,
reads the text back and reports every declared word that did not survive.
`--deck` on all of them runs against a real generated deck rather than the
specimen, which is where the interesting failures are: the specimen's payloads
are hand-written to behave, and a model writes a 130-character card body where
the specimen has 40. The specimen sweep is clean and the real deck reports 45,
almost all of it a deck written before the caps were corrected.

Six defects came out of that first real-content pass, all of them shipping
before it and none visible to any test: `funnel` dropped every stage body,
`framework` drew element bodies unfitted so they ran out of their cards, the
`title` and `closing` surfaces discarded their own headline and standfirst,
the closing CTA pill overflowed its fixed shape, and the field-length pass
budgeted the deck against the one theme it named.

The visual pass then found three more, all of them figures rather than prose:
`kpi-dashboard` and `data-cards` wrapped their values mid-number ("48.2 / K",
"2.3 / %") in about a third of the gallery, `data-cards` landed the wrapped
line on the label beneath it, and `split-screen` fused its two halves into one
block on every square-cornered theme. The first two shared a root cause in
`measure()`, which estimated every character at the lowercase average: lining
figures sit near 0.58 em and a percent sign near a full em, and Archivo Black
declares weight 400 because black is the only weight it ships, so the widest
display face in the gallery was measured at the narrowest display advance.

> **Learned.** A contact sheet at four cells per row is reliable for structure
> — overlap, clipping, fused panels, a wrapped value — and not for contrast.
> Two types were called illegible from a cell and read perfectly at full size.
> Contrast has a numeric test; use it, and keep the sheets for what only eyes
> can see.
>
> The deterministic checks and the visual pass find disjoint sets. The fit
> sweep never saw the wrapped figures, because each fragment fits its box; the
> text check never saw them either, because a five-character value is below
> its word-length floor. Neither is redundant with looking.
>
> The specimen carries no speaker notes, so the 0.7in that a note reserves off
> every content slide had never been exercised — by any check, on any theme.
> Turning it on found 29 failures across four slide types at once, including
> one (`feature-grid` fitting text to a box a quarter-inch taller than the one
> it drew into) that was wrong with or without a note. `npm run themematrix --
> --notes` is now the second half of the sweep, with its own debt list.
>
> The lesson generalises past notes: a fixture that never exercises an optional
> field cannot audit it. `src/specimens.js` omits several, and every sweep
> inherits the blind spot.

### [x] The schema's caps are not the layouts' budgets

*Priority: high. Renderer and schema, no model.*

`cards[].body` accepts 320 characters and the type accepts four of them. No
theme can seat that: four cards at 2.8in of measure need about thirteen lines
each, and the card is three inches tall. The model writes to the cap it is
given, so the cap is the instruction — a generous one guarantees a rewrite
pass every time, and a deck that is only saved by the rewrite is a deck that
breaks whenever the rewrite fails.

The caps should come from the layouts: for each type and field, the largest
text the tightest theme seats at the readable floor. `tools/capfit.mjs` now
measures exactly that — it grows a type's own specimen payload until some theme
can no longer seat it and bisects, per field, with the others held at the scale
the type clears. **37 fields** carry a cap the layouts cannot seat.

The answer is not one thing, which is why the tool reports rather than edits:

- Caps that are simply generous. `cards[].body` accepts 320 and seats 161; four
  cards of 320 characters is not a slide anyone wants. Cut these.
- Caps no layout can seat at any readable size. A `data-cards` value of 16
  characters needs 13pt in a four-up card — that field is for "99.9%", not
  "1,234,567.89 kWh". Cut these too, harder.
- Diagram labels — `cycle`, `diagram`, `concept-map` — whose shapes are a fixed
  size. These are the `branching-flow` diamond again: size the shape to its
  label rather than cutting what the label may say.

Done. Thirty-four caps were cut to the measured value; the `cycle` and
`concept-map` hubs now grow to their labels; and `loadDeck` was split so a cap
can be corrected at all — see the Learned block.

> **Learned.** Tightening a cap made every deck already on disk refuse to open,
> because `loadDeck` enforced length as hard as structure. They are not the same
> kind of constraint: a slide missing its required field cannot be drawn, while
> a body eighty characters over renders and the fitter says so. Reading a deck
> now refuses on structure and warns on length; `validateDeck` still reports
> both, so the model is held to the cap at the moment it writes, which is where
> a cap belongs.
>
> Some of it was not a cap problem. `cycle` and `concept-map` measured at 34–47%
> not because their caps were generous but because their hub circles were a
> fixed 1.5in with a text box as wide as the whole circle. Check whether the
> shape is the constraint before cutting what the content may say.
>
> The prober needed three corrections before its numbers meant anything: a cap
> on an array field caps its ITEMS (replacing the array with a string threw at
> every scale, which bisection read as "nothing fits"); identifiers and asset
> paths carry a maxLength but are not prose (growing a node's id breaks the
> edges that name it); and growing every field together answers a question about
> the type, not about a field. It reported 70 fields before those fixes and 35
> after — a measurement is not evidence until its own failure modes are known.
>
> It still cannot measure a field the specimen omits. `compare.left.points` is
> never grown, so its cap is unverified.
>
> **Corrected later.** That was not the main cause, and the compare overflow was
> not either. `resolvePath` could not follow a `$ref` or descend a nested array,
> so `compare.left.body` — behind `#/definitions/side` — had never been measured
> at all and was promising 320 characters that no theme in the gallery can seat.
> Sixteen fields the specimen does exercise were invisible for the same reason,
> and the `compare.verdict` row that read "fits 1 of 260" was the bisection
> reading its own noise. The caps below are what the layouts seat now that the
> walk reaches them.

### [x] Text drawn at a fixed scale is unreported, not just unfitted

*Priority: medium. Renderer only, no model.*

`src/fit.js` reports a floor hit from inside the fit functions. Nineteen sites
in `src/layouts.js` passed a hardcoded `scale:` and never called one, so their
text could overflow its box with a clean fit sweep — which is exactly how
`framework` shipped element bodies running out of their cards and under the
ellipse.

Eighteen now fit. The nineteenth is the checklist tick: a fixed glyph in a fixed
box with no content in it, and it says so in a comment so the next grep does not
reopen it.

> **Learned.** Fitting them at the token size would have been wrong in a way
> that looks right. The floor is a POINT size, so a chip drawn at 0.85 of a 13pt
> caption was being asked "does this fit at 13pt?" when the question is "does it
> fit at 11?" — and reported a failure for text that seats perfectly. The first
> construction produced four newly-broken caps and two of them were the
> instrument. `fitAt`/`fitAllAt`/`fitLineAt` fit at the size the layout has
> already decided on.
>
> Asking the question was the cheap half; the constants behind it were the rest.
> Every site that then failed was a number nobody had measured: a funnel value
> gutter fixed at 1.2in with a stat figure fixed at 0.45 and nothing measuring
> one against the other; a compare verdict bar taking a flat 1.24in off the two
> cards whatever it held; a framework card clamped to 1.15in while its row held
> 1.45; a roadmap title given 0.3in with a third of an inch sitting empty above
> it. Three layouts fitted to one height and drew into another.
>
> The sweep cannot see a shape's POSITION, only its text. `branching-flow` grew
> its diamond to hold its label, laid the branch rows out from wherever that
> finished, and drew the last row under the speaker-note bar and off the slide —
> with a clean sweep, because every label fitted its own shape. That was found
> by looking at a render, and nothing else would have found it.
>
> When a shape must grow, grow the dimension that is free. The diamond grew
> width and height in lockstep and spent the column the branch stack needed to
> buy margin it did not.

### [x] The caps the layouts cannot seat, and the fields nothing ever rendered

*Priority: low. Schema and renderer, no model.*

`node tools/capfit.mjs` measures the list. It held eleven fields; it holds one,
`cards.cards[].body` at 86%, which is the fixed-point drift the entry above
describes — cutting a cap moves the scale the other fields are measured at.

The rule that did the work: **ask whether the SHAPE is the constraint before
cutting what the content may say.** Three fields came off the list by fixing a
layout rather than cutting a cap — `chronology` was fitting against a box
narrower and shorter than the one it draws into (87 of 160 became all 160),
`bibliography` gave its citation a flat 55% of the row whether or not an
annotation existed (105 became 203), and `hero-image` left half its overlay
unused (105 became its full 120). Seven more were cut to their measured values.

> **Learned.** The larger finding was not about caps at all. The prober can only
> measure a field the specimen POPULATES, and twelve string fields were absent
> from every specimen slide — so twelve fields had never been rendered, in any
> theme, by any check. Populating nine of them (the other three are asset paths
> and a chart-internal unit) found **four layouts that silently drop content the
> schema offers**: `compare` never drew either side's points, `image-text` never
> drew its caption, `diagram` never drew an edge label, and `branching-flow`
> never drew a step body. 408 words a side, identically on all 34 themes.
>
> No sweep could have reported them. A field that is never drawn is never
> fitted, so the fit sweep sees nothing; only the text check, and only once the
> fixture carried the field, said a word. Enumerate what a fixture does not
> cover — do not read what it does.
>
> Three of the four are now drawn. The fourth is a decision the measurement
> forced: a `branching-flow` step body needs two-line cards, two-line cards take
> the column the decision diamond grows into, and the decision label drops from
> 39 characters to 19 — below the twenty its own specimen uses. The type is
> named for its decision, so `bs.body` stops being offered rather than being
> drawn or silently dropped.
>
> `diagram`'s 4% was never a cap. It fitted a body into the 0.17in a dense
> graph leaves, which no text fits, so it reported a floor hit at every label
> length from one character upward — and the prober read that as a savage cap.
> `capFit` now tests one character first and says "the layout, not the caps".

### [x] The visual audit, at schema caps

*Priority: medium. Renderer only, no model.*

`npm run capstress` renders any set of types at their schema caps and rasterises
them; `--scale 0.01` renders them at one character, which separates a layout
that cannot hold anything from a cap that is too generous.

**The gallery has now been swept once, on `warm-humanist`, every type at its
caps with a speaker note.** Thirteen defects came out of it, none of which any
sweep could report, and two instruments were built because of what the looking
kept turning up. See the **Learned** block below.

**Closed 2026-09-03.** What was left is done, and one of the claims below was
wrong in a way worth keeping:

- **The other capstress themes** — all eight of `COVERING_THEMES` are now swept
  at the corrected caps, contact sheets per theme with full-size on anything
  suspicious.
- **`venn` needed its caps cut AND its layout changed**, against the
  expectation recorded here. The caps did come down from 30/27 to the measured
  14, and it went on overprinting itself: the three item stacks were each
  centred on their own circle and a Venn's circles overlap by construction, so
  they met in the middle. `roomFor` had solved the horizontal case and nothing
  did the vertical one. **"The arrangement holds, the caps are what do not" was
  the wrong diagnosis, and only a render at the caps says so** — the caps had
  to be corrected first for the layout fault to be visible at all.
- **The cap residue is 0 fields**, from 26. Two passes of
  `tools/capfit-apply.mjs`, the second after the `tracking` unit fix surfaced
  two more the old measurement was hiding.
- **`cycle` and `concept-map` were deleted rather than repaired.** Both
  overlapped their own content at 35% of their caps — ordinary content, not a
  stress case — so neither was a cap problem. The vocabulary is 73 types. See
  the deletion commit for the reasoning and what each was replaced by.
- **The cap residue is 26 fields** (`node tools/capfit.mjs`), up from 1 — the
  prober now measures against a slide that carries a standfirst, which is the
  slide a model actually writes. None of it is new debt.
- `feature-grid` is still the two lines of speaker-note debt on `minimal-muji`.
  Its card is derived end to end and the shortfall is seven hundredths of an
  inch.
- The contrast list is still unpaid: `test/contrast.test.js` names 24 pairings
  that clear 3:1 but not 4.5:1.

> **Learned.** Four things, and the last two are the ones that generalise.
>
> **A type whose own writer guidance works around its layout is a type to
> delete.** `concept-map`'s budget read "one or two words — long leaves cannot
> fit a radial layout": an instruction written to keep content away from a
> layout that cannot hold it. `cycle` needed 3.06in of vertical run and a slide
> with a standfirst and a note leaves 2.75in. Both were deleted rather than
> redesigned, and the test for which is cheap — render at ~35% of caps, which
> is ordinary content rather than a stress case. If it still overlaps there,
> the arrangement is wrong and no cap will save it. If it is clean there, the
> caps are what to cut. `venn` passed that test and stayed.
>
> **The vocabulary is large on purpose and deleting from it is a normal edit.**
> 73 types is not a number to defend. What deletion costs is contained —
> schema enum and rule, the layout, the specimen, three catalog maps, the
> SlideEditor descriptor, the vocabulary-test fixtures — and `npm test`,
> `themematrix`, `drawcheck` and `textcheck` between them catch anything left
> dangling. Check no deck on disk uses the type first.
>
> **The fixture's omissions are the audit.** `standfirst` is declared once on
> the base slide object, so a walk of the type rule missed it on all 75 types —
> the length pass never budgeted it, `trimSlide` could never shorten it (its own
> skip-headline branch had been unreachable since it was written), and the cap
> prober never grew it. The specimen omits it on 71 of 75 types. Seeding it took
> the cap sweep from 9 problems to 287, of which 278 were one cause: a 220-char
> cap the header cannot keep. The header seats 152.
>
> **Six defects were boxes, not text.** A caption computed to a NEGATIVE height
> and pptxgenjs wrote it without a word; a rule drawn 0.12in above the content
> start struck through the standfirst; connectors were drawn from the wrong end
> for every branch left of its node, on all 34 themes. A fit sweep is clean on
> all of them because every fragment fits the box it was handed — the box is
> what is wrong. `src/geometry.js` now watches every draw and found 105 more.
>
> **A budget that is not the box is a bug in both directions, and it was
> everywhere.** `before-after` fitted a body against 1.8in and drew it into
> 0.94in; the standfirst was fitted against 0.85in, drawn into 0.75in and
> advanced 0.72in; `cycle` fitted a step body against 0.45in and drew it into
> 0.28in, which is why the hub was sized against the wrong number. Derive it
> once and use the same value for the fit, the box and the advance.

### [ ] The front end, and the landing page

*Priority: medium, down from HIGHEST. No model, and **not blocked** — the
direction below covers the app sweep as well as the landing page, and says so:
"Landing first, then a full app sweep."*

**Re-scoped.** This entry was the biggest thing on the list when it was
written, and almost all of it has since shipped: the design system, the landing
rebuild, the deck workspace (its own entry, ticked, and the largest piece of
the app half), project navigation, the report-first entry flow, the briefing
flow, the density sweep's first pass, and 390px verification across every
project page and `SlideEditor.jsx`.

Left at HIGHEST it kept reading as a large blocked project, and it is neither
large nor blocked. What remains is a polish pass with **no named defects behind
it** — which is the honest description and also the reason it needs a WALK
rather than a plan: the density sweep's first pass found what it found by
opening every route and looking, not by reasoning about what might be wrong.

The refusal-as-offer is the one piece that genuinely waits, and not on this
entry's direction: it waits on the subscription-vs-credits decision and on
there being a checkout to point at. The half that did not — the usage panel
showing the free trial and how much of it is spent — is done.

**The answers.** Reference: all four of Linear/Vercel, Framer/Gamma,
Stripe/Raycast and Apple, which resolve to one thesis — *the interface is
achromatic; the decks are the colour*. Landing first, then a full app sweep.
Structure: stay on Vite/React (the architecture doc is explicit that the
workload is not serverless-compatible, so Next.js buys structure, not
hosting), rebuild the landing on a new shared token layer rather than
restyling. Imagery: real renders. Motion: rich, with fallbacks. Palette:
light and dark, user-settable, light by default.

**Done.**

- **A real design system.** Full token set for both themes, resolved before
  first paint, with a three-way appearance control in Settings and a quick
  one in the profile popup. Every contrast pair is tokenised — `on-accent`,
  `on-danger` — because the accent inverts wholesale in dark and a literal
  white foreground becomes invisible rather than merely wrong.
- **Landing rebuilt as pinned scenes.** Hero, pipeline, slide vocabulary,
  theme cycle, feature grid, verification. Vertical scroll is the only input;
  nothing has to be clicked or dragged to reveal its content.
- **Real imagery.** `tools/landing.mjs` renders a committed deck across a
  chosen cast and commits the frames — 46 WebP at 0.52 MB. The pipeline scene
  uses hand-written markup of the actual interface instead, so it cannot go
  stale against a product it is drawn from.
- **Two renderer defects found by looking**, one fixed (inverted-panel
  contrast, 17 of 34 themes) and one recorded in `docs/TRAPS.md` (tracked text
  measured in the wrong unit).
- **Some of the app sweep**: three prompts for one decision collapsed to one,
  the mode chip made the mode switch, labels that describe the product rather
  than the data model, the themes page actually showing themes.

**What is left.** The largest piece of the app half is now done — "The deck
workspace — too many doors, no front one" is ticked, and with it the project
navigation, the report-first entry flow, and the phone verification this entry
was still waiting on: every project page and `SlideEditor.jsx` are checked at
390px with no horizontal overflow.

The briefing flow is done (above). What remains under this entry is the rest of
the app's density and hierarchy.

**The density sweep, first pass (2026-09-03).** Every route walked in BOTH
appearance modes, with an in-page audit that computes each text node's colour
against its nearest opaque background and applies the WCAG floor for its size
and weight. Dark mode had never been looked at at all.

- **Contrast is clean**: zero text below its floor across eight routes and the
  four project pages, in light and dark. The token system does its job.
- **One real contrast bug**, and it was a token-layer mistake rather than a
  colour choice: four separator glyphs used `line-strong`, a *border* token, as
  ink — 1.47:1 in light, 1.66:1 in dark, so a theme card's two font names ran
  together with nothing legible between them.
- **One structural bug the contrast audit could not see**: `.slide-frame`
  separated a thumbnail from its card by shadow alone, which dark mode does not
  have, so a dark-ground deck had no edge at 1.34:1. No text, so no contrast
  failure — see `docs/TRAPS.md`.
- **Settings** was sized for the wrong content: Name/Short and
  Department/University shared equal columns, so "EIT" sat in a field five
  times wider than its content while the department name clipped mid-word.
- **The icons were never checked against their own names** — a gear that drew a
  sun, and a collapse/expand pair that drew the same arrow. Both in TRAPS.

What is left: the chat view's outline and editing phases, which need a model to
reach, and the admin page, which has its own entry. The admin page has its own entry now ("The
admin panel, swept"). This box stays unticked until those have had a pass, not
because the design direction is unresolved.

**Briefing flow, first pass — five defects, all found by running it.** None was
visible from the source and none had a failing test; the app was walked from
sign-in to the summary card in hosted mode.

- **Every hosted user was told the install had no gateway key.** `/api/models`
  builds its `auto` only when the key is set and then dropped the `keySet` that
  proved it, so ChatView's `!auto.keySet` was permanently true — a warning
  banner on the empty chat screen offering to fix nothing. The same projection
  dropped `kind`, so a local Ollama printed as "Auto" rather than
  "Local · Ollama". Three of the four consumers read `/api/auto/status`
  instead and were correct, which is what kept it alive. `test/modelchoices.test.js`
  pins both fields and the genuine no-key case.
- **A preset made the briefing ask the same question twice.** The walk shows
  the question at the *effective* step and the answer handler stored `step + 1`,
  so the two drifted the moment anything was skipped: "who is your guide?" was
  asked twice and the research question six times. The skip function was right
  all along — `nextBriefStep()` now owns the advance, and the tests walk the
  whole briefing rather than probing the step function.
- **The first question had one answer.** "Use a saved format, or start fresh?"
  offers only "Start fresh" until the account has saved one, so a new account's
  first interaction with the product was a question that could not be answered
  two ways. Skipped once the list is known to be empty — `presetsStore.isLoaded()`
  exists because an empty cache and an unfetched one look identical, and hiding
  a real choice is the worse mistake.
- **The composer claimed local execution on a hosted box.** "every model call
  stays on this machine" rendered unconditionally, two rows under a header
  badge correctly reading SHARED MODEL. A privacy claim is the one piece of
  copy that must not be approximate.
- **`&amp;` reached the screen.** Entities decode in JSX text and not in a
  quoted string inside `{}`; the two are indistinguishable in a diff.

The collapsed sidebar also had two adjacent controls both named "Settings" —
the gear, and the profile chip that opens a different modal.

**[x] The briefing's shape — built (2026-09-03).** Two forms: a required card
carrying theme, length, density and the research choice with one action, and a
single collapsed optional panel that skips in one click or opens to all ten
fields at once. Two clicks to a deck, against fifteen.

> **Learned.** Two defects fell out of the rework that were not the thing being
> reworked, and both were the same mistake — a value the walk made equivalent
> to another, which stopped being equivalent once the walk went.
>
> `answered` meant "the questions before the cursor". With a walk that is also
> "the questions with an answer"; with a form it is not, because a user can
> fill the last field and leave the first. That equivalence is where the "0
> members / no guide set / no subject set" filler in the summary came from —
> those were never answers, they were positions.
>
> `firstBriefStep()` returned 1 to step over the preset question on an account
> with no presets, and 1 became the *optional tier* — so the briefing opened on
> "anything else?" having asked nothing. A magic number that meant "one
> question in" silently came to mean "one tier in".
>
> And the panel first reported "2 of 10 set" immediately above "the rest stay
> at their defaults", because a suggested title and a branding default both
> carry values. "Has a value" and "the user chose it" are not the same
> question, and the label was asking the second.

**The direction, as agreed before building it.** Fifteen questions,
and a user who answers none still clicks through fifteen cards; the completed
transcript then reads "0 members / no guide set / no subject set / no thesis
set / no audience set", three lines each, above the summary. Three options were
put up — a short form with an "answer more" affordance, a required/optional
split, or leaving the walk and fixing only the summary. **The answer is the
first two combined**, and the reasoning is worth keeping because it is what
makes the combination more than a compromise:

The problem is not the number of questions, it is that every one of them is a
*walk*. A short form alone fixes the entry and risks "answer more" becoming the
same twelve-card walk one step later. A required/optional split alone still
walks the user through the required set for answers that fit on one screen
together. Applying *form rather than walk* to *both* tiers is the actual fix:

- **Required — one compact card**, not a sequence. The answers that genuinely
  change the artefact.
- **Optional — one grouped panel** behind an "add detail" affordance, fillable
  in any order and skippable in a single action rather than card by card.

`BRIEFING_QUESTIONS` is a flat `{ key, ask }` array and `nextBriefStep()`
already owns the advance, so the tier is an additive field rather than a
rewrite. Which questions sit in which tier is the thing to settle when this is
built — `research` in particular changes output quality materially and may not
belong with `guide` and `team`.

Worth stating plainly: this moves the briefing from a conversation toward a
form inside a conversation. That is a change in what the surface *is*, and it
is the intended direction rather than a side effect.

> **Learned.** Four things, all of which cost real time.
>
> **`overflow-x: hidden` is a sticky-killer, and it does it silently.** One
> axis hidden and the other visible is invalid CSS, so the browser promotes
> the visible axis to `auto` — and an element with `overflow-y: auto` is a
> scroll container, which is what `position: sticky` sticks to. Signed out the
> landing was fine; signed in, every pinned scene stuck to a box that was not
> the viewport and the reader scrolled through blank page. Eleven empty
> viewports against none, on the same build. Trying to undo it with
> `overflow-visible` on the same element does not work. A scene's ancestors
> need NO overflow property at all.
>
> **A hook whose effect binds to an element that does not exist yet never
> rebinds.** A scene that returns `null` until its data arrives has no element
> on first render, and a ref's identity never changes — so `[ref]` alone left
> the observer attached to nothing and the scene sat at progress 0 forever.
> That looks exactly like a scene that works but never advances, which is the
> hardest kind of broken to see.
>
> **A heading outside the pinned frame is a screenful of nothing.** The frame
> only begins below the block above it, so at the top of the section the
> content is centred in a box that has barely entered the viewport. Put the
> heading inside the frame it belongs to.
>
> **Measure the ground, not the token.** `swiss-international` declares a
> white page and renders a near-black cover; a plate theme's ground is an
> image no token describes. Both the landing manifest and the theme cards read
> darkness off the painted pixels.

### [x] Hosting blockers — what strands a real user

*Priority: HIGHEST once the front end is done. No model. Nothing here is taste.*

Three gaps that a stranger hits on day one. None is visible in a demo, and all
three are cheap to describe and not cheap to skip.

- **[x] Password reset.** `POST /api/auth/forgot` and `/api/auth/reset`, a
  single-use token stored as its SHA-256 with a 60-minute life, and a
  `#/reset/<token>` screen that renders above the auth gate. Completing one
  kills every session for the account and confirms the address.
- **[x] Email verification.** `verified_at` on users, a 24-hour token sharing
  the same store, `#/verify/<token>`, and a resend for the account's own
  address. An unconfirmed account may sign in, browse, and hold its own BYOK
  key; it may not create or generate anything.
- **[x] The report donor is a state, not a surprise.** `donorStatus()` is read
  at boot, on the admin System tab (which now offers the upload the API has
  always had), and at the *top* of `createReport` — before the research pass
  rather than at the render three steps later.

**The verification gate, as decided.** Auto is blocked because it is the
operator's money; BYOK key management stays open because it is the user's own
credential and storing it costs the box nothing; generation is blocked
regardless of provider. That last one is the part worth writing down. Routing
resolves per request in `src/cloud.js` and falls back, so "your own key may
generate, the shared one may not" leaks the moment a preference resolves to
Auto — and a deck is 5–15 MB of rasters and two LibreOffice passes on the
operator's machine whoever's key paid for the words. One gate at the workspace
entrance cannot leak; a per-provider one cannot help but.

**Look-ahead.** Two later items touch this. Housekeeping has "the report donor
is install-wide; a hosted box serving more than one institution needs it per
account" — so `donorStatus(refDir)` takes its directory as a parameter and
answers per account without changing shape when that lands. "The full
functional sweep" will exercise the reset and confirmation paths in the running
app; they were built to be exercisable there (both were driven end to end
through a real browser against a local SMTP sink, not only by unit test).

> **Learned.** Five things, four of them about where a check belongs.
>
> **A gate stated as a default-deny survives the next route; a list does not.**
> The alternative to `verifiedRequestOnly` — enumerating the fifteen routes that
> currently spend something — is a list that goes stale the first time a
> sixteenth is written, and the failure is silent. "Reading is free, changing
> anything is not" is one sentence, and the test asserts it against routes that
> do not exist yet.
>
> **The donor was checked three steps too late, and so was the briefing.**
> `createReport` ran a web research pass and a full model write before reaching
> the render that needed the template, so a missing `.docx` cost minutes and the
> account's Auto budget to report something knowable before the first request
> went out. The same shape appeared in the UI: the briefing runs entirely in the
> browser, so an unconfirmed account answered five questions before the server
> refused — the same defect spent on the person's time instead of the server's.
> Both fixes are the same move: check at the entrance.
>
> **A "verify your email" gate must degrade to nothing where no email can be
> sent.** `verificationRequired()` is `mailConfigured()`. Anything else means a
> box with no SMTP creates accounts it can never unlock, and the failure is
> invisible until the first stranger signs up. The same reasoning grandfathers
> every account that predates the column: a migration that locks out the people
> already on a running box is worse than the problem it solves.
>
> **"Forgot password" is an enumeration oracle unless every answer is
> identical** — including the *timing*. An SMTP dialogue takes seconds, so
> awaiting the send makes a real address measurably slower than an unknown one
> and hands back exactly what the generic response was hiding. Dispatch, do not
> await. It is also a harassment tool: the per-IP limiter does nothing about one
> inbox being mailbombed from a botnet, so the throttle has to be per address.
>
> **Running it found what the tests could not.** The donor guard was inserted
> into `createDeck` as well as `createReport` — both open with the same two
> lines and a whole-file replace matched both — so generating a *deck* on a box
> with no report template failed with "this server has no report template
> installed". Every unit test passed. It surfaced in the first thirty seconds of
> a real end-to-end run. Three traps from this session are in `docs/TRAPS.md`.

### [x] The deck workspace — too many doors, no front one

*Priority: high. No model. This is the page users actually live in.*

`views/DeckDetail.jsx` was the largest view in the app (~1.8k lines) and had
never been through a design pass. Arriving at a deck presented, before any
content: theme, style and density, Re-sweep, Render/"Up to date", `.pptx`, an
Export menu, and an overflow hiding Clone, Versions and Dark mode — eight
controls, none marked as the one you probably want. Below that a "never
finalised" banner with its own CTA, then three panels (Report, Research,
Speaker script) each an empty state with its own generate button, then the
slide grid. Roughly a dozen competing actions on arrival.

**What it is now: a project of four pages.** `Deck · Report · Research ·
Script`, as plain links under the project title — weight and ink, no pill and
no boxed strip, because a boxed control directly under a title reads as a
second header rather than as a way through one page. All four are always
shown, absent ones dimmer, so a project reads as what it could be and the
navigation does not change shape as the project grows.

They are routes, not tabs (`#/script/<slug>` is new; the other three already
existed), so a link into any of them survives a reload and back walks the
pages you walked.

- **The duplication is gone.** Report and Research were thinner copies of
  views that were already routed, and the deck page linked out to those views
  as well — each artefact had two surfaces. `DeckDetail` lost ~350 lines.
- **One action, chosen by stage.** Render while the render is stale, Download
  when it is not, and *nothing* while the run banner is up — that banner
  already carries the stage's action next to the sentence explaining it.
  Theme, style, density and Re-sweep moved below the navigation, where they
  are the Deck page's controls rather than the project's.
- **The report-first flow was broken, not merely undesigned.** See the Learned
  block.
- **The phone half is done.** All four pages verified at 390px with no
  horizontal overflow, and `SlideEditor.jsx` survives it.

> **Learned.** Three things, none of which were visible from the entry text.
>
> **The sidebar already called these Projects; the view never got the memo —
> and that was a bug, not a naming quibble.** The server has always modelled a
> report-first project (no `deck.yaml`, `report: true`, `slides: 0`), but
> `GET /api/decks/:slug` opens `deck.yaml` unconditionally, so such a project
> 500ed there and the page consumed the failure as a loading skeleton that
> never resolved. A whole entry flow led to a screen that spun forever. The fix
> needed a second, lighter endpoint (`/project`) that answers what a project
> *holds* rather than assuming the deck is the thing that exists.
>
> **A hover-revealed control is not hidden on a phone, it is absent.** The
> per-slide toolbar was `opacity-0 group-hover:opacity-100`, and
> `matchMedia("(hover: hover)")` is false on a touch device — so Edit, Punch
> and Swap were unreachable and the slide editor could not be opened at all.
> The entry predicted `SlideEditor.jsx` would not survive 390px; it survives
> fine, and the real defect was one layer up, in getting to it.
>
> **Two primaries is a shape, not a place.** The first pass moved Render and
> Download into the header as one stage-chosen action — and then the header
> offered "Download .pptx" while the banner below offered "Finalize this deck".
> The same defect the item exists to fix, recreated three inches higher. The
> rule that holds: the action belongs next to the sentence that explains it,
> and whoever has that sentence wins.
>
> Also: four pages that do not share a container width are four screens. They
> were `max-w-6xl` and `max-w-4xl`, so the title and the links jumped sideways
> on every switch.

### [x] Generate a deck and read it — the gateway's own model, run locally

*The item that had been blocked for four sessions. Unblocked not by the gateway
coming back but by `ollama pull qwen3.6:35b-a3b` — the same family and shape the
gateway serves (35.5B, 3B-active MoE, 4-bit), which is what makes it a stand-in
rather than a substitute.*

**Why this is not the local-model shortcut the working agreement warns about.**
That rule is about swapping in a DIFFERENT model, whose output answers a
question nobody asked. This is the same weights at the same bit-width (Q4_K_M
against the gateway's NVFP4). It also declares vision and thinking, so it plays
author, research AND critic — retiring three separate model choices.

Measured on the box it runs on: **100% GPU at 22 GB, 184 tok/s sustained, GPU
68°C at 146 W of a 150 W cap, CPU 79°C against a 105°C ceiling.** No CPU
offload, no kernel compilation. The vLLM route in `docs/LOCAL-MODEL.md` is
therefore **abandoned**: 22 GiB of weights against a laptop GPU already holding
4 GiB means mandatory `--cpu-offload-gb`, and FlashInfer's SM120 JIT compiles
with `nproc` (24) parallel `nvcc` jobs at 2-4 GB each — ~72 GB against 62 GB of
RAM whose only swap is zram, i.e. compressed RAM with no disk to spill to. That
is a hard freeze, and it is what the user reported.

**The deck: 83/100.** A real thesis ("A Technical Audit, Not a Hype Cycle"), a
coherent three-part arc, 100% varied, 90% grounded, and a takeaway that makes a
claim ("Stop Betting on Chemistry. Fund Yield Validation First."). The prose is
good. Three defects came out of reading it, and two are now fixed:

- **A chart whose categories and series disagree in length makes the entire
  `.pptx` unopenable.** Not the chart — LibreOffice refuses the file, and the
  only symptom is "source file could not be loaded". `writeFile()` succeeds, so
  every check upstream was clean. See the entry below.
- **Three of twenty slides had no headline** and rendered as a tall empty band
  above stretched content. `headline` was required on 15 types and optional on
  57. Now required on every content type.
- **The research pass returned majority-junk sources — 16 of 21.** Open; see
  *Research relevance* below.

> **Learned.** **"Generate one deck and read it" was worth four sessions of
> waiting.** Three defects, one of which made the deliverable unopenable, none
> reachable from 618 tests, and all of them found in the first deck. The
> specimen's payloads are hand-written to behave; only a model's payload has the
> shapes a model actually produces.

### [x] Research relevance — 16 of 21 sources were not about the topic

*No model needed to fix. Found by reading the first generated deck's research.*

The corpus for a solid-state battery deck contained Wikipedia's **"India"**
(31,107 words) and **"History of India"** (28,946), four Microsoft *"How to get
help in Windows"* pages, a **Minecraft "Lithium" mod**, **drugs.com** and
**Mayo Clinic** on lithium the psychiatric medication, and DBeaver's download
page. Five of twenty-one sources were about batteries.

The queries are not the problem — `expandQueries` produced good ones
("solid electrolyte ion transport mechanism", "dry electrode coating
manufacturing methods"). One reasonable query, *"India solid state battery
policy framework"*, matched the country article on the word "India" alone.

**The problem is that nothing between the search results and `notes.md` asks
whether a page is about the topic.** `absorb` (`src/ai/research.js`) filters on
`item.ok`, URL dedupe and a per-host cap, and nothing else, so 60,000 words
about India went into the corpus the author reads.

Measured on the real pages, **term DENSITY separates them and term presence does
not**: Wikipedia "India" contains 5 of the 7 topic terms — a presence rule
passes it — but at 0.44 hits per 1000 words against Wikipedia "Solid-state
battery" at 35.55. An 80x margin. A conservative floor (~1.0/1000) drops the
junk with room to spare, and it is topic-agnostic, which the three-layer rule
requires: the code derives the terms from the brief, it does not know the topic.

**Fixed and re-run on the same brief.** `absorb` now scores each fetched page's
topical density against terms derived from the brief and refuses anything below
the floor; off-topic pages are never backfilled, because a thin corpus is a
worse deck and a corpus about the wrong subject is a deck about the wrong
subject.

| | Before | After |
|---|---|---|
| Sources | 21 | 8 |
| Clearly off-topic | **16** | 2 |
| Notable arrivals | — | `energy.gov` "Next-Generation Batteries" |

The corpus is smaller and better: the junk had been occupying the per-query and
per-host budgets that an authoritative source then could not enter. Two mildly
off-topic pages still get through ("Electronics", a project-proposal system) —
the gate turns 31,000 words about India into a page that is merely adjacent,
which is the right order of error.

> **Learned.** **Density, not presence, and the difference is not a detail.**
> Wikipedia's "India" contains five of the brief's seven terms — every
> "mentions the topic" rule keeps it — at 0.4 hits per 1000 words against 35.6
> for a real battery article. An 80x margin invisible to the obvious check.
>
> **A hyphenated compound must be kept whole and never also split.** Splitting
> "solid-state" put "state" in the yardstick, an article about a country of
> states scored seven times higher on it, and the margin between on- and
> off-topic collapsed from 5.8x to 3.9x — enough that the first floor I set let
> every junk page through. The compound is the distinctive term; its halves are
> ordinary words.
>
> **Tune a threshold against the real documents.** Both the split and the floor
> were wrong on the first attempt and right after measuring seven real pages.

### [x] The relevance gate is inoperative on a short page

*No model needed to fix. Found in the research of the second generated deck.*

A follow-on to the entry above, and the same shape of error one level down.
The corpus for a vehicle-to-grid deck came back 6 good sources and one page of
**algebra help** — QuickMath's "Step-by-Step Math Problem Solver", 211 words,
which entered at a density of **4.74** against a floor of 4.0.

It got in on **one** appearance of "integration", in the phrase *"definite and
indefinite integration"*. A homonym, once.

**The floor could not have refused it.** The smallest non-zero density a page of
N words can score is 1000/N, so any page under 250 words clears a floor of 4.0
on a single hit of a single term. The gate was measured against Wikipedia-scale
junk — 31,000 words — and is inoperative on exactly the pages least likely to
be about anything.

Fixed by requiring the evidence as well as the ratio: `RELEVANCE_MIN_HITS = 2`,
the least that can separate a topic from a coincidence. Re-scored against that
run's real corpus, all six on-topic pages keep (8 to 89 hits) and only the
algebra page is refused.

> **Learned.** **A ratio cannot judge a sample too small to have one.** The
> quantisation of a rate is invisible when you calibrate on large documents:
> every measurement behind `RELEVANCE_FLOOR` was taken on pages of 17,000 to
> 31,000 words, where one hit moves the score by 0.03. On a 211-word page one
> hit moves it by 4.74 — past the floor by itself. When a threshold is a rate,
> ask what its smallest possible non-zero value is at the smallest input you
> will ever hand it.

### [x] A plan the model did not write, padded until it looked like one

*Found by generating with a local model. `src/ai/generate.js`.*

Three defects in the outline stage, all invisible downstream, all found by
running the planner repeatedly on one brief rather than once.

**The grammar offered a stub and the model took it.** `slides` was bounded
`minItems: 3`, and a constrained decoder takes the earliest exit a grammar
allows: two outlines in nine came back **exactly three slides** — the minimum,
not a coincidence. Every array in that schema has a documented `maxItems`
because an unbounded array runs away; the mirror failure had no symptom, so
nothing set the other bound to anything meaningful.

**And `mintContentSlides` hid it.** A stub reached the human gate looking whole
— 19 slides, four named parts — because the mint filled the promised sixteen
content slides with **fifteen identically-worded specs**, all in section 0. The
rescue was written for a small deficit (11 members, 10 slides) and has no
ceiling, so it will fabricate an entire deck. Nothing reported the difference.

The floor is now what the deck already promises: the content count the mint
would otherwise fabricate, plus a title and a closing. A thin answer is
re-asked once and the better attempt kept. `stats` carries `plannedByModel` and
`minted` so a caller can say when a plan is mostly ours.

**A slide could name a part that was never declared.** `sections` is capped at
the deck's section count; a slide's `section` index was bounded by a constant 7.
The model used indices 4 and 5 in a four-part plan and the structure pass
opened them as "Open part 6." — a divider for a part with no label, no place in
the arc and no member presenting it. Now bounded by the same cap.

**An opener without an index stopped being an opener.** `section` is optional,
and a model that named what a part argues while omitting the index cost the
deck the divider it wrote: `ensureStructuralSlides` matches openers by index,
matched nothing, and inserted a second generic divider. Eight dividers on a
four-part plan — "Announce Part One: idle buses as an untapped grid resource"
followed immediately by "Open the part on Grid Opportunity". Sections are now
filled in before the structure pass: a divider takes the section of the content
it opens, everything else carries the previous slide's forward.

| Six samples, same brief | Before | After |
|---|---|---|
| Stub outlines (exactly 3 slides) | 2 of 9 | 0 of 6 |
| Content slides planned by the model | 1-19 | 13-17 |
| Content slides minted | 0-15 | 0-3 |
| Sections used / declared | 5-6 / 4 | 4 / 4 |

> **Learned.** **A result sitting exactly ON a bound is the grammar's choice,
> not the model's.** Both stubs were three slides long and `minItems` was 3.
> That equality is the whole diagnosis, and it is only visible if you record
> the bound next to the result — the plan on disk looked like a 19-slide deck.
>
> **Sample a model stage before believing one run of it.** The first outline
> was a stub and the second was excellent; either alone would have been the
> wrong conclusion. Nine samples cost twenty minutes and turned "the model is
> bad at planning" into a rate — 2 in 9 — with a mechanical cause.
>
> **A padding routine must report how much it padded.** The mint is right to
> exist and was right about the deficit it was written for. What made this a
> silent failure rather than a visible one is that nothing downstream could
> tell a plan the model wrote from a plan it did not.

### [x] The first deck generated for a team, and the first critic loop watched

*The session item. Local `qwen3.6:35b-a3b`, 22 slides, 4-member team,
`--slides-per-member 4 --images --critic`. Roughly two hours end to end on this
box, ~3 minutes per slide-write call.*

**Presenter assignment works.** Verified by rendering, not by reading code: the
title slide carries "Group 7 — Aarti Deshmukh (TCE21-014) · Rahul Mehta …", every
content slide's footer carries the one member who presents it, and section
dividers carry only the slide number. Four members over sixteen content slides,
contiguous blocks, dividers unassigned. This had never rendered before — every
deck the project had generated showed `Presenter: —`.

**The critic works, and it earns its place.** One finding in round 1, and it was
true: slide 10, a feature-grid, *"the text 'Centers marginalized groups in site
selection criteri' is cut off at the end of the line"*. Read off the rendered
PNG by a vision model, on a deck where every mechanical check was clean.

Both of the defects behind that finding are in their own entries above and
below. The short version:

- The text was cut **by the decoding grammar**, at exactly the 53-character cap
  — three of that slide's four card bodies sat on the cap mid-word. The
  field-length pass had already found and correctly rewritten all of them, and
  then discarded its own work on a whole-deck validation gate.
- **The critic's fix could not have succeeded.** `runTurn` builds its ops
  grammar with no type restriction, and `buildOpsSchema` merges every type's
  properties by overwrite. Thirteen types declare `items`; the last one wins.
  So the model was asked to repair a `feature-grid` while the grammar required
  `contact`'s `{label, value}` items — and the failure surfaced as "slide 10
  (type: feature-grid): missing required field \"title\"". Twelve property
  names collide this way (`cards`, `body`, `rows`, `steps`, `events`, `nodes`,
  `entries`, `stages`, `columns`, `left`, `right`, `items`), and `items` alone
  has eight distinct element shapes. **Open — the fix shape is a decision, see
  the entry below.**

**The image supply had one note to work with, on the title slide.** The whole
22-slide deck carried a single `[image]` note and it was on `title`, which
cannot hold one. Structural finding alongside it: of 73 slide types, exactly
**one** (`testimonial`) has an optional `image` field a supply can fill in
place. Everything else must be promoted to `image-text`, which is only lossless
from `bullets` / `numbered-list` / `takeaway` with at most 4 items of at most
180 characters. See the image-seating entry.

> **Learned.** **The critic is worth its cost, and not for the reason the entry
> assumed.** It was built to catch what the fitter's measurements cannot see.
> What it actually caught was a defect three separate mechanical passes had
> already found or should have: the grammar cut the text, the field-length pass
> repaired it, and the repair was thrown away. The critic was the only thing in
> the pipeline reading the *output* rather than the intermediate — which is the
> argument for it, restated in a way no test could have.
>
> **A vision model reporting a specific quoted string is a defect you can
> trust.** The finding named the card, quoted the truncated text, and said what
> was missing. That is checkable against the deck in seconds, which is what
> makes a critic finding actionable rather than an opinion to be argued with.
>
> **Watch what it says before trusting what it changes** was the right
> instruction. The finding was correct and the fix was impossible, and only one
> of those is visible from the report line.

### [x] Image seating, part two: the chain from plan to picture

*The follow-on session. Everything below was found by running the chain end to
end for the first time, and every link in it was broken.*

The type built the day before worked. Nothing that had to reach it did.

**The planner could not spell it.** `type` in the outline grammar was capped at
16 characters, and `illustrated-points` is 18 — decoding stops mid-name, the
truncated string matches no type, and the coercion turns it into `bullets`. Two
existing types were in the same position and always had been:
`metric-comparison` (17) and `layered-architecture` (20). **Neither had ever
been plannable**, and both appeared in samples within minutes of the fix.

**The catalogue told the model it was an escape hatch.** Types with no family
are announced as "ESCAPE HATCH (rasterised, text not editable)", a line meant
for `freeform` alone. `cards` was in there too, and had been all along.

**Filed under the wrong family, it inherited a prohibition.** Grouped with
"Image & Visual" it was caught by "avoid image-requiring types, you have no file
to name" — it is a list type whose picture is optional, and it is filed under
List & Grid now.

**And with all three fixed the model still would not choose it.** Zero across
seven samples and three promptings. Told to "include two or three" it complied
and the deck's variety collapsed from 17 distinct types to 10, with up to seven
charts. So the seat is assigned after the outline returns, the way presenters
and the structure contract already are — one per section, three per deck, only
on list-shaped beats that look showable, and none at all for an abstract topic.

**The writer never asked for a picture.** It produced a good slide and no
`[image]` note, so the supply had nothing to look for. An empty seat is the
request.

**A headline is not an image query**, and this is the part worth remembering.
Searched as a picture, "The Physical Anatomy of a V2G Bus Depot" returned:

| Query it degraded to | What came back |
|---|---|
| (headline, unguarded) | the planet Jupiter |
| `anatomy` | an 1898 lithograph of human anatomy |
| `bus` | an abandoned bus in the Atacama desert |
| `fermata` | a musical notation mark |
| `school charging` | a school building in Hurricane Sandy |

Five wrong pictures, every one correctly licensed and high resolution, because
`rankCandidates` sorted by licence tier and pixel width and **nothing asked
whether the picture was of the thing**. What to photograph is now asked of the
utility role as a literal six-word subject (with a minimum length, because told
"six words at most" it answered "bus"), relevance is the primary sort key with a
majority-of-subject floor, and the ladder no longer degrades to a single word.

Live after: "electric bus charging station" resolves to a charging station for
city electric buses, solar panels to rooftop solar panels, wind turbines to wind
turbines — and the V2G depot slide keeps its empty seat, which renders as the
ordinary list it already is.

> **Learned.** **Three separate gates all made the right answer unrepresentable,
> and each one looked like taste.** A planner that never picks a type, a model
> that never asks for a picture, a search that returns something odd — all three
> read as judgement until you check whether the thing was possible. Ask "could
> it have done this?" before "why didn't it?".
>
> **A default branch that ASSERTS something is different from one that
> collects.** "Everything with no family" was fine as a bucket; describing its
> contents as rasterised and uneditable made it a lie about `cards` for however
> long that has been true.
>
> **The asymmetry decides the threshold.** A wrong picture ships on a submitted
> deck. A refused one leaves a seat that renders as an ordinary list. Once that
> is stated the tuning stops being a judgement call: bias hard towards refusing,
> and treat a low fill rate as the intended outcome rather than a failure.
>
> **Five wrong pictures in a row is a design signal, not five bugs.** Each one
> could have been patched with a narrower threshold. What they had in common was
> that no stage ever compared the result with the request.

### [x] Image seating — there was nowhere to put a picture

*Decided with the numbers in hand, then built. Schema, layout, planner.*

The last handoff predicted "if they keep landing on 5- and 6-bullet slides, the
answer is a new slide type, not a looser rule". The measurement came back worse
than that: the whole 22-slide deck carried **one** `[image]` note and it was on
the **title** slide. Structurally, of 73 types exactly **one** (`testimonial`)
declared an optional `image` field — the only shape `imageSeat` can fill in
place. Everything else requires its picture, and the writer is explicitly told
to avoid those because it has no file to name.

So the rule was not too tight. **There was nowhere to put a picture**, and the
`[image]` note was the writer's only way of saying it wanted one, arriving after
the type had already been chosen for other reasons.

Both halves are now built:

- **`illustrated-points`** — headline plus three to six points, image OPTIONAL.
  The writer produces it empty and the slide is complete, rendering as a
  full-width list; a supply fills the same slide later and the points move to a
  column. Five points survive where `image-text` caps its body at four.
- **The planner chooses it**, in the outline, for a beat a picture genuinely
  helps — with a ceiling, since a deck of them is a slideshow. The writer's
  `[image]` instruction is now conditional on whether the slide's type can
  actually carry one, derived from the schema by the same rule the supply uses.

Clean across 34 themes x 74 types, `drawcheck`, `textcheck`, and `capfit` at
100% together. **Not yet seen end to end with a model** — the planner half needs
one generation to confirm the type is chosen at a sensible rate.

> **Learned.** **"The rule is too tight" and "there is nowhere to put it" look
> identical from the skip list.** Every skipped note said `type "X" cannot carry
> an image without losing content`, which reads as a promotion rule being fussy.
> The question that separated them was not about the rule at all: how many types
> have a seat? One. Count the capacity before tuning the gate.
>
> **A type that renders two ways gives the sweeps a choice, and they can only
> see one.** The specimen carries the filled state because that is where the
> risk is — a narrowed column is where points overflow, and `caption` exists
> only in that branch. Choosing the other state left `caption` a field nothing
> had ever rendered, which `drawcheck` said out loud.
>
> **Branch on what was asked for, not on what resolved.** Treating an
> unresolvable image as "no image" dropped the caption silently — a credit
> vanishing with the picture it credits.

### [~] A turn's grammar is built from every type at once, so it fits almost none

*Priority: medium — the critic path is fixed, chat is not. Found by watching the
critic fail to apply a correct finding. `buildOpsSchema` in `src/ai/ops.js`.*

`runTurn` — the primitive under chat, the critic's fix pass and generation —
builds its ops schema with no `onlyTypes`, so `buildOpsSchema` walks every
type's `then.properties` and assigns them into one flat object:

```js
for (const [name, spec] of Object.entries(rule.then?.properties ?? {})) {
  props[name] = deref(spec);      // last type to declare `items` wins
}
```

Thirteen types declare `items`. The last one to be walked is `contact`, so
every multi-type turn carries `items: array<{label, value}>` — and a model
asked to patch a `feature-grid` is *forced* by the grammar to emit the wrong
shape. Observed exactly this way: the critic found a real clipped card body on
slide 10 and its fix failed validation with `missing required field "title"`.
The model did not get it wrong. The right answer was unrepresentable.

Twelve property names collide: `items` (8 distinct element shapes), `cards`,
`body` (string vs array), `rows`, `steps`, `events`, `nodes`, `entries`,
`stages`, `columns`, `left`, `right`. Only a turn that happens to touch the
winning type gets a correct grammar.

**Re-measured, and it is worse than that.** Generated from the schema rather
than counted by hand: **22** property names are declared by more than one type,
and `items` by **thirteen** types with **thirteen distinct** element shapes.
`body` has 4 shapes across 10 types, `headline` 5 across 6, `label` 6 across 6.
Against the one real generated deck on disk, an unscoped turn is handed the
wrong shapes for **10 of its 22 slides**.

**This is not only the critic.** Chat is the same primitive, and the product
vision puts the chat panel at the centre — "edit the deck the way you would
talk to Gamma". Every chat instruction that patches one of those thirteen types
is fighting the same grammar.

Three shapes for the fix, and they are materially different work:

1. **[x] Scope the turn to the types it touches.** *Done — `runTurn` takes
   `onlyTypes` and the critic passes the types of the slides its findings name.
   Unscoped turns are unchanged, so chat may still write any type.* This was the
   agreed direction. It fixes the critic and leaves the general merge wrong for
   any turn spanning several types, which is what the two options below are for.

1b. **[x] Derive the scope from the selection chat already has.** *Done.* The
   panel's selection reached `runTurn` as `onlySlides` and was used only to
   filter ops AFTER the model answered — while the grammar it answered against
   was still the flat merge. A selection names slides and a slide names its
   type, so the types a turn may PATCH were known all along. New `patchTypes`
   narrows only the patch key space: a full `slide` carries its own `type` and
   must stay unrestricted, because `scopeOpsToSelection` lets append and insert
   through and a turn scoped to slide 10 may still be asked to add a chart.
   **10 of 22 wrong → 0 of 22**, and a single-slide selection cuts the patch key
   space from 82 keys to 9. This is the majority of real chat usage — select a
   slide, ask for a change — and it needed no grammar-shape change, only a
   narrower one, which is the direction the module's own notes call safe.

   What it does NOT fix: a chat turn with no selection ("make the whole deck
   punchier"), which still gets the flat merge. That is what 2 and 3 remain for.
2. **Merge permissively instead of by overwrite.** Union the properties of
   same-named fields and reduce `required` to the intersection, so every type's
   shape is representable and `validateDeck` plus the repair loop enforce which
   one was correct. Fixes chat and the critic together; loosens the grammar,
   which is the thing that keeps constrained decoding on-distribution.
3. **Make `patch` type-conditional.** Closest to correct and hardest: a patch
   carries no `type`, and the target's type is only known from `index`, so the
   grammar cannot condition on it without restructuring the op.

> **Note for whoever takes this.** The measurement is already done — the
> collision table above is generated from the schema, and
> `buildOpsSchema(ds, {slideCount: 22})` versus
> `buildOpsSchema(ds, {slideCount: 22, onlyTypes: ["feature-grid"]})` shows the
> two grammars side by side in one call. `test/ops.test.js` now derives the
> collision set rather than hard-coding it, so the numbers above cannot go
> stale without a test noticing.
>
> **Options 2 and 3 change the SHAPE of the grammar** — an `anyOf` union per
> colliding name, or a discriminated `oneOf` per type — and this module's
> history is a list of grammars that die silently rather than loudly
> ("Ollama's decoding grammar silently dies at maxLength 2000"; "a surviving
> `$ref` fails the whole request"). Neither should land without a model to run
> it against. Option 1b was taken instead precisely because narrowing an
> existing shape is the one move that cannot introduce a new one.

### [x] The critic's fixes never reached the file anyone opens

*Found while running the critic loop for the first time. `src/ai/pipeline.js`.*

`critiqueDeck` renders inside its own loop, so the `.pptx` was the deck the
critic finished with. Finalize then kept editing that deck — the fit trim, the
grounding pass and the presenter re-assignment all run on its output — and
nothing drew it again. Whenever a fix landed, the artefact on disk was a
different deck from the `deck.yaml` beside it.

**The presenter half is the one that would have shipped.** The critic's fix
goes through the ops layer, which does not carry `presenter`, so the rewrite
drops it; finalize re-assigns and persists, and the code says so in its own
comment. What the comment does not say is that nothing renders afterwards. And
a slide with no presenter does not draw an empty footer — `applyContentChrome`
falls back to every presenting member joined by "·" — so a deck with the defect
does not look broken. It looks like a deck where all four people present every
slide.

Now redrawn, but only when those passes actually moved the deck, so a clean
critic round costs nothing. `critique` is injectable into `finalizeDeck` for
the same reason `chat` is.

> **Learned.** **A fallback can make a defect look like a design.** The failing
> render was legible, plausible and wrong: "Ada Lovelace · Alan Turing" on every
> slide reads as a deliberate choice, not as a slide that lost its presenter.
> The first version of the test asserted the right name was *present* on the
> slide and passed against the broken code — the roster contains every name, so
> containment can never fail. The assertion that works is that the OTHER names
> are absent.
>
> **A stub that skips what the real collaborator does tests the stub.** The
> first critic stub returned an edited deck without rendering it, so it failed
> against the fixed code for a reason production never has. Making it render —
> and drop `presenter`, as the ops layer really does — is what turned it into a
> test of the defect.

### [x] Chart colours — the monochrome premise was stale, the pie was not

*No model, renderer. Opened as "monochrome charts need pattern fills"; that
turned out to be the wrong problem, and measuring first found the right one.*

**What the entry assumed, and why it no longer held.** It was written when
charts borrowed the UI palette and `high-contrast-mono` drew three identical
black series. `src/chartpalette.js` fixed that, and the theme now declares a
six-colour *chromatic* chart palette of its own. Today there is exactly one
monochrome theme in 34, it authors its own series colours, and the derived grey
ramp is therefore never used by anything shipped. There was no monochrome chart
to fix.

**What was actually broken** — and both defects are reachable only through a
pie, because a pie's colours come from its **categories**, which the schema does
not cap, while `series` is capped at four:

- **A declared palette was cycled**, `declared[i % len]`. `high-contrast-mono`
  declares six, so an eight-slice pie drew slices 7 and 8 in exactly the colours
  of 1 and 2. Measured across all 34 themes at 4, 8 and 12 slices: **8 identical
  colour pairs**. A wrapped entry now shifts value and keeps the author's hue.
- **The derived ramp maximised hue gap** and alternated lightness by index
  parity, so two entries an even number apart could land in the same hue region
  at identical lightness — a twelve-slice pie drew two greens at ΔE 6. It now
  searches hue and lightness together, scored on CIE76 distance.

Worst perceptual distance across every theme and slice count: **0.0 → 13.1**,
zero identical pairs. Rendered and looked at: a ten-slice pie and a four-series
bar on `bauhaus`. `themematrix` clean across 34.

**Pattern fills were not built, and should not be for this.** pptxgenjs 4.0.1
has no pattern-fill support at all (zero occurrences of `pattFill`), so it means
post-processing the chart XML inside the `.pptx`. That is real work for a
premise that no longer exists. It remains a genuine *accessibility* idea —
greyscale printing and colour-vision deficiency — and belongs in its own entry
if it is wanted, not as the fix for a colour-crowding problem that colour
solved.

> **Learned.** **Measure the premise before building the fix.** The entry named
> a mechanism (pattern fills) for a condition (too few greys) that had been
> resolved by other work months earlier, and building it would have been effort
> spent on nothing while the actual defect — identical pie slices — sat
> unnoticed in the same file.
>
> **WCAG contrast is the wrong metric for a categorical palette.** It is a
> luminance ratio, so red and blue at equal lightness score 1.0 while being
> instantly distinguishable. The first measurement here used it and reported 132
> "near-identical" combinations that were nothing of the sort. ΔE is the right
> tool, and switching the picker's objective to it fixed the crowding as a side
> effect of measuring it honestly.
>
> **The test asserted the bug.** `// It cycles rather than running out` was
> written as intended behaviour, which is why nothing ever caught the repeated
> slices.

### [x] Bulk account cleanup, behind a dry run and a typed phrase

*No model. Held back from the admin sweep until its shape was agreed, because
the safe version and the dangerous version look identical from the outside.*

116 accounts on the dev box, almost all throwaway, deletable only one
`window.confirm` at a time. The obvious fix — delete everything matching the
search box — is also the one that wipes real accounts when the filter is wrong.

**The danger is not the wrong number, it is a filter matching more than the
operator read.** So `POST /api/admin/users/cleanup/preview` returns the whole
list, not a count, groups every spared account by why it was spared, and hands
back a token bound to **that exact set** rather than to the filter that produced
it. The confirm re-derives the selection server-side and refuses unless it still
hashes to the same token, so a signup, a new deck or a promotion between the two
steps sends the operator back to read the list again. The typed phrase carries
the count (`delete 110 accounts`), so a stale one cannot approve a larger set.

**Four vetoes the caller cannot switch off**: admins, whoever is signed in,
anyone who owns a deck, anyone who has generated — plus a seven-day age floor
that may be raised and never lowered.

The deck rule is the one worth naming. `deleteUserAccount` removes the user row
and everything that cascades from it (sessions, BYOK keys, prefs, usage) and
**nothing removes their decks**: `meta.owner` would go on naming an account that
no longer exists, `canAccessDeck` would show the folder to nobody but an admin,
and it would sit on the volume forever. So an account that owns a deck is dealt
with deliberately, one at a time, and this pass will not touch it. On this box
that costs nothing — 110 of 116 accounts own nothing at all.

> **Learned.** **A dry run that reports a number is not a dry run.** The whole
> value is in the operator reading the actual list, so the count is the least
> useful thing the preview returns — and binding the confirmation to the *set*
> rather than the *filter* is what makes the reading mean something. A token
> over the filter would have re-authorised a different list every time the
> world moved underneath it, which is exactly the failure the dry run exists to
> prevent.
>
> **Run the delete, then go looking for what it left.** The cleanup ran cleanly
> — 110 accounts, zero orphaned decks, because that rule was enforced — and left
> exactly one thing behind: a per-account identity file, keyed by a hash of an
> email that no longer resolves to anyone. The cascade list tells you what the
> *database* cleans up, not what the *feature* owns; brand marks and the report
> donor were in the same position and were the larger leak. `deleteUserAccount`
> now removes all three.
>
> Also: **the interesting half of a destructive selection is what it excluded.**
> Grouping the spared accounts by reason turned an unreadable 112-line list into
> two chips, and it is where the deck-orphaning rule became visible as a rule
> rather than a footnote.

### [x] Operating settings and the gateway key, changeable from the panel

*No model. The natural follow-on from the sweep: the sweep made the controls
visible, and visible read-only settings invite the question of why they cannot
be changed.*

Retention, signup and the spend caps were env-only, so changing one number on a
box somebody is using meant a container restart. Worse, the sweep scheduler was
armed only when `FORGE_SWEEP_DAYS` was set **at boot**, so turning retention on
at runtime would have scheduled nothing at all. The tick is now unconditional
and reads the setting when it fires; with retention off it does nothing.

`src/runtime.js` owns the settings and the precedence, and the precedence is the
whole design — **it runs opposite ways for settings and for secrets, on
purpose**:

| | Wins | Why |
|---|---|---|
| Operating settings | **stored** over env | a setting that cannot change at runtime is the problem being solved |
| Secrets (gateway key) | **env** over stored | a key rotated in the deployment must beat one typed into a browser months ago; rotation cannot depend on clearing a row |

The cost of the first direction is that a stored value shadows a deploy-time
change, so nothing is silent: every value reports whether it came from the
panel, the environment or the default, names the env var it is suppressing, and
can be reset back to it.

**The gateway key is write-only.** Nothing returns a key to the browser, so an
XSS on the admin page cannot take one. The status carries whether a key is set,
which source is live, and the last four characters — enough to tell two keys
apart, not enough to be one. It refuses to pretend when `FORGE_KEY_PEPPER` is
unset: the encryption key would be a constant published in this repository, and
hosted mode already throws rather than store under it.

Also corrected: the hosted caption claimed *"env still wins on deploy"* while
`isHosted()` gives `config/hosted.json` precedence over `FORGE_HOSTED` —
backwards, on exactly the sentence an operator would rely on during a deploy.

> **Learned.** **Ask which direction each kind of value should resolve, and say
> so out loud.** Both directions are defensible and the codebase already had one
> of each — `hosted.json` overriding env, keys resolving env-first — with
> nothing naming the distinction, and a UI caption asserting the opposite of
> what the code did. The rule that survives is: *configuration* wants to be
> changeable at runtime, *credentials* want to be owned by the deployment.
> Making a setting editable is the easy half; deciding what beats what, and
> showing it, is the part that stops a deploy from silently doing nothing.

### [x] The admin panel, swept

*No model. Driven in a real browser, both appearance modes, every tab, against
the questions the entry named: is anything broken, who is using this, what is it
costing, and what do I do about it.*

**Three things the panel stated that were not true.**

- **Storage counted `out/deck.pptx` alone.** A deck runs 5-15 MB and the preview
  PNGs are nearly all of it, so the card read 23.8 MB on a box holding 79 — and
  `DEPLOY.md` names storage as the constraint that runs out first. It sums the
  deck folder now. (`decks/.specimen-cache` is a 608 MB dev artefact and is
  correctly outside the count; an early reading of this bug that included it
  was wrong by an order of magnitude.)
- **"Model calls" was the exact misreading `src/limits.js` warns about** in its
  own header: one recorded event is one pipeline operation and makes many model
  calls behind it. Analytics already called the same number "requests", so the
  panel contradicted itself across two tabs. Both say **Auto runs**.
- **`weeklyTokens` is a cap nothing can reach.** No call site records a token
  count — every one passes 0 — so the limit can never fire and the Tokens
  metric was permanently `0k`. Marked inert rather than printed like a live cap,
  because a limit that cannot fire reads as protection that is not there.

**Two blind spots that only matter on a deployment.**

- **`FORGE_SWEEP_DAYS` and `FORGE_OPEN_REGISTRATION`** are two of the three
  operating controls `DEPLOY.md` names, and neither appeared on any screen.
  Retention is off unless somebody set it, so a box keeps every deck forever and
  nothing said so. A **System → Operating controls** panel now reports all three
  and warns when retention is off.
- **`pruneAutoEvents()` was written when the table was added and never called
  from anywhere.** Every quota event this install has recorded is still in the
  database, in the same SQLite file as accounts and sessions. Now runs at boot
  and daily, deliberately not tied to the deck sweep, which only runs when
  `FORGE_SWEEP_DAYS` is set.

**The page was slowest exactly when it mattered.** `autoHealth` already had a
stale-while-revalidate with the right reasoning written above it, and it covered
every case but a cold cache — where there is nothing stale to serve, so the
request awaited the full probe. That is 20.6s on the first load after a restart,
on the first page an operator opens when the gateway is down. Cold reads report
"checking" and the probe lands for the next one: **20.6s to 0.10s**. Also
`df` ran through `execSync`, stalling every other request on the box, and
labelling ten usage bars cost one `getUserId` per registered account — 116
queries for ten rows.

**Repetition removed.** The header badge repeated the two cards beneath it; the
Overview explained hosted/local without carrying the control while System
explains it beside the switch; the header carried a third copy of that switch;
Analytics printed the limits as a summary card immediately above the same limits
as a grid; the RBAC paragraph appeared on two tabs. The header subtitle was
implementation notes and now says what the page is for.

**The missing verb.** The operator's vocabulary was find, promote, delete —
the entry called this out and it was the real gap. A quota is a cost control
rather than a punishment and it had no remedy: a run that failed after the
budget was taken, a shared demo machine, or somebody who has to finish today all
reached the same dead end, and deleting the account was the only lever. The
users list now carries each account's window and weekly spend against the cap
(two queries, not one per account) and an account that has spent something can
be zeroed.

**Not done, deliberately.** Bulk user cleanup — this box carries 116 accounts,
almost all throwaway, and deleting them is one `window.confirm` at a time. A
filter-scoped bulk delete is the obvious fix and also the one that wipes real
accounts when the filter is wrong, so it wants a design (dry-run count, typed
confirmation) rather than a button. `/api/admin/stats` still walks every deck
directory per request; that is now a cheap walk (0.04s across 683 MB) but it is
still the wrong shape at a thousand decks. `window.alert`/`window.confirm` are
still the error and confirm surface, and the hosted toggle still hard-reloads
after a magic 500ms.

> **Learned.** Three.
>
> **The panel's own source warned about its worst label.** `src/limits.js`
> opens by saying these events are pipeline operations, not model calls, and
> that reading them as calls makes every number look an order of magnitude
> tighter — and the card above them said "Model calls". A doc comment one file
> away is not a defence; the two tabs disagreeing with each other is what makes
> it findable.
>
> **A cache that covers the common case can still be worst at the worst
> moment.** The health probe was cached with exactly the right reasoning
> written above it, and the reasoning had a hole precisely where the cache was
> empty — the first load after a restart, which is what an operator does when
> something is wrong.
>
> **Measure the thing you are about to claim.** The storage bug was real at
> 3.3x, and the first measurement said 28.8x because it swept in a 608 MB
> specimen cache that is not deck storage at all. The fix did not change; the
> number reported to a human would have been wrong.

### [~] Reports — structure, and the wait

*Priority: medium. The speed half needs no model — **and is done**.*

Two complaints. The output does not feel good, which is a content and structure
question and **still open** — it needs a model and a real read of what the
sections say. And generation feels slow, which was measurable today.

**The wait — done.** Profiled against a real 8-section report rather than
guessed at:

| phase | before | after |
|---|---|---|
| `.docx` in the user's hands | **16.9s** | **6.7s** |
| page images on screen | (same wait) | +7.7s, after the download |

Two findings, neither of which the entry predicted. First, the "two LibreOffice
passes" are not both in the renderer: `renderReport` starts LibreOffice once,
for the TOC page numbers, and the *second* start is `reportPreview` rasterising
the finished document — a picture of a file the user already had, which they
waited for before getting it. Splitting `POST /report/render` from
`POST /report/preview` is the whole 10s. Second, `libreofficeToPdf` built a
fresh LibreOffice profile on every call and deleted it after, paying setup
every time: ~0.8s of a ~7s conversion, which every rasterising sweep also pays
per render.

**What is left: the structure half.** Whether the report says anything worth
reading. Needs a model and a genuine read of the output, not a profile.

> **Learned.** **Profile before believing the entry.** This one named "two
> LibreOffice passes for the table-of-contents page numbers" as the cost. The
> TOC pass is one start, it is unavoidable without a layout engine, and it was
> never the part worth attacking — the preview was, and the entry did not
> mention it. Ten seconds of a sixteen-second wait was spent on something
> nobody had asked to wait for.
>
> **"Ready" is a claim about the deliverable, not about the pipeline.** The
> file existed at 7.6s and the route held it back for another 9.3s so it could
> return everything at once. Returning what exists when it exists is not an
> optimisation, it is the difference between a wait and a hang.

### [~] The generated deck and report, judged by looking

*Priority: high. Generation exercised on local Ollama; the gateway was down.*

The first pass where a deck AND its report were generated end to end and then
read page by page. Seven defects, none of which any check reported, and none
visible without rendering real generated content:

| what | where |
|---|---|
| Raw JSON typeset into the report body | `assembleReport` |
| Reference ran 600 chars of `[Google Scholar] [PubMed]` loop | `cleanReference` |
| 6 of 9 speaker notes cut mid-word at their cap | `healCutField` |
| 4 of 14 slides lost `section`, so the eyebrow drew no label | `generateDeck` |
| A heading rule drawn under an absent heading | `drawHeading` |
| `framework` stranded its slack as a dead bottom third | `layouts.framework` |
| `flow` labels floated 1.5in clear of the chips they name | `layouts.flow` |

Plus one that only a fresh deck could show: a deck is trimmed to fit the theme
it was generated with and rendered in whichever of the 34 a user picks. The
generated deck was clean in its own theme and lost thirteen text elements below
the readable floor across six others. `trimDeckToFit` now fits the gallery, for
2.7% of the deck's characters.

**Post-generation actions, swept.** Every path a user takes after the deck
exists was exercised on the real deck:

- **Theme switch** — rendered across the gallery. sci-fi-hud broke `<1000h`
  into "<1000 / h" and printed a caption on top of "commercializat / ion".
  Both fixed; the deck is trimmed for every theme now.
- **Slide-type change** — all 1008 slide x type pairs through
  `compatibleRemap`. 10 have a deterministic map and the rest correctly fall
  through to the model. One remap is structurally short of a field, and
  `convertSlide` already validates and falls through for exactly that, so it
  is handled rather than broken.
- **Chat edit on a named slide** — wrote a `bullets` array onto a before-after
  slide and reported success while the render was identical. Fixed.
- **Report at full depth** — 10 pages, which is the shape expected; `full` is
  already the default in both the CLI and the briefing, so the 4-page result
  earlier was the explicit `--depth brief`. Its Abstract carried a data table.
  Fixed.

**Answers to the three "does it actually work" questions.**

- **Theme change, any to any.** Swept the real deck across all 34. Before the
  cross-theme trim: 28 clean. After it: **31 of 34**, and all four remaining
  failures were the same thing — the deck TITLE overflowing the title slide's
  `display` role. Measured: a title fits every theme at 52 characters and fails
  on three by 56, even all-caps. The outline grammar allowed 90 and the real
  deck came back with 69. Cap cut to 52 in the GRAMMAR only, never in
  deck.schema.json — tightening the validation cap makes every edit on an
  existing deck fail, because a chat or coherence turn validates the whole deck
  and would reject an unrelated fix over a title written under the old cap.
- **Slide-type change, per slide.** All 1008 pairs through the deterministic
  `compatibleRemap`: 10 map losslessly, the rest correctly return null and fall
  to the model. Six representative model conversions run for real (bullets →
  cards/timeline, stats → bullets, chart → bullets, framework → cards,
  feature-grid → cards): all six valid, section and presenter preserved,
  content genuinely rewritten for the target type. This path is sound.
- **Chat with slides selected.** It worked only by persuasion. The selection
  reached the model as prose and nothing enforced it, so a turn could and did
  edit the wrong slide while reporting success. The selection now travels as
  data and an op outside it is refused. Also fixed alongside: a turn could
  write one type's fields onto another's slide, which validated and rendered
  identically.

**The chat, exercised for real.** Single-slide and multi-slide selections run
against the generated deck, not simulated:

- **Targeting is right.** A two-slide selection changed exactly those two;
  headlines and sections preserved on both.
- **Extent.** The turn's vocabulary is `set_meta` (deck title, subtitle, theme,
  section names) plus append / insert / replace / update / delete / move /
  duplicate slide. So chat can restructure the deck completely and switch the
  theme, and can change no coordinate, colour or typeface — the layout rule
  holds through the edit path as it does through generation.
- **Its op array was unbounded**, which is the runaway shape this repo already
  documented and fixed in the outline schema. Bounded now.
- **Quality is where it is weak, and not only because of the model.** Asked to
  hold bullets under 55 characters, the turn obeyed and destroyed the point of
  a comparison slide: "PSCs reach 25.8% vs. 22-26% for Si" became "Efficiency
  reaches 25.8%", on a slide headlined "PSC vs. Si: Efficiency & Stability
  Gap". Nothing noticed, because a chat edit ran NO post-turn pass at all —
  generation grounds, length-checks, trims and coherence-checks; an edit went
  straight to the render. The trim runs now. Grounding and coherence after an
  edit are still open: coherence is a model call per turn, which is a cost
  decision rather than an oversight.

**Finalize was manual, and that was invisible.** The post-write pass —
grounding, field-length rewrite, trim, coherence, then render — is the tail of
generation and is called automatically by both `generateFromPlan` and
`resumeGeneration`. Reaching "fully written but never finalised" therefore
always means the run was interrupted. But recovery was a button in a banner, so
a deck stayed unusable until a human noticed, and the state read as a normal
step rather than as damage. It runs on arrival now.

Which models it uses, since that was asked and was not written down anywhere:
grounding and the trim are deterministic and use none; the field-length rewrite
and the coherence review are both the **author** role; the optional vision
critic is the **critic** role. So a finalize costs two author passes, or three
with `--critic`.

**The remaining components, swept.**

- **Research.** `search()` caps results at 2 per host and says why — a model
  handed eight pages from one domain writes a report sourced from one site. The
  cap is PER QUERY, and a deep run makes eight queries plus follow-ups and gap
  queries, absorbing them into a corpus deduped by URL alone. So the guard
  bought nothing at the level it was written for: a real run came back
  three-tenths Wikipedia, including the mineralogy article in the research for a
  deck about solar cells. Now capped across the corpus, with the surplus put
  back if too little else arrives — on a topic where one authority holds the
  material, starving the corpus is the worse failure.
- **Speaker script.** Works in shape — anchored per slide, readable spoken
  prose grounded in the research — and four defects came out of reading it.
  The prompt asks a divider for "a short spoken transition, 40-80 words" and
  the writer produced a 200-word monologue; the cap is in the grammar now, with
  the sentence-heal behind it so a tighter bound cannot cut a presenter off
  mid-sentence. Slide 13 was written as the single character `}` — minLength 1
  is satisfied by a brace — and then PRESERVED across regenerations by "keep
  previous words", which is right for a transient failure and wrong when the
  previous words are the failure. A slide whose segment failed left a silent
  hole in a file that is downloadable, so the reader saw 11, 13 and no reason
  why. And `--slide` was 0-based while every number the product shows a user is
  1-based, so `--slide 12` rewrote slide 13.
- **Critic.** Runs only under `--critic`. Its `vision: true` declaration was
  read by nothing, so in hosted mode — where every non-author role goes to the
  gateway — it would have posted base64 slide PNGs to a text model and handed
  the reply to a fix turn that edits the deck. Now: locally the model is asked
  what it can do (`/api/show` reports capabilities), remotely the provider
  declares `vision_models`. **The loop itself is still unrun** — the gate was
  built, the critique was never watched end to end.

  On the two-model question: hosted runs ONE model, because critic and author
  both resolve to the gateway. The split is local-only and forced — Ollama
  reports `qwen3-coder:30b` as completion+tools and `gemma4:26b` as
  completion+vision+tools, so the author physically cannot read a slide.

**What this pass could NOT answer.** The gateway was down for the whole
session, so generation ran on local Ollama. Everything above is mechanical —
structure, placement, escaping, truncation — and is the product's behaviour
whatever wrote the words. Whether the deck ARGUES anything, whether the
research is any good, and whether the report reads well are still open and
still need Auto, per `AGENTS.md`.

> **Learned.** **The specimen cannot find these.** Every one of the seven came
> from payloads a model actually wrote: an omitted optional `headline`, a
> missing `section`, a note stopped at its cap, paragraphs that were JSON. The
> specimen is hand-written to behave, so it carries none of those shapes and
> every sweep over it stays clean. `--deck` on a real generated deck is not a
> nicer version of the specimen sweep; it is the only version that asks the
> question.
>
> **Two of the seven were the same mistake in different files.** Sizing a box
> to its content and then placing it are one decision, and only the first half
> had been made — in `framework`'s grid and twice in `flow`. Grep for a layout
> that computes a height with `Math.min(room, needed)` and then draws from the
> top of `room`.
>
> **A field that is optional in the schema is a field the model will omit.**
> `headline` and `section` are both optional, both omitted on a real deck, and
> both produced a visible defect that validation passed and no sweep could
> measure — a rule underlining nothing, and an eyebrow with no label.

### [ ] Research and content flow, end to end

*Priority: medium. Needs a model.*

Standing distrust of both the research pass and the argument the deck makes.
The research half has been through one round already (section 9) and the
briefing now steers queries; whether that reaches the page is unverified.
Deferred by request until the whole surface can be exercised at once.

### [ ] The full functional sweep

*Priority: medium. Needs a model for the generation-dependent half.*

Explicitly asked for: every function exercised in the running app rather than
by unit test. Named specifically — every theme against every slide type,
deck→report, report→deck, and the speaker scripts. Deferred by request until
the gateway key is in place, and to be done in one pass rather than piecemeal.

### [x] Model configuration names models that are not installed

*Priority: medium. Blocks any local run.*

**The first half of this entry was already stale when its turn came.** All six
models it named — `qwen3-coder:30b-a3b-q4_K_M`, `gemma4:26b-a4b-it-q4_K_M`,
`qwen3:4b-instruct` and the three fallbacks — are installed on the development
machine now, and all four roles resolve to exactly what `models.yaml` names.
The machine gained them at some point after the entry was written and nothing
told the entry.

The second half was not stale, and is the part that mattered: *fail loudly
instead of degrading quietly*. `resolveRole` has always set `fellBack` when it
substitutes, and that flag has always been threaded through `chat()` into the
turn's stats — where **nothing read it**. Not one caller anywhere. A role
running a model the config does not name was invisible at every layer.

`roleAudit()` now answers it in one place (configured, resolved, and which of
ok / fallback / missing / provider), boot warns on a mismatch, the admin System
tab shows every role, and a substitution warns once per role per process so the
CLI sees it too. Five tests in `test/roleaudit.test.js`, including that an
unreachable Ollama gets an answer rather than an exception — a diagnostic that
throws when the thing it diagnoses is down is not a diagnostic.

> **Learned.** **A field nothing reads is not instrumentation, it is a comment
> in a slightly more expensive form.** `fellBack` was correct, plumbed through
> three layers, and load-bearing for nothing. The bug was never that the
> substitution went unrecorded; it was that recording felt like handling it.
> Worth grepping for the other end of any flag before trusting it: the
> consumer, not the producer, is what makes it real.
>
> Also: an entry describing the state of a machine ages badly. This one
> asserted six specific models were missing, and the machine changed
> underneath it. Entries that name environment facts should say how to check
> them, not what the answer was on the day.

### [x] Hosting blockers — what a stranger hits

*Priority: HIGHEST. No model. Nothing here is taste.*

Four things that made the box unsafe or wrong to hand to people who are not the
operator. All concrete, none needing the gateway — which is why they were done
the session the gateway stayed down.

- **[x] The dev account store cannot travel.** Not by an empty database and not
  by a reset step: `config/` is now excluded from the Docker build context by
  default with only the two committed templates re-included, and `/data` is a
  named volume that starts empty. `test/buildcontext.test.js` holds the
  property. `docs/DEPLOY.md` records what a fresh box starts with.
- **[x] An unconfigured operator identity is reported, not rendered.**
  `identityStatus()` in `src/ai/identity.js` answers missing / template /
  incomplete / ok, on `donorStatus`'s model, and the boot log and Admin →
  System both read it. `config/identity.yaml` is reset to the template; the
  real values are the operator's to enter.
- **[x] `uniqueSlug` no longer reads other accounts.** An owned deck gets an
  opaque four-character token whether or not anything collided, so its presence
  reports nothing. Ownerless decks — CLI, tests, single-operator installs —
  keep the readable counter.
- **[x] The report donor is per account.** `donorDirForDeck(deckDir)` resolves
  it from the deck's own owner, so no caller threads a user through and an
  admin rendering somebody else's report still draws it on theirs. An account
  supplies its own under Settings → Identity → Report template; anyone who
  uploads nothing falls through to the operator's default.

**Look-ahead.** *Surfaces nothing has ever run* needs a test account driving the
UI against a real deck, and that is now the way to check this work too — the
donor panel was verified by driving it as two accounts. *Measuring content
quality* is unaffected: none of this touches what a model writes. Nothing in
the roadmap wants the flat `decks/<slug>` layout changed, so the opaque token
was preferred to a `decks/<tenant>/<slug>` reshape that every path join, the
preview and download routes, the scheduler and the `deckscore` CLI would have
had to learn.

> **Learned.** Three of the four were worse than their entries said, and the
> reason was the same each time: each began as a single-operator design, grew a
> per-account version, and left the original behind as the silent default.
>
> **The account database was already in the image.** The entry read as
> housekeeping — a dev database that "must not travel". It was travelling.
> `.dockerignore` excluded `config/users.json` and `config/sessions.json`, the
> account store from *before* the SQLite migration, and named nothing about
> `config/forge.db`, which holds the same accounts plus password hashes, the
> encrypted BYOK vault and Auto usage. `config/uploads/` — users' own research
> documents — was not covered either. Both reached the image through `COPY
> config ./config`. Nothing at `/app/config` is read at runtime, because
> `FORGE_CONFIG_DIR` points at the volume, and that is exactly why it stayed
> invisible: an image layer is readable by anyone who pulls it whether or not
> the process opens it.
>
> The shape is the lesson, not the file. An allow-list of state to exclude
> fails on the unsafe side every time a subsystem adds something, and it had
> already failed twice over. Deny-by-default moves the failure to the loud
> side: forget to re-include a template and the image will not boot.
>
> **A suffix that appears only on a collision is still an answer.** The obvious
> fix for `uniqueSlug` is to replace the counter with a random token, and it
> does close the count — but a user who asks for a title and gets a clean slug
> has learned nobody else holds it, and one who gets a suffix has learned
> somebody does. Only an unconditional token says nothing. That is why the
> ownerless path keeps the counter rather than sharing the new one: a
> single-operator install has nobody to leak to, and `npm run deckscore
> perovskite-solar-cells-stability-challenges-2` has to stay typable.
>
> **`fail()` returns the response, not undefined.** Factoring the two donor
> uploads into one helper, the natural `return fail(res, 400, …)` inside it
> gives the caller a truthy value, its `=== undefined` guard misses, and the
> route answers twice. Any helper that can both reply and return has to say
> null in as many words.
>
> **Verifying it needed two accounts, not one.** Every per-account boundary
> here is invisible from inside a single session: one account uploading a
> template looks identical whether or not it overwrote everybody else's. The
> check that meant anything was A uploads, then B reads — and B still seeing
> the operator's default is the whole feature.

### [x] The report's structure — read from the template, not hardcoded

*Priority: high. The report is the graded artefact, and this was found on the
way to running it end to end. No model was available for the content half —
the TCET gateway is still wedged and local Ollama was in use for other work —
so everything below was verified by grammar analysis, by an obedient stub, and
by rendering real `.docx` files and reading them back with `pdftotext -layout`.*

Four defects, all on the report path, all of the same family as the five
"the right answer was unrepresentable" findings from the previous session.

**1. A team of four or fewer got a report with no body.** The section budget
was `targetSections(identity, {min: 4})` — the deck planner's "one part per
presenting member" rule, borrowed. The cap counted the TOTAL sections with a
floor of four, while the planning prompt separately requires the four-section
graded core, so every team of four or fewer spent its entire budget on the
frame and Theoretical Background, Application and Future Scope could not be
planned at all. `report-new` is solo by construction and could therefore only
ever emit Abstract/Introduction/Conclusion/References. It had already shipped:
`decks/topic-exploring-first-impressions-and-networ/report.yaml` has no body
section. The report's structure is now the institution's, not the team's.

**2. The section list was ours, not the template's.** The renderer never cared
what a section was called — `buildBody` emits `content[name]` for any name,
which is how the Image Credits appendix has always numbered and paginated
without being in the graded eight. What was fixed was the LIST.
`parseDonorSections` now reads the donor's own numbered heading run and
`reportStructureForDeck` hands it to the planner, so a college whose report has
a Methodology gets one by uploading its template. Bold is the discriminator,
not numbering: a reference list is the other consecutively numbered thing in
the document and starts at 1 too. Tables are skipped so the template's own TOC
is not read as a second copy of the structure.

**3. A section the topic earned was dropped.** `sanitizeReportPlan` matched
every planned name against the fixed eight and discarded the rest. The planner
may now add up to three sections of its own. Their POSITION is decided during
coercion because it cannot be recovered later — sorting by structure index says
nothing about where a section that has no index belongs — anchored to the last
structural section listed before it and clamped away from the final position so
an appendix cannot be planted after the References. The plan grammar's `name`
went 30 → 60 characters: 30 spells the eight fixed names and nothing else.

**4. The writer was told not to repeat sections it was never shown.** The
system prompt said "do not repeat wording already used in another section"
while `report.content` was built empty and never filled, so only the title ever
reached the message. Each call now carries the plan outline and the opening
line of every section already written — and only prose that passed its own
grammar, so a dropped section is not fed forward as something to avoid.

Alongside: `deck-from-report` read `meta.yaml` *after* planning, so a companion
deck was planned at the 24-slide default whatever the user set, and built its
brief by walking the graded eight, which would have silently omitted exactly
the topic-specific material the deck most needs.

> **Learned.**
>
> - **A rule that is right for one artefact can be wrong for its neighbour, and
>   sharing the helper is how it travels.** Sizing structure to the team is
>   correct for a deck — a talk is divided between the people giving it — and
>   wrong for a report, whose structure is set by whoever grades it. Nothing
>   flagged the reuse; `targetSections` simply took a different `min`.
> - **A test can encode a defect as an intention.** `planReport sizes the
>   section cap to the team — small team, small report` asserted the result was
>   exactly `[Abstract, Introduction, Conclusion, References]`. Someone read
>   that list as "a small report" rather than as "a report with no body". The
>   assertion was the reason nobody looked again.
> - **A stub that ignores the bound it is handed makes the whole suite blind to
>   bounds.** `fakeChat` returned six sections whatever `maxItems` said, so no
>   assertion in the file could reach a cap the real grammar-constrained model
>   is held to. Obedience has to extend to the section grammars too — the first
>   obedient stub still returned four paragraphs into an Acknowledgement that
>   allows two, and the dropped section read as a planning bug.
> - **Ask what the renderer actually requires before assuming a constant is
>   load-bearing.** `REPORT_SECTIONS` looked like the report's foundation. It
>   was one `filter` in `presentSections`; `IMAGE_CREDITS` had been proving the
>   renderer was general for as long as it had existed. The expensive-looking
>   half of this work was already done.
> - **When the section list stops being fixed, everything that walked it is
>   suspect.** `presentSections` was the obvious one. `reportBrief` in
>   pipeline.js walked it too, and would have dropped a custom section's prose
>   from the companion deck's brief without any error.
> - **A rendered artefact answers questions an intermediate cannot.** Rendering
>   `report.yaml` through the real donor and reading it back with
>   `pdftotext -layout` confirmed the two-pass TOC page numbers are exact on
>   every section including a custom one, and that the tail renumbers. Nothing
>   asserted on `report.yaml` could have shown that.

### [x] Metering in the unit the operator is actually billed in

*Priority: high, no model needed. `PRODUCTION.md` §2.3 called this the first
thing to do on the payments track, because nothing can be priced honestly until
it is done.*

The quota counted "requests". The operator is billed in tokens. `auto_events`
has had a `tokens` column since it was created and every call site wrote 0 into
it, so `weeklyTokens` was a cap nothing could reach and a 24-slide dense deck
with deep research cost exactly what a 10-slide sparse one did.

**The numbers were never missing.** `chat()` has always returned `promptCount`
and `evalCount` for both transports. Every caller above threw them away. What
was missing was somewhere to add them up, which is now an async-local meter —
the same shape as `src/account.js`, for the same reason.

**Four routes were spending with no quota check at all**, found while wiring
it: `report/generate` (the entire graded report), `script` (a model call per
slide), `sweep` (rewrites every slide) and `generate/resume`/`finalize` (the
rest of a plan, then the field-length, coherence, image and critic passes).

**Tiers**, so an account can be given headroom without raising the caps for
everybody. **Reserve-then-settle**, so a run that failed after two model calls
is charged for two model calls.

> **Learned.**
>
> - **A column that exists is not a feature that works.** `tokens` was in the
>   schema, in `recordAutoEvent`'s signature, in `checkAutoLimits`' comparison
>   and in the limit config. Every layer was built. The value was 0 at every
>   call site, so the whole chain was decoration — and it read as finished in
>   every file you might open to check.
> - **Two caps in different units silently disagree.** The token budget shipped
>   at 80,000 against a slide budget of ~4 decks a week; the estimator puts one
>   22-slide researched deck at ~244,000. A third of a single deck. It could
>   never bite because nothing counted, so the contradiction sat there. The
>   test now asserts the two budgets agree, in decks.
> - **Look for what a new subsystem reveals about the old one.** Wiring the
>   meter meant visiting every route that reaches a model, which is the only
>   reason anyone noticed that four of them had no quota check. The audit was a
>   side effect of the feature, not a task.
> - **Metering must follow the work, not the request, when the work outlives
>   it.** `/generate` returns as soon as the run is registered so a client can
>   drop and reattach; a request-scoped meter would have recorded almost
>   nothing for the most expensive operation in the product.
> - **An estimate is safe only because something reconciles it.** The
>   reservation has to be taken before the cost is knowable. That is tolerable
>   because `settleAuto` replaces it minutes later — without the second half,
>   every estimate would be a permanent charge and the constants would have to
>   be right first time.
> - **The estimate is still an estimate.** `estimateTokens` is derived with its
>   arithmetic written down rather than tuned, because the gateway is down and
>   nothing has measured a real run. It wants calibrating before anyone is
>   charged against it.

### [x] Add a slide to a finished deck, written like the others

*Priority: high. No direction needed — the primitive exists and the surface
does not.*

`insert_slide` and `append_slide` are in the ops grammar, `applyOps` handles
both, and a chat turn can already say "add a chart after slide 5". So the
capability is there and the feature is not, which is the worst of the two
states: a user who wants one more slide has to know to phrase it as chat, and
what they get back is written by the CHAT path rather than the writer.

That difference is the whole item. `writeSlide` gives a new slide the writer's
grammar scoped to its own type, a purpose from the plan, retrieved research for
that purpose, and the field-length and coherence passes afterwards. A chat turn
gives it the merged ops grammar, whatever research the turn happened to carry,
and no post-passes. The slide that comes out is visibly not a sibling of the
ones around it.

What it should be:

- **A first-class action on a slide**: "add a slide after this one", the way
  convert already sits on `/slides/:index/convert`. A route, an affordance in
  the deck view, not a sentence the user has to compose.
- **Content written by the slide writer**, not the chat turn. The insertion
  point implies a purpose: it sits inside a section, between two slides whose
  headlines are known, so a purpose can be derived the way `mintedSpec` already
  derives one for a padded slide. That purpose is also the retrieval query, so
  the new slide is drawn from the same research as its neighbours.
- **The plan updated too.** A deck whose `deck.yaml` has a slide its
  `plan.yaml` does not know about will lose it the next time anything replans,
  and `assignPresenters` will not give it an owner.
- **A type chosen, not asked for.** The user wants a slide, not a `feature-grid`
  — the writer already picks types against the composition rules, and the
  neighbours say what would not be a repetition.

**The motivating case is a run that stopped.** Someone generating a deck hits
their quota, or a run drops, and the deck exists but is short. Today the answer
is resume — which continues the *approved plan*. There is no answer for "the
plan is finished, the deck is fine, I want three more slides in the middle",
and after tiering that is exactly the shape of a user who has just paid for
more headroom and wants to spend it on the deck they already have.

> **Look-ahead.** This shares its whole spine with the turn grammar item above
> (§ *A turn's grammar is built from every type at once*): a first-class insert
> is a single-type write, so it takes `onlyTypes` and gets an exact grammar for
> free. Build it on `writeSlide` rather than on `runTurn` and the grammar
> question does not arise.

> **Learned.**
>
> - **A capability is not a feature.** `insert_slide` was in the ops grammar
>   the whole time and chat could emit it, which is why this read as done. What
>   was missing was a surface and — far more importantly — that the slide be
>   written by the WRITER rather than the chat path. The op existing is what
>   made the gap invisible.
> - **The writer must be shown the deck up to the insertion point.** It is
>   handed "SLIDES SO FAR"; passing the whole deck would tell it that slides
>   after this one had already been said.
> - **The type has to be decided before the grammar can be built.** `onlyTypes`
>   scopes the ops schema, so asking the model which type it wants would be a
>   round trip to answer a question the deck can answer itself. Choosing by
>   least-used family gives five different families over five inserts.
> - **The plan is not bookkeeping.** A slide in deck.yaml but not plan.yaml is
>   lost at the next replan and never given a presenter.

### [ ] A provider key, so the money figures stop being derived

*Blocked on the operator, not on code. Expected — a key is coming, but not
immediately, so nothing should be planned around having one this week.*

Everything monetary in `docs/ECONOMICS.md` rests on ~4 characters per token,
illustrative price bands, and a count of research-carrying calls read from the
source rather than observed. One 22-slide generation through any paid key
settles all three at once, and `meterSummary()` breaks the total down per role
so it reports exactly where the tokens went.

It is also now the cheapest it will ever be to run: per-slide retrieval took a
deck from ~1.6M tokens to ~135K, so the measurement run costs about a rupee at
the budget band.

**Until the key exists**, treat every ₹ figure as an order of magnitude and do
not publish a price against it. The constants in `src/usage.js` lean
conservative on purpose — they over-estimate, so a reservation refuses early
rather than overspending — which is the safe direction to be wrong in while
waiting.

The same key unblocks: the report content run, chat and convert turns through
the UI, `--upload` research, and the research-to-page flow. Those are the
sessions to plan for the day it arrives.

### [x] The free tier should be a trial, not an allowance

*Priority: high, and it decides what the paid tiers can be. No model needed.*

Every quota in `src/limits.js` is a ROLLING WINDOW — five hours, seven days —
and a rolling window resets. That is correct for fair use on a free campus
gateway and wrong the moment the key costs money: a user who waits gets
unlimited decks, forever, at the operator's expense. The exposure per account
is unbounded and cannot be budgeted.

A lifetime trial is bounded by construction. Measured against the shipped
per-deck cost (`docs/ECONOMICS.md`):

| free tier | exposure per signup | 1,000 signups |
|---|---|---|
| 4 decks/week, one semester | ₹110 – ₹439, *and it never stops* | unbounded |
| **3 decks, lifetime** | **₹5.15 – ₹20.59, once** | ₹5,100 – ₹20,600 |

Twenty-one times cheaper, and — the part that matters for a one-person
operation — a number that can be written on a page in advance.

**What to build.** `checkAutoLimits` counts events since a cutoff; a lifetime
cap is the same query without one. The pieces already exist: `auto_events` rows
are never deleted before 30 days (`pruneAutoEvents` would have to spare the
counter, or the count moves onto `users`), tiers exist, and `settleAuto` means
the count is of real spend rather than of estimates.

Keep the rolling windows on top as ABUSE protection, not as the product limit —
they stop a script, and the lifetime cap decides what is free.

**The open risk is signup, not metering.** A lifetime cap makes each new
account worth exactly three decks, so the pressure moves to making accounts.
Email confirmation already exists and is enforced whenever SMTP is configured
(`mailConfigured()`), which is the cheapest real deterrent and another reason
§1.2 is a launch blocker rather than a nicety.

> **Decide alongside this**: whether paid is a subscription or non-expiring
> credits. A student's need is bursty — nothing for two months, four decks in
> exam week — so credits fit the use and subscriptions fit the revenue.

> **Learned.**
>
> - **A rolling window cannot bound anything.** Every cap in the file was one,
>   which is right for fair use on a free gateway and wrong the moment the key
>   costs money: waiting refills it, so exposure per account is unbounded.
> - **Derive the counter from rows and the prune will refill it.**
>   `pruneAutoEvents` deletes past 30 days, so a lifetime cap computed from
>   `auto_events` would quietly reset every month — the exact property the cap
>   exists to remove. It is a running total on the account.
> - **The remedy has to reach the new limit.** `clearAutoEvents` is the
>   operator's only lever for someone wrongly capped, and it would otherwise
>   not have worked on the one limit that never recovers by itself.
> - **Two limits cannot both be the binding one in a test.** The trial and the
>   rolling caps needed separate fixtures; a test where the wrong one refuses
>   is a test about nothing.

### [ ] Prompt caching, if the numbers still need it

*Priority: low, and deliberately so. Blocked on a provider being chosen.*

The third of the three cost levers in `docs/ECONOMICS.md` §4, and the only one
not taken. Cached input typically prices near 10% of list, so a stable prefix
is worth roughly ten times.

**Retrieval has already taken most of what this would have.** A deck went from
~1.6M tokens to ~135K, and the remaining per-call payload is small enough that
another 10x on part of it is a smaller prize than it sounds. There is also a
real tension: caching wants a large IDENTICAL prefix and retrieval wants a
small variable one, so they partly cancel. The sensible combination is a cached
stable prefix — system prompt, slide catalogue, theme voice, and a small shared
research core — plus the short retrieved tail per call.

**Do not build it blind.** The wire format differs per provider (Anthropic,
OpenAI and Google all offer some form and none of them the same one), so this
waits until a provider is actually chosen, and then only if a measured run says
the cost still needs it. Guessing at three formats to save money that may
already be saved is the wrong order.

### [ ] Selling it: tiers, checkout, and what a refusal offers

*Priority: high once money is involved, and blocked on two decisions plus the
legal work. No model needed for the code.*

`docs/ECONOMICS.md` §5 has the tier model and the numbers behind it; this is
the entry for building it. The metering underneath is done — tokens are
counted, reservations settle at actual spend, accounts carry a plan, and the
free tier is a lifetime trial that does not reset.

What is left, in order:

- **Settle subscription vs non-expiring credits** (`docs/BLOCKED.md` §3.2).
  Everything below depends on it: credits need a balance and a top-up, a
  subscription needs a renewal date and a cancel path. Building either before
  the answer means building both.
- **The checkout.** Razorpay or Stripe: an order created server-side, their
  hosted checkout, a webhook whose signature is verified, the account marked.
  A day or two — `docs/PRODUCTION.md` §2.1. The account system, the
  admin-gated settings layer and the per-account key store already give it
  somewhere to hang.
- **The refusal as a surface.** Half done: the usage panel shows the trial and
  how much is gone, and a 429 carries the tier and every remaining budget. What
  is missing is the moment of refusal becoming an offer, and that cannot be
  designed until there is something to buy.
- **Confirm the tier numbers against a measured run.** The margins in
  ECONOMICS §5 rest on a derived per-deck cost. Publishing a price against a
  derived figure is the one thing not to do.

> **Look-ahead.** The legal and entity work (`PRODUCTION.md` §2.2) is the long
> pole and is unaffected by any of the above — registration, KYC, GST, a
> published refund policy. It can start before a line of checkout code and
> should, because it is measured in weeks and the code is measured in days.

### [ ] Who this is sold to, beyond one college

*Priority: medium, and not an engineering item — recorded here because it was
discussed and would otherwise live only in a conversation.*

The structural read: **the college is the beachhead, not the market.** Every
engineering college in India runs some version of the same assignment against a
fixed template, and the product now reads the template rather than assuming
one — a different college's format is a donor upload, not a code change. That
is what makes the market bigger than one campus, and it is already built.

Which suggests expansion college by college — one student who likes it per
campus — rather than anything needing a marketing budget that does not exist.
The free trial is the advertisement: three decks is enough to finish one real
assignment and show somebody.

Two things follow from that and are engineering:

- **`Auto` must not name one institution.** Done — the tier is named for its
  role now, and the gateway's identity lives in its label and baseURL where it
  is true.
- **A second donor template is the cheapest possible test.** `parseDonorSections`
  reads a template's own heading run, and nothing has ever been run against a
  template that is not TCET's. One borrowed `.docx` from another college would
  tell us whether "it just works" is true or hopeful.

### [ ] Surfaces nothing has ever run

*Priority: high. Some need a model, none needs the gateway specifically.*

Every path below is a real user journey with zero end-to-end runs behind it.
They are listed together because the answer to "does the product work" is not
knowable while they are unexercised.

- **[x] The browser UI against a real deck.** Driven for the first time, on an
  owned copy of the real generated deck: all four project pages, the slide
  grid, downloads and the export menu. **It found two defects that no test
  could see, one of them total.** Chat and convert *turns* remain unexercised
  through the UI — they need a model.
- **[x] Auth flows** — register, login, password reset, email verification.
  Run end to end for the first time via `npm run dev:mail`, which starts
  `tools/mailsink.mjs` alongside the app: register → confirmation mail →
  unverified login (allowed) → workspace write refused 403 `email_unverified`
  → confirm → forgot password → reset mail → new password → old credential
  dead, new one live, verified state preserved, reset token single-use.
  **It found one defect**, below.
- **`--upload` research**, **`report-new`**, **`deck-from-report`** — three
  entry points, no runs *with a model*. The report machinery below them has now
  been driven end to end without one: `generateReport` against the real donor
  with an obedient stub, through `renderReport`, to a `.docx` read back with
  `pdftotext -layout`. That found four defects (see *The report's structure*)
  and leaves exactly one question open — whether what the model WRITES into
  those sections is any good, which only Auto can answer.
- **[x] Presenter assignment with a real team.** Run for the first time, with
  a four-member team and `--slides-per-member 4`, and verified by rendering
  rather than by reading the deck object: team roster on the title slide, the
  one assigned member in every content slide's footer, dividers carrying only
  the slide number. **No defect** — the one thing in this session's list that
  was already right.
- **[x] Rate limits and quotas** under real load. Driven through the real HTTP
  routes on an isolated instance: 10 and then 30 simultaneous `POST /api/decks`
  against a budget of 2 admitted exactly 2. The expected TOCTOU **did not
  reproduce** — nothing between the check and the record yields to the event
  loop — but that safety was undocumented and one `await` from gone, and ten
  same-tick callers were all admitted. `reserveAuto` makes it structural.
- **[x] The vision critic loop.** Watched for the first time, on a real
  22-slide deck. It found one defect and the defect was real — a card body cut
  mid-word, read off the rendered PNG with every mechanical check clean. Its
  fix then failed, and could not have succeeded: the turn grammar is built from
  every slide type at once. **Two defects out of one round**, both above.

> **Learned (the browser UI).** Two defects, and the shape of both is the
> reason this item exists.
>
> **In-app navigation did nothing at all.** Every route transition changed the
> URL and left the view where it was — the project tabs, the sidebar's Themes
> link and the back button alike — and only a reload showed the page asked
> for. The `applyHash` subscription was written without a dependency array,
> the ordinary way to keep a handler's closure fresh, so it re-subscribed on
> every render. A hashchange then dispatches, the sibling `setHash` listener
> runs first, React flushes that render *synchronously* because hashchange is
> a discrete event, the flush runs the effect's cleanup, and the cleanup
> removes the listener while the same event is still dispatching. The DOM spec
> says a listener removed mid-dispatch is not invoked. Re-dispatching the same
> hash worked, because `setHash` was then a no-op and nothing re-rendered —
> which is exactly what makes it look like the router is fine.
>
> It was introduced by `c1dab18`, the commit that added the reset and verify
> screens, one day before it was found. `router.js` is pure and unit-tested and
> its tests still pass, because nothing was wrong with the helpers.
>
> **Export → Bundle (.zip) answered 401 for everyone.** `downloadBundle` was a
> raw `fetch` with no headers. The bundle is a POST under the deck workspace,
> and state-changing routes ignore the session cookie on purpose, so it carried
> no credential at all. Every other helper goes through `call()` or spreads
> `authHeader()`; bypassing the wrapper is what loses the header.
>
> **Both are browser-only by construction**, which is worth stating plainly:
> this repo has no component-test infrastructure, so neither defect was
> reachable from `npm test` and neither would be reachable by a test written
> today. That is a real gap and a decision to make, not an oversight to fix in
> passing — see the unchecked item below.

> **Learned (auth flows).** The reason these were never run is not that nobody
> got round to it. `mailConfigured()` is load-bearing beyond sending: with no
> SMTP the app marks new accounts verified on creation, so the verification
> path does not merely go untested on a dev box — it never executes. The
> missing piece was a mail server, not a test, which is why
> `tools/mailsink.mjs` is committed rather than improvised.
>
> **The defect it found was a screen lying about a success.** Confirming an
> address reported "that confirmation link has expired or has already been
> used" for a link that had never been used — and the address was confirmed all
> the same. The effect ran twice, the first call spent the single-use token and
> had its result thrown away by its own cleanup, and the second reported the
> token as spent. The only offer on that screen is "ask for a new one", which
> issues a fresh token and does it again: a loop with no exit that leaves the
> account already verified.
>
> The near-miss is the guard the code already had. A `let live = true` cleanup
> flag stops a stale render and does nothing about a request that has already
> gone — for an exchange that cannot be repeated, the guard has to sit in front
> of the call. `app/web/src/lib/singleflight.js` is that, and it is a shared
> promise rather than a done-flag so a second caller reads the same outcome.
>
> **The verification gate is narrower than its own docstring suggests.**
> `verifiedRequestOnly` reads as "reading is free, changing anything is not",
> but it only applies under the four prefixes `deckWorkspace` is mounted on
> (`/api/decks|reports|presets|briefing`). `/api/identity`, `/api/brand`,
> `/api/donor` and `/api/keys` are outside it, so an unverified account can
> write its settings — which matches what `docs/DEPLOY.md` promises ("can sign
> in, browse and hold its own Cloud key"), but the default-deny is per route
> *within* a mount, not per route. A new top-level prefix is not covered by
> anything. Worth knowing before adding one.

### [x] "Auto" is bound to one institution's name, not to a role

*Priority: medium, and it rises the moment this is hosted for anyone outside
the college. No model.*

TCET's CoE provides **a model endpoint and nothing else** — no support, no
quota administration, no relationship with this product's users. Two places in
the product implied otherwise and are fixed: the Legal and Contact pages routed
users to a "CoE coordinator" for Auto quota and access, which named a third
party as this app's support and access authority.

What remains is naming. The free tier is not a role in the code, it is the
literal id `tcet-auto` and the literal env var `FORGE_TCET_API_KEY`:

- `autoProvider()` (`src/cloud.js:224`) looks up `providers["tcet-auto"]`
- the encrypted operator key is stored under `provider = "tcet-auto"`
- every function in `src/limits.js` defaults `provider = "tcet-auto"`
- `kind: "tcet"` reaches a UI label

**This does not block replacing the upstream.** Point
`providers["tcet-auto"].baseURL` at OpenRouter, DeepInfra or any other
OpenAI-compatible endpoint and put its key in `FORGE_TCET_API_KEY`, and Auto
works with no code change — which is the honest answer to "what if TCET goes
away". The cost is that `config/models.yaml` then names one institution while
serving another, and the admin panel says so to the operator.

The fix is a rename to a role — `auto` / `FORGE_AUTO_API_KEY` — reading the old
names as fallbacks so no deployment breaks, and a migration for the
`global_keys` and `auto_events` rows keyed by the old id. Worth doing before
anyone outside the college is invited, not before.

> **Learned.**
>
> - **A rename is only safe if the old name still resolves, in BOTH
>   directions.** An upgraded install has the old env var in its compose file
>   and the old rows in its database; a fresh one has neither. Reading only the
>   new name breaks the first, and migrating without a read-fallback breaks
>   anything the migration cannot reach.
> - **Rename the rows, or the user sees a reset.** `auto_events.provider` and
>   `global_keys.provider` both held the literal. Left alone, spend history
>   would appear to vanish and an admin-uploaded key would appear to be gone —
>   both silent, both alarming, neither an error.
> - **The column DEFAULT is part of the rename.** `auto_events.provider`
>   defaulted to the old literal, so a fresh database would have started
>   stamping new rows with it. Nothing hit it, because every caller passes the
>   provider explicitly — which is exactly why it would have survived a review.
> - **The test fixture was already the compatibility test.** `modelchoices`
>   writes the old provider block and the old env var; it kept passing through
>   the whole rename, which is the evidence the fallback works. Only its `kind`
>   assertion needed changing, and that assertion WAS the defect.
> - **Keep the institution where it is true.** The gateway's `label` and
>   `baseURL` still name TCET, because that is whose gateway it is. What was
>   wrong was the tier, the env var and the id.

### [ ] Nothing can test the browser

*Priority: high. No model. Needs a direction agreed before any code.*

Three defects this session existed only in a running browser and none was
reachable from `npm test`: the confirmation screen spending its token twice,
in-app navigation doing nothing, and the bundle button answering 401. Two of
the three were total — a whole surface inert — and all three survived a suite
that grew to 516 passing tests.

The pattern is consistent. `router.js` is pure and unit-tested and its tests
passed throughout, because the helpers were correct; what broke was how a
component subscribed to an event. `api.js` helpers are one line each; what
broke was one of them skipping the wrapper. Neither is a logic error a unit
test could reach, and both are the first thing a person notices.

This repo has no component-test infrastructure and adding one is a real
decision, not a chore — jsdom plus a React test renderer is a dependency, a
second test command and a body of test code with its own upkeep. The
alternatives are worth weighing against it: a scripted browser pass over the
surfaces that matter, run before a release rather than per commit, would have
caught all three and needs no new dependency, since the tooling is already
used to find them. **Agree the direction before building either.**

What is NOT in doubt is the trigger: a surface nobody drives is a surface
nobody has tested, whatever the suite says.

### [ ] Measuring content quality

*Priority: high. `npm run deckscore` is the deterministic half and exists.*

The standing gap all through the sweep: everything fixed was mechanical, and
"is the output any good" was answered by reading, on the gateway, by a person.
That is the right answer and it does not scale — so it happened rarely and
nothing accumulated between times.

**Done — the deterministic half.** `npm run deckscore <slug>` scores a deck out
of 100 across five components, each carrying its findings: intact, fits,
grounded, varied, whole. It needs no model and no opinion, so two runs can be
compared — Auto against local, before a prompt change and after. The real
generated deck scores 73, and every point it loses is a defect this session
found by hand.

**What is left is the half a number cannot reach.** Whether the deck ARGUES
anything, whether the research is any good, whether the report reads well. That
needs Auto and a person. What would make it accumulate rather than evaporate:

- A small fixed set of briefs, generated on Auto, kept as a baseline to read
  against — so "the output got worse" is a comparison rather than a memory.
  **Still open; needs a key.**
- ~~The score recorded per generation, so a regression shows up as a number
  before anybody notices it by eye.~~ **Done.** `finalizeDeck` scores the
  finished deck and appends to an install-wide `config/scores.jsonl` with the
  backend that produced it; `npm run deckscore -- --history [slug]` reads it
  back. A regression is measured against the MEDIAN of recent runs rather than
  the previous one, because scores move several points between decks on subject
  matter alone and "worse than last time" would fire constantly. Too little
  history reports nothing rather than a verdict from one data point.

> **Learned.** The scorer's own first run reported `whole` at 0% for every deck
> because it counted the deck TITLE as a sentence cut off mid-way. A headline is
> a noun phrase and ends without a full stop by design. A measure that is wrong
> in the same direction for every subject looks like a finding and is a bug in
> the ruler.

### [ ] Small defects and papercuts

*Priority: low individually, and collected here so they stop being rediscovered
one at a time. Each has a named symptom and none needs a model to fix, though
two need one to CONFIRM.*

Moved out of `docs/PRODUCTION.md` §5, which was a second list of work items
running in parallel with this one.

- **[x] Image progress printed a slide index where a counter belonged.** The
  supply emits `{ index }` (the slide) and `{ done }` (the counter), and both
  the CLI printer and the UI read `index`, so a one-image deck reported
  `images 3/1`. Fixed, along with six status frames the UI could not label at
  all — the whole post-write half of a generation read as "Working…".
- **[x] `looksCutAtCap` false-positived on headlines and labels.** It flagged
  any field at its cap without terminal punctuation, which is true of every
  headline ever written. Fixed by looking for what a cut actually looks like —
  a dangling function word, a lone letter, an open hyphen — and treating a
  single-token value and Title Case held to the last word as deliberate. The
  bias stays toward flagging: a cut field that ships is worse than a rewrite
  that was not needed.
- **[x] The coherence pass missed three near-identical headlines.** Not a
  faulty comparison — there was none. The pass asked a reviewer about topical
  drift and about data with no point, and never about repetition. It is now
  computed rather than asked about, because deciding whether slide 21 restates
  slide 18 means holding the whole deck in view and the reviewer sees a digest.
  Dividers are compared but never rewritten, which is what exposes the real
  defect: slide 18 is a section divider and slide 21 is a `framework` with the
  identical headline. Four real duplicates across the nine decks on disk, no
  false positives.
- **`feature-grid` carries two lines of speaker-note debt on `minimal-muji`** —
  the only failure in the `--notes` sweep. **Diagnosed:** it is a 1pt gap, not
  the 2pt the sweep used to claim. `minimal-muji` sets body at 13pt by design
  and `reportFloor` was naming the role floor (14) rather than the effective
  one; that message is fixed. The remaining gap is real but small, and closing
  it means either cutting the `body` cap for every theme or changing the card
  geometry for one — neither obviously worth it for one theme, one type, and
  only with a note present.
- **`illustrated-points` with an empty seat leaves the lower half of the slide
  empty**, and the vision critic flags it as `blank`. Equally true of a
  four-item `bullets` slide, so the question is whether the layout should
  breathe differently when no picture is coming. *A decision, not a bug.*

### [x] Housekeeping found during the audit

*Priority: low.*

Found in the plan-to-picture session. **The content-level items moved to
*Small defects and papercuts* above** — they were listed in two entries at
once, which is the thing the working agreement now forbids. What is left here
is the repository hygiene half.

- ~~`config/identity.yaml` contains `institution.name: HACKED`.~~ Fixed under
  *Hosting blockers*: the file is reset to the template and `identityStatus()`
  reports an unconfigured default at boot and in Admin. The real values are
  still gone — they are the operator's to enter in Settings.
- ~~`tools/fonts.manifest.json` carries a drifted `used_by` list.~~ Fixed: the
  field is derived from the themes and `test/fonts-manifest.test.js` holds it
  in both directions — no family a theme names is missing, and no family no
  theme uses is carried. Six were, which is six typefaces fetched and installed
  on every machine and in every container for nothing; the manifest is 21
  families now. It drifted because it was maintained by hand and read by
  nobody, which is the argument for deriving it.
- ~~The account store holds well over a hundred throwaway test accounts.~~
  Still true on the dev box and no longer able to travel: `config/` is
  excluded from the build context by default. See *Hosting blockers*.
- ~~`uniqueSlug` appends `-2`, `-4` on collision against a global namespace.~~
  Fixed under *Hosting blockers*: an owned deck gets an opaque token
  unconditionally; ownerless decks keep the counter.
- ~~A monochrome theme can only carry three or four distinguishable greys.
  OOXML pattern fills are the real answer.~~ **The premise was out of date and
  the real defect was elsewhere.** See *Chart colours* below.
- ~~The report donor is install-wide.~~ Fixed under *Hosting blockers*:
  `donorDirForDeck(deckDir)` resolves it from the deck's own owner, and an
  account uploads its own under Settings → Identity.
- ~~`POST /api/decks/search` is unreachable for non-admins.~~ Fixed: the route
  moves above `app.use("/api/decks/:slug")`, which was matching it first with
  `slug = "search"`. `test/routing.test.js` boots the server and asks it over
  HTTP as a non-admin — the first HTTP-level test in the suite, and the only
  shape that can catch a route-ordering bug at all.
