# CLAUDE.md

Guidance for Claude Code working in this repository.

`AGENTS.md` is the working agreement (commit discipline, roadmap process,
conventions) — read it before changing anything. This file is the operational
map: what the system is, how to run it, and the invariants that are expensive to
rediscover.

## What this is

Presentation Forge turns a topic into a themed `.pptx` deck and a companion
`.docx` report, for academic submissions. Node 24, ESM, no TypeScript. Same core
(`src/`) drives three surfaces: a CLI (`src/ai/pipeline.js`), an Express API
(`app/server/index.js`), and a Vite/React UI (`app/web/`).

```
brief → research → outline → HUMAN GATE → content → validate → render → preview → critique
         notes.md  plan.yaml               deck.yaml            .pptx     PNGs
                                                                .docx
```

## The rule that governs everything

**The model never writes layout.** Three strictly separated layers:

| Layer | Owns | Written by |
|---|---|---|
| chrome | crest, banner, presenter line, slide number | `src/chrome.js`, locked code |
| theme | palette, type, spacing, shape | `themes/*.yaml`, human-authored |
| content | what the slides say | the model, as schema-validated YAML |

A change that lets content specify a coordinate, a hex colour, or a font name is
wrong however convenient it looks. If a slide needs a layout that does not
exist, add a slide *type*, never an escape hatch in the schema.

Themes split into `tokens` (exact machine values, read only by the renderer) and
`voice` (tone guidance, read only by the model). These must never overlap — the
moment a model can see a hex value it starts inventing them. A theme-contract
test machine-checks the split.

## Commands

```bash
npm run dev                                 # API :5174 + UI :5173
npm test                                    # node --test over test/
npm run render decks/<slug>/deck.yaml       # content -> .pptx
npm run preview decks/<slug>/out/deck.pptx  # .pptx -> PNGs + thumbs
npm run forge -- new "<topic>" --research   # headless: outline
npm run forge -- generate <slug> --critic   # headless: deck
npm run fonts                               # download + install the 27 families
npm run brand                               # normalise brand/logos -> brand/generated
npm run landing                             # re-render the landing page's imagery
npm run searxng                             # local search backend (docker)
```

Note `npm run dev` starts the UI on 5173 and the API on 5174 (`FORGE_API_PORT`,
deliberately not `PORT`). Vite proxies `/api` so the browser stays same-origin.

The API and every CLI entry point load a gitignored `.env` from the repo root
(`--env-file-if-exists`), so a gateway or provider key lives there rather than
being exported per shell. `.env.example` is the template for both this and the
container.

## Verification that actually proves something

A written `.pptx` proves the file parsed, nothing more. `pres.writeFile()`
succeeds for decks with text running off the canvas and invisible-on-invisible
colour pairs. **Rasterise and look at the image** before claiming a render
works. That is why `src/preview.js` exists.

The checks answer the mechanical half across the whole product, and they find
disjoint sets — each was added because the ones before it were clean on a defect
that shipped:

```bash
npm run themematrix              # every theme x every type: what will not fit, ~3s
npm run themematrix -- --notes   # the same, with a speaker note on every slide
npm run textcheck                # every declared word survived onto the page
npm run drawcheck                # every field the schema offers reached the page
npm run coverage                 # which themes a sweep must look at; --without <t> costs a deletion
node --test test/contrast.test.js   # title and divider surfaces carry their ink
node tools/capfit.mjs            # what length each field can actually be
npm run capstress                # every type at its caps, rendered — then LOOK
npm run capstress -- --scale 0.01   # ...and at one character: the layout, not the caps
```

They ask four different questions, in this order:

1. **Is the box on the slide?** The geometry watcher (`src/geometry.js`) runs
   inside every render, so `themematrix` answers it for free. A non-positive
   extent for any shape, and the canvas edges for text and images. pptxgenjs
   writes a negative width without a word and LibreOffice draws something that
   is not the shape — a caption computed to a negative height came out with its
   title and body printed on top of each other.
