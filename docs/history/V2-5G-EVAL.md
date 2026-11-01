# V2-5G Evaluation — native chart-data editing

Date: 2026-10-11. Baseline `f2d29c9` (V2-5F pending review).
No table editing, chart drawing, persistence, or agent paths.
Drivers: `node tools/chart-eval.mjs` (gitignored
`out/chart-editor/`); headless `test/v2-chart-edit.test.js`;
browser `test/v2-edit-chrome-chart.test.js`. Curated evidence:
`docs/chart-editor-evidence/` + README.

## Verdict

A selected chart's categories, values, names, and kind edit in
place through one atomic `element.setChartData` per Apply, with
multi-series pie/doughnut loss rejected before commit, human
data surviving regeneration under its own flag, and native
editable PowerPoint output verified down to the inline chart
caches. PASS recommended; V2-5G `[~]` pending independent
review, V2-5 parent stays `[~]`.

## 1. Chart-data command contract

`element.setChartData { id, chart: { chartKind?, categories?,
series? } }` (`packages/model/commands.ts`): absent keys ride
along; the inverse restores the prior chart wholesale under a
distinct `priorChart` key (a full forward and a restore are
structurally identical, so they must not share a shape). Geometry
and label typography ride along untouched. One Apply is one
envelope, one revision, one history entry through the unchanged
engine. No React mutation path exists — the panel builds a
payload, the adapter validates, the engine commits.

## 2. Validation rules

Static (engine envelope): known kind enum; non-empty category
string array; non-empty series array with non-empty names and
numeric arrays; at least one key present. Semantic
(`applyCommand`, which sees current state): non-empty data
(≥1 category, ≥1 series — last-member deletion refused);
exact length agreement (every series holds one value per
category — category-count changes ship full matrices or fail);
finite numbers only (NaN/Infinity/non-numbers rejected, empty
strings rejected — never coerced, never zero-filled);
per-category strings. Allowed deliberately: zeros, negatives,
decimals, very large finite values, empty-string labels, and
duplicate labels/names (labels are display strings; identity is
positional and no join reads names). UI parses strictly
(empty/non-numeric cells name the cell and block Apply) and new
rows/columns start empty so the full-matrix rule cannot pass
accidentally.

## 3. Conversion policy (§4)

