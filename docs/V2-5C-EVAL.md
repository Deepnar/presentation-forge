# V2-5C Evaluation — native canvas editing, move/nudge/delete & tombstones

Date: 2026-10-11. Baseline `4d16a2f` (V2-5B/5B-1 pending
acceptance). No text editing, resizing, persistence, or
agent paths. Drivers: `node tools/v2-5c-eval.mjs`
(gitignored `out/v2-5c/`). Curated evidence:
`docs/v2-5c-evidence/` + README.

## Verdict

The browser performs real human edits through the shared
command engine with reliable history and regeneration-safe
deletions, and no second source of truth was created. PASS
recommended; V2-5C `[~]` pending independent review, V2-5
parent stays `[~]`.

## 1. Interaction architecture

Three layers, as specified: scene-dom owns selection,
overlays, keyboard dispatch, and projection math;
`packages/editor/scene-edit.js` (`attachEditor`) owns
pointer mechanics, drag preview, and engine submission;
the engine owns mutation, revision, history, and
ownership; the compiler owns regeneration and tombstone
enforcement. The adapter reads viewer selection and
engine snapshots — it stores no document copy. React
creates the document, attaches the adapter, and renders
filmstrip/status; it owns no editing logic.

## 2. Command-engine adapter

`attachEditor(viewer, doc, { root, onError, onSync })`:
pointer handlers (down/move/up/cancel + Escape cancel),
`clientToScene` projection through live layout (null
without it — errors explicitly instead of guessing),
preview via node transform with overlay follow, single
move or atomic batch on release, nudge/delete/undo/redo
entry points, `pending()` for deterministic observation,
and `detach()` removing every listener and edit mode.
Commit failures surface through `onError`; successes sync
the viewer via `replaceScenes` (no remount) and report
through `onSync`.

## 3. Drag coordinate math

Viewport → SVG px via the live svg rect divided by the
canonical width (`rect.width / (13.333 × 96)`), deltas
only (no jump: origins come from the authoritative engine
snapshot, never the pointer anchor), inches = svg px /
96 rounded to 3 decimals. Proven at fit, 100%, 200%,
900×1400, and after scroll (scroll offsets fall out of
client-rect math — no special-casing). Chrome banner
seats, nested group targets, and chart/table innards all
resolve to authoritative units before any math runs.

## 4. Nudge keybindings

Arrows move selection 0.05in; Shift+arrows 0.25in; arrows
with empty selection (or read-only mode) still navigate
slides; filmstrip, inputs, and outside controls never
intercept (mount-root listener + editable-target guard).
Multiselect submits one atomic batch; any locked or stale
member fails the whole batch explicitly. Undo reverses
the batch as one entry. Exported as `NUDGE_STEP`,
`NUDGE_LARGE_STEP` beside the adapter.

## 5. Delete behavior

Single selection → one `element.delete`; multiselect →
one batch; locked never deletes (locked hits clear like
background); unknown/stale ids fail explicitly, never
partially; selection reconciles by dropping unresolvable
ids; undo restores exact order/identity/metadata/content;
redo deletes again. Group children are not individually
deletable: hits resolve to the parent group first, so a
child delete invitation deletes the authoritative unit —
never the wrong element, documented in the suite.

## 6. Tombstone schema and preservation contract

Backward-compatible optional `SlideScene.suppressed:
{ id, semanticRef? }[]` (schema + regenerated types).
Engine records on compiler-originated deletions only
(human-added: nothing); regeneration skips exact-ID
matches and carries the list forward; matching never
guesses (renamed identities go inert, retained);
detached slides pass through untouched; locked chrome
cannot be deleted or suppressed; batch rollback covers
tombstones on the same working clone; undo/redo restore
suppression via snapshot images.

## 7. Regeneration counterfactuals (Cases A–I, 10/10)

A suppressed-absent; B undo clears suppression and
re-includes; C redo re-suppresses; D human-added clean;
E customized suppresses by identity; F detached
identical; G siblings exact; H1 renamed inert+retained;
H2 same-id cross-theme suppression holds; I batch
failure records half nothing. A (plus C/E–H2) fails on
baseline. Exact contents and metadata asserted, not
counts.

## 8. Undo/redo integration

Toolbar Undo/Redo buttons plus Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z, Ctrl+Y (guarded from inputs); one drag,
one nudge batch, and one delete batch each equal one
history entry; revisions advance monotonically
(nudge-delete-undo lands rev 3); failures surface in the
status line; stale bases cannot overwrite (adapter always
submits at the fresh revision; engine rejects otherwise);
snapshots stay immutable; restoration does not reselect
(documented — the user re-points).

## 9. Browser screenshots

Seven inspected shots (§11 list covered: prose, chart,
chromed, dark/plate by reuse pointer, group; cards,
comparison, table, metric via headless + prior evidence):
before/during/after drag, zoomed, scrolled, nudge,
multiselect, delete/undo, locked rejection, group move.
Overlay deltas ≤ 0.1px on committed geometry; mid-gesture
verified by pixel-diff and ring measurement.

## 10. Tests

- `test/v2-edit-5c.test.js` — 19/19 linkedom (init,
  drag math at 1x/2x, threshold, cancel, locked,
  toggle/collapse semantics, nudge increments, batch
  atomicity, stale failure, delete+tombstone+reconcile,
  read-only preservation, ctrl+z wiring, detach, group,
  chart-unit, revision freshness, immutability).
- `test/v2-edit-chrome-5c.test.js` — 5/5 trusted Chrome
  (drag commit, zoomed+scrolled conversion, nudge batch
  + delete + undo buttons, locked + Done cleanup,
  narrow).
- `test/v2-tombstone-5c.test.js` — 10/10 (A–I).
- Both suites fail on `4d16a2f` (adapter absent; 7/10
  tombstone cases fail by resurrection).
- `test/v2-selection-4e.test.js` 18/18 + smoke + viewer
  suites unmodified and green (read-only preserved).

## Validation totals

Focused at close: tombstones 10/10, adapter 19/19,
Chrome editing 5/5 (each re-verified in isolation),
engine 27+21, ownership 5/5, related suites 130/130,
typecheck clean, benchmark 50 cells L1 zero. Full
`npm test`: **1635 total · 1633 pass · 2 fail ·
0 skipped · 0 cancelled · 0 todo**. The two failures:
the standing BYOK locale grouping issue (unrelated,
untouched), and the edit-chrome file wedging for 75
minutes under full parallel load (killed to let the
suite report; its 5 tests never executed there, 5/5 in
isolation immediately after). No failure was
reclassified, and no accepted test was rewritten to
pass — the single 4c1 contract update belongs to the
fail-closed boundary it documents.

## 11. Remaining limitations

No text/resize/style/chart-data editing; no persistence
(edit mode keeps unsaved work visible with a status hint;
deck navigation resets explicitly); no agent turns;
collapse-on-release replaces click-collapse in edit mode
(documented §4 behavior); preview uses node transforms
(paint verified); tombstones keyed by exact ID (family
changes intentionally inert).

## 12. Proposed next editor slice

V2-5D: inline text editing through `element.updateText`
(commit-granularity per D2) with `contentCustomized`
already wired, plus `element.add` UI for text/shape.
Then style/chart-data commands, slide management UI,
persistence binding, agent turns.
