# Handoff — 2026-08-30, theme variation and the first real-content audit

Two pieces: **§10 "Theme variation"**, finished, and the first pass of **§10
"Every theme against every slide type"** — deterministic half done, visual half
sampled. Everything is on `origin/main`. `npm test` is 382 passing, CI is
green, the UI builds, the working tree is clean.

**Start here.** `AGENTS.md` is the working agreement — commit discipline, how
the roadmap is worked, conventions. `CLAUDE.md` is the operational map.
`docs/ROADMAP.md` §10 is the standing quality list and is current. This file is
only what the last session learned that those three do not already say.

## What changed

A theme now owns its **composition**, not only its palette. `tokens.layout`
(`src/composition.js`) is six axes — title composition, divider composition,
heading alignment / opening mark / rule, content frame, list marker and
columns, drop cap — each an enum whose first value is the behaviour that
preceded it. Applied in the opening mark, the heading block and the content
frame, which 67 of the 74 layouts already shared, so one flag restyles all 75
slide types.

Four themes were culled as duplicates of a survivor rather than designs of
their own: `flat-2`, `minimal-warm`, `dark-neon`, `retro-terminal`. The
remaining 34 carry 34 distinct compositions. `notion-clean` declares nothing —
a vocabulary needs a plain member.

`retro-crt` was rebuilt: the plate drew a bloom at one centre and a blurred
ellipse at another, so two smears crossed the screen and the lit area sat above
the type rather than behind it. Every layer is now concentric on one centre.

## Five instruments that outlast the item

```bash
npm run themematrix                 # 34 x 75 fit failures, ~3s, nothing rasterised
npm run textcheck                   # every declared word survived to the page
node tools/contrast-audit.mjs --types a,b   # one sheet per type, every theme
node tools/slideqa.mjs --themes a   # all 75 types, one theme, full-size PNGs
node tools/pixels.mjs <png> '#INK' 0.4 0.6 0.62 0.68   # contrast on real pixels
```

All of them take `--deck decks/<slug>/deck.yaml`. **Use it.** The specimen's
payloads are hand-written to behave; a model writes a 130-character card body
where the specimen has 40, and the same sweep reports 8 failures on the
specimen and 51 on a real seventeen-slide deck.

`tools/pixels.mjs` is how "measure contrast on the rendered pixels" is actually
done. A plate theme's ground is not its palette token — `retro-crt` lights the
middle of its tube, and inks measuring 4.6:1 against the flat token measured
2.8:1 against the band the text sits on.

`test/themematrix.test.js` and `test/contrast.test.js` each hold a **debt
list** — eight fit failures, twenty-four contrast pairings — and fail in *both*
directions, so an entry cannot be added silently and cannot be left in after it
is paid.

The checks find **disjoint** sets, and none of them replaces looking. The fit
sweep never saw a wrapped figure, because each fragment fits its box; the text
check never saw it either, because a five-character value is under its
word-length floor. Both were found by eye.

A contact sheet at four cells per row judges **structure** — overlap, clipping,
fused panels, a wrapped value — and not contrast. Two types were called
illegible from a cell and read perfectly at full size.

## Three defects the composition work surfaced

All three had been shipping for a long time, all three are in `docs/TRAPS.md`,
and none of them raises anything a test could read:

- **Every chart slide in every plate theme rasterised on white.** pptxgenjs
  numbers a background image's relationship without counting chart
  relationships, so a background assigned after `addChart` is written as a
  second `rId1`; the reader resolves the background blip to the chart part and
  paints nothing. On the dark themes that meant near-white ink on white.
- **A numbered list rendered "1. 1. 1. 1."** — `startAt="1"` is written on
  every paragraph, so the count restarts at each item.
- **A word wider than its column hyphenates itself at the raster.** The fitter
  budgets height, so every fragment fits and nothing is reported. Any layout
  that narrows a column has to fit the longest word to the measure too, and
  with `fitOneLine`'s default safety margin — `measure` estimates at 0.55em
  where real text averages nearer 0.60.

## How to work on themes

