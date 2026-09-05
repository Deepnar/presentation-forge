# Handoff — 2026-09-05, metering, retrieval, and the price that made both necessary

Everything is on `main`. `npm test` is **785 passing** (was 660 at the start of
the day). `themematrix` is clean across 34 themes; `--notes` has its one known
`feature-grid` failure, now correctly stated. The working tree is clean.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. Two files are new and change how sessions should run:

- **`docs/BLOCKED.md`** — every blocker in one place, split into external /
  operator / decision, each naming who can clear it. Read it before concluding
  anything is stuck.
- **`docs/ECONOMICS.md`** — what a deck costs to produce and what it can be
  sold for. Read it before changing anything that sends tokens.

And one rule now written into both agreement files: **`docs/ROADMAP.md` is the
only place future work is recorded**, written there in the session it is
discussed. Work had accumulated in `PRODUCTION.md` §4 and §5 in parallel, and
whichever list was not being edited went stale.

## No model was available

Both backends were out all day. The gateway is still wedged — re-probed:
`/v1/models` in 0.7s, a two-token completion timing out at 90s. Local Ollama was
in use for other work and deliberately untouched. Everything below was verified
by grammar analysis, by stubs that obey the bounds they are handed, and by
rendering artefacts and looking at them.

---

## Where this stopped

**Nothing is unblocked.** Everything that could be done without a key, a model
or a decision has been done — `docs/BLOCKED.md` §4 lists what was closed and
states plainly that every remaining roadmap item now waits on §1, §2 or §3 of
that file. That is unusual and it is the most important line in this handoff:
the next move is not an engineering one.

Every open roadmap entry now names its blocker **in its own header**, so the
roadmap and BLOCKED cannot drift into disagreeing about what is stuck. Two
remaining items look like engineering and are not: the turn grammar's unscoped
case changes the SHAPE of a decoding grammar and needs a model to run against,
and `feature-grid`'s note debt means either cutting the body cap for all 34
themes or changing card geometry for one, which is a trade-off rather than a
fix.

### Read this before believing a blocker

**Two blockers in this repository were invented, by me, in this session**, and
both took the user asking to surface. The front-end app sweep was called
direction-gated for three sessions; the direction was on file the whole time
and covers it explicitly — *"Landing first, then a full app sweep."* The canvas
entry then cited that same non-existent gate.

The lesson generalises past those two entries: **a blocker that has never been
re-checked against the source is a claim, not a fact.** Before deferring
anything here on the grounds that it is blocked, open the entry and read what
it actually says. Everything currently in `BLOCKED.md` has been checked once;
that is not the same as being true forever.

## What to do next

**1. Get a provider key and run one deck.** It settles every money figure at
once — `meterSummary()` reports per-role token spend — and it is now the
cheapest it will ever be, about a rupee at the budget band. It also unblocks
report content quality, chat and convert through the UI, `--upload` research
and the research-to-page flow. `docs/BLOCKED.md` §2.1.

**2. SMTP.** Fifteen minutes, and it stopped being optional: with a lifetime
trial, making a new account is the way around the cap, and confirmation is the
cheapest deterrent.

**3. Two decisions** — browser coverage, and subscription vs credits.
`docs/BLOCKED.md` §3 states both with a recommendation.

---

## What this session did

### The report path, audited without a model

Four defects, all of the "the right answer was unrepresentable" family. The
worst had already shipped: the section budget was the deck's team-sizing rule
borrowed, so **any team of four or fewer got a report with no body section at
all**, and `report-new` is solo by construction.

The section list is now read from the donor template (`parseDonorSections`), a
topic can earn up to three sections of its own, and each section writer is
shown the outline and what has already been written — the prompt told it not to
repeat other sections while showing it none of them.

### Metering, tiers, and a trial

The quota metered "requests" while the operator is billed in tokens. The counts
were never missing — `chat()` has always returned them and every caller threw
them away. An async-local meter now adds them up, reservations settle at what a
run actually cost, and accounts carry a tier.

Wiring it surfaced **four routes spending on the gateway with no quota check at
all**: `report/generate`, `script`, `sweep`, and `resume`/`finalize`.

The free tier is a **lifetime trial** rather than a rolling allowance, because a
rolling window resets and exposure per account was unbounded. ~₹5–21 per signup
once, against ₹110–439 per user per semester.

