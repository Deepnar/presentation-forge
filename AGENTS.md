# Presentation Forge — working agreement

Presentation Forge is becoming a unified presentation workspace: topic or raw
material → themed, editable deck → human and AI editing → native PowerPoint.
The active program is V2 on branch `v2`; the legacy generation/report pipeline
remains supported. The hosted Auto tier is the reference for generated-content
quality; local Ollama remains supported for local use and pipeline exercises.

## Start here

Read this file, `docs/HANDOFF.md`, the "Finish line" section of
`docs/ROADMAP.md`, `docs/TRAPS.md` and `docs/BLOCKED.md` before changing code.
Inspect branch, HEAD, tracked changes and untracked files, and preserve
unrelated work. `docs/PRODUCT-VISION.md` records direction; architecture records
describe what is built. `docs/history/` holds the per-slice records of earlier
V2 work — read one when you need why something is the way it is, never as a
procedure to follow.

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
during regeneration. Human and AI changes share validated commands, stale-revision checks and
history. The Assistant proposes; the human approves; the command engine applies.
Model-supplied fields never carry caller authority (ids, owners, revisions).
Sources and citations stay owner-private, and nothing copies source text into a
deck or an export without the owner's explicit consent.

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
  work out the concrete design against the code as it is, not the entry text.
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

**Plan → build → verify → commit.** No separate contracts, direction gates,
evidence packets, review records or acceptance files. The roadmap entry is the
plan; the commit history is the record; `docs/HANDOFF.md` is the current state.

- **Take the lead within the finish line.** The roadmap's "Finish line" section
  is the agreed order of work. Pick the next item, build it fully and move on
  without stopping for permission at each step.
- **Build the real thing.** No throwaway first versions and no scope cuts to
  finish faster — speed comes from less ceremony, not less product. When an
  item is too big for one pass, split it into complete sub-items.
- **Verify by running and looking.** Write tests for new behaviour, run the
  tests for what changed and what it directly touches, and for anything visible
  open it in the browser or rasterise it and look. Run the full suite before a
  merge to `main`. A green typecheck or a written .pptx proves nothing on its own.
- **Ask only for what is genuinely the owner's call:** new paid infrastructure
  or accounts, spending real model budget beyond a few runs, production
  deployment, destructive Git operations, and changes to how user data is
  handled. Everything else, decide and record why in the commit or roadmap.

Commit focused changes and push to `origin/v2`. Never push to `main` by habit.

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

Browser suites share the Vite build output: run them serially
(`node --test --test-concurrency=1 test/*chrome*.test.js`), never alongside a
build. Their screenshots go to `out/evidence/`, which is not committed. If
PostgreSQL is not running its suites skip — say so rather than calling them
green. Leave unrelated processes and other projects' databases alone.
