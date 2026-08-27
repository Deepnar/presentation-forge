# Handoff — 2026-08-27, theme variation

One roadmap item, finished: **§10 "Theme variation — one composition, thirty-eight
times"**. Everything is on `origin/main`. `npm test` is 379 passing, the UI
builds, the working tree is clean.

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

## Two instruments that outlast the item

```bash
npm run themematrix                 # 34 themes x 75 types, fit failures, ~3s
npm run themematrix -- --against .themeaudit/base.json   # gate a change
```

`test/themematrix.test.js` and `test/contrast.test.js` each hold a **debt
list** — eight fit failures, twenty-four contrast pairings — and fail in *both*
directions, so an entry cannot be added silently and cannot be left in after it
is paid. Those two lists are the to-do for §10's "Every theme against every
slide type", which is now the visual half plus paying them down, not a
from-scratch job.

## Three defects that had nothing to do with composition

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
npm run themematrix                                   # what will not fit
node tools/contrast-audit.mjs --types title,section   # one sheet per type, every theme
node tools/slideqa.mjs --themes <a> --out .themeaudit/x   # per-slide PNGs
npm run themeaudit -- --themes <a,b> --types title,section,bullets
npm run gallery -- --themes <name>                    # thumbnails are committed
```

Prove a refactor rather than asserting it: rendering six themes before and
after and diffing `ppt/slides/*.xml` is what caught pptxgenjs writing an
explicit `algn="l"` whenever alignment is passed, so the default path must omit
it rather than pass `"left"`.

Measure contrast, never judge it. Sample beside the text, not through it —
glyphs are the brightest thing in a crop.

## What is next

`docs/ROADMAP.md` §10, in priority order:

1. **The front end and the landing page** — standing dissatisfaction with the
   whole surface, no model needed. The largest remaining item.
2. **Every theme against every slide type** — the visual half, plus the two
   debt lists above. The instruments exist now.
3. **Reports** — structure, and the two-LibreOffice-pass render, profilable
   today against a committed `report.yaml`.
4. **`flow`'s vertical spine** — four themes over the readable floor, named in
   the matrix debt list. `before-after` and `team-grid` had the same defect and
   were fixed by sizing the box to the real line count (`linesBox`); this is
   likely the same fix.

## Constraints that still hold

**Generation is untested.** It must run against the shared gateway only, with
the key in `.env`. The local Ollama install and its GPU are committed to other
work and must not be touched. Everything in §10 marked *needs a model* is
blocked on that, by the owner's decision, to be done in one pass.

**`config/models.yaml` names six models, none installed** on this machine. Role
resolution falls through silently.

## Known and deliberate

- The callout bar inverts to light on dark themes. Consistent and intentional,
  loud on `gradient-mesh-dark`. Not changed without a decision.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
  Identity is per account now; set a real one in Settings.
- The dev account store holds well over a hundred throwaway test accounts. That
  database must not travel to production.
