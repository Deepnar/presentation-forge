# V2-5H Evaluation — native table editing

Date: 2026-10-11. Baseline `9d2b660` (V2-5G pending review).
No slide management, Layers, layout galleries, persistence, or
agent paths. Drivers: `node tools/table-eval.mjs` (gitignored
`out/table-editor/`); headless `test/v2-table-edit.test.js`;
browser `test/v2-edit-chrome-table.test.js`. Curated evidence:
`docs/table-editor-evidence/` + README.

## Verdict

A selected table's cells, headers, rows, and columns edit in
place through one atomic `element.setTableData` per Apply, with
ragged input rejected before commit, verbatim text fidelity,
human matrices surviving regeneration under their own flag, and
native editable PowerPoint tables verified cell by cell. PASS
recommended; V2-5H `[~]` pending independent review, V2-5
parent stays `[~]`.

## 1. Table schema audit (§2)

Authoritative representation: `rows: string[][]` (plain
strings — no runs, no per-cell formatting objects),
`header: boolean` (row 0 is the header when true), and an
optional compiler-resolved `layout` (rowHeights, colWidths
summing to element width, header/body typography, padding,
grid). Geometry lives on the element. Row/column changes need
no dimension-array surgery: both renderers fall back per entry
(declared length match, else even split / proportional height),
so added rows and columns draw from honest fallbacks instead of
invented layout — and no second layout engine was built in
React. Renderer behaviors that could lose cells (green-fill
ragged padding, silent drops) are projection-only and covered
by refusing ragged input at the command boundary.

## 2. Table command API (§3)

`element.setTableData { id, table: { rows } }`
(`packages/model/commands.ts`): full replacement matrices only
— never deltas, never padding. The header flag, layout,
typography, and geometry ride along untouched (the flag is
preserved, never toggled; header WORDING edits arrive as
first-row cells). The inverse restores prior rows wholesale
under a distinct `priorRows` key. Locked/unknown/wrong-kind
targets rejected; one transaction and one history entry per
Apply; neighbors untouched; human `tableCustomized` ownership
marked separately from geometry; envelopes validated at the
engine boundary with rectangularity enforced in `applyCommand`
as well as the envelope check.

## 3. Row/column operation semantics (§4)

Edit any cell, rename headers via row 0, append/remove the last
row, append/remove the last column. Rules: ≥1 row and ≥1
column (last-member deletion refused); header flag preserved;
insertion is end-append, removal is end-trim (predictable,
documented — middle operations out of scope); new cells start
as empty strings (valid, never zero-filled); removing a
populated row acts on the visible draft at once and commits
only on Apply — the draft change plus the explicit Apply is
the confirmation model, with removal buttons titled
accordingly. Existing row/column styling is never rewritten:
layout travels verbatim and renderers fall back per entry.
**A short row is rejected, never padded** — so populated rows
cannot vanish because another part of the matrix differs.

## 4. Inspector and draft lifecycle (§7)

`TableDataPanel` in the floating format dock: a string grid
with a bold header row and "row 1 is the header" note, ±Row /
±Column (bounded at one, destructive buttons titled), Apply /
Cancel, inline errors. Drafts are verbatim string matrices
separate from the scene; one Apply submits once; Cancel
reseeds; failures keep the draft; no-ops record nothing;
remount per element+revision refreshes undo/redo and
reselection; selection change discards unapplied input (stated
policy — only Apply writes); Tab/Enter never submit
accidentally (Enter applies deliberately, like every panel);
locked/read-only tables get no panel; narrow viewports scroll
the grid horizontally (proven at 900px). Chart-editor
conventions reused (dock, remount keys, raw-string drafts,
explicit Apply); no chart assumptions copied (no numeric
parsing at all).

## 5. Numeric/text fidelity (§8)

Cells are never parsed: `00123`, `₹1,25,000`, `1.00`, `−7.5%`,
`N/A`, empty strings, long copy, and unicode all round-trip
character-identical from grid to scene to OOXML (proven).
No locale conversion, no type coercion, no trimming. The
schema carries strings only, so there is nothing to collapse —
and ragged/non-string input is refused rather than repaired.

## 6. Layout and overflow rules (§5, §10)

