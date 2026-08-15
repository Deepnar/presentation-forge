# HANDOFF — deck-quality round 3: no stranded members, all 75 types audited

Two real defects shipped from user testing, both fixed and verified; three
findings were confirmations. Commit history up to `1e8747f` on `origin/main`.
Servers left running (UI :5173, API :5174, Ollama). Local models untouched;
cloud `deepseek-v4-flash` used for the generation tests.

## 1. No stranded presenting member (the real "missing last person" bug)

`planDeck` could only SHRINK a plan. An 11-member team with slides-per-member 1
planned 10 content slides (8 sections, one slide each), and the deck jumped
from Vedant Sud's takeaway straight to the closing — Dhwani Tandon presented
nothing. Fix: `mintContentSlides` in `src/ai/generate.js` enforces the
content-count contract — at least N × M content slides when the briefing fixes
M per member, at least one per member when it does not — minting the deficit
into the trailing content-bearing sections, bounded by the same contentCap the
trim enforces, before `ensureStructuralSlides` runs. The minted slides are
`bullets` specs with a "Continue the part…" purpose the writer can build on.

Verified three ways: unit tests (`test/plan-structure.test.js` — 9 or 10
natural slides mint up to exactly 11, one per member, closing last), replay of
the real broken plan (11 content slides, Dhwani gets one), and a full cloud
generation (`decks/first-impressions-and-networking-among-colle`, 11 members ×
1, cloud planner + writer): 21 slides, exactly 11 content, every member once,
Dhwani on slide 20, closing last.

## 2. The 75-type layout audit

`tools/slideqa.mjs` renders the whole specimen deck in a set of themes,
rasterises it, records the renderer's per-slide problems, and emits per-type
full-size PNGs plus labelled contact sheets (20 cells/sheet at readable size).
Run: `node tools/slideqa.mjs --themes warm-humanist,swiss-international,dark-neon`.

The verdict list is committed at `docs/slide-type-audit.md` (75 rows: OK /
fixed). **10 layouts reworked** in `src/layouts.js`:

- `flow` (vertical) — was six thin full-width stripes with bodies dropped and
  the bottom quarter empty; now a numbered spine (chip on a rail, title and
  body flowing right). Bodies render when a row holds a title plus one line at
  the floor; a body needing two lines at six steps drops (title-only step).
- `timeline`, `pipeline`, `funnel` — hugged the heading, lower half empty;
  each now centres its whole block between heading and footer.
- `cycle` — ring sat in the lower ~60%; it now starts below the heading.
- `dependencies` — edges drew ON TOP of nodes (Enrichment→Alerts slashed
  across Storage); edges draw behind the boxes and layers order by dependency
  barycentre. `diagram` got the same barycentre ordering.
- `concept-map` — leaf labels shrank to ~8pt and collided ("Events" over
  "Queues"); leaves are now pills sized to their own measured text, fanned so
  footprints never overlap.
- `matrix` — rotated y-axis label wrapped ("Impact" → Imp/act); the box is now
  measured on the transform-uppercased string.
- `contact` — small card pinned below the heading; the card now spans the
  content width heading-to-footer.

**26 types were sound layouts the writer was under-filling.** `TYPE_BUDGETS`
in `src/ai/catalog.js` tells the writer how much each layout invites (4 stats
on the four-up grid, 5-8 table rows, a body per framework element, …); it
rides the planner and writer catalogues (`slideCatalog` + `catalogForType`).

Most "half-empty" flags in the sheet audits were short SPECIMEN content (a
three-row table, two-item stats, one-word flow steps), not structural defects —
the layouts span the full width and fill with real content. Those are the 39
"OK" verdicts.

## Confirmations (no change)

- **First section divider after the title is intended**: title → section
  divider (opens Part 1) → content. That is the designed rhythm.
- **No hard slide cap**: maxSlides was 24; the binding constraint was the
  content cap vs the member count — fixed by the mint.
- **"Content feels disconnected"**: caused by the stranded member (the deck
  visibly skipped someone before the thank-you) plus thin sections (10 content
  slides across 8 sections). After the mint the sections fill out; no separate
  fix needed.

## Open items / notes for the next session

- `docs/slide-type-audit.md` is the QA deliverable. Re-run
  `tools/slideqa.mjs` + a vision pass before claiming a future layout change
  is verified — the sheets are the reproducible audit primitive.
- The flow layout's one-line-body rule is content-aware: a body that needs two
  lines at six steps drops (title-only step). At 4-5 steps (the new budget) a
  body always fits. If the writer keeps emitting 6-step flows, consider
  tightening the flow budget to "4-5 steps" in practice.
- dark-neon's contact card labels were flagged as low-contrast by the vision
  pass once; the tokens look fine (#98A2B5 on #151B26), so it was not chased.
  If a real dark deck's contact slide reads faint, revisit the caption token.
- The specimen `flow` uses 6 steps, which is the worst case for the layout; a
  real 5-step deck renders bodies. The QA verdict for flow records this.
- Local models untouched, no qwen. Model discipline held: flash codes ONLY,
  mimo-v2.5 vision ONLY, cloud for generation tests.
