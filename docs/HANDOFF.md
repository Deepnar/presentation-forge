# Handoff — 2026-08-31, the fixed-scale sweep and what it uncovered

Everything is on `origin/main`. `npm test` is 383 passing, the working tree is
clean.

**Start here.** `AGENTS.md` is the working agreement — commit discipline, how
the roadmap is worked, conventions. `CLAUDE.md` is the operational map and lists
the checks. `docs/ROADMAP.md` §10 is the standing quality list and is current.
`docs/TRAPS.md` holds the cross-cutting failure modes and outlives this file.
This file is only what the last session learned that those do not say.

## What was done

**§10 is 9 of 17 items closed.** One item closed, one new item opened for the
residue it exposed.

- **Text drawn at a fixed scale now reports.** Eighteen of the nineteen sites
  fit; the nineteenth is a fixed glyph in a fixed box and says so.
- **Nine schema caps cut to what the layouts seat**, and four layouts made to
  seat what they promise rather than having their caps cut.
- **Two blind spots closed in the cap prober** and one in the field-length
  pass's schema walk — the largest single finding of the session.

## The state of the sweeps

| check | result |
|---|---|
| `npm run themematrix` | clean, 34 themes x 75 types |
| `npm run themematrix -- --notes` | 4 — `diagram` x2, `feature-grid` x2 |
| `npm run textcheck` | clean, specimen and the real deck |
| `npm run themematrix --deck <real>` | 9 — `cards` x5, `takeaway` x4 |
| `test/contrast.test.js` | 24 recorded, passing both ways |

The speaker-note debt went 5 → 4 and the real deck 10 → 9; both losses were the
`compare` slide, which is now the type that gained the most room.

## What the sweep could not see, and still cannot

This is the part worth carrying forward. Every check in the repo answers "does
this text fit this box". Three whole classes sit outside that:

1. **The size the text is actually drawn at.** A layout that sets a role at a
   fraction of its token was being fitted against the token. The floor is a
   point size, so the fitter answered the wrong question and reported failures
   for text that seats. `fitAt`/`fitAllAt`/`fitLineAt` in `src/layouts.js` take
   the fraction; use them for any new `scale:` that is not 1.

2. **Where a shape ends up.** Nothing asks whether a box is on the slide.
   `branching-flow` drew its last row of branch cards under the speaker-note bar
   and off the bottom edge with every label fitting its own shape and a
   completely clean sweep. Found by looking at a render; nothing else would
   have. **Any layout that stacks shapes must budget the column against
   `box.bottom` itself.**

3. **A fit budget that is not the box the text is drawn into.** Three layouts
   fitted to one height and drew into another. The sweep is clean and the text
   runs out of the card.

## The prober is now trustworthy in three more places

`tools/capfit.mjs` measures what a field may actually say. It had three faults,
all of which made a cap look safer than it is:

- **`resolvePath` could not follow a `$ref` or descend a nested array**, so
  `compare.left.*`, `branching-flow.steps[].*` and `roadmap.phases[].items[].*`
  resolved to "no cap". The field-length pass told the model those fields were
  uncapped and the prober skipped them. `compare.left.body` was promising 320
  characters that no theme in the gallery could seat.
- **`grow` fanned out through one array level, not two**, so
  `branches[].steps[].title` kept whatever the specimen said at every scale.
- **The filler was always prose.** `funnel` tapers only when every stage carries
  a number it can read, so growing "42%" into "the model writes" measured a
  funnel that does not taper — the narrowest bar, where a funnel runs out of
  room, was never rendered.

It also now separates **a layout that cannot hold anything** from **a cap that
is too generous**: a type failing with every field at one character is reported
as a layout failure instead of "fits 1" against every field on the slide.

## The rule that decided every cap

**Ask whether the shape is the constraint before cutting what the content may
say.** It paid off every time it was applied:

- `roadmap`'s item title read 23 of 30, and 30 of 30 once its box stopped being
  a flat 0.3in with a third of an inch sitting empty above it.
- `compare`'s side body read 53, and 134 once the verdict bar stopped taking a
  fixed 1.24in off the cards whatever it held.
- `framework`'s card was clamped to 1.15in while its row held 1.45.

Cutting first would have hidden all three. `docs/ROADMAP.md` §10 carries the ten
fields still over their measured length, with this test written next to them.

## What is left

`docs/ROADMAP.md` §10, in priority order:

1. **The front end and the landing page.** The largest remaining item, and a
   different kind of work — agree direction before writing code.
2. **The rest of the visual audit.** Every defect this session found that the
   sweeps could not was found by rendering a type at its schema caps and looking
   at the page. `tools/slideqa.mjs` renders every type full size; growing a
   slide to its caps first is what makes it worth looking at.
3. **The caps the layouts still cannot seat** — ten fields, listed in §10.
4. **Reports** — structure, and the two-LibreOffice-pass render.
5. **Research and content flow / the full functional sweep.**
6. **`config/models.yaml`** names six local models, none installed.

Smaller things found and not fixed:

- The `cycle` connector arrows sit off the ring at inconsistent angles.
- `diagram` fails on `high-contrast-mono` and `minimal-muji` at any label
  length — its nodes are a fixed size. This is the `branching-flow` diamond and
  the `cycle` hub a third time, and both of those were fixed by sizing the shape
  to its label.
- The prober can still only measure a field the specimen POPULATES.
  `compare.left.points` and `bs.body` are omitted from every specimen slide, so
  their caps are unverified. Enriching `src/specimens.js` to exercise every
  optional field closes it and makes every sweep stronger.

## Testing against real content

**Every check takes `--deck decks/<slug>/deck.yaml`. Use it.** The specimen's
payloads are hand-written to behave. Better still, grow a type to its schema
caps before rendering it — that is what a model will write to, and it is how
this session found the defects the sweeps were clean on.

`decks/electrochemical-impedance-spectroscopy-for-l` is kept deliberately as the
real-content fixture.

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
