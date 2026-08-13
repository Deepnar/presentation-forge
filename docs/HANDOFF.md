# Handoff — for the next session

Read `AGENTS.md` (repo root) first — the three-layer rule, commands, roadmap
discipline, commit rules. Then `docs/TRAPS.md`. Then the sections below. This
file is overwritten at the end of every session; git history preserves older
handoffs.

## Session summary

**The deck-quality review round shipped** (user review at 21:45, four issues).
Fixes 1-3 are done, verified end-to-end, and pushed: presenter distribution no
longer strands members; overfull slides are auto-trimmed instead of shipping a
flag; and data beats now become real charts (which surfaced and fixed a
stacked-bar rendering bug). Fix 4 split honestly: a shared-layout + token
polish pass on the four workhorse themes shipped and vision-checked clean;
layout-LEVEL distinctness for flagship themes is designed below for a dedicated
themes session. `npm test` 225/225, `vite build` clean, all pushed to
`origin/main`.

## What shipped

### 1. Presenter distribution — members ≥ sections no longer strands anyone

`src/ai/team.js` `distributePresenters`: when sections ≤ members, content
*slides* are now the unit. Every presenting member gets ≥1 slide when the count
allows, block sizes stay within one slide of each other (balance ≤1), and a
member with no section takes a contiguous share of a neighbouring section's
slides. `slidesPerMember` is honoured in both branches — a deck sized to the
briefing (11 members × 1 → 11 content slides) hands each member exactly one.
Equal counts + no briefing target keeps the old "member i takes section i".
Verified: the First-Impressions deck's 11 content slides now reach all 11
members, one each. New tests in `test/team.test.js`.

### 2. Content trim — the floor flag fixes instead of reporting

`src/ai/trim.js` (new): a deterministic, schema-driven trim pass at the end of
generation and after density sweeps. Slides flagged below the readable floor
drop their lowest-value trailing items first (down to schema `minItems`), then
shorten the longest prose at a sentence boundary with an ellipsis, re-rendering
between steps (in-memory, no pptx written) so content is only cut as far as the
box demands. The flag survives only when trimming cannot reach the floor.
`render()` gained in-memory-deck + `deckDir` + `write:false` support for the
audit loop. Verified: First-Impressions went 10 floor problems → 0; a fresh
cloud generation trimmed 18 steps with one stuck slide that a round-cap raise
cleared; `mimo-v2.5` confirmed the trimmed slides fit at readable sizes.

### 3. Data-affinity steering — data beats become charts

`catalog.js` counts numeric facts in the research (units/percentages/3+ digit,
deduped) and `dataAffinityNote` rides the planner + writer prompts when there
are ≥2: data beats become `chart` slides, kinds named and matched (scatter for
correlations, radar for profiles, stacked-bar for composition, bar/line/area
for trends). **Root-caused during verification:** `stacked-bar` wrote OOXML
grouping `clustered` because pptxgenjs honours `barGrouping`, not `barStacked`
(silently ignored). The layout now passes `barGrouping: "stacked"`, guarded by
a regression test that unzips the pptx. Verified with the cloud model: a
data-centre brief planned 5 chart slides and generated 4 real ones (line, bar,
hbar, bar), all rendered correctly (vision-checked).

### 4a. Theme polish — shared surfaces + four workhorse themes

