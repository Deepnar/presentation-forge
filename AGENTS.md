# Presentation Forge — working agreement

Presentation Forge is becoming a unified presentation workspace: topic or raw
material → themed, editable deck → human and AI editing → native PowerPoint.
The active program is V2 on branch `v2`; the legacy generation/report pipeline
remains supported. The hosted Auto tier is the reference for generated-content
quality; local Ollama remains supported for local use and pipeline exercises.

## Start here

Read this file, `docs/CONTINUATION.md`, `docs/HANDOFF.md`, `docs/TRAPS.md`,
`docs/BLOCKED.md`, and the active `docs/ROADMAP.md` entry before changing code.
Inspect branch, HEAD, tracked changes and untracked files. Preserve unrelated
work. Never assume a branch or overwrite an existing checkout to match a prompt.

`docs/DEVELOPMENT-PROTOCOL.md` defines the development cycle and authority order;
`docs/development-state.json` records the accepted baseline, implementation under
review and validation state. `docs/PRODUCT-VISION.md` records product direction;
`docs/ACCEPTANCE-CRITERIA.md` defines common gates. Architecture records describe
what is built; evaluation reports supply evidence, not automatic acceptance.

The active task and accepted baseline are recorded in the state file and handoff.
A candidate milestone is not authorized work. Never promote a milestone merely
because its implementation exists.

## The one rule that governs everything

**The model never writes layout code.** V2 separates semantic intent,
deterministic compilation and authoritative editable scenes:

| Layer | Owns | Written by |
|---|---|---|
| A — intent | meaning, content, semantic relationships | model-authored, schema-validated `DeckIntent` |
| B — compiler | composition, geometry, typography, fit | deterministic `packages/compiler/` + normalized theme tokens |
| C — scene | exact editable slide objects | validated `SlideScene`, mutated through the revisioned command engine |

A change that lets model-authored content specify coordinates, hex colours or
font names is wrong. Layer C necessarily contains resolved geometry and styling;
that is compiler output or validated human editing, never an intent escape hatch.
Browser SVG and native PPTX consume the same scene. Do not introduce screenshot
backgrounds with proxy editing boxes, renderer-owned layouts or a second document.

