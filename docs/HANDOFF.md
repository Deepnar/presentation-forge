# Handoff — 2026-08-31, the gallery swept, and the checks that made it repeatable

Everything is on `origin/main`. `npm test` is 391 passing, the working tree is
clean.

**Start here.** `AGENTS.md` is the working agreement — commit discipline, how
the roadmap is worked, when to stop and ask. `CLAUDE.md` is the operational map
and lists the checks as four questions rather than one. `docs/ARCHITECTURE.md`
has a new **Verification** section describing the instruments. `docs/ROADMAP.md`
§10 is the standing quality list and is current. `docs/TRAPS.md` holds the
cross-cutting failure modes and outlives this file. This file is only what the
last session learned that those do not say.

---

## Do this first — and do not do anything else instead

**The front end and the landing page is the top item and it is blocked on the
human.** Your first action this session is to ask, using the five questions
already written into its `docs/ROADMAP.md` entry: reference and feel, landing
page or app first, restyle or rebuild, real decks or mockups, motion budget.

Send those questions and **wait**. Do not open the item on a guess, and do not
skip to a lower item because nobody has replied yet. That substitution is
exactly why this has stayed at the top of the list while everything under it got
polished, and `AGENTS.md` now forbids it.

**If and only if the human has answered**, build to the answer.

**If the human has answered "not now" or has already redirected you**, take the
next item in this order — from the top, not whichever looks easiest:

1. **Finish the visual audit on the covering set.** Below; it is the only item
   with a fully specified next step.
2. **Cut `venn`'s caps** — §10. It renders correctly at 35% of its caps and
   scores 48%, so the caps are what is wrong, not the layout.
3. **Reports** — structure, and the two-LibreOffice-pass render.

---

## What was done

**The gallery was swept once — every type at its caps, with a speaker note — and
thirteen defects came out of it.** Not one was reportable by any check that
existed at the start. Three became reportable by the end, because the looking
kept turning up the same classes and each was mechanisable:

- **`src/geometry.js`** — is the box on the slide? Runs inside every render, so
  `themematrix` answers it for the whole gallery for free. Found 105 problems
  the first time it ran.
- **`npm run drawcheck`** — was the field drawn at all? Text that is never drawn
  is never fitted, so no fit sweep can see it.
- **`src/coverage.js`** — which themes a sweep has to look at. Eight, not 34.

## The state of the checks

| check | result |
|---|---|
| `npm test` | 391 passing |
| `npm run themematrix` | clean, 34 themes x 73 types |
| `npm run themematrix -- --notes` | 2 — `feature-grid` on `minimal-muji` |
| `npm run themematrix --deck <real>` | 45 — `cards` x41, `takeaway` x4 |
| `npm run textcheck` | clean, 34 themes |
| `npm run drawcheck` | clean; 10 accepted, 3 unpopulated |
| `npm run capstress` | 122 across the 8 covering themes |
| `node tools/capfit.mjs` | 26 fields over their measured length |
| `test/contrast.test.js` | 24 recorded, passing both ways |

**Three counts rose and all three are the checks working, not regressions.**
`capfit` went 1 → 26 and `capstress` 9 → 64 because the prober and the sweep now
stress a slide carrying a standfirst, which is the slide a model actually
writes. `capstress` then went 64 → 122 because it runs eight themes instead of
four. None of it is new debt. **Before treating a rising count as a break, check
whether the payload or the theme set changed.**

## Finish the visual audit — the specified next step

`docs/ROADMAP.md` §10 "The visual audit, at schema caps". One theme of eight has
been looked at type by type. Do the rest, in this order, and look at the page —
the machine half is already clean on most of it.

```bash
npm run capstress -- --themes sci-fi-hud            # the only sidebar frame
npm run capstress -- --themes corporate-clean-blue  # the only offset frame
npm run capstress -- --themes editorial-magazine    # the only two-column list
npm run capstress -- --themes high-contrast-mono    # the widest type in the gallery
npm run capstress -- --themes gradient-mesh-dark    # a plate ground, centred heading
npm run capstress -- --themes bauhaus,minimal-muji  # numeral opening; tightest margins
```

Take the frames first. `layered-architecture` had two columns that did not fit
`sci-fi-hud`'s 8.0in row, and that was found by measuring rather than by looking
— the frames are where constants that assume a full-width box break.

The types worth opening full size, by how much the covering sweep flags them:
`venn` and `layered-architecture` (15 each), then `pros-cons`, `dependencies`,
`cards` and `before-after` (8 each). Most of that is cap debt that is
now honestly reported; look anyway, because the two classes below do not report.

## The three findings worth carrying forward

**1. A shared schema field is invisible to anything that reads the type rule
alone.** `headline` (≤80) and `standfirst` (≤150) are declared once on
`definitions.slide.properties`, and every consumer walked
`allOf[].then.properties`. On every type the length pass never told the model
the headline had a cap, `trimSlide` could never shorten one — its own
skip-headline branch had been unreachable since it was written — and the cap
prober never grew one. **Ask what the fixture does not carry.** That is now the
second half of `npm run drawcheck`'s output rather than something to remember.