`src/layouts.js`: the **stats** layout no longer piles columns in the top half
(it centres the block, measures labels against ~10% narrower width so wrapped
labels can't meet their sub, and cycles accent/accent_alt instead of pulling
ink onto a dark theme's third stat); **section** dividers draw a short
light-tint accent rule under the number; the **title** composition tightens by
0.2in. Theme YAML: warm-humanist softer card shadow; swiss-international
hairline card outlines; dark-neon brighter muted text; glassmorphism more
saturated blobs, see-through frost, title scrim. `mimo-v2.5` rated all four
8.0-8.5 with no regressions.

## Fix 4b design — layout-level theme distinctness (a dedicated themes session)

Themes are still token variations on ONE layout system — same chrome, same card
function, same section surface. Real distinctness needs layouts that branch on
the theme. Three flagship candidates, in order of payoff:

1. **neubrutalism — hard shadows + offset borders (cheapest, tokens-first).**
   The `card()` helper already reads `theme.shadow.card`; a "hard offset" shadow
   (`type: outer, blur: 0, offset: 6, angle: 90, color: ink, opacity: 1`) plus a
   thick border (`shape.border.width: 3`) is nearly expressible in YAML today.
   Verify a full deck first — if the hard shadow reads right on cards, lists and
   stat tiles, this theme is a token change, not a layout one.
2. **editorial-magazine — drop-cap / two-column body.** Needs a layout change:
   a `bullets`/`cards` variant that draws a large initial cap on the first
   paragraph and a two-column body treatment. The seam is a per-theme flag the
   layouts read (e.g. `tokens.editorial: { dropcap: true, columns: 2 }`), with
   the layout falling back to the default when absent so the other 25 themes are
   untouched. Keep the flag a layout-level *treatment*, never a coordinate.
3. **bauhaus — geometric block headers.** Section/chapter surfaces with a
   primary-colour block behind the headline (circle/triangle/semicircle from the
   theme's shape vocabulary). Layout change to the `section` surface keyed off a
   `tokens.bauhaus: { block: true }`-style flag.

Rules for the session: one flagship per commit, rasterise + `mimo-v2.5` compare
against the pre-change render of the same deck, and never let the theme YAML
inject a coordinate or font name into content. The polish groundwork is done —
the shared stats/section/title surfaces are clean, so the flags can build on
them rather than around them.

## Verification notes

- `npm test` 225/225; `npx vite build --config app/web/vite.config.js` clean.
- **Presenter distribution (unit + real deck):** 11 members / 7 sections / 11
  content slides → 11 distinct presenters, one each; 11/7/20 → all covered,
  balance ≤1, max 2; 5 members / 3 sections → 5 contiguous blocks.
- **Trim (real deck + real generation):** First-Impressions 10 → 0 floor
  problems; the cloud data-centre deck trimmed 18 steps (then 2 more after the
  cap raise) to 0; `mimo-v2.5` confirmed the agenda/feature-grid/compare/
  stacked-list slides fit clean, ellipses on word boundaries.
- **Charts (cloud generation):** the data-centre brief produced 4 chart slides
  across 4 kinds; `mimo-v2.5` confirmed line/bar/hbar all render completely.
  The stacked-bar grouping regression test unzips the pptx and asserts
  `<c:grouping val="stacked"/>`.
- **Theme polish:** rendered raytracing-ai in all four themes before and after;
  `mimo-v2.5` confirmed the stats collision gone, section rule visible, glass
  reads as glass, ratings 8.0-8.5, no regressions.

## Seams and leftovers

- **The trim cuts, it does not rewrite.** A trimmed agenda can keep a subtitle
  that mentions dropped items (the vision check flagged slide 02's "seven quick
  tours" over four remaining items). The deterministic, no-model constraint is
  the point; a later smart pass could rephrase supporting text. Noted in the
  roadmap's trim Learned entry.
- **Fix 4b is designed, not built** — see the section above. The four-workhorse
  polish is done; the layout-level flags wait for the dedicated themes session.
- **The data-centre verification decks** (`decks/data-centre-...`, untracked)
  are the chart-steering fixtures — keep for regression, delete freely.
- **CDP harness** from the last session lives in `/tmp/opencode/` and is
  reusable; the chart/trim/theme work this session was backend-only and needed
  no browser automation.
- **The trim cap is 24 rounds** (~1s, plates cached). If a genuinely huge slide
  ever stalls there, the flag is supposed to survive — that is the design.

## End-of-session state

- Servers still running: API `http://localhost:5174`, UI `http://localhost:5173`
  (unchanged — no server code this session).
- `config/local.yaml`: cloud key attached, `routing.default: cloud`.
- All commits pushed to `origin/main` (last: the TRAPS entry; the roadmap,
  trim cap, theme polish, chart steering and presenter-distribution fixes all
  landed before it).
