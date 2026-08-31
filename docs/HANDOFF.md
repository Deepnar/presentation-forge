# Handoff — 2026-08-31, theme variation and the slide-quality audit

Everything is on `origin/main`. `npm test` is 383 passing, CI is green, the UI
builds, the working tree is clean.

**Start here.** `AGENTS.md` is the working agreement — commit discipline, how
the roadmap is worked, conventions. `CLAUDE.md` is the operational map and now
lists the checks. `docs/ROADMAP.md` §10 is the standing quality list and is
current. This file is only what the last session learned that those do not say.

## What was done

**§10 is 9 of 16 items closed.** Three closed in this session:

- **Theme variation.** A theme now owns its *composition*, not only its palette.
  `tokens.layout` (`src/composition.js`) is six axes — title composition,
  divider composition, heading alignment / opening mark / rule, content frame,
  list marker and columns, drop cap. Applied in the opening mark, the heading
  block and the content frame, which 67 of the 74 layouts already shared, so one
  flag restyles all 75 types. Four themes were culled as duplicates of a
  survivor; the remaining **34 carry 34 distinct compositions**. `notion-clean`
  declares nothing, because a vocabulary needs a plain member.
- **`flow`'s vertical spine**, and with it the whole fit debt list.
- **The schema's caps.** 34 caps were promising the model more than any theme
  could draw. Now measured rather than chosen.

**All 34 themes seat all 75 slide types at a readable size, and every declared
word survives in all 34.** The fit debt list is empty; it held twelve entries
when the sweep was built.

## The instruments

```bash
npm run themematrix           # 34 x 75 fit failures, ~3s, nothing rasterised
npm run themematrix -- --notes  # the same with a speaker note on every slide
npm run textcheck             # every declared word survived onto the page
node tools/capfit.mjs         # what length each field can actually be
node tools/slideqa.mjs --themes a          # all 75 types, one theme, full-size
node tools/contrast-audit.mjs --types a,b  # one sheet per type, every theme
node tools/pixels.mjs <png> '#INK' 0.4 0.6 0.62 0.68   # contrast on real pixels
npm run themeaudit -- --themes a,b --types title,section
npm run gallery -- --themes <name>   # thumbnails are committed; regenerate them
```

**All of them take `--deck decks/<slug>/deck.yaml`. Use it.** The specimen's
payloads are hand-written to behave. A model writes a 130-character card body
where the specimen has 40, and the same sweep reports 8 failures on the specimen
and 51 on a real seventeen-slide deck. Auditing against the specimen is
auditing the specimen.

Three tests hold the line and fail in **both** directions, so a debt list can
neither grow silently nor rot after it is paid:

| test | debt |
|---|---|
| `test/themematrix.test.js` (fit) | **empty** |
| the same, with speaker notes | 5 |
| `test/contrast.test.js` (surfaces) | 24 |

## What is left

`docs/ROADMAP.md` §10, in priority order:

1. **Text drawn at a fixed scale is unreported.** 19 sites in `src/layouts.js`
   pass a hardcoded `scale:` and never call a fit function, so their text can
   overflow with a completely clean sweep — this is how `framework` shipped
   element bodies running out from under its ellipse. `grep -n "scale: 0\." src/layouts.js`
   is the list. **This was going to be next.**
2. **The front end and the landing page.** The largest remaining item, and a
   different kind of work — agree direction before writing code.
3. **The rest of the visual audit.** All 34 themes were looked at for ten
   high-risk types, and all 75 types for four themes spanning the four content
   frames. 65 per-type sheets remain, at falling yield.
4. **Reports** — structure, and the two-LibreOffice-pass render.
5. **Research and content flow / the full functional sweep** — both unblocked
   now the gateway works.
6. **`config/models.yaml`** names six local models, none installed.

Two smaller things found and not fixed:

- The `cycle` connector arrows sit off the ring at inconsistent angles.
- `capfit` can only measure fields the specimen populates. An optional field the
  specimen omits — `compare.left.points` — is never grown, so its cap is
  unverified. Enriching `src/specimens.js` to exercise every optional field
  closes it, and would also make the sweeps stronger everywhere.