2. **Was the field drawn at all?** `drawcheck` writes a marker into each field
   and reads back what the layout emitted. Text that is never drawn is never
   fitted, so the fit sweep sees nothing and the text check has nothing to miss.
3. **Does the text fit the box?** `themematrix`, and `capfit` for the length a
   field can actually be.
4. **Did it survive the render?** `textcheck` rasterises and reads it back.

All of them take `--deck decks/<slug>/deck.yaml`, and that is the point: the
specimen deck's payloads are hand-written to behave, so the same sweep is clean
on the specimen and reports 45 failures on the one real generated deck on disk.
Audit against real content or the audit is measuring the specimen.

Most of that 45 is a deck written before the caps were corrected — its card
bodies run 122 to 209 characters against a cap of 95, and `loadDeck` warns on
length rather than refusing, so it still renders and the fitter still says what
does not fit. A rising count after a cap cut is the caps working, not the
renderer breaking; check the deck's field lengths before assuming a regression.

**A field the fixture does not carry is a field nothing has ever rendered.** A
speaker note reserves 0.7in off every content slide and the specimen carries
none, so `--notes` found 29 failures the first time it ran. The same blind spot
applied to twelve optional fields, which is how four layouts came to drop
content the schema offers without a check noticing — and then to `standfirst`,
which the specimen omits on 69 of 73 types and which no cap, sweep or render had
ever carried. `drawcheck` reports what the specimen does not populate as well as
what the layouts drop, because that half is the one nothing else can see.

None of them replaces looking. A wrapped figure fits its box fragment by
fragment; a five-character value is under the text check's word floor; three
Venn labels printed on top of one another with every check clean. `npm run
capstress` is what makes looking worth the time — it renders the payload a model
writes rather than the one the specimen was written to behave at.
`tools/slideqa.mjs` renders every type full size and `tools/pixels.mjs` measures
contrast on the pixels actually painted — a plate theme's ground is not its
palette token.

**A theme that does not earn its place should be deleted, and one check runs
first.** The gallery is deliberately large; cutting a weak theme is a normal
edit, not a loss. The only thing deletion breaks that looking cannot see is
COVERAGE — a theme may be the last one selecting a frame, an opening or a list
treatment, and deleting it does not fail anything, it just means that branch is
never rendered by any sweep again. `npm run coverage -- --without <names>` says
whether that is what is about to happen. Today no theme is a sole carrier; five
are one of two (`editorial-magazine`/`newsprint` for two-column lists,
`sci-fi-hud`/`isometric-dark` for the sidebar frame, `letterpress` for dropcap).
If an axis really is unwanted, delete the branch from `src/composition.js` as
well — a value no theme selects is dead code.

**Look at eight themes, not 34.** 34 x 73 is 2,482 slides and nobody looks at
that, so the sweep stops happening. They do not need to: the layouts branch on
composition axes — the frame, the opening mark, the alignment, the list columns,
the plate — not on themes, so a set carrying every value of every axis renders
every branch and the other 26 are the same code in different colours. That set
is `COVERING_THEMES` in `src/coverage.js`, it is what `npm run capstress`
defaults to, and `test/coverage.test.js` fails when a theme introduces a value
none of them carries. When it does, add a theme there — do not widen the sweep.

`docs/TRAPS.md` is the cross-cutting failure list (PowerPoint autofit, LibreOffice
headless no-ops, pptxgenjs silently dropping unknown options, font measurement).
Read it before touching the renderer or the fitter.

## Layout of the code

