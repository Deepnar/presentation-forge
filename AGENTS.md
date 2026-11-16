# Presentation Forge — working agreement

The one guide for any agent or person working here; `CLAUDE.md` imports it.
It is the operational map and the rules. How the system is built, and why,
is `docs/ARCHITECTURE.md`.

Presentation Forge turns a topic or the user's own material into a themed,
editable deck — and the report and speaker script that go with it — for
academic submissions. Node 24, ESM. One core drives three surfaces: a CLI
(`src/ai/pipeline.js`), an Express API (`app/server/`) and a Vite/React UI
(`app/web/`). The active program is V2 on branch `v2`: a project is the
workspace, the editor is where a deck lives, and the legacy deck pipeline
still generates and feeds it.

```
brief → research → outline → HUMAN GATE → content → compile → editable project
                                                   ↘ report · speaker script · .pptx/.docx
```

## Start here

Read `docs/HANDOFF.md`, the **Finish line** at the top of `docs/ROADMAP.md`,
`docs/TRAPS.md` (before touching the renderer or fitter) and `docs/BLOCKED.md`
(before deciding something is stuck). Check the branch, HEAD and untracked
files, and leave unrelated work alone. `docs/history/` explains why earlier
V2 slices are shaped as they are; it is not a procedure.

## The rule that governs everything

**The model never writes layout.** V2 keeps three layers strictly apart:

| Layer | Owns | Written by |
|---|---|---|
| intent | meaning, content, how blocks relate | the model, as schema-validated `DeckIntent` |
| compiler | composition, geometry, type, fit | `packages/compiler/` over normalized theme tokens |
| scene | exact editable slide objects | compiler output or human edits, through the revisioned command engine |

A change that lets model-authored content carry a coordinate, a hex colour or
a font name is wrong however convenient. If a slide needs a layout that does
not exist, add a composition or slide *type*, never an escape hatch. A person's
choice of layout is a change to intent (`layoutChoice`), not coordinates.
Browser SVG and native PPTX read the same scene — no screenshot backgrounds
with proxy boxes, no renderer-owned layouts, no second document.

The legacy boundary still holds: locked institutional chrome in `src/chrome.js`
(policy in `packages/core/chrome.ts`), human-authored themes in
`themes/*.yaml`, model content as validated YAML. Themes split into `tokens`
(exact values, read only by renderers) and `voice` (tone, read only by the
model); a theme-contract test keeps them apart — the moment a model sees a hex
value it starts inventing them.

Human edits, ownership flags, tombstones and detached slides survive every
recompile (`carryEdits`). The Assistant proposes, the person approves, the
engine applies. Model-supplied fields never carry authority (ids, owners,
revisions). Sources stay owner-private; nothing copies source text into a deck
or export without the owner's consent.

## Commands

```bash
npm run dev                                 # API :5174 + UI :5173 (Vite proxies /api)
npm run dev:mail                            # the same + an SMTP sink on :2525 (verify/reset flows)
npm run render decks/<slug>/deck.yaml       # legacy content -> .pptx
npm run preview decks/<slug>/out/deck.pptx  # .pptx -> PNGs + thumbs
npm run forge -- new "<topic>" --research   # headless outline
npm run forge -- generate <slug> --critic   # headless deck
npm run fonts                               # install the 21 theme font families
npm run brand | npm run landing | npm run searxng
node tools/v2-types.mjs                     # regenerate types after a schema change
```

The API port is `FORGE_API_PORT`, deliberately not `PORT`. Every entry point
loads a gitignored `.env` (`.env.example` is the template). The `forge-sandbox`
launch in `.claude/launch.json` runs API 5374 / UI 5373 against `out/sandbox`
— its own config, database and decks — for checking work in a browser.

**Tests run focused**: an explicit file list, `nice`, `--test-concurrency=1`.
The owner runs other heavy work on this machine; a glob that matches nothing
makes `node --test` run everything. Browser (`*chrome*`) suites share the Vite
build — run them serially and never beside a build; screenshots go to
`out/evidence/`. Postgres suites skip without a server — say so rather than
calling them green.

## Verification that proves something

A written `.pptx` proves the file parsed. **Rasterise and look** before saying a
render works — text off the canvas and invisible-on-invisible colour both
write fine. The checks answer four different questions, in order (detail:
ARCHITECTURE → *Verification*):

1. Is the box on the slide? — the geometry watcher, inside every render
2. Was the field drawn at all? — `npm run drawcheck`
3. Does the text fit? — `npm run themematrix` (`-- --notes`), `node tools/capfit.mjs`
4. Did it survive the render? — `npm run textcheck`

Also: `npm run capstress` (every type at its caps — then look), `npm run
coverage` (before deleting a theme), `npm run deckscore <slug>` (compare runs),
`tools/slideqa.mjs` and `tools/pixels.mjs` (contrast on painted pixels). All
take `--deck decks/<slug>/deck.yaml`: audit real generated content, not the
specimen, which is written to behave. Look at the eight `COVERING_THEMES`
(`src/coverage.js`), not all 34 — layouts branch on composition axes, not
themes. None of these replaces looking.

## Where things are

```
packages/model      intent, scene, project, tool schemas + generated types; the command engine
packages/compiler   intent -> scenes; carryEdits; layout-choice
packages/editor     SVG viewer/editor (scene-svg, scene-dom, scene-edit, scene-arrange)
packages/renderer-pptx, renderer-docx   native exports
packages/tools, agent, skill            the Assistant: tool session, provider runs, instructions
src/projects/       stores (SQLite + Postgres), import, pptx-import, files, retheme,
                    slide-compile, slide-layouts, report, script, report-slides
src/ai/             legacy pipeline: research, generate, report, script, model client
src/                render, layouts, fit, chrome, theme, plate, preview, checks
app/server/         Express — a thin transport; anything it does the CLI can do
app/web/            the React workspace and editor (SceneViewer.jsx is the editor shell)
```

