# Handoff — 2026-09-02, the pipeline swept end to end; hosting blockers are next

Everything is on `origin/main`. `npm test` is **492 passing**, `npm run
themematrix` is clean across 34 themes, the working tree is clean. 45 commits
this session.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map — it now carries the gateway's actual specification, from the
CoE Student Developer Guide. `docs/TRAPS.md` gained thirteen entries this
session and outlives this file. `docs/ROADMAP.md` carries every item below as a proper
entry; this file is the order I would take them in.

---

## The one thing that will decide next session

**The TCET gateway is still down for generation**, and it still fails in a shape
that looks like health. Check it first:

```bash
curl -s -o /dev/null -m 20 -w "models %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/models -H "Authorization: Bearer $FORGE_TCET_API_KEY"
curl -s -m 90 -w "\nchat %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/chat/completions \
  -H "Authorization: Bearer $FORGE_TCET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6","messages":[{"role":"user","content":"Say ok"}],"max_tokens":4}'
```

Unchanged all session: `/v1/models` answers 200 in ~0.6s, `/v1/chat/completions`
returns nothing in 90s. Everything generated this session ran on **local
Ollama**, which is why every content-quality question below is still open.

`FORGE_DEV_LOCAL_FALLBACK=1` now exists for exactly this — an unreachable
gateway drops to local mid-request so the pipeline stays exercisable. Read the
section in `CLAUDE.md`: it is off by default, env-only, and a fallback run
tells you nothing about quality.

---

## Running anything — read this or lose an hour

**This box is flipped to hosted.** `config/hosted.json` has `"hosted": true`.
`roleAudit()` answers *"hosted — roles resolve through the gateway or BYOK, not
local models"* rather than listing roles; that is correct, not a fault.

**`.env` holds `FORGE_TCET_API_KEY`, and that pulls the AUTHOR role to the
gateway even in LOCAL mode.** `chat()` routes the author by the routing
preference, and `auto` resolves to the gateway whenever a key exists —
regardless of hosted/local. So "switch to local" is not enough to test locally:
the planner will still go to the gateway and, right now, hang on it. That cost a
full outline run this session.

To generate genuinely locally, withhold the key and use a scratch config so the
dev database and identity are untouched:

```bash
SC=/tmp/forge-scratch && mkdir -p $SC && cp config/models.yaml $SC/
cp config/identity.example.yaml $SC/identity.yaml
printf '{"hosted": false}\n' > $SC/hosted.json

FORGE_TCET_API_KEY= FORGE_CONFIG_DIR=$SC \
  npm run forge -- new "<topic>" --max-slides 16 --density dense --research
FORGE_TCET_API_KEY= FORGE_CONFIG_DIR=$SC \
  npm run forge -- generate <slug>
```

Local roles resolve to `qwen3-coder:30b` (research, author), `gemma4:26b`
(critic, the only vision-capable one), `qwen3:4b` (utility). A 14-slide deck
takes roughly 20 minutes on this machine; the outline alone can take several.

**Scoring a deck** — the new one, and the fastest way to see whether a run
regressed:

```bash
npm run deckscore <slug>          # /100 across intact, fits, grounded, varied, whole
```

---

## What to do next, in the order I would do it

### 1. The four hosting blockers (no model, all concrete)

These are the ones a stranger hits, and none needs the gateway.

- **The dev account store holds 100+ throwaway accounts** (`config/forge.db`)
  and must not travel to production. Decide: ship an empty DB, or a documented
  reset step in `docs/DEPLOY.md`.
- **`config/identity.yaml` reads `institution.name: HACKED`.** Real values gone.
  Identity is per account now, so the fix is Settings, but the file on this box
  is still the operator default.
- **`uniqueSlug` leaks across accounts.** It appends `-2`, `-4` against a global
  namespace, so creating a deck reveals whether another user's title exists.
  Per-account slug namespacing closes it.
- **The report donor is install-wide.** A box serving more than one institution
  serves the wrong letterhead. `donorStatus(refDir)` and `resolveDonor(explicit,
  refDir)` already take the directory as a parameter, so this is a resolver that
  reads `meta.owner`, not a reshape.

### 2. The model work — what the CoE guide changed, and what is still unproven

The **CoE AI Gateway Student Developer Guide v1.0 (Aug 2026)** arrived late in
the session and settled two standing unknowns while opening a capability the
product had never used. `CLAUDE.md` now carries the specification; this is what
was *done* about it.

**Closed by the guide:**

- **The model id does not matter.** The field is required by the protocol and
  its value is IGNORED (§3) — the gateway serves one model and takes any
  string. So the long served id `/v1/models` reports
  (`/home/user1/models/Qwen3.6-...`) was never something callers had to match,
  and the "hosted generation may fail against a healthy server" risk is gone.
- **It reads images** (§5) — diagrams, screenshots, charts, handwritten notes;
  video not. So the vision critic IS viable hosted, and
  `tcet-auto.vision_models` is documented rather than assumed.

**Opened by the guide: thinking was off for this entire project.** §6 — the
gateway runs with reasoning OFF by default and takes it per request via
`chat_template_kwargs.enable_thinking` plus an optional `reasoning_effort`
(`low` / `medium` / `xhigh`). Every pass that reasons has therefore been asking
a model that was not reasoning.

