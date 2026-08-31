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
> A model will invent images. With no image-supply mechanism (F13 unbuilt), a
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

### [ ] (stretch) F13 image search — CC image lookup for model-emitted descriptions
The `[image]` notes the writer now emits (and the sanitizer preserves) are the
designated seam for supply: a slide that WANTS an image has a description the
app could search for (Unsplash source API or a SearXNG image category), opt-in.

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

Not built: **F13 image grounding** (search/download of CC images for
model-emitted filenames — design noted in Handoff) and **F16 i18n** (locale
number formatting + RTL — design noted in Handoff).

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

### [ ] Image supply — auto, not just upload

Today: upload an image → `assets/` → the slide is set to an image type with the real asset; invented URLs are stripped to `[image]` notes. What’s missing is **Gamma-like auto images**: when the writer wants an image, the system should find one, not just flag it. Design in `docs/HANDOFF.md` next-session notes: Unsplash Source / SearXNG image category, opt-in per deck, CC licence, cached in `decks/<slug>/assets/auto/`, `resolveAsset` prefers it, never invented. No model writes a URL.

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

These were **not** the next super-fancy tour; the tour stays separate. Briefing + Research + PPTs themselves + PPT themes are now done — the remaining backlog item (`Image supply — auto`) runs next. No rendering in this session per user — verification is user-side.

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

### [ ] Every theme against every slide type

*Priority: high. Renderer only, no model — `src/specimens.js` supplies content.*

34 themes × 75 types has never been looked at as a whole. The deterministic
half now exists and runs in about three seconds:

- `npm run themematrix` renders every theme against every type with
  `write: false` and reports every fit-floor failure; `test/themematrix.test.js`
  holds the set, which is now **empty**. With `--notes` it holds two, both
  `feature-grid` on `minimal-muji`, the tightest theme in the gallery.
- `test/contrast.test.js` holds the title and divider surface pairings and
  names the twenty-four that clear 3:1 but not 4.5:1.
- `npm run textcheck` rasterises and reads the text back; clean on the specimen
  and on the real generated deck.
- `tools/contrast-audit.mjs --types a,b` sheets any type across every theme,
  and `tools/slideqa.mjs` emits per-slide PNGs plus chunked contact sheets.
- `npm run capstress` renders types at their SCHEMA CAPS and rasterises them,
  which is the payload a model actually writes; `--scale 0.01` renders them at
  one character, which separates a layout that cannot hold anything from a cap
  that is merely generous.

What is left is the visual half — rasterise and look at all of it — plus paying
down the contrast list. **Render each type at its schema caps before looking**:
every defect the fixed-scale pass found that the sweeps were clean on came out
of doing that, and none of them was visible with the specimen's own payloads. Expect the algorithmic diagram types and the
dense data types to be where the failures are; the composition pass already
found that a narrowed measure breaks words inside cards, kpi tiles and team
grids without the fitter noticing.

A third instrument now exists — `npm run textcheck` — which rasterises to PDF,
reads the text back and reports every declared word that did not survive.
`--deck` on all three runs them against a real generated deck rather than the
specimen, which is where the interesting failures are: the specimen's payloads
are hand-written to behave, and a model writes a 130-character card body where
the specimen has 40. The same sweep reports eight failures on the specimen and
fifty-one on a real seventeen-slide deck.

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

### [ ] The visual audit, at schema caps

*Priority: medium. Renderer only, no model.*

`npm run capstress` renders any set of types at their schema caps and rasterises
them; `--scale 0.01` renders them at one character, which separates a layout
that cannot hold anything from a cap that is too generous. Every defect the two
passes above found that `themematrix` and `textcheck` were both clean on came
out of running it and looking at the page.

What is left is the rest of the gallery. The remaining known items:

- `feature-grid` is two lines of speaker-note debt on `minimal-muji`, the one
  theme that pairs an inset frame with generous margins. Its card is already
  derived end to end — the shape test finds no slack — and the shortfall is
  seven hundredths of an inch.
- `cards.cards[].body` seats 82 against a cap of 95.
- The types nobody has looked at full-size at their caps.

### [ ] The front end, and the landing page

*Priority: high. No model.*

Standing dissatisfaction with the whole surface, landing page first, with
motion and polish of the kind Framer produces. Distinct from the theme work:
this is the product's own interface, not the decks it renders.

### [ ] Reports — structure, and the wait

*Priority: medium. The speed half needs no model.*

Two complaints. The output does not feel good, which is a content and structure
question. And generation feels slow — the renderer alone is two LibreOffice
passes for the table-of-contents page numbers, before any model time, and that
half can be profiled and improved today against a committed `report.yaml`.

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

### [ ] Model configuration names models that are not installed

*Priority: medium. Blocks any local run.*

`config/models.yaml` addresses `qwen3-coder:30b-a3b-q4_K_M`,
`gemma4:26b-a4b-it-q4_K_M` and `qwen3:4b-instruct`, and its `fallbacks:` list
names three more. None of the six is installed on the development machine.
Role resolution therefore falls through silently, which section 9 already
identified as the cause of a thin outline once. The config should either name
what is actually available or fail loudly instead of degrading quietly.

### [ ] Housekeeping found during the audit

*Priority: low.*

- `config/identity.yaml` contains `institution.name: HACKED`; the real values
  are gone. Identity is per account now, so the fix is to set it in Settings.
- `tools/fonts.manifest.json` carries a `used_by` list per family that has
  drifted: six families are listed that no theme uses, and the field is
  documentation the install step does not read.
- The account store holds well over a hundred throwaway test accounts. Harmless
  locally, but that database must not travel to production.
- `uniqueSlug` appends `-2`, `-4` on collision against a global namespace, so
  creating a deck reveals whether a title already exists. Per-account slug
  namespacing would close it.
- A monochrome theme can only carry three or four distinguishable greys. OOXML
  pattern fills are the real answer for a mono chart with more series than that.
- The report donor is install-wide. A hosted box serving more than one
  institution needs it per account, like identity and brand.
