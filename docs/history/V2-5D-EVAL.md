# V2-5D Evaluation — inline text editing and native text/shape insertion

Date: 2026-10-11. Baseline `b7915aa` (V2-5C + V2-5C-1 in review).
No resize handles, formatting toolbar, shapes gallery, persistence,
or agent paths. Drivers: `node tools/v2-5d-eval.mjs` (gitignored
`out/v2-5d/`); headless `test/v2-text-5d.test.js`; browser
`test/v2-edit-chrome-5d.test.js`. Curated evidence:
`docs/v2-5d-evidence/` + README.

## Verdict

A person can double-click ordinary slide text, reword it, add native
text boxes and rectangles/rounded rectangles, and export editable
native PowerPoint — every committed change crossing the same
revisioned engine, with rich formatting never silently flattened.
PASS recommended; V2-5D `[~]` pending independent review, V2-5
parent stays `[~]`.

## 1. Text-editing interaction model

PowerPoint-like, single click selects; double-click or Enter opens
text-edit mode; a textarea overlay sits exactly over the text box
(measured within 0.21px of the element in real Chrome); the slide
layout never moves; the authoritative SVG node hides beneath the
overlay and is restored on close. Commit: Ctrl/Cmd+Enter, the Commit
button, or focus leaving the overlay (click-away = commit).
Cancel: Escape or the Cancel button. An unchanged draft is a genuine
no-op (no revision, no history, no ownership change).

Two real-browser findings shaped the implementation:

- **Inspector shift.** Selecting reveals the inspector, which reflows
  the stage, so the second press of a fast double-click can land on
  the background — and its click then *clears* the selection before
  `dblclick` fires. The adapter holds a freshly single-selected unit
  through that clearing click (600ms window, selection-checked), so
  the event still reaches it. Editing itself never opens on press:
  a press may still become a drag, and press-time opening hijacked
  rapid successive drags in testing (covered: second drag on another
  text commits a move, never an edit).
- **Cancel/focusout race.** Chrome fires focusout synchronously
  while the overlay is removed, so teardown nulls the box *before*
  detaching; otherwise Escape-cancel recommitted the draft (proven
  by the failing-then-passing Chrome cancel test).

Commit/Cancel buttons carry `onMouseDown preventDefault` so they
never blur-commit before their own action runs.

## 2. Supported paragraph/run structures

`packages/editor/scene-text.js` owns the boundary. **Simple text**
(exactly one paragraph holding exactly one run) is directly
editable; the draft is the run's text and the commit clones the
run's full styling (family, size, weight, color, role, tracking,
line, transform, bold, italic) plus paragraph align/bullet, changing
only text. Newlines become paragraph boundaries carrying the same
style. **Structured text** (anything else — multi-paragraph bodies,
multi-run emphasis) is explicitly refused with its counts named
(`4 paragraph(s), 4 run(s)`), no session opened, no history, no
flattening. Plain-text flattening is never called fidelity-
preserving anywhere in code, tests, or UI.

Editable in V2-5D: titles, labels, single-run bodies, inserted text.
Deferred: rich-run editing (multi-run/multi-paragraph in place).

## 3. Draft lifecycle and commit/cancel policy

`beginTextEdit` records `{ slideId, elementId, baseRevision,
origParagraphs, draft }`. Typing touches only `draft` (proven:
scene JSON identical mid-edit). `commitTextEdit` builds one
`element.updateText` and submits one envelope — D2 resolved per
commit, one history entry per session however long the typing.
Failure (conflict, deleted target, invalid result) preserves the
draft and the open session for copy-out or explicit force.
`cancelTextEdit` discards with no history or ownership change.
Pending-edit policy: slide/deck navigation and edit-mode exit
commit first and proceed only on success (`commitPendingEdit`,
wired into filmstrip, Prev/Next, deck picker, Done, and live-deck
arrival).

## 4. Command-engine integration

Text commits and both insertions travel as single `element.updateText`
/ `element.add` envelopes at the session's base revision through the
unchanged V2-5B engine (FIFO, validation, snapshot undo). The engine
sets `contentCustomized`; no React or adapter code duplicates that
logic. Drag/nudge/delete/undo/redo entry points are shared with
V2-5C; while a session is open they reject explicitly (the field
keeps native caret/undo semantics).

## 5. Conflict handling

Revision is recorded at `beginTextEdit`. A moved revision reports
`stale-revision` (expected/actual) with the session and draft kept
open — never a silent rebase. Only an explicit user Overwrite
(`force: true`, banner button) re-bases onto the current revision.
A deleted target reports `unknown-element` with the draft preserved
for copy-out. A missing slide/deck behaves the same way. Navigation
with a conflicted draft stays put with the banner visible.

## 6. Text-box insertion

`+ Text` submits `element.add` with the canonical text schema
(`kind: text`, `fitPolicy: wrap`, valid inches geometry,
`provenance: human`, collision-safe `h-` id with mint retry).
Placement is deterministic scene-center (visible at fit/100%/200%,
scrolled, narrow; proven on-canvas by bounds assertion), clear of
edge-seated chrome. Appends at top draw order (`z` follows), selects
the new element, and the same edit mechanism rewrites it. Move,
nudge, delete, undo, and redo behave identically to compiler text.
Successive inserts stack at center (documented; cascading is future
work — the user drags, one revision).

