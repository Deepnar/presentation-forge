# Handoff — 2026-09-05, the model sessions: a team, a critic, and the chain to a picture

Everything is on `main` and pushed. `npm test` is **660 passing** (was 626 two
sessions ago; every new test was run against the old code and seen to fail
first). `themematrix`, `drawcheck`, `textcheck` and `capfit` are clean across 34
themes × 74 slide types. The working tree is clean and the GPU is free.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. **`docs/PRODUCTION.md` is new and is the thing to read before
planning a session** — every item still outstanding between here and real users,
checked against the code rather than carried forward. `docs/TRAPS.md` is the
cross-cutting failure list and gained six entries; it outlives this file.

The gateway was not touched and is still wedged. Everything below ran on local
`qwen3.6:35b-a3b`:

```bash
SC=/tmp/forge-local && mkdir -p $SC && cp config/models.yaml $SC/
cp config/identity.example.yaml $SC/identity.yaml
printf '{"hosted": false}\n' > $SC/hosted.json && echo '{"settings":{}}' > $SC/runtime.json
# append a `team:` block to $SC/identity.yaml — see "Running with a team"
FORGE_TCET_API_KEY= FORGE_HOSTED=0 FORGE_CONFIG_DIR=$SC npm run forge -- <cmd>
```

**Everything below is a pipeline result, not a quality result.** Local is for
exercising; Auto is what the product is judged by.

---

## What to do next

`docs/PRODUCTION.md` has the full ordered list. The single highest-value item:

**Run the report end to end.** `report-new` and `deck-from-report` have zero
runs, and the report is the *graded* artefact. A run was started and abandoned;
nothing has ever completed. It goes through the same model and grammar machinery
that produced five separate "the right answer was unrepresentable" defects in one
session, so the prior is high. Read the artefact back — render the real `.docx`
through the donor and run `pdftotext -layout` over it, rather than asserting on
`report.yaml`.

After that: the turn grammar for chat (§4.1), and the browser-coverage direction
decision (§1.4), which is the one worth taking before launch rather than after.

---

## What these two sessions did

### Verified with a model, for the first time

- **Presenter assignment with a real team.** Team roster on the title slide, the
  one assigned member in each content footer, dividers carrying only the slide
  number. **No defect** — the only thing in either session's list that was
  already right.
- **The vision critic loop.** It found a real clipped card body off a rendered
  PNG on a deck where every mechanical check was clean, quoted the exact string,
  and — after the grammar fix below — now applies its fix and converges clean on
  the next round.
- **The whole plan → seat → picture → render chain**, which had never run.

A 22-slide team deck scored **94/100** on `deckscore` (the previous deck: 83) —
intact 100%, grounded 100%, varied 100%, whole 90%, fits 82%.

### Thirteen defects fixed

Grouped by what was hiding behind them.

**The grammar made the right answer unrepresentable — five times.**

1. The outline schema's `slides` had `minItems: 3`, and two plans in nine came
   back exactly three slides. `mintContentSlides` padded each into a 19-slide
   deck of identically-worded bullets and nothing reported it.
2. `type` was capped at 16 characters, so `metric-comparison` (17),
   `layered-architecture` (20) and `illustrated-points` (18) could not be
   spelled. **Two of those had never once been plannable** and it looked like
   taste.
3. A slide could name a section index the plan never declared.
4. A divider that omitted its index stopped being that part's opener — eight
   dividers on a four-part plan.
5. `runTurn` built its ops grammar from all 74 types at once, so a `feature-grid`
   patch was constrained by `contact`'s `items`. The critic's correct finding
   **could not** have been fixed.

**A pass discarded its own work, or shipped what it should have refused.**

6. `fieldLengthPass` gated on whole-deck validity — false whenever any field is
   over its cap, which is the condition it exists to repair — so it returned the
   deck it was handed while still reporting the repairs as applied.
7. Keeping those repairs exposed a rewrite returning `{title: "", body: ""}`:
   every cap satisfied, all meaning gone, and no schema rule can refuse it.
8. The critic's fixes never reached the `.pptx`, and the presenter fallback made
   that look deliberate rather than broken.

**Nothing compared the result with the request.**

9. A 211-word page of algebra entered a vehicle-to-grid research corpus on one
   appearance of "integration" — in *"definite and indefinite integration"*.
   Density has a floor it cannot see below: any page under 250 words clears 4.0
   on a single hit.
