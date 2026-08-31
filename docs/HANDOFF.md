# Handoff — 2026-08-31, the fixed-scale sweep and the fields nothing rendered

Everything is on `origin/main`. `npm test` is 383 passing, the working tree is
clean.

**Start here.** `AGENTS.md` is the working agreement — commit discipline, how
the roadmap is worked, conventions. `CLAUDE.md` is the operational map and lists
the checks. `docs/ROADMAP.md` §10 is the standing quality list and is current.
`docs/TRAPS.md` holds the cross-cutting failure modes and outlives this file.
This file is only what the last session learned that those do not say.

## What was done

**§10 is 10 of 17 items closed.** Two closed, one opened for what is left.

- **Text drawn at a fixed scale now reports.** Eighteen of nineteen sites fit;
  the nineteenth is a fixed glyph in a fixed box and says so.
- **The cap residue went from eleven fields to one.** Three came off by fixing
  a layout rather than cutting a cap.
- **Four layouts were silently dropping content the schema offers.** That was
  the session's real finding, and nothing in the repo could have reported it.
- **`npm run capstress`** renders any type at its schema caps and rasterises it.
  Every defect below that the sweeps were clean on came out of using it.

## The state of the checks

| check | result |
|---|---|
| `npm run themematrix` | clean, 34 themes x 75 types |
| `npm run themematrix -- --notes` | 2 — `feature-grid` on `minimal-muji` |
| `npm run textcheck` | clean, specimen and the real deck |
| `npm run themematrix --deck <real>` | 9 — `cards` x5, `takeaway` x4 |
| `node tools/capfit.mjs` | 1 field over its measured length |
| `test/contrast.test.js` | 24 recorded, passing both ways |

## The finding worth carrying forward

**A field the specimen does not carry is a field nothing has ever rendered.**
Twelve string fields were absent from every specimen slide. Populating nine of
them — the other three are asset paths and a chart-internal unit — found four
layouts that drop content the schema promises: `compare` never drew either
side's points, `image-text` never drew its caption, `diagram` never drew an
edge label, `branching-flow` never drew a step body. 408 words a side,
identically on all 34 themes.

No sweep could have reported it. A field that is never drawn is never fitted, so
the fit sweep sees nothing, and only the text check — and only once the fixture
carried the field — said a word. **Enumerate what a fixture does not cover; do
not read what it does.**

Three of the four are now drawn. The fourth is a decision the measurement
forced: a `branching-flow` step body needs two-line cards, two-line cards take
the column the decision diamond grows into, and the decision label drops to 19
characters — below the twenty its own specimen uses. The type is named for its
decision, so `bs.body` stops being offered rather than being drawn badly or
dropped quietly.

## What the checks still cannot see

Every check in the repo answers "does this text fit this box". Three classes sit
outside that, and all three bit this session:

1. **The size the text is actually drawn at.** A role set at a fraction of its
   token was being fitted against the token, so the floor landed in the wrong
   place and failures were reported for text that seats.
   `fitAt`/`fitAllAt`/`fitLineAt` take the fraction — use them for any `scale:`
   that is not 1.

2. **Where a shape ends up.** Nothing asks whether a box is on the slide.
   `branching-flow` drew its last row of branch cards under the speaker-note bar
   and off the bottom edge with every label fitting its own shape and a clean
   sweep. **A layout that stacks shapes must budget the whole column against
   `box.bottom` itself.**

3. **A fit budget that is not the box the text is drawn into.** Six layouts had
   it. More generous than the box hides an overflow; less generous invents a
   failure. They look nothing alike from the sweep, so check both directions.

## The rule that decided every cap

**Ask whether the SHAPE is the constraint before cutting what the content may
say.** It paid off every time:

- `chronology` measured 87 of 160 because it fitted against a box narrower and
  shorter than the one it draws into. Fixed, it seats all 160.
- `bibliography` gave its citation a flat 55% of the row whether or not an
  annotation existed. 105 became 203.
- `hero-image` left half its 2.6in overlay unused. 105 became its full 120.
- `roadmap`'s item title read 23 of 30 with a third of an inch empty above it.

Cutting first would have hidden all four.

## Using capstress

```bash
npm run capstress -- --types funnel,framework       # at their caps, then LOOK
npm run capstress -- --scale 0.01                   # at one character
```

A type that still fails with every field at one character has a failure **no cap
can fix**, and the render says which shape. `diagram` sat at 4% for exactly that
reason: it fitted a body into the 0.17in a dense graph leaves, which no text
fits, and the prober read it as a savage cap. `capFit` now tests that case first
and reports "the layout, not the caps".

## What is left

`docs/ROADMAP.md` §10, in priority order:

1. **The front end and the landing page.** The largest remaining item, a
   different kind of work — agree direction before writing code.
2. **The visual audit at schema caps.** `capstress` exists for this; the
   gallery has not been swept type by type at full size.
3. **Reports** — structure, and the two-LibreOffice-pass render.
4. **Research and content flow / the full functional sweep.**
5. **`config/models.yaml`** names six local models, none installed.

Known and not fixed:

- `feature-grid` is the two remaining lines of speaker-note debt, on
  `minimal-muji`. Its card is derived end to end — the shape test finds no
  slack — and the shortfall is seven hundredths of an inch.
- `cards.cards[].body` seats 82 against a cap of 95. Cutting a cap moves the
  scale the other fields are measured at, so this list never quite reaches
  zero; one round per session is the right pace.
- `cards.cards[].title` seats 14 of 27 when the body is near its own cap. The
  two compete for one card; the field-length pass is what resolves it at
  generation time.

## Generation

The TCET gateway (`config/models.yaml`, `providers.tcet-auto`, model `qwen3.6`)
answers in under a second with `FORGE_TCET_API_KEY` in a gitignored `.env` at
the repo root.

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

`FORGE_HOSTED=1` makes Auto resolve to the gateway and never fall back to the
local Ollama, whose GPU is committed to other work. A 17-slide deck generates
end to end without research in a couple of minutes. The model client allows 300s
per request with retries, so a single stubborn slide can burn ten minutes in the
field-length pass.

## Known and deliberate

- The callout bar inverts to light on dark themes. Consistent and intentional.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
  Identity is per account now; set a real one in Settings.
- The dev account store holds well over a hundred throwaway test accounts. That
  database must not travel to production.
- `decks/electrochemical-impedance-spectroscopy-for-l` is kept deliberately as
  the real-content fixture. Every check takes `--deck`; use it.