Content-only edits keep geometry byte-identical (asserted) and
leave layout verbatim (asserted deep-equal). Added rows and
columns draw from renderer fallbacks; nothing shrinks,
truncates, drops, resizes, or restyles silently. Density is
estimated with `tableOverflowEstimate` (new, `scene-text.js`):
per-cell wrapped lines via the compiler's own `lineCount`
against the same column widths and row heights both renderers
draw — advisory only, surfaced with the row named and inches
quoted (proven live: "row 3 needs ~0.83in, has 0.19in (+5
more)"). A much denser table stays fully authored with a
warning, never a quieter table.

## 7. Human ownership and regeneration (§6)

New backward-compatible `tableCustomized` boolean (schema +
regenerated types, set only in `applyCommand`).
`recompileSlide` carries the human matrix (rows deep-copied,
header flag preserved, layout/typography fresh) over
preserved-or-fresh geometry; move-only tables refresh rows
from the compiler with no flag; data+move compose; undo
restores compiler rows byte-identically so recompile flows
fresh; redo restores human rows; human-added tables carry
forward; detached slides pass through identical. Identity is
exact-id first with semanticRef fallback (shared `findPrev`);
when the semantic table disappears or changes identity there
is no matrix to carry and the fresh compile stands alone —
documented, not guessed.

## 8. Undo/redo exactness

Snapshot history restores exact rows, layout, header flag,
`tableCustomized`, and provenance; redo restores the edit.
Structural edits (add/remove rows and columns) round-trip
exactly, including through OOXML export.

## 9. Browser table parity

Committed scenes re-render through `sceneToSvg` /
`replaceScenes` with no table-specific code: edited cells,
added rows/columns, and header wording all appear; removed
structure disappears on Apply; selection rings and handles
follow the unchanged box.

## 10. Native PowerPoint table verification (§9)

Asserted on real slide XML: native `<a:tbl>` structure, exact
row/column counts, correct cell order, header text, unicode,
leading zeros, empty cells, and per-cell values as editable
`<a:t>` runs — never rasterized (`a:blip` absent), never lost.
Undo removes abandoned cells from the XML and redo restores
them. Edited tables pass the existing export preflight, which
still rejects empty tables.

## 11. Restore-command validation findings (§11)

Audited as required: the chart `priorChart` restore path
accepted any well-formed object and installed it verbatim,
bypassing the length-agreement and pie-gate rules a forward
commit faces. Contained correction included (no engine
rewrite): `applyCommand` now runs the shared
`assertChartPayload` on BOTH paths, and the envelope validator
deep-checks restore shapes. The table command was built safe
from the start — `assertTableMatrix` on both paths, `priorRows`
validated at the envelope and semantically at apply. Covered:
direct ragged/empty `priorRows` submissions rejected with no
history; direct mismatched/pie `priorChart` submissions now
rejected (new tests). The remaining pre-agent surface (any
other inverse-shaped input) is documented in the roadmap item,
not widened here.

## 12. Focused and full-suite results (§12, §16)

- `test/v2-table-edit.test.js` — 22/22 (command ×7,
  fidelity/density ×4, undo/conflicts/ownership ×4,
  regeneration ×4, export ×3).
- `test/v2-edit-chrome-table.test.js` — 3/3 trusted Chrome
  (cell edit with undo/redo round-trip; add row+column then
  remove; narrow-viewport usability).
- Baseline `9d2b660` (isolated worktree): new table APIs
  absent — required fail-first proof recorded at close.
- Existing chart-edit suites rerun green (no regressions from
  the shared-code hardening); command-engine, preservation,
  renderer, viewer, and export suites green; `npm run
  typecheck` clean; benchmark 50 cells L1 zero; production
  build green; full suite totals below (BYOK locale out of
  scope; browser files isolated, none counted on
  kill/timeout).

## 13. Evidence (§13)

Eight curated shots (`docs/table-editor-evidence/`): panel
grid with header note, cell commit, added structure, grown
table with density warning, undo restoration, chromed header
edit with marks intact, narrow-viewport commit, plus manifest
notes. Every visual claim pairs with scene assertions and
slide-XML checks.

## 14. Remaining limitations

Middle insert/remove (end-only operations); no header-flag
toggle (preserved, future); no cell merge or formulas;
layout/typography follow the compiler (added rows use fallback
geometry until recompile); panel drafts discard on selection
change (stated); no dark table fixture; embedded chart-xlsx
placeholder predates this slice (unchanged).

## 15. Proposed slide-management slice (§15)

Slide add/duplicate/delete/reorder UI over the existing
engine slide ops (already revisioned and tested headless),
filmstrip multi-select, and detach/relayout affordances —
then V2-6 persistence. Layers, layout gallery, and frontend
consolidation stay planning entries. Nothing started here.