10. Image supply returned, in one afternoon, for one slide: the planet Jupiter,
    an 1898 lithograph of human anatomy, an abandoned bus in the Atacama, a
    musical notation mark, and a school building in Hurricane Sandy. Every one
    correctly licensed and high-resolution, because ranking sorted by licence
    tier and pixel width.

**The config was a comment.**

11. `roles.author.thinking` was never sent to Ollama at all.
12. And once it was, the `research` role — which declares no thinking — was
    found returning ~17,000 characters of reasoning per call, because a capable
    model thinks by DEFAULT. Sending `think: false` took that call **27s → 3s**.
13. The catalogue announced `illustrated-points` and `cards` as
    "ESCAPE HATCH (rasterised, text not editable)", the bucket for types with no
    family, which is meant to hold `freeform` alone.

### Built

**`illustrated-points`** — the seat auto image supply never had. Of the 73 types
before it, exactly one (`testimonial`) had an optional `image` field, so every
`[image]` note landed where nothing could seat it; on one real deck the single
note in 22 slides was on the title slide. The new type is three to six points
with an OPTIONAL image: written empty it renders as an ordinary full-width list,
and a picture dropping in later moves the points to a column without losing one.

**Seats are assigned, not asked for.** Across seven planning samples and three
promptings the model chose the type zero times; told to "include two or three"
it complied and variety collapsed from 17 distinct types to 10 with up to seven
charts. `seatIllustratedBeats` assigns them after the outline returns — the way
presenters and the structure contract already are.

**An empty seat is a request**, and what to photograph is asked of the utility
role as a literal subject with a *minimum* length (told "six words at most" it
answered "bus", and the search obliged with an abandoned bus in a desert).

---

## Running with a team

`config/identity.example.yaml` has no `team:` block. Append one to the scratch
identity or every deck renders `Presenter: —`:

```yaml
team:
  label: "Group 7"
  members:
    - { name: "Aarti Deshmukh", roll: "TCE21-014", presenting: true }
    - { name: "Rahul Mehta",    roll: "TCE21-027", presenting: true }
    - { name: "Priya Nair",     roll: "TCE21-033", presenting: true }
    - { name: "Imran Sheikh",   roll: "TCE21-041", presenting: true }
```

`--slides-per-member N` freezes into `meta.yaml` and drives both the plan's
content budget and the deterministic split.

---

## Timing and the GPU, so nobody misreads it

`qwen3.6:35b-a3b` runs **100% on GPU, ~22.6 GB, 68°C**. Budget **~3 minutes per
slide-write call** — a 22-slide deck is over an hour of writing before finalize
and the critic. It is not a hang.

One session reported the model as GPU **and CPU** late at night and 100% GPU
again the next morning with nothing changed. The likely mechanism: **the critic
loop interleaves renders with model calls**, and plate/preview rendering uses
headless Chrome, which takes VRAM while the model is resident. Check `ollama ps`
before concluding the pipeline got slower.

---

## Instruments worth reusing

- **Sample a model stage before believing one run of it.** The first outline was
  a stub and the second was excellent. Nine samples cost twenty minutes and
  turned "the model plans badly" into a rate with a mechanical cause.
- **A result sitting exactly ON a bound is the grammar's choice, not the
  model's.** Both stubs were three slides and `minItems` was 3.
- **Ask "could it have done this?" before "why didn't it?".** Three separate
  gates made the right answer unrepresentable and every one looked like taste.
- **Assert what must be ABSENT.** "Is the right presenter on this slide" passes
  against a render that prints the whole roster — containment against a superset
  can never fail.
- **A stub that skips what the real collaborator does tests the stub.** The
  critic stub had to render its output, and drop `presenter` as the ops layer
  really does, before it tested anything.
- **State the asymmetry and the threshold stops being a judgement call.** A
  wrong picture ships; a refused one leaves an ordinary list. Bias to refusing.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.

## Known and not fixed

All of it, with symptoms, is in [`PRODUCTION.md`](PRODUCTION.md) §5 and §6.
The short version: the turn grammar still merges every type for chat; the image
progress line prints a slide index where a counter belongs; `looksCutAtCap`
false-positives on at-cap headlines; the coherence pass missed three
near-identical headlines on one deck; `feature-grid` carries two lines of
speaker-note debt on `minimal-muji`.

`decks/vehicle-to-grid-integration-for-electric-bus` is the fixture worth
keeping — its slide 10 is the reproduction case for the grammar-cut defects and
its `research/sources.json` is the before-picture for the relevance evidence
rule.
