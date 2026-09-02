# Handoff — 2026-09-02, the pipeline swept end to end; hosting blockers are next

Everything is on `origin/main`. `npm test` is **492 passing**, `npm run
themematrix` is clean across 34 themes, the working tree is clean. 47 commits
this session.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map — it now carries the gateway's actual specification, from the
CoE Student Developer Guide. `docs/TRAPS.md` gained nine entries this session
and outlives this file. `docs/ROADMAP.md` carries every item below as a proper
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

### 2. Both gateway unknowns are now CLOSED — but one thing is newly worth a run

The CoE AI Gateway Student Developer Guide v1.0 (Aug 2026) settled them, and
`CLAUDE.md` now carries the specification:

- **The model id does not matter.** The field is required by the protocol and
  its value is IGNORED (§3) — the gateway serves one model and takes any
  string. The long served id `/v1/models` reports is not something callers must
  match.
- **It reads images** (§5), so the vision critic is viable hosted and
  `tcet-auto.vision_models` is no longer a guess.

What the guide opened instead: **thinking is off by default and taken per
request** (§6). The author and critic roles now opt in at `medium`
(`supports_thinking` in `config/models.yaml`), which means the passes that
reason have been asking a model that was not reasoning for this entire project.
**Nothing has yet been generated with it on** — the gateway has been down. The
first hosted run after it returns is the one to read closely, and to score.

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

Generated a real deck AND its report end to end, then read every page and
exercised every post-generation path. Twenty-two defects, none of which any
existing check reported.

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

**The rest.** Finalize was manual and silently so. Research diversified per query
rather than per corpus. A script segment was written as the single character
`}`. `--slide 12` rewrote slide 13.

---

## Traps this session paid for

All nine are in `docs/TRAPS.md`. The three that will bite again soonest:

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

---

## Instruments worth reusing

- **Generate, then LOOK.** Every one of the twenty-two came from payloads a
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