## Generation works now

The TCET gateway (`config/models.yaml`, `providers.tcet-auto`, model `qwen3.6`)
answers in under a second with `FORGE_TCET_API_KEY` in a gitignored `.env` at
the repo root.

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

`FORGE_HOSTED=1` makes Auto resolve to the gateway and never fall back to the
local Ollama, whose GPU is committed to other work. A 17-slide deck generates
end to end without research in a couple of minutes.

One caveat: the model client allows 300s per request with retries, so a single
stubborn slide can burn ten minutes in the field-length pass. Budget for it or
raise the timeout.

## The twelve defects the audit found

All were shipping. None was visible to any test. Six came from putting real
model-written content through every theme, three from looking at renders, three
from turning on a speaker note.

- `funnel` dropped every stage body the schema allows.
- `framework` drew element bodies at a fixed scale with no fit at all, so they
  ran out of their cards and under the central ellipse — with a clean sweep,
  because nothing called the fitter.
- The `title` and `closing` surfaces discarded their own headline and
  standfirst, drawing the deck's title instead. Every real deck writes both.
- The closing CTA pill was capped at 3.4in and pushed its second line through
  the bottom edge.
- The field-length pass budgeted the deck against the one theme it named: on a
  real deck it flagged nothing while six of seventeen slides lost text
  elsewhere. It now sweeps every theme.
- `kpi-dashboard` and `data-cards` wrapped values mid-number, and `data-cards`
  landed the wrapped line on the label.
- `split-screen` fused its halves into one block on square-cornered themes.
- Every chart slide in every plate theme rasterised on white.
- `big-number` reserved a flat 2.1in for its figure whatever the box was.
- `feature-grid` fitted its body to `ch - 1.25` and drew it into `ch - 1.48`.

## What the session learned

**Instrument, do not reconstruct.** Three wrong arithmetic guesses at the
`feature-grid` budget before printing the layout's own numbers, which took one
line and settled it immediately. Reach for that first.

**A contact sheet judges structure, not contrast.** Overlap, clipping, fused
panels, a wrapped value — yes. Legibility — no: two types were called illegible
from a 700px cell and read perfectly at full size. Contrast has a numeric test
and `tools/pixels.mjs`; use those.

**The checks find disjoint sets and none replaces looking.** The fit sweep never
saw a wrapped figure, because each fragment fits its box. The text check never
saw it either, because a five-character value is under its word-length floor.
Both were found by eye.

**A layout that drops content to satisfy the fitter has not been fixed.** The
first `flow` attempt stopped the bodies shrinking below the floor and started
them *dropping* — a reported failure became fifteen words of silent loss, and
only the text check said so.

**Nearly every fit failure was a hardcoded constant, not a budget.** All twelve
debt entries, plus `big-number`, `feature-grid`, `before-after`, `team-grid` and
the `branching-flow` diamond. Measure one line at the size it will really render
at and divide the box among its parts; a constant in that place is a constant
that decides whether text survives.

**Shapes must be sized from their labels, and a shape is not its bounding box.**
A rhombus's largest inscribed rectangle is half its bounding box; a circle's is
its diameter over root two. The `branching-flow` diamond and both hub circles
gave their labels a box wider than the shape, so text ran out through the edges.

**Any check that reads a rasterised page needs the real fonts.** CI's test job
installs LibreOffice and Poppler but not the 27 families, so a word that fits
breaks in the substituted face. `substitutedFaces()` asks fontconfig and the
check skips; the CI image job asserts the fonts install.

## Known and deliberate

- The callout bar inverts to light on dark themes. Consistent and intentional.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
  Identity is per account now; set a real one in Settings.
- The dev account store holds well over a hundred throwaway test accounts. That
  database must not travel to production.
- `decks/` holds one real generated deck
  (`electrochemical-impedance-spectroscopy-for-l`) kept deliberately: it is the
  real-content fixture the sweeps should be run against.
