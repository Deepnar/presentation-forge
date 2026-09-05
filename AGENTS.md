# Presentation Forge — working agreement

Generator for academic presentations and reports. Node + pptxgenjs. The product
is **hosted**, and the model behind it is the TCET CoE gateway (the "Auto"
tier) — see *Which model to judge the product by*, below. Local Ollama still
works and is still supported; it is no longer the thing being aimed at.

## The one rule that governs everything

**The model never writes layout code.** Three layers, strictly separated:

| Layer | Owns | Written by |
|---|---|---|
| chrome | banner, crest, presenter, slide number | `src/chrome.js`, locked |
| theme | palette, type, spacing, shape | `themes/*.yaml`, human |
| content | what the slides say | the model, as validated YAML |

A change that lets content specify a coordinate, a hex colour, or a font name is
wrong regardless of how convenient it looks. If a slide needs a layout that does
not exist, add a slide *type* — do not add an escape hatch to the schema.

Themes are split into `tokens` (exact machine values, read only by the renderer)
and `voice` (tone guidance, read only by the model). These must never overlap:
the moment a model can see a hex value it will start inventing them.

## Repository layout

```
src/            renderer, validator, fitter, chrome, preview      (CLI + API share this)
themes/         one YAML per design language
schema/         deck.schema.json — the content contract
config/         identity.yaml — remembered defaults, user-editable
brand/logos/    raw source marks (any format)
brand/generated/ normalised marks — produced, never hand-edited
app/server/     Express; a transport over src/, holds no logic
app/web/        Vite + React UI
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

## Orchestration — who drives what

Hermes (the CLI agent) drives opencode for this repo. The human does not babysit
the TUI: they state intent, Hermes launches, monitors, and rotates sessions.

- **Only two models, ever.** Code: `opencode-go/deepseek-v4-flash`. Vision:
  `opencode-go/mimo-v2.5` (via the opencode-vision plugin's subagents). Nothing
  else, even when it looks convenient. The user pays for a Go subscription and
  that is the budget.
- **Session rotation.** Start a fresh `opencode run` for new work — clean
  context by construction. When an interactive session's input tokens pass
  ~1M (check `~/.hermes/scripts/opencode-sessions.sh <dir>`), do not push it:
  note what it achieved and start a new session with a carry-forward summary
  ("Previously completed: X. Continue with Y.").
- **Push discipline.** Push to `origin/main` regularly — after each logical
  commit or small group of commits, never hoard work locally. The remote is
  the safety net and the user's visibility into progress.
- **Self-contained prompts.** A fresh opencode session has no memory. Every
  prompt must point at `AGENTS.md`, `docs/HANDOFF.md`, `docs/TRAPS.md` and the
  relevant `docs/ROADMAP.md` item, and restate the task concretely.
- **Product vision — Gamma-like.** The end state is: the user drops in a topic
  or a pile of raw info, and a complete themed deck comes out — no follow-up
  questions, no manual fixes. Every feature decision should move toward
  "topic in → deck out" with zero hand-holding. The chat panel is the first
  real surface of this: it is where the user talks to a deck the way they
  would talk to Gamma.

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

- ES modules throughout, Node 24. No TypeScript.
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
