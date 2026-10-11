# V2-5J Evaluation — Layers panel and object arrangement

Date: 2026-10-11. Baseline `7068972` (V2-5I pending review).
No group creation, skeleton gallery, persistence, or agent
paths. Drivers: `node tools/layers-eval.mjs` (gitignored
`out/layers/`); headless `test/v2-layers-5j.test.js`; browser
`test/v2-edit-chrome-5j.test.js`. Curated evidence:
`docs/layers-evidence/` + README.

## Verdict

Every slide object is inspectable and controllable through a
Layers panel bound to the authoritative scene — draw order,
user locks, and visibility all commit through the same
revisioned engine with matching SVG and PowerPoint output.
PASS recommended; V2-5J `[~]` pending independent review, V2-5
parent stays `[~]`.

## 1. Layer tree and selection integration

`flattenLayers` (shared, unit-tested) flattens parents before
children in z order with depth, parent ids, lock/hide flags,
and readable labels (`elementLabel`: role-led text, form-named
shapes, series-named charts, dimensioned tables, alt-led
images, counted groups — never blank). The panel reads the
engine slide directly; selection IS the viewer's (both
directions proven: panel click selects canvas units,
canvas clicks highlight rows, multiselect and group
resolution preserved). Children of selected groups read "via
parent" instead of pretending independence. Expand/collapse
filters collapsed subtrees purely (`applyCollapse`, tested);
rows scroll into view on selection; blank slides get an empty
state; the rail keeps its 172px width so narrow viewports
behave and the canvas is never obscured.

## 2. Stacking-order contract

Canonical policy, now explicit: **z is the rank both
projections sort by (stable), array order mirrors it.**
`element.reorder` removes, inserts at the clamped index, and
rewrites every top-level z to its position — one command, one
entry, stable ids, untouched geometry and content. Both
renderers already sorted stably by z, so no renderer rewrite
was needed; the contract is what was missing, and both now
provably agree (SVG `data-el` sequence vs OOXML `a:off`
sequence asserted). No incidental sort stability is relied
upon, and the element array is rewritten by the command, never
replaced ad hoc.

## 3. Locking semantics

`element.setLocked` toggles an explicit boolean (absence and
false normalized — they read identically everywhere).
Locked objects reject drag/resize/delete/style/edit at the
engine; locks inherit downward for canvas hits (existing DOM
rule) and for panel hide actions (new ancestor rule); the
Layers panel lists locked rows with a working unlock control
(the escape hatch stays reachable — which is exactly why the
engine exempts `setLocked` from its own locked gate).
System chrome (locked + compiler provenance + no authored
ref) cannot be unlocked through the panel path — refused with
an explanation, proven, history untouched. Locking marks
provenance human and slide customized without claiming
geometry; undo restores byte-exact prior state.

## 4. Visibility semantics

Backward-compatible `hidden?: boolean` across schema, SVG,
PPTX, validation, ownership, and undo. Hidden means **omitted
from both projections while preserved verbatim in the scene**
— never deleted, never rasterized, restorable whole (content,
geometry, draw order). Stated plainly: hidden objects are NOT
PowerPoint-editable while hidden, because they are not in the
file; re-showing restores native editability. Preflight skips
hidden payloads (an unsafe hidden chart cannot fail export)
and re-arms on re-show. Hidden rows are dimmed, listed, and
eye-toggleable, but never selected (no canvas node exists to
select — documented instead of faked). Groups vanish whole;
children vanish alone.

## 5. Grouping scope and limitations

Audited, then deliberately deferred: groups are full
selection units with addressable children, correct coordinate
offsets, and native group export already — but creating and
dismantling groups needs transform semantics and nesting
rules beyond a wrapper, so no group/ungroup command ships
here. The panel displays real group hierarchies with
expand/collapse, operates on group units (reorder/lock/hide),
refuses child reordering with the group named, and inherits
locks downward. Nothing is flattened into images. No fixture
deck carries groups, so hierarchy behavior is proven on
synthetic scenes headlessly — stated, not browser-faked.

## 6. Ownership/regeneration

Reorder sets arrangement ownership (`customized` + human);
locks and hides mark provenance human without geometry
claims. `recompileSlide` carries z on exact-id matches, user
locks (non-chrome lineage), and defined hidden values — plus
restores the human id sequence on customized slides (fresh-only
ids keep fresh order at the end; managed slides keep compiler
order, making the rule a no-op for untouched slides). Proven:
reordered order+z survive; user lock/hide carried; abandoned
lock/hide recompile fresh; move-only text refreshes; detached
identical; tombstones compatible (existing suite green).
Deck-level regeneration does not exist (test-only single-slide
recompile, no callers) — stated honestly as before.

## 7. Undo/redo behavior

Snapshot history restores exact ranks, flags, and provenance;
redo restores the layer edit. One operation is one entry;
parked drops and identical toggles record nothing; stale
revisions fail with order untouched.

## 8. Native PPTX ordering

Proven on real archives: shape sequences follow the rank,
reordered text/charts/tables stay native and editable, hidden
tables/charts vanish without raster traces, re-shown objects
export natively again, preflight skips hidden and re-arms.

## 9. Chrome visual evidence

Five trusted suites with nine curated shots: tree with
bidirectional selection, card text covered by its own frame
after one backward step (then undone), locked-against-drag
with marks intact, hidden-from-projection with bytes intact,
Alt+Arrow keyboard reorder with arrows untouched, narrow
usability, and read-only absence of the tab.

## 10. Focused and full-suite results

- `test/v2-layers-5j.test.js` — 25/25 (tree ×4, reorder
  ×6, lock ×4, visibility ×5, regen ×3, export ×4).
- `test/v2-edit-chrome-5j.test.js` — 5/5 (tree sync,
  restack, lock/hide cycle, keyboard, narrow+read-only).
- Baseline `7068972` (isolated worktree): new layer APIs
  absent — required fail-first proof recorded at close.
- Related suites rerun green (engine incl. the lock-gate
  exemption, preservation incl. the customized-order rule,
  tables/charts, 5d–5i editor, 5c adapter, viewer/selection,
  renderer, export); `npm run typecheck` clean; benchmark 50
  cells L1 zero; production build green; full suite totals
  below (BYOK locale out of scope; browser files isolated,
  none counted on kill/timeout).

## 11. Remaining limitations

No group/ungroup commands (bounded follow-up); no bulk
reorder; middle-row collapse state is per-mount (resets on
remount); hidden rows unselectable by design; lock toggle on
already-correct state is a no-op; multi-line inspectors can
still shift the stage (hold backstop); no dark layer fixture
(dark shell chrome verified instead); no fixture groups for
browser hierarchy proof.

## 12. Recommended layout-gallery slice

Editable slide-skeleton gallery producing Layer-C scenes
through the existing add path (blank insert already lands),
then V2-6 persistence. Nothing started here.

## 13. Validation totals

Focused at close: headless 25/25, Chrome 5/5 (isolated),
related suites green, typecheck clean, benchmark 50 cells L1
zero, production build green, real Chrome green. Full
`npm test`: exact totals at close (BYOK locale out of scope;
bounded-concurrency browser isolation, nothing counted on
kill/timeout).