```
src/render.js      deck -> pptx; owns the background/plate decision
src/layouts.js     the 73 slide-type layouts (4k lines — the bulk of the renderer)
src/fit.js         text measurement and shrink-only fitting, per-role floors
src/chrome.js      locked institutional marks pass, runs after the layout
src/theme.js       theme + style load and deep-merge
src/plate.js       headless-Chrome HTML -> PNG background, sha256-cached
src/report.js      donor .docx surgery (jszip), two-pass TOC page numbers
src/composition.js per-theme composition: frame, opening mark, divider, marker
src/themematrix.js every theme x every type, as a fit verdict
src/textcheck.js   rasterise, read the text back, report what did not survive
src/drawcheck.js   mark each field, render, report what the layout never drew
src/geometry.js    the box watcher: non-positive extents, shapes off the canvas
src/coverage.js    the eight themes a visual sweep has to look at, and why
src/capfit.js      the length a field can actually be, measured per theme
src/validate.js    ajv errors resolved to "slide N, type T, do X"
src/ai/pipeline.js the CLI and the orchestration both the CLI and API call
src/ai/ollama.js   role-addressed model client (ollama | openai-compatible)
src/auth.js        accounts and sessions (SQLite via node:sqlite, JSON fallback)
src/cloud.js       provider resolution, hosted/local switch, key resolution
app/server/        Express transport — must hold NO pipeline logic
```

`app/server` stays a thin wrapper: anything it can do, the CLI must also do,
because the pipeline has to run headless.

## Runtime dependencies that are easy to forget

- **LibreOffice** (`soffice`) — every preview and the report TOC pass.
- **Poppler** (`pdftoppm`) — splits the PDF into slide PNGs.
- **Headless Chrome** — plate themes and `type: freeform`. Resolved from
  `FORGE_CHROME`, defaulting to `/usr/bin/google-chrome-stable`.
- **Installed fonts** — `npm run fonts` puts 27 families in the *user* font dir.
  A machine with only DejaVu/Liberation rasterises every theme wrong. This bites
  containers specifically (see Deployment).
- **Ollama** — the local default backend, `localhost:11434`.
- **SearXNG** — research and auto image supply, `SEARXNG_URL`.
- **A donor `.docx` in `reference/`** — reports cannot render without one. The
  directory is gitignored; `FORGE_REFERENCE_DIR` relocates it for a container.

## State and paths

Every stateful directory is env-overridable so the app can run against a volume:
`FORGE_DECKS_DIR`, `FORGE_THEMES_DIR`, `FORGE_BRAND_DIR`, `FORGE_CONFIG_DIR`,
`FORGE_PLATE_CACHE`, `FORGE_REFERENCE_DIR`, `FORGE_DB_PATH` (`src/paths.js`).

| Data | Location |
|---|---|
| Deck content, plan, research, output | `decks/<slug>/` (gitignored) |
| Accounts, sessions, BYOK keys, routing, usage | `config/forge.db` (SQLite, WAL) |
| Operator identity default | `config/identity.yaml` (gitignored) |
| Per-account identity | `config/identities/<hash>.yaml` |
| Provider keys, routing preference | `config/local.yaml` (gitignored, global) |
| Hosted/local runtime switch | `config/hosted.json` (gitignored) |

A deck with previews runs 5–15 MB, dominated by the slide PNGs. That is the
storage driver for any deployment.

## Which model the product is judged by

**The TCET CoE gateway ("Auto"), not a local model.** Hosted is what ships and
Auto is what a hosted user gets, so Auto's output *is* the product's quality.
Every content question — does the deck argue anything, does the report read
well, is the research any good — is answered against Auto:

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

A deck that reads well on a 30B local model and badly through the gateway is a
deck that reads badly. Local Ollama support stays in the code and must not rot
(`resolveRole`, the fallbacks, the model picker, `roleAudit`) — it is simply
not where effort goes and not what "does this work?" means. Generating spends
the operator's budget, so a few runs read closely beat a sweep nobody looks at.

**The gateway does go down**, and it fails in a shape that looks like health:
`/v1/models` answers in under a second while `/v1/chat/completions` times out
behind Cloudflare (HTTP 524). When that happens, local Ollama is for exercising
the pipeline — does research reach the page, does resume work, does the report
render — and never for judging whether the output is good. Always record which
backend a result came from; `roleAudit()` and Admin → System both report it.