The method is unchanged and it is the only one that works: render and look.

```bash
npm run themeaudit -- --themes <a,b> --types title,section,bullets
npm run gallery -- --themes <name>                    # thumbnails are committed
```

Plus the five above. `npm run gallery` matters: the thumbnails are committed
and go stale otherwise. Both scripts need the `--` separator or npm eats the
flags.

Prove a refactor rather than asserting it: rendering six themes before and
after and diffing `ppt/slides/*.xml` is what caught pptxgenjs writing an
explicit `algn="l"` whenever alignment is passed, so the default path must omit
it rather than pass `"left"`.

Measure contrast, never judge it — `tools/pixels.mjs`. Sample beside the text,
not through it: glyphs are the brightest thing in a crop and flatter the
reading.

## The nine defects the audit found

All were shipping, none was visible to any test. Six came from putting real
model-written content through every theme, three from looking at the renders.

- `funnel` dropped every stage body the schema allows.
- `framework` drew element bodies at a fixed scale with no fit, so they ran out
  of their cards and under the central ellipse — with a clean fit sweep,
  because nothing called the fitter.
- The `title` and `closing` surfaces discarded their own headline and
  standfirst, drawing the deck's title instead. Every real deck writes both.
- The closing CTA pill was capped at 3.4in and pushed its second line through
  the bottom edge.
- The field-length pass budgeted the deck against the one theme it named: on a
  real deck it flagged nothing while six of seventeen slides lost text
  elsewhere. It now sweeps every theme.
- `kpi-dashboard` and `data-cards` wrapped values mid-number, and `data-cards`
  landed the wrapped line on the label. Root cause was in `measure()` — see
  below.
- `split-screen` fused its halves into one block on square-cornered themes.

The measurement one is worth knowing about: `measure()` estimated every
character at the lowercase average. Lining figures sit near 0.58 em, a percent
sign near a full em, and **Archivo Black declares weight 400** because black is
the only weight the family ships — so the widest display face in the gallery
was being measured at the narrowest display advance.

## What is next

`docs/ROADMAP.md` §10, in priority order:

1. **The front end and the landing page** — standing dissatisfaction with the
   whole surface, no model needed. The largest remaining item.
2. **The schema's caps are not the layouts' budgets** — `cards[].body` accepts
   320 characters and the type accepts four of them, which no theme can seat.
   The model writes to the cap it is given. Derive the caps from the layouts.
3. **Every theme against every slide type** — the rest of the visual half. All
   34 were looked at for ten high-risk types, and all 75 types for four themes
   spanning the four content frames.
4. **Reports** — structure, and the two-LibreOffice-pass render.
5. **`flow`'s vertical spine** — four themes over the readable floor, named in
   the matrix debt list. `before-after` and `team-grid` had the same defect and
   were fixed by sizing the box to the real line count (`linesBox`).

## Constraints that still hold

**Generation now works.** The TCET gateway (`config/models.yaml`,
`providers.tcet-auto`, model `qwen3.6`) answers in under a second with
`FORGE_TCET_API_KEY` in a gitignored `.env` at the repo root. Run with
`FORGE_HOSTED=1` so Auto resolves to the gateway and never falls back to the
local Ollama, whose GPU is committed to other work. A 17-slide deck generated
end to end without research in a couple of minutes.

**`config/models.yaml` names six local models, none installed** on this
machine. Role resolution falls through silently, so local runs are still not
viable — the gateway is the route.

**Any check that reads a rasterised page needs the theme fonts.** CI's test job
installs LibreOffice and Poppler but not the 27 families, so LibreOffice
substitutes a wider face and a word that fits breaks. `npm run textcheck` asks
fontconfig and skips rather than reporting a defect the product does not have;
the CI image job is what asserts the fonts install.

## Known and deliberate

- The callout bar inverts to light on dark themes. Consistent and intentional,
  loud on `gradient-mesh-dark`. Not changed without a decision.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
  Identity is per account now; set a real one in Settings.
- The dev account store holds well over a hundred throwaway test accounts. That
  database must not travel to production.
