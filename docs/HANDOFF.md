# Handoff — 2026-08-31, the gallery swept, and the two checks it needed

Everything is committed on local `main`, 27 commits ahead of `origin/main` and not
yet pushed. `npm test` is 388 passing, the working tree is clean.
**Start here.** `AGENTS.md` is the working agreement — commit discipline, how
the roadmap is worked, conventions. `CLAUDE.md` is the operational map and now
lists the checks as four different questions rather than one. `docs/ROADMAP.md`
§10 is the standing quality list and is current. `docs/TRAPS.md` holds the
cross-cutting failure modes and outlives this file. This file is only what the
last session learned that those do not say.

## What was done

**The gallery was swept once — `warm-humanist`, every type at its caps, with a
speaker note — and thirteen defects came out of it.** Not one was reportable by
any check that existed at the start. Two of them were reportable by the end,
because looking kept turning up the same two classes and both were mechanisable.

- **`npm run drawcheck`** marks every field the schema declares, renders, and
  reads back what the layout actually emitted.
- **`src/geometry.js`** watches every draw for a box that cannot be right and
  runs inside every render, so `themematrix` answers it for free.

## The state of the checks

| check | result |
|---|---|
| `npm test` | 388 passing |
| `npm run themematrix` | clean, 34 themes x 75 types |
| `npm run themematrix -- --notes` | 2 — `feature-grid` on `minimal-muji` |
| `npm run themematrix --deck <real>` | 45 — `cards` x41, `takeaway` x4 |
| `npm run textcheck` | clean, 34 themes |
| `npm run drawcheck` | clean; 10 accepted, 3 unpopulated |
| `npm run capstress` | 64 across 4 themes — cap debt, all reported |
| `node tools/capfit.mjs` | 26 fields over their measured length |
| `test/contrast.test.js` | 24 recorded, passing both ways |

**The two rising counts are the checks working.** `capfit` went from 1 field to
26 and `capstress` from 9 problems to 64, both because the prober and the sweep
now stress a slide that carries a standfirst — which is the slide a model
actually writes. None of it is new debt; it is the debt the omission was hiding.
Before assuming a regression, check whether the payload changed.

## The finding worth carrying forward

**A shared schema field is invisible to anything that reads the type rule
alone.** `headline` (≤80) and `standfirst` (≤150) are declared once on
`definitions.slide.properties`, and every consumer walked
`allOf[].then.properties` instead. So on 75 of 75 types:

- the field-length pass never told the model the headline had a cap;
- `trimSlide` could never shorten a headline — its own skip-headline-first
  branch had been unreachable since it was written;
- the cap prober never grew one, so no measured cap and no capstress render had
  ever carried a headline longer than the specimen's own.

The specimen then omits `standfirst` on 71 of 75 types. Seeding it took the cap
sweep from 9 problems to 287, and 278 of those were one cause: a 220-char cap
the header cannot keep. **Ask what the fixture does not carry.** That is now
the second half of `npm run drawcheck`'s output rather than something to
remember.

## What the checks can see now, and what they still cannot

Four questions, in this order — see `CLAUDE.md`:

1. **Is the box on the slide?** `src/geometry.js`. Non-positive extents for any
   shape, canvas edges for text and images. Rotated boxes are judged on the
   footprint they render, and a decorative shape may bleed — the bold geometric
   themes hang a slab past a divider's corner on purpose.
2. **Was the field drawn at all?** `npm run drawcheck`.
3. **Does the text fit the box?** `themematrix`, `capfit`.
4. **Did it survive the render?** `textcheck`.

**Still unanswerable: do two boxes overlap?** That is what is left of the class,
and it is the one `cycle` needs. Both boxes are on the slide, both fit their own
text, and they are drawn on top of each other. An overlap check is not obviously
tractable — a label over a filled shape is the normal case — so looking is still
the instrument.

## The rule that decided every repair

**Derive the number once and use it for the fit, the box and the advance.** A
budget that is not the box the text is drawn into is a bug in both directions —
more generous hides an overflow, less generous invents a failure, and they look
nothing alike from a sweep. It was everywhere:

- the standfirst was fitted against 0.85in, drawn into 0.75in and advanced
  0.72in, so a three-line one landed on the body's first line;
- `before-after` fitted a body against 1.8in and drew it into 0.94in;
- `cycle` fitted a step body against 0.45in and drew it into 0.28in — and the
  hub, which has to clear the steps, was sized against the smaller number;
- `pros-cons` handed `fitScaleAll` the whole column, which fits EACH member into
  the height given, so the stack was never measured at all.

And the older rule still paid every time: **ask whether the SHAPE is the
constraint before cutting what the content may say.** `metric-comparison`'s
delta pill was a flat 1.3in for a 12-character field; no fit could have saved it
because the subhead floor stops a 15pt role shrinking below 0.93. The pill is
sized from its content now.

## What is left

`docs/ROADMAP.md` §10, in priority order:

1. **The front end and the landing page.** The largest remaining item, a
   different kind of work — agree direction before writing code.
2. **The visual audit** — one theme of four is swept. `sci-fi-hud` is the only
   sidebar frame and is where to look next: `layered-architecture` had two
   columns that did not fit its 8.0in row, and that was found by measuring, not
   by looking.
3. **Reports** — structure, and the two-LibreOffice-pass render.
4. **Research and content flow / the full functional sweep.**
5. **`config/models.yaml`** names six local models, none installed.

Known and not fixed, both needing a decision rather than a repair:

- **`cycle` cannot hold its arrangement with a speaker note.** `radiusY` is
  pinned at its 1.15in floor; the arrangement needs about 1.53in for a minimum
  hub plus a step's title and body. The hub overlaps the top and bottom steps'
  bodies, on every theme, and always has. The repair is an arrangement that
  gives up the ring when the box is short.
- **`concept-map` at its caps is illegible.** `TYPE_BUDGETS` tells the writer
  "one or two words — long leaves cannot fit a radial layout" and the cap says
  27. Cut the cap to the guidance.

`quote`, `epigraph` and `freeform` draw neither headline nor standfirst. For the
first two that is a question about what a full-bleed quotation surface is, not a
defect; `freeform` is the rasterised escape hatch by definition. All three are in
`drawcheck`'s ACCEPTED list with that reasoning, and a stale entry there fails
the run.

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
- `FORGE_GEOM_TRACE=1` on any render prints the stack of the draw call behind a
  geometry verdict. The message names the type and the theme; the layouts are
  four thousand lines.