## Hosted vs local

`FORGE_HOSTED` is the only fork, checked by `isHosted()` in `src/cloud.js`:
`config/hosted.json` (admin runtime toggle) wins, then the env var.

- **hosted** — Auto is the configured gateway only, Cloud is BYOK, no Ollama
  fallback. Local models are hidden from every picker.
- **local (default)** — Auto falls back to Ollama; installed models are listed.

`config/hosted.json` is read from the real config dir even under `npm test`, so a
test whose outcome depends on the mode must pin it with `setHostedForTest()`
rather than inherit whatever this machine is flipped to.

## Multi-tenancy — the rules

The account system began as a gate on the operator's cloud key. It is now
per-account, and these boundaries are load-bearing. `docs/ARCHITECTURE.md` has
the reasoning; `test/tenancy.test.js` is the executable contract.

- **Admin is `user.role === "admin"`, never an email address.** Registration does
  not verify email, so any address-derived privilege means whoever signs up
  first owns the box. Roles are granted at boot (`seedAdmin` / `promoteToAdmin`
  from `FORGE_ADMIN_EMAIL`) or by an existing admin.
- **Identity and brand marks are per account**, layered template → operator →
  account → deck `meta.yaml`. `loadIdentity(deckDir)` finds the account from
  `meta.owner`, so callers do not thread a user through.
- **BYOK keys are per account**, resolved by `resolveProviderKey()`. The shared
  gateway key is deliberately install-wide and admin-only — it bills the
  operator and is rate-limited per user by `src/limits.js`.
- **The account reaches the model client through `src/account.js`**
  (AsyncLocalStorage), not through parameters. No account (CLI, tests) means the
  install-wide configuration, which is the old behaviour.
- **Media routes authenticate.** `/preview/*`, `/download/*` and `/assets/*`
  accept an httpOnly session cookie because `<img>` cannot send a bearer header —
  they are not public, and ownership is still enforced. Every state-changing
  route reads the bearer header only and ignores the cookie; keep it that way or
  the cookie becomes a CSRF vector.

When adding a route, ask which of these it touches. A setting that is written to
`config/` and not keyed by account is install-wide by definition, and must be
admin-gated.

## Deployment

`docker/Dockerfile` + `docker/docker-compose.app.yml` build the app with
LibreOffice, Poppler, Chromium and the theme fonts, plus a SearXNG sidecar and
an optional Caddy TLS terminator, with `/data` as the persistent volume.
`docs/DEPLOY.md` is the walkthrough.

Two things about that image are easy to undo by accident:

- The build stage runs `tools/install-fonts.mjs` and the runtime stage runs
  `fc-cache` **and asserts `fc-match "Inter"` resolves**. Without the fonts every
  server-side render — preview PNGs, plates, report pagination — uses substituted
  type, and the `.pptx` looks fine, so nothing tells you.
- `FORGE_REFERENCE_DIR` points the report donor at the volume. The template is
  gitignored and not in the build context, so an admin uploads it at runtime via
  `POST /api/admin/donor`.

The workload is **not serverless-compatible**: generation is a multi-minute SSE
stream, rendering shells out to LibreOffice and Chrome, and state is a local
SQLite file plus a deck directory tree. It needs a long-running container with a
writable disk. Porting the UI to Next.js changes none of that.

## Conventions

- ES modules, Node 24, no TypeScript.
- Comments explain *why*, never *what*. No comment that restates the next line.
- Never hardcode institution details in `src/` — they belong in `config/identity.yaml`.
- Generated artefacts (`decks/*/out/`, `brand/generated/`, `brand/fonts/`) are
  gitignored and must be reproducible from a clean checkout.
- Keep `docs/ARCHITECTURE.md` in sync when a subsystem changes shape.