### The cost, which turned out to be the business question

`writeSlide` sent the entire research excerpt on every call — 26 times for a
22-slide deck, ~1.6M tokens, 98.9% of it input and almost all the same text
again. At that price **₹99 bought three decks on the cheapest model and none on
anything better**: there was no student price point that worked.

Per-slide BM25 retrieval took it to ~135K, a measured **12×**. ₹99 now buys 40
decks at the budget band, 10 on a good model, at ~80% margin.

### The score, kept

`scoreDeck` existed and was run by hand, which answers "is this deck any good"
once and loses the answer. `finalizeDeck` now scores the finished deck and
appends to `config/scores.jsonl` with the backend that produced it;
`npm run deckscore -- --history [slug]` reads it back. A regression is measured
against the MEDIAN of recent runs rather than the previous one, because scores
move several points between decks on subject matter alone.

Three tests ran `finalizeDeck` without pinning `FORGE_CONFIG_DIR`, so the first
run of this wrote a fixture's score into the real config — the same trap as
`hosted.json` being read from the real config dir under `npm test`. Pinned.

### The app walk, and the front end that was not blocked

Once the false gate was removed, every route was driven in a real browser and
MEASURED — contrast against the composited background, block-level tap targets,
overflow, heading order.

- **Contrast is clean everywhere**, no overflow, no heading skips, and
  `#/chat`, `#/decks`, `#/settings` and `#/home` were clean on every measure
  before anything was touched.
- **One real defect class, in seven places.** Stacked nav columns rendered links
  at 21px with a 6px gap. Fixed at the container so the gap becomes the
  children's padding: target 21px → 29px, rhythm within 2px of before.

Two method notes worth more than the fix. The docs table of contents renders
`<button>`, not `<a>`, so a selector naming only anchors silently skipped the
column with the most entries — the fix *looked* applied and was not, which only
re-measuring caught. And the audit's own first output was 22 findings on one
route of which 11 were prose links WCAG exempts: **a measure that flags the
right thing is still a bad measure if it flags twice as much that is fine.**

That walk also, by accident, piloted one of the two options in *Nothing can test
the browser* — so that decision is now cheaper to make, and the entry records
what the approach caught and what it cost.

### Also

Selection-scoped chat grammar (10 of 22 slides were getting the wrong field
shapes; now 0). Six status frames the UI could not label. The `Auto` rename off
one institution's name, with both spellings resolving. Inserting a slide into a
finished deck, written by the writer rather than by chat. `looksCutAtCap`. The
coherence pass's repetition blindness — it was never looking for it. The trial
meter on the usage panel, which is the half of the refusal surface that is not
a taste question.

---

## Instruments worth reusing

- **A stub that ignores the bound it is handed makes a whole file blind to
  bounds.** One line — a fake returning six sections whatever `maxItems` said —
  is why a solo report with no body survived a passing suite.
- **A test can freeze a defect as an intention.** "small team, small report"
  asserted the plan came out as exactly the four graded-core sections. That
  list *is* the defect.
- **Ask what the code already violates before assuming a constant is
  load-bearing.** `REPORT_SECTIONS` looked foundational; it was one `filter`,
  and `IMAGE_CREDITS` had been proving the renderer name-agnostic for as long
  as it existed.
- **When a fixed list stops being fixed, grep the constant, not the function
  you were editing.** `reportBrief` walked it three files away.
- **Measure before defending a number.** The first token estimate was six times
  too low, in the direction that made the product look affordable.
- **The obvious protection can hide the defect.** Excluding dividers from the
  repetition comparison protects structure and conceals a content slide
  restating its own section title, which was the actual case.

## Known and not fixed

The README was rebuilt around real renders from `app/gallery/` — it claimed 34
themes and 74 slide types and showed neither. It now leads on the same stats
slide in four themes, which is the layer rule made visible rather than
asserted. The repository description and topics were set at the same time; the
old description said "no cloud LLM", which stopped being true when BYOK landed.

`docs/BLOCKED.md` for why anything is stuck; `docs/ROADMAP.md` for the work
itself. Unchanged: the turn grammar's unscoped case (options 2 and 3 change the
SHAPE of a decoding grammar and should not land without a model), the refusal
surface in the UI, and `feature-grid`'s note debt on `minimal-muji` — a 1pt gap
on a deliberately compact theme, not the 2pt the sweep used to claim.