Keep the legacy chrome/theme/content boundary too: locked institutional furniture
is in `src/chrome.js` with shared policy in `packages/core/chrome.ts`; themes are
in `themes/*.yaml`; legacy model content is validated YAML. Extend the appropriate
semantic/compiler vocabulary when a composition is missing. Manual layout
templates are editable scene skeletons, separate from AI composition families.
Preserve human modifications, ownership flags, tombstones and detached scenes
during regeneration. Human and future agent changes share validated commands,
stale-revision checks and history. The headless durable run core, bounded provider
exchanges, explicit provider-backed preparation/queue boundary, bounded
host-instance tool conversations, the shared web-search provider boundary and
headless durable visible turns with atomic proposal approval are independently
accepted. Owner-authenticated conversation read/export/decide/cancel/clear HTTP
transport is also independently accepted; it exposes no preparation or execution.
The bounded headless explicit-turn worker and operator CLI are independently
accepted at `58662ec`; they reuse stored approval and canonical run authority.
Owner-authenticated durable turn submission is independently accepted at
`2ba82cb`; it delegates to the same stored turn authority, with no provider dispatch,
queue/scene/history write or automatic approval on submission.
Owner-scoped bounded work discovery and its operator CLI are independently
accepted at `8378a20`; metadata hints grant no claim, approval or execution
authority and must re-enter the canonical worker for current checks.
The Auto-only host policy and bounded operator pickup are independently accepted
at `5cf5b5c`; they remain disabled by default, bind account budgets explicitly and
reuse canonical turn/run authority. Explicit authenticated finite host wake is
independently accepted at `dce5628`; it pins Bearer/account identity and remains
separately disabled by default. Wake acknowledges a finite hint, not guaranteed
owner-wide progress or completion. Exact project/generation/turn wake and the Auto work-auto operator path are
independently accepted at `3da0801`; they reuse the same finite host capacity and
canonical H/I2 authority without owner-history scanning. Different active targets
are busy; coalesced receipts confer no fresh-validity or completion guarantee.
The existing editor Assistant is independently accepted in V2-8I-8 at b9c2d20: freeform current-slide/selection chat, explicit proposals and exact-target
wake reuse the accepted authority. Grid/title/inline/save guards and authoritative
reload preserve human work; loading AI changes clears session undo and uses Version
history for restoration. Availability is owner-bound metadata with CLI parity.
Host execution remains default-off; no always-on scheduler is enabled.
The separate J1 headless research entry is independently accepted at f161901:
inspect-only canonical web_search requires a trusted single-use capability bound
to the complete request, with finite queries/results and ephemeral normalized
sources. Base content sessions and durable execution retain their earlier tool
subsets; H/host/Assistant paths gain no research capability. Snippet identity does
not establish verified claim support. J1 itself adds no persistence or public
research activation. The separate J2 headless project web-source registry is
independently accepted at `6d51cd4`: explicitly selected normalized snippets remain
owner-private until source clear or canonical project deletion. Chat clear and
Version history preserve sources; source clear is not restored through history.
Registration/resolution add no Assistant/H research authority or automatic provider
context. Retained source identity does not establish verified locators or claims.
The J3 headless citation-reference checker is independently accepted at `edda5ec`:
exact saved target/source and optional excerpt-relative UTF-8 quote checks share
one owner/document/catalog snapshot. Target existence, retained source and locator
match are separate observations; claim support stays not-assessed. Results attach
nothing and grant no reusable approval. No source text enters scenes/history,
provider context or a public surface through these checks.
The J4 revisioned scene citation lifecycle is independently accepted at `665cd04`:
owner-qualified headless attach/remove/inspect and unverified metadata survive
commands, undo/history and regeneration without restoring cleared sources.
Content hashes and retained ranges do not establish claim support. Creating or
copying cited projects and exporting them to native PPTX refuse until separate
preservation contracts; no provider/H/Assistant research or public surface authority is added.
Saved chat does not automatically become provider context. Further host progress/
scheduling, provider routing, source-aware copying/citation presentation, research
orchestration, live-provider qualification and
semantic creation remain in the
[roadmap](docs/ROADMAP.md#v2-8-remaining). Resolve exact accepted
scope through development-state.json and its independent review record.

Themes are split into `tokens` (exact machine values, read only by the renderer)
and `voice` (tone guidance, read only by the model). These must never overlap:
the moment a model can see a hex value it will start inventing them.

## Repository layout

```
packages/       V2 model, core, compiler, editor, projects, native renderers
src/            pipeline, compatibility adapters, stores, preview (CLI/API share this)
themes/         one YAML per design language
schema/         deck.schema.json — the content contract
config/         identity.yaml — remembered defaults, user-editable
brand/logos/    raw source marks (any format)
brand/generated/ normalised marks — produced, never hand-edited
app/server/     Express; thin transport over shared domain logic
app/web/        Vite + React workspace and legacy surfaces
decks/<slug>/   deck.yaml, meta.yaml, out/
reference/      the institutional templates output is checked against
docs/           ROADMAP.md (all work), PRODUCTION, ECONOMICS, ARCHITECTURE, TRAPS
```

`app/server` must stay a thin wrapper. Anything it can do, the CLI must also do,
because the pipeline has to run headless.

## Commit discipline

1. **Impersonal, factual messages.** Describe what changed and why, in the
   repository's voice. Never narrate the session — no "the user said…",
   "as requested…", "we decided…", "per our discussion". Subject ≤ ~70 chars;
   the body explains the *why*, not the *what* (the diff shows the what).
2. **Many small, focused commits.** Split by concern, not by session — one
   logical change per commit (renderer / theme / docs / tests as separate
   commits). Never one massive end-of-session commit. If a message needs bullets
   to list unrelated changes, it should have been several commits.
3. **Stage in logical chunks** — `git add <specific paths>` per commit, never
   `git add -A` once.
4. **No AI attribution.** No `Co-Authored-By` trailers, no "generated with", no
   tool names anywhere in commit messages or code comments.

## Working the roadmap

`docs/ROADMAP.md` is both the plan and the progress tracker. It is not a spec.

**It is also the ONLY place future work is written down.** The moment a piece
of work is discussed — a defect noticed in passing, a feature the user asks
about, a direction agreed in conversation, an idea that came out of building
something else — it gets an entry in `docs/ROADMAP.md` in that same session,
before the session ends. Not in a handoff, not in a section of another doc, not
only in the conversation.

This is a rule because it has already gone wrong: work items accumulated in
`PRODUCTION.md` §4 and §5 in parallel with the roadmap, so there were two
lists, and whichever was not being edited went stale. The other docs have their
own jobs and none of them is holding work:

| file | answers |
|---|---|
| `docs/ROADMAP.md` | **what is to be done, what was done, and why** |
| `docs/PRODUCTION.md` | what stops real users — launch readiness only |
| `docs/ECONOMICS.md` | what it costs and what it can be sold for |
| `docs/ARCHITECTURE.md` | how the system is built, as built |
| `docs/TRAPS.md` | what has bitten before, cross-cutting |
| `docs/BLOCKED.md` | what cannot be worked on, and who unblocks it |
| `docs/HANDOFF.md` | the current state, for the next session; overwritten |

When one of those files needs to mention future work, it LINKS to the roadmap
entry rather than restating it. A pointer that goes stale is visible; a second
copy that goes stale is not.

**Keep it current, not just appended to.** An entry whose reality has changed
is edited when it changes — including entries nobody is working on, when a
neighbouring change makes them wrong. A roadmap that is only ever added to
becomes an archive, and an archive is not a plan.

- **Entries are intent + rationale, not specs.** When an item's turn comes,
  discuss the concrete implementation before writing code. Never build straight
  from the entry text.
- **Stop and ask when the item needs direction — do not substitute another.**
  Some items are taste and product judgement rather than defects: the front end
  and the landing page, anything that changes what a surface IS rather than
  whether it works, and any item whose entry says to agree direction first. On
  those, say what the options are and WAIT for an answer. Do not assume the
  human is away and quietly pick a different item instead; that is how the
  highest-priority work stays untouched for weeks while the list below it gets
  polished. Silence is not consent to start, and it is not permission to
  reorder the list either — ask, then wait.
- **No first versions.** Build the robust, thought-through version — real
  algorithms, edge cases handled, end-state in mind. Not a throwaway MVP. If an
  item is too large for one pass, split it into robust sub-items rather than
  shipping something knowingly temporary.
- **Look ahead before building.** Scan the roadmap for later items in the same
  subsystem and design the current work to be forward-compatible — build on the
  primitive those will need. If they genuinely conflict, decide explicitly
  (do the later one first, or record the exact seam). Never implement something
  a known-future item will have to tear out. Note the look-ahead result in the
  completion entry.
- **Earn the checkmark.** Mark an item done only after its full original scope
  is implemented *and behaviourally validated* — a real run, not a syntax check.
  Audit against the entry text, not memory of it. Before starting anything, spot
  check that previously ticked items in the same area are genuinely done.
- **Propagate on completion.** After finishing an item, scan the still-unchecked
  items for any describing the *old* behaviour of what just changed, and update
  them to the new reality and the new dependency. A shipped feature that leaves
  later items describing the pre-change world silently misleads the next
  session. Do this before ticking the box.
- **Record what was learned.** Each completed item gets a `> **Learned.**` block
  covering what was not obvious beforehand. Reusable failure modes go in
  `docs/TRAPS.md` instead — the roadmap is per-feature, TRAPS is cross-cutting.
- **Keep `docs/ARCHITECTURE.md` in sync.** A brand-new subsystem gets a new
  section; a reworked one gets its existing section updated. The architecture
  doc must keep describing the system as built, not as designed.

## Development workflow

The active coding agent works directly in this repository with its available
tools. There is no required Hermes/opencode relay, TUI workflow, model-provider
allowlist or dependency on an earlier conversation. Optional delegation must
follow the current task's authorization; it does not make self-review independent.

Follow **PLAN → IMPLEMENT → VERIFY → INDEPENDENT REVIEW → ACCEPT/HOLD → HANDOFF**
in `docs/DEVELOPMENT-PROTOCOL.md`, with role instructions in `docs/agents/`.
Each task names its accepted baseline, bounded scope, invariants, non-goals,
required tests/evidence, acceptance criteria, standing failures and stop point.
An implementer cannot accept its own work. A separate reviewer or explicit human
approval supplies acceptance; without either, record pending review and stop.

Commit focused changes and push regularly to the explicitly authorized branch
(`origin/v2` for this task). Never push to `main` by habit. Do not deploy or run
irreversible migrations as a side effect of implementation acceptance.

Work autonomously within approved scope. Obtain human direction for major
product/architecture changes, new paid infrastructure, security-policy or user
data-handling changes, removal of accepted functionality, destructive Git
operations and production deployment. Prepare a concrete reviewable result first.
Do not re-ask for actions already authorized by the current task.

## Which model to judge the product by

**The TCET CoE gateway — Auto — and nothing else.** Hosted is what ships, Auto
is what a hosted user gets, so Auto's output IS the product's quality. Judge
every content question against it:

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

- **Do not evaluate content quality on a local Ollama model.** A deck that
  reads well on a 30B local model and badly through the gateway is a deck that
  reads badly, because nobody hosted is running the local one. Judging on
  local answers a question nobody asked.
- **Local support stays in the code** — `resolveRole`, the fallbacks, the model
  picker. It is not being removed and it should not rot. It is simply not
  where the effort goes, and not what "does this work?" means.
- Generating spends the operator's gateway budget, so be economical: a few
  real runs read closely beat a sweep nobody looks at.

**When the gateway is down, local is for exercising, not for judging.** The
TCET box goes out — `/v1/models` keeps answering while `/v1/chat/completions`
times out behind Cloudflare, so it looks up and is not. Two different jobs, and
only one of them can move to Ollama:

- *Does the pipeline run end to end — does research reach the page, does resume
  work, does the report render?* Yes, run it on local. The plumbing is the same
  code either way.
- *Is the output any good?* No. That question only has an answer on Auto, and
  a local answer to it is worse than no answer because it reads like one.

Say which of the two a result came from. `roleAudit()` and the admin System tab
both report the model actually used, so there is no excuse for a note that does
not say.

## Ending a session

Overwrite `docs/HANDOFF.md` with the current state and commit it. Git history
preserves previous handoffs. The next session is told to read it first.

## Conventions

- ES modules throughout, Node 24. Existing V2 packages use strict TypeScript,
  executed natively by Node; legacy code and React use JavaScript/JSX. Follow
  the subsystem's language and package import boundaries. Generated schema types
  are checked in and drift-tested; use `npm run types:generate` when appropriate.
- Comments explain *why*, never *what*. No comment that restates the next line.
- Never hardcode institution details in `src/` — they belong in `config/identity.yaml`.
- Generated artefacts (`decks/*/out/`, `brand/generated/`, `brand/fonts/`) are
  gitignored and must be reproducible from a clean checkout.
- Before claiming a render works, rasterise it and look at the image. Valid YAML
  and a written .pptx prove nothing about whether text fits on the slide.

## Verification

```
npm run render decks/<slug>/deck.yaml     # content -> .pptx
npm run preview decks/<slug>/out/deck.pptx # .pptx -> PNGs + thumbs
npm run dev                                # API :5174 + UI :5173
```

`src/preview.js` exists so output can be *seen*. Use it.

**Focused validation is the default.** Test new or changed behaviour and the
boundaries it directly affects. Use accepted evidence for unchanged subsystems;
do not routinely repeat the full legacy/browser/database/benchmark matrix for
each slice. Choose the smallest meaningful checks that establish a usable,
correct result, then finish the scoped work. Expand coverage only for a concrete
regression, shared-core impact, unresolved risk or explicit release requirement.
After a relevant pass, rerun only when a subsequent change or failure warrants it.
Independent review should inspect existing evidence and run narrow new-behaviour
or challenge checks, rather than duplicate the entire implementation run.
Documentation-only changes need lightweight consistency checks, not product tests.
Record selected checks, exclusions and remaining uncertainty honestly; preserve
assertions, ownership/data-integrity safeguards and the independent acceptance gate.
Avoid GPU/model work and expensive rendering unless the changed behaviour needs it.

Run browser files in bounded serial isolation: each may rebuild the same Vite
`dist`, so never run the bulk browser set concurrently or overlap it with a build.
Use a process watchdog; a timed-out or cancelled file is not a pass. Count leaf
tests, skips, cancellations and unexecuted cases explicitly, preserving the
standing BYOK locale failure separately. If PostgreSQL is unavailable, its
contract/concurrency/fault/browser checks are unexecuted, not green.

Respect quiet-window constraints on shared machines. Inspect CPU, memory, I/O
pressure and competing work before expensive validation; do documentation and
lightweight checks while busy. Never stop unrelated processes or reuse another
project's database. Identify the actual backend and implementation commit in
every evidence report. Inspect screenshots for clipping/overlap and measure canvas
stability; a written PPTX or a syntax check is insufficient.
