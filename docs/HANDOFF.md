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
2. **`concept-map`'s cap**, then **`cycle`'s arrangement** — §10, and `cycle`
   needs the human before it is built.
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
| `npm run themematrix` | clean, 34 themes x 75 types |
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
`concept-map`, `cards`, `before-after` (8 each). Most of that is cap debt that is
now honestly reported; look anyway, because the two classes below do not report.

## The three findings worth carrying forward

**1. A shared schema field is invisible to anything that reads the type rule
alone.** `headline` (≤80) and `standfirst` (≤150) are declared once on
`definitions.slide.properties`, and every consumer walked
`allOf[].then.properties`. On 75 of 75 types the length pass never told the model
the headline had a cap, `trimSlide` could never shorten one — its own
skip-headline branch had been unreachable since it was written — and the cap
prober never grew one. **Ask what the fixture does not carry.** That is now the
second half of `npm run drawcheck`'s output rather than something to remember.

**2. Derive the number once and use it for the fit, the box and the advance.** A
budget that is not the box the text is drawn into is a bug in both directions —
more generous hides an overflow, less generous invents a failure, and they look
nothing alike from a sweep. The standfirst was fitted against 0.85in, drawn into
0.75in and advanced 0.72in. `before-after` fitted a body against 1.8in and drew
it into 0.94in. `cycle` fitted a step body against 0.45in and drew it into
0.28in — and the hub, which has to clear the steps, was sized against the smaller
number. `pros-cons` handed `fitScaleAll` the whole column, and it fits EACH
member into the height given, so the stack was never measured at all.

**3. Ask whether the SHAPE is the constraint before cutting what the content may
say.** `metric-comparison`'s delta pill was a flat 1.3in for a 12-character
field, and no fit could have saved it because the subhead floor stops a 15pt role
shrinking below 0.93. The pill is sized from its content now. This rule has paid
in every session it has been applied.

## What the checks still cannot see

**Do two boxes overlap?** Both are on the slide, both fit their own text, and
they are drawn on top of each other. `cycle` is the live case. An overlap check
is not obviously tractable — a label over a filled shape is the normal case, so a
naive one would report every card in the gallery — so **do not build one
speculatively.** Looking is the instrument until someone has a specific idea.

## Known and not fixed

- **`concept-map` at its caps is illegible. Cut the cap.** `TYPE_BUDGETS`
  already tells the writer "one or two words — long leaves cannot fit a radial
  layout" and the cap says 27. The guidance is right and the cap contradicts it;
  this needs no decision, only the cap round.
- **`cycle` cannot hold its arrangement with a speaker note.** `radiusY` is
  pinned at its 1.15in floor; the arrangement needs about 1.53in for a minimum
  hub plus a step's title and body, so the hub overlaps the top and bottom
  steps' bodies. It always has, on every theme. The repair is an arrangement
  that gives up the ring when the box is short — **put that to the human before
  building it**, because it changes what the type looks like.

`quote`, `epigraph` and `freeform` draw neither headline nor standfirst. For the
first two that is a question about what a full-bleed quotation surface is, not a
defect; `freeform` is the rasterised escape hatch by definition. All three sit in
`drawcheck`'s ACCEPTED list with that reasoning, and a stale entry there fails
the run.

## Deleting a theme is fine — run one check first

The gallery is deliberately large and cutting a weak theme is a normal edit.
Before deleting, run `npm run coverage -- --without <names>`. The layouts branch
on composition axes, so a theme can be the last one selecting a frame, an
opening or a list treatment; deleting that one does not fail anything, it just
means the branch is never rendered by any sweep again.

Today no theme is a sole carrier. Five are one of two: `editorial-magazine` and
`newsprint` (two-column lists), `sci-fi-hud` and `isometric-dark` (the sidebar
frame), `letterpress` (dropcap, with `editorial-magazine`). The other 29 cost
nothing structurally.

**Do not delete a theme to make a check green.** None of the thirteen defects
found this session was a theme's fault — they were layout bugs shared across the
gallery. Deleting `minimal-muji` would make `themematrix --notes` clean and leave
`feature-grid` exactly as tight as it is. Delete on taste, which is the human's
call; `node tools/themesheet.mjs` renders all 34 on one page for that decision.

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