**What changed in `config/models.yaml`:**

| key | where | why |
|---|---|---|
| `vision_models: [qwen3.6]` | `providers.tcet-auto` | a remote model cannot be asked what it supports |
| `vision_models: []` | `providers.opencode-go` | BYOK must be explicit too; the critic skips on Cloud |
| `supports_thinking: true` | `providers.tcet-auto` | gate: never send the field to an endpoint that never claimed it |
| `thinking: true` + `reasoning_effort: medium` | `roles.author`, `roles.critic` | the passes that plan, review coherence, and read a slide |

Research and utility stay off — they classify and summarise, they do not reason.
`medium` not `xhigh` deliberately: §12 says the server is shared by ~15 students
and a deck is many requests.

**What changed in code:**

- `roleCanSeeImages(role)` in `src/ai/ollama.js` — locally it ASKS
  (`/api/show` reports capabilities, so a fallback onto a text model is caught
  by what the model is); remotely it reads the provider's `vision_models`.
  `critiqueDeck` refuses and reports rather than posting images blind.
- Thinking is sent only when the role asks AND the provider declares support.
- **A real bug found while wiring it:** `cloudSpec` builds its own spec rather
  than going through `resolveRole`, so it carried neither the role's thinking
  settings nor the provider's flag — silently dropping both on *exactly the path
  a hosted deck takes*. Verified against a recording server that the field now
  arrives on the hosted path and on no other. If you add another per-role model
  option, check `cloudSpec` carries it; it is the easiest place to lose one.

**What is still unproven, and is the first thing to do when the gateway
answers:**

- **Nothing has been generated with thinking on.** The gateway has been down
  all session, so the entire change is verified structurally (the right JSON
  reaches the right endpoint) and not behaviourally.
- **`medium` is a guess.** The guide recommends thinking for "coding, math,
  logic, debugging" and `xhigh` for "very hard problems, long reasoning chains".
  Planning a 16-slide deck may well be the second.
- The concrete experiment, now that there is a measure for it:

  ```bash
  # same brief, thinking off then on, and compare
  FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 16 --density dense
  FORGE_HOSTED=1 npm run forge -- generate <slug>
  npm run deckscore <slug>
  ```

  Toggle `thinking:` on `roles.author` between runs. `deckscore` catches a
  mechanical regression; the prose difference still needs reading. Note this
  spends the operator's budget — two runs, read closely, beat a sweep.

### 3. Content quality — half of it is now measurable

Everything fixed this session was mechanical: structure, placement, escaping,
truncation, targeting. All of it is true whatever model writes the words.

**`npm run deckscore <slug>` now measures the deterministic half** — intact,
fits, grounded, varied, whole — and returns one comparable number so runs can
be set beside each other. The real generated deck scores **73**, and every point
it drops is a defect this session found by hand.

**The other half still needs Auto and a person:** does the deck ARGUE anything,
is the research any good, does the report READ well. `AGENTS.md` is explicit
that those are answered on the gateway and nowhere else. What would make it
accumulate rather than evaporate is in the roadmap under "Measuring content
quality": a small fixed set of briefs kept as a baseline, and the score recorded
per generation so a regression is a number before it is a complaint.

### 4. Run the critic loop end to end

The vision gate was built and the loop was never watched. `--critic` renders
every slide, sends the PNG to the `critic` role, and hands the findings to a
fix turn that EDITS THE DECK — so a critic that cannot see is worse than none.

On the two-model question, since it came up: **hosted runs one model.** Critic
and author both resolve to the gateway. The split is local-only and forced —
Ollama reports `qwen3-coder:30b` as `completion,tools` and `gemma4:26b` as
`completion,vision,tools`, so the author physically cannot read a slide.
Locally the model is now asked what it can do (`/api/show`); remotely the
provider declares `vision_models`.

### 5. Surfaces never exercised

Each is a real user path that nothing has run:

- **The browser UI for chat and convert.** All of this session's turns went
  through the CLI and `runChatTurn`. The HTTP route was verified separately, the
  UI was not driven. (A deck generated by the CLI has no `meta.owner`, so a test
  account cannot open it — set one to drive the UI against a real deck.)
- **Auth flows** — register, login, password reset, email verification. Built
  the session before last, never re-verified.
- **`--upload` research**, **`report-new`**, **`deck-from-report`** — three
  entry points, zero runs.
- **Presenter assignment with a real team.** Every deck this session had no
  team, so every slide rendered `Presenter: —`.
- **Rate limits and quotas** under real load.

### 6. Still-open roadmap items

`docs/ROADMAP.md` has the detail. The ones with teeth:

- **The admin panel, swept** — deferred deliberately; it is the operator's own
  surface, not a user's.
- **The front end** — priority HIGHEST in the file. The briefing is fifteen
  cards and a user who answers nothing still clicks through all fifteen; the
  completed transcript reads "0 members / no guide set / no subject set". That
  is product judgement and `AGENTS.md` says to ask before changing it.