## 7. Shape insertion

`+ Rect` / `+ Round` submit `element.add` with `form: rect |
roundRect` — the starter set from the Layer-C contract (ellipse is
schema-valid and renders, but has no button yet). Same placement,
ordering, provenance, selection, history, and regeneration-carry as
text. Unsupported forms throw before any engine contact. No gallery,
fills inspector, connectors, or freehand — explicitly out of scope.

## 8. Theme-default policy

Gap (stated, not hidden): scenes carry resolved runs but no design
system, so no exact theme default exists to reuse. The narrow
deterministic fallback is the whole policy: sample a sibling run's
size/family/ink (and a sibling shape's fill) when one exists, else
ink by background luminance (dark → white, light → near-black) at
18pt body, and a mid blue shape fill readable on both grounds. No
second theme resolver or fitting compiler lives in the UI.

## 9. Overflow/fit findings

Editing can outgrow the box. The slice does not shrink fonts, truncate,
discard runs, resize geometry, or recompose: commits always land
whole, and an estimate reusing the compiler's own `lineCount`
heuristic reports `text needs ~N lines in a box seating ~M` through
the error line and edit event. Geometry is byte-identical after an
overflowing commit (asserted). No browser-side layout planner was
built; schema-validity is asserted separately from fit, as specified.

## 10. Ownership/regeneration behavior (Cases A–I)

- A edited compiler text → `contentCustomized`, wording survives
  recompile at kept-or-fresh geometry.
- B undo → exact prior paragraphs, flags, and provenance return.
- C redo → human wording and ownership return.
- D/E human-added text/shape → carried forward across recompiles.
- F detached → untouched (inherited V2-5B path, unmodified).
- G moved-only text → geometry kept, wording refreshes from the
  compiler (no content flag from a move).
- H deleted generated text → suppression tombstone still holds
  (V2-5C path rerun green); human-added deletions record none.
- I unsupported (rich) edit → refused with zero mutation; the
  body's four paragraphs and runs assert identical.

## 11. Native export checks

Edited scenes render through the unchanged V2-5A preflight.
Asserted on real OOXML (`ppt/slides/slide1.xml` via JSZip):
user-entered text present, inserted text present, inserted shape as
`<a:prstGeom prst="roundRect">`, run color projected, multiline
commits as real paragraph breaks (`<a:br/>`), no `autoFit`
reliance, charts/tables untouched (existing suites green),
export-unsafe configs still fail closed (V2-5A suite green).

## 12. Browser screenshot observations

Seven curated shots (`docs/v2-5d-evidence/`): overlay mid-edit with
caret and undisplaced layout; committed title (`human`, rev 1);
cancelled edit (rev 0, identical slide); rich-text refusal banner
with intact content; chromed inserts (crest/footer untouched, rev
2); inserted shape selected; dragged insert at its new position.
Overlay-vs-element geometry measured live: dx −0.01px, dy −0.02px.

## 13. Test results

- `test/v2-text-5d.test.js` — 37/37 linkedom+engine+OOXML (model
  helpers, lifecycle, isolation, styling, paragraphs, rich refusal,
  conflict/force, deleted target, slide-switch policy, undo/redo
  ownership, regeneration, insertion ×7, export ×2). Fails on
  `b7915aa` (module absent — verified in an isolated worktree:
  1 fail / 0 pass at import).
- `test/v2-edit-chrome-5d.test.js` — 4/4 trusted Chrome
  (dblclick→type→commit, Escape cancel, caret isolation +
  Ctrl+Enter, insert→drag→undo). Each re-verified after the two
  interaction fixes (§1); insertion suite green throughout.
- Related suites rerun: 5c adapter, 5b/5b1 engine, 5b ownership,
  5c tombstones, 4e selection — 138/138 with the new file before
  the final additions; full-suite totals recorded at close.
- `npm run typecheck` — clean. Benchmark, production build, and
  full `npm test` at close (below).

## 14. Remaining limitations

Rich-run editing deferred (honest refusal); successive inserts
share the center point; ellipse has no button; no resize handles
(overflow warns instead of resizing); no persistence (deck
navigation commits or holds, as documented); fast double-click
relies on the 600ms selection hold; Ctrl+Z in the field is native
text-undo only; no dark v2 fixture exists in the viewer (dark
legibility proven by `contrastInk` units, not a dark screenshot).

## 15. Proposed V2-5E work

Rich-run editing (per-run draft model), resize handles through
`element.resize`, insert cascading/nudge-to-place, ellipse button,
style commands (`element.setStyle` shape), chart/table editors,
then persistence binding (V2-6 seam). No V2-5E started here.

## 16. Validation totals

Focused at close: headless 37/37, Chrome 4/4 (isolated runs),
related engine/viewer/selection/tombstone suites green,
`npm run typecheck` clean, `node tools/v2-benchmark.mjs --raster
none` 50 cells L1 zero, production browser build green, real
Chrome interaction green. Full `npm test`: recorded at close with
exact totals (known BYOK locale failure out of scope; no killed or
timed-out file counted as passing — bounded-concurrency per the
parallel-Chrome lesson, browser files run isolated).