Runtime dependencies that are easy to forget: **LibreOffice** (previews, report
TOC), **Poppler** (PDF → PNG, PDF text), **headless Chrome** (`FORGE_CHROME`;
plates, freeform), **installed fonts** (`npm run fonts`, user font dir — without
them every server render uses substitutes and nothing says so), **Ollama**
(local default), **SearXNG** (`SEARXNG_URL`), and a **donor `.docx`** in
`reference/` (gitignored; `FORGE_REFERENCE_DIR`) for any report.

State is env-overridable for a volume (`FORGE_DECKS_DIR`, `FORGE_CONFIG_DIR`,
`FORGE_DB_PATH`, `FORGE_REFERENCE_DIR`, … in `src/paths.js`). Projects, their
files, layouts, intents, documents, accounts and keys live in the database
(`config/forge.db`, or Postgres via `FORGE_PROJECTS_BACKEND`); the full table is
ARCHITECTURE → *Data locations*.

## Hosted, local and tenancy

`FORGE_HOSTED` is the one fork (`isHosted()`; `config/hosted.json` wins over the
env). **Hosted**: Auto is the configured gateway only, Cloud is BYOK, no Ollama.
**Local** (default): Auto falls back to Ollama. Tests that depend on the mode pin
it with `setHostedForTest()`. `FORGE_DEV_LOCAL_FALLBACK=1` (env only) drops an
unreachable gateway to Ollama for exercising the pipeline — never for judging.

Tenancy rules are load-bearing (`test/tenancy.test.js` is the contract):
admin is `user.role === "admin"`, never an address; identity, brand marks and
BYOK keys are per account; the account reaches the model client through
`src/account.js`, not parameters; media routes accept the session cookie for
GET/HEAD only and every state-changing route reads the bearer header only. A
setting written to `config/` and not keyed by account is install-wide and must
be admin-gated.

The workload is not serverless: multi-minute streams, LibreOffice and Chrome,
SQLite plus a deck tree. Deploy is `docker/` (fonts asserted with `fc-match`,
donor uploaded at runtime) — `docs/DEPLOY.md`.

## Which model the product is judged by

**Auto — the TCET CoE gateway** (Qwen3.6-35B-A3B; `model` field ignored; reads
images; thinking per request; shared by ~15 students). Hosted is what ships, so
Auto's output is the product's quality:

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

Never judge content quality on a local model; local exercises the pipeline
only. The gateway fails looking healthy (`/v1/models` answers, chat times out
behind Cloudflare). Say which backend every result came from (`roleAudit()`,
Admin → System). Local model support stays and must not rot. Do not start local
inference on this machine without asking.

## How work is done

**`docs/ROADMAP.md` is the only place future work is written** — a defect
noticed in passing, a feature asked about, a direction agreed — in the same
session. Other docs link to roadmap entries rather than restating them:

| file | answers |
|---|---|
| `docs/ROADMAP.md` | what is to be done, what was done, and why |
| `docs/PRODUCTION.md` | what stops real users; every way it ships |
| `docs/ECONOMICS.md` | what it costs, what it can be sold for |
| `docs/ARCHITECTURE.md` | how it is built, as built — keep in sync |
| `docs/TRAPS.md` | cross-cutting failure modes |
| `docs/BLOCKED.md` | what cannot move, and who unblocks it |
| `docs/HANDOFF.md` | current state for the next session; overwritten |

- **Plan → build → verify → commit.** The roadmap entry is the plan, commits
  are the record. Take the next Finish-line item and build it fully without
  stopping for permission at each step.
- **Build the real thing.** No throwaway first versions, no scope cuts. Too big
  for one pass → split into complete sub-items.
- **Look ahead** at later items in the same subsystem; build on the primitive
  they need.
- **Earn the checkmark**: full scope, behaviourally validated. Then propagate —
  edit later entries that describe the old behaviour — and record a
  `> **Learned.**` block. Reusable failure modes go to TRAPS.
- **Core before the front end**: an editing behaviour that feels broken is core
  and is fixed when found.
- **Ask only for the owner's calls**: paid infrastructure or accounts, real
  model spend beyond a few runs, production deploys, destructive Git
  operations, changes to how user data is handled.

## Commits

Follow the global `git-workflow` skill. Push to `origin/v2`; never to `main` by
habit.

```
<type>: <concise description>

- concrete change
- important behaviour or file affected

Validated: <tests and checks actually run>
```

Types: feat, fix, refactor, test, docs, chore, perf, build, ci. Small,
concern-focused commits staged by path (`git add <paths>`, never `-A`). Impersonal
— no "the user asked", "we decided". **No AI attribution**: no `Co-Authored-By`,
no "generated with", no tool names in messages or code comments.

## Conventions

- ES modules, Node 24. V2 packages are strict TypeScript run natively by Node;
  legacy code and React are JavaScript/JSX. Generated schema types are checked
  in and drift-tested.
- Comments explain *why*, never *what*.
- Never hardcode institution details in `src/` — they belong in
  `config/identity.yaml`.
- Generated artefacts (`decks/*/out/`, `brand/generated/`, `brand/fonts/`) are
  gitignored and reproducible from a clean checkout.

## Ending a session

Follow the global `session-closeout` skill: propagate outcomes to the roadmap,
ARCHITECTURE and the other docs first, then overwrite `docs/HANDOFF.md` and
commit it.