Conversions that preserve the complete data are permitted:
bar/hbar/line/area among themselves at any series count, and
pie/doughnut in both directions at ≤1 series (round trip keeps
every value, proven). Conversions native OOXML cannot keep —
multi-series to pie/doughnut — are rejected in the adapter with
an explanation ("cannot keep N series in native PowerPoint
output — remove series first or pick a bar, line, or area
kind"), enforced again in `applyCommand`, and still guarded by
the V2-5A preflight as the last line (proven to name the loss).
Nothing is ever reduced to a first series, and no chart is
replaced by a table without user intent (that fallback lives
only in the compiler for authored multi-series pies).

## 4. Inspector and draft lifecycle

`ChartDataPanel` in the floating format dock: kind select with a
preemptive pie note, editable series/category headers, a value
grid, per-row/column add/remove (bounded at one), Apply/Cancel.
Drafts are raw strings separate from the scene; Apply parses and
submits once; Cancel restores committed values; failures keep
the draft for correction; no-ops record nothing; remount per
element+revision refreshes on undo/redo and reselection.
Selection change discards unapplied input — stated policy
(panels are explicit-Apply; only Apply writes). Stale revisions
fail through the engine with the scene untouched. Inputs live
outside the mount root, so no canvas shortcut fires. Locked and
read-only charts get no panel.

## 5. Revision/conflict behavior

Single-shot Apply at the fresh revision; engine FIFO + nonce +
stale rejection unchanged. Conflict, deleted-target, and
duplicate handling come from the shared path (proven for charts:
stale loses, winner intact). No long-lived session exists, so
no in-flight guard was needed — noted explicitly rather than
reused blindly.

## 6. Human data ownership

New backward-compatible `dataCustomized` boolean (schema +
regenerated types, set only in `applyCommand`) covering the
whole chart content contract — kind, categories, series — which
are inseparable (a pie's single series and a bar's many are one
decision). `recompileSlide` carries the human payload over fresh
geometry and fresh label typography; move/resize-only charts
refresh data from the compiler; undo restores compiler state
byte-identically so abandoned edits recompile clean; redo
restores the human payload. Human-added charts carry forward;
detached slides pass through identical.

## 7. Regeneration counterfactuals

Move-only and resize-only refresh data with geometry kept and
no flag. Edited values/labels/kind survive with the flag.
Data+geometry compose. Undo→recompile yields compiler data;
redo→recompile yields human data. Human-added chart carried.
Detached identical. Locked charts reject at every layer.
Neighboring text/tables byte-identical after chart commits.

## 8. Undo/redo exactness

Snapshot history restores the exact prior chart (kind,
categories, series, labels, flags, provenance); redo restores
the edit. Structural edits (add/remove rows/columns, kind
switches) round-trip exactly.

## 9. Browser chart parity

Committed scenes re-render through `sceneToSvg`/`replaceScenes`
with no chart-specific code: renamed categories appear on axes,
edited values rescale bars, added series extend legends, kind
switches re-project (bar→line proven live). Geometry unchanged
by data-only edits (asserted headless); label typography never
reset (carried fresh, asserted). Legends follow series names.

## 10. Native PPTX chart and workbook verification

Asserted on real parts: `ppt/charts/chart1.xml` holds the exact
series count (`<c:ser>`), names, categories, and values inline;
slide XML carries a `graphicFrame` and no `a:blip` (never
rasterized); kind switches project (`pieChart`, `lineChart`);
undo removes abandoned paint from the XML and redo restores it.
Standing pipeline fact, documented not hidden: the embedded
`Microsoft_Excel_Worksheet1.xlsx` is a 0-byte placeholder, so
fidelity is verified against the inline `strCache`/`numCache`
blocks that PowerPoint actually reads.

## 11. Focused and full test totals

- `test/v2-chart-edit.test.js` — 26/26 (command ×10,
  conversion ×4, undo/conflicts/ownership ×4, regeneration
  ×4, SVG/PPTX ×4).
- `test/v2-edit-chrome-chart.test.js` — 2/2 trusted Chrome
  (value+rename commit with undo/redo round-trip; add
  category+series with pie refusal and draft preservation).
- Baseline `f2d29c9` (isolated worktree): `setChartData`
  unknown — required fail-first proof recorded at close.
- Existing chart suites (`chart`, `v2-chart-4c/4c1/4c2`,
  `chartpalette`), renderer/scene/preservation suites, and the
  full editor family rerun green; `npm run typecheck` clean;
  benchmark 50 cells L1 zero; production build green; full
  suite totals at close (BYOK locale out of scope; browser
  files isolated, none counted on kill/timeout).

## 12. Visual evidence

Eight curated shots (`docs/chart-editor-evidence/`): panel grid,
value+rename commit, added series/category, pie refusal with
intact chart and draft, kind-switched line chart, chromed
rename with marks intact, plus manifest notes. Numeric OOXML
checks accompany every shot claim.

## 13. Remaining limitations

No table editing (next slice); fixtures carry only
single-series bars, so multi-series/kind browser proof beyond
bar+line is headless-only; new rows/columns start empty by
design (must be filled before Apply); duplicate labels allowed
(documented); panel drafts discard on selection change
(stated); embedded xlsx placeholder (inline caches verified);
no dark chart fixture (dark-ink chart labels unproven in
screenshots).

## 14. Next table-editor slice proposal

`element.setTableData` mirroring this contract (cell strings,
row/column add/remove with full-matrix agreement, header
handling, no silent padding loss), a grid panel reusing the
dock, `tableCustomized` ownership with the same carry shape,
and OOXML `a:t` verification. Sized like this slice; no code
started.
