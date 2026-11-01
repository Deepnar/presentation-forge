# V2-4C-2 Evaluation — multi-series pie/doughnut preservation

Date: 2026-10-11. Baseline `a1f2832` (V2-4C + V2-4C-1 in review).
Driver: `node tools/v2-4c1-eval.mjs` (extended with a doughnut
case; outputs gitignored `out/v2-4c1/`). Curated evidence:
`docs/v2-4c2-evidence/` + README. No schema, theme, table, or
PPTX-renderer changes; the compiler gains one fallback branch
plus one diagnostic kind.

## Verdict

No authored series or value disappears silently anymore.
Multi-series pie/doughnut input compiles to an editable table
carrying every category and value; browser and PPTX project
that same authoritative scene. Single-series pies and all
cartesian charts are byte-for-byte behaviorally unchanged.

## 1. Exact native failure

Kind-by-kind OOXML probe (identical scenes, both renderers):

| kind, series | visible | in chart part | elsewhere in PPTX |
|---|---|---|---|
| pie ×1 | series[0] wedges | full series | — |
| doughnut ×1 | series[0] ring | full series | — |
| pie ×2 | series[0] only | series[0] only (`<c:ser>` ×1) | **nowhere — B dropped from the file** |
| doughnut ×2 | series[0] only | series[0] only | **nowhere** |
| bar/hbar/line/area ×2 | both series | both series | — |

The browser's V2-4C-1 hollow mark named B, but PowerPoint
itself lost B's values. A warning cannot fix the file.

## 2. Preservation policy (Layer B fallback)

`renderBlockPrimary` case "chart": pie/doughnut with more than
one series emits `tableElement` (header = series names, rows =
category × values as authored strings) instead of a chart —
the same honest-fallback policy as data-table scenes ("exact
values as an editable table, never a fake chart"). Rationale:

- Representation decisions belong to Layer B; both renderers
  project the same scene, so browser and PPTX can never
  disagree about what the slide IS.
- Identity stable: same id/semanticRef the chart would carry
  (`<slide>:<block>:content`), no duplicates, deterministic.
- Unit/caption reserves and texts flow unchanged; status,
  caveat, and tone rails flow through `placePrimary` as usual.
- Chart capacity rules are skipped for the swap (they model
  slots, not cells); the table's own cell fitting diagnoses.
- The swap is explained by a new `chart-fallback-table`
  diagnostic (QA code + block-linked message), not silence.

An export-only table (scene keeps pie, PPTX draws table) was
rejected: it would leave browser-shows-pie vs PPTX-shows-table
to confuse, against §4. No schema change: the table contract
already carries everything.

## 3. Before/after (A=[1,2], B=[30,40])

- Before: browser A-pie + `□ B (not shown)`; PPTX A-pie,
  B absent from the file.
- After: browser table [_,A,B] × [x:1,30] [y:2,40]; PPTX the
  identical editable table (`<a:t>` cells for every token).
  Scene JSON carries the table; the pie is gone from Layer C
  for this input, so there is nothing to misread.

## 4. Untouched behavior

Single-series pie/doughnut (proportions, order, zero-shares,
holes, native editability), all multi-series cartesian kinds,
micro ticks, baselines, palettes, chrome, themes. The V2-4C-1
pie-marking code stays as the backstop for non-canonical
scenes (legacy demos, hand-built multi pies).

## 5. Tests

`test/v2-chart-4c2.test.js` (11): fallback shape/order for
pie+doughnut, negatives/zeros/units as authored strings,
single-series and cartesian invariance, id/ref stability +
determinism, diagnostic kind + QA code + block link, PPTX
editable-table cells, doughnut parity, browser table
projection + selection, single-pie native values. Seven fail
on `a1f2832` (stash-verified). Consumer nets
(199 + 189 tests) and full suite 1483/1484 hold — sole
failure the known BYOK locale one. Benchmark goldens emit no
new diagnostics (no multi-series pies in fixtures).

## 6. Limitations

- A former pie reads as a table: honest but less glanceable;
  the diagnostic points at the block for authors.
- V2-4C-1 hollow marks now trigger only off-canonical-path.
- Interim palette, system fonts, left inset: unchanged,
  still tracked.