**2. Derive the number once and use it for the fit, the box and the advance.** A
budget that is not the box the text is drawn into is a bug in both directions —
more generous hides an overflow, less generous invents a failure, and they look
nothing alike from a sweep. The standfirst was fitted against 0.85in, drawn into
0.75in and advanced 0.72in. `before-after` fitted a body against 1.8in and drew
it into 0.94in. `pros-cons` handed `fitScaleAll` the whole column, and it fits EACH
member into the height given, so the stack was never measured at all.

**3. Ask whether the SHAPE is the constraint before cutting what the content may
say.** `metric-comparison`'s delta pill was a flat 1.3in for a 12-character
field, and no fit could have saved it because the subhead floor stops a 15pt role
shrinking below 0.93. The pill is sized from its content now. This rule has paid
in every session it has been applied.

## What the checks still cannot see

**Do two boxes overlap?** Both are on the slide, both fit their own text, and
they are drawn on top of each other. It cost the gallery two types this session:
`cycle` and `concept-map` overlapped their own content at ordinary length and
every check was clean on both. An overlap check is not obviously tractable — a
label over a filled shape is the normal case, so a naive one would report every
card in the gallery — so **do not build one speculatively.** Until someone has a
specific idea, the cheap substitute is `npm run capstress -- --scale 0.35`:
ordinary content rather than a stress case, and what still overlaps there has an
arrangement no cap will fix.

## Known and not fixed

- **`venn`'s caps are too generous.** It scores 48%, second-lowest in the
  gallery, and renders correctly at 35% — so `sets[].label` (30) and
  `sets[].items` (27) come down to the measured 14 apiece. No decision needed.
- **`feature-grid`** is two lines of speaker-note debt on `minimal-muji`. Its
  card is derived end to end and the shortfall is seven hundredths of an inch.

`quote`, `epigraph` and `freeform` draw neither headline nor standfirst. For the
first two that is a question about what a full-bleed quotation surface is, not a
defect; `freeform` is the rasterised escape hatch by definition. All three sit in
`drawcheck`'s ACCEPTED list with that reasoning, and a stale entry there fails
the run.

## Deleting a slide type is a normal edit

**73 types, and that is not a number to defend.** `cycle` and `concept-map` went
this session: both overlapped their own content at 35% of caps — ordinary
content, not a stress case — so neither was a cap problem, and both needed a new
arrangement rather than a repair. `flow` and `pipeline` carry ordered steps;
`hierarchy` carries branching relationships; both render cleanly.

The test for "delete or cut the caps" is cheap and worth applying to any type
that looks wrong:

```bash
npm run capstress -- --types <type> --scale 0.35
```

Overlaps there → the arrangement is wrong, delete it. Clean there → the caps are
what to cut. `venn` passed and stayed. Note the cap prober cannot make this call:
it scored `cycle` at 100% because an overlap is not a fit failure.

Deletion touches, and nothing else: the schema enum and its `allOf` rule,
`src/layouts.js`, `src/specimens.js`, three maps in `src/ai/catalog.js`, the
`SlideEditor.jsx` descriptor, and the `test/vocabulary.test.js` fixtures plus its
family-list assertions. Check no deck on disk uses the type first
(`grep -rl "type: <name>" decks/*/deck.yaml`), then let `npm test`,
`themematrix`, `drawcheck` and `textcheck` catch anything dangling.

## Cap rounds — one per session, and check the shape first

`node tools/capfit.mjs` reports 26 fields over their measured length. Do not cut
them all: cutting a cap moves the scale every other field on that type is
measured at, so the list never quite reaches zero, and one round per session is
the right pace. For each candidate, ask whether the shape is the constraint
before touching the cap — four of a previous session's five cap "failures" were
layouts with slack, not caps that were too generous.

## Generation

The TCET gateway (`config/models.yaml`, `providers.tcet-auto`, model `qwen3.6`)
answers in under a second with `FORGE_TCET_API_KEY` in a gitignored `.env` at
the repo root.

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

`FORGE_HOSTED=1` makes Auto resolve to the gateway and never fall back to the
local Ollama, whose GPU is committed to other work. A 17-slide deck generates end
to end without research in a couple of minutes. The model client allows 300s per
request with retries, so a single stubborn slide can burn ten minutes in the
field-length pass.

## Known and deliberate

- The callout bar inverts to light on dark themes. Consistent and intentional.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
  Identity is per account now; set a real one in Settings.
- The dev account store holds well over a hundred throwaway test accounts. That
  database must not travel to production.
- `decks/electrochemical-impedance-spectroscopy-for-l` is kept deliberately as
  the real-content fixture. Every check takes `--deck`; use it.
- `FORGE_GEOM_TRACE=1` on any render prints the stack of the draw call behind a
  geometry verdict. The message names the type and the theme; the layouts are
  four thousand lines.