- **The fitter's `tracking` unit bug** — unchanged, still wants its own round
  against a fresh `themematrix --save` baseline. Keeps `matrix` out of the
  landing showcase.
- **24 contrast pairings** clearing 3:1 but not 4.5:1 (`test/contrast.test.js`).
- **`venn`'s caps** — measured at 14, declared at 30/27.

---

## What this session actually did

Three stretches. The web app's entry flow, then the deck and report generated
end to end and read page by page, then every post-generation path a user takes.
**Thirty defects**, none of which any existing check reported.

**The briefing and the app's front door.** Every hosted user was told the
install had no gateway key — `/api/models` built its `auto` object only when the
key was set and then dropped the `keySet` that proved it, so the warning was
permanent. A saved format made the briefing ask "who is your guide?" twice and
the research question six times. The first question had exactly one possible
answer on a new account. The composer claimed "every model call stays on this
machine" on a hosted box. `&amp;` reached the screen.

**The deck.** A missing `section` on 4 of 14 slides left the chrome eyebrow with
no label. Six of nine speaker notes were cut mid-word at their cap. A heading
rule was drawn under an absent heading. `framework` stranded its slack as a dead
bottom third and `flow`'s labels floated an inch and a half clear of the chips
they name. A `takeaway` with no headline had no title at all. `stats` broke
`<1000h` into two lines and printed a caption on top of "commercializat/ion"
after a theme switch. The deck title overflowed on three themes because the
grammar allowed 90 characters where 52 fits everywhere.

**The report.** Raw JSON typeset as body prose. A reference that ran 600
characters of `[Google Scholar] [PubMed]` repeated twenty times. A data table in
the Abstract.

**The edit paths.** A chat turn edited slide 6 when told slide 5, and reported
success. A turn wrote one type's fields onto another's slide, validated, and
rendered identically. The ops array was unbounded — the documented runaway shape.
An edit ran *no* post-turn pass at all.

**The rest.** Finalize was manual and silently so — generation calls it itself,
so reaching "fully written but never finalised" always means the run was
interrupted, and recovery was a button nobody knew to press. Research
diversified per query rather than per corpus, so one domain still supplied three
of ten sources. A script segment was written as the single character `}` and
then PRESERVED across regenerations by "keep previous words". `--slide 12`
rewrote slide 13. The vision critic's `vision: true` was read by nothing, so
hosted it would have posted slide images to a text model and edited the deck
from the reply.

**And three things that were not defects but gaps.** Users were never told what
happens to their decks — the privacy page said 90 days where the scheduler
deletes at 30, and privacy/terms/contact rendered only in the landing footer,
which never appears once signed in. Thinking mode was off for the entire
project, because nobody had read §6 of the gateway guide. And content quality
had no measure at all, which `npm run deckscore` now half-answers.

---

## Traps this session paid for

All thirteen are in `docs/TRAPS.md`. The four that will bite again soonest:

**A rule stated in prose is a hint; the grammar is what binds.** Three separate
components failed this way — the slide selection ("applies to EXACTLY these"),
the divider length ("40-80 words"), the host diversity ("per host"). Each was
correct as written and enforced nothing.

**Constrained decoding constrains the type and the length, never whether the
characters read as English.** A schema asking for strings is satisfied by
strings that are JSON. And a field sitting exactly AT its cap was cut by the
grammar, not finished by the writer — invisible to an over-cap check and to an
ellipsis check alike.

**A field the schema offers is a field the model will fill.** The table reached
the Abstract because the grammar offered it there.

**`cloudSpec` builds its own spec and silently drops per-role options.** It does
not go through `resolveRole`, so `thinking`, `reasoning_effort` and the provider
capability flag all vanished on exactly the path a hosted deck takes — the path
least likely to be exercised locally. Grep it before believing a new per-role
option works.

---

## Instruments worth reusing

- **Generate, then LOOK.** Every one of the thirty came from payloads a
  model actually wrote — an omitted optional field, a note stopped at its cap,
  paragraphs that were JSON. The specimen carries none of those shapes, so every
  sweep over it stays clean. `--deck` on a real generated deck is not a nicer
  specimen sweep; it is the only version that asks the question.
- **Instrument the failure before fixing it.** Finalize looked like it stranded
  decks on a dead gateway. A chat stub that counted calls and threw showed three
  calls attempted, all thrown, and finalize completing anyway — the model passes
  catch their own errors. The real cause was that recovery was a button.
- **At schema caps the layouts hold.** Six bullets at the 160-char ceiling are
  clean across all 34 themes. A valid overfull fixture is not constructible
  without contriving one, so use a real deck rather than writing a test that
  passes because nothing was overfull.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.

## Known and not fixed

- `decks/perovskite-solar-cells-stability-challenges-2` is the deck everything
  above was found in — real generated content, kept as a fixture. Every check
  takes `--deck`; use it.
- The older `decks/electrochemical-impedance-spectroscopy-for-l` predates the
  cap corrections and still reports over-length fields. That is the caps
  working, not a regression.
- `matrix` is held out of the landing showcase until the tracking bug is fixed.
- `feature-grid` is two lines of speaker-note debt on `minimal-muji`.
