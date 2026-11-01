# V2-5E Evaluation — resize handles, shape styling, and interaction hardening

Date: 2026-10-11. Baseline `73eb531` (V2-5D pending review).
No rich-run editing, chart/table editors, persistence, or agent
paths. Drivers: `node tools/v2-5e-eval.mjs` (gitignored
`out/v2-5e/`); headless `test/v2-resize-5e.test.js`,
`test/v2-style-5e.test.js`, `test/v2-textcommit-5e.test.js`;
browser `test/v2-edit-chrome-5e.test.js`. Curated evidence:
`docs/v2-5e-evidence/` + README.

## Verdict

The browser editor resizes native elements accurately at every
zoom, restyles shapes through the same revisioned engine with
regeneration-safe ownership, cascades repeated inserts, and no
longer double-submits text commits or jumps the stage on
double-click. PASS recommended; V2-5E `[~]` pending independent
review, V2-5 parent stays `[~]`.

## 1. Resize implementation

Eight handles (corners + edge midpoints) in a dedicated
pointer-transparent layer over the stage — white squares, accent
borders, directional cursors, readable on light and dark grounds.
A handle press starts a resize session, never a drag; moves redraw
a dashed preview box at the candidate geometry (the element is
never transform-distorted, so text never smears mid-gesture);
release commits exactly one `element.setGeometry`; Escape and
pointer cancellation discard with no history. A press without
movement commits nothing (no jump at resize start).

Supported: single-selected text, shape, image, chart. Explicitly
refused (never improvised): locked units, groups (children would
need rescaling, not re-boxing), lines (absolute x2/y2 endpoints),
tables (absolute colWidths summing to w), and multiselection.
Read-only viewers never load the adapter, so read-only mode is
visually unchanged. Handles are DOM overlays, never scene content,
so export cannot contain them.

Two implementation findings:

- **Eager pending.** The first commit landed but `pending()`
  resolved early: the transaction registered only after `await`.
  Same race class as the V2-5D focusout fix — `commitResize` now
  captures state synchronously and tracks the async apply
  immediately (proven by a failing-then-passing exact-coordinates
  test).
- **Layer lifetime.** The viewer's render clears the mount root on
  every committed swap, destroying the handle layer with it. The
  layer now re-attaches itself on every reconcile (proven: handles
  rebuilt on post-commit geometry).

No aspect-ratio or modifier-key policy was introduced: handles are
free, one revision per gesture, undo restores all four numbers.

## 2. Geometry architecture (§4 decision)

`element.resize` changes w/h only, so west/north handles need more.
The slice adds an atomic `element.setGeometry { x, y, w, h }`
(`packages/model/commands.ts`): one command, one inverse, one
history entry — never a move+resize pair that could half-land.
`element.resize` stays for extent-only callers. All eight handles
render because all eight are correct through the one command;
`resizeGeometry` is a pure shared function, so preview and commit
cannot drift. Extents clamp at 0.1in holding the opposite edge;
non-finite input throws loudly (the clamp was found swallowing
NaN in testing and now validates first).

## 3. Coordinate fidelity measurements

V2-5C-1 equations reused verbatim (`clientToSvgDelta`, per-axis
scales, divide-never-multiply). Headless: scale-1 exactness, a
non-uniform 2×/0.5× case asserting per-axis division, release-vs-
last-move parity. Real Chrome (equation checked against live k):

| case | pointer | authoritative Δ | rendered check |
|---|---|---|---|
| fit, se +96×+48 | +96/+48 client px | +1.007w/+0.503h in (k≈0.99) | within 0.02in of equation |
| 200% scrolled, nw −60×−30 | −60/−30 client px | origin −0.33/−0.16in, extent +0.33in | within 0.03in both axes |
| handle alignment | — | se center on box corner | ≤ 2px |

Overlay alignment alone was not accepted: the inspector's
authoritative inches are parsed and compared to the equation.

## 4. Shape-style command contract

`element.setStyle { id, style: { fill?, stroke?, strokeWidth? } }`:
only mentioned keys are touched (partial updates never wipe);
explicit `null` removes a key; `fillAlpha`/`strokeAlpha`/`form`
ride along. Validation up front: 6-digit hex (leading `#`
accepted, normalized upper), finite width 0–24, at least one key,
shapes only, unlocked, existing. Effective no-ops succeed without
recording (case-insensitive too). Undo restores exact prior
appearance including absence (null markers survive JSON); redo
restores the human paint.

## 5. Ownership audit and styleCustomized

The gap was real: `customized` marks geometry and
`contentCustomized` marks text, so a restyled compiler shape lost
its fill on the next recompile (fresh paint wins). The slice adds
the narrow backward-compatible `styleCustomized` boolean
(schema + regenerated types, set only in `applyCommand`), with a
same-kind owned-keys carry in `recompileSlide` mirroring the
content rule: styled shapes keep human fill/stroke, merely
resized shapes refresh paint from the compiler, alphas/form
always follow the fresh compile. Undo of a first style edit
restores the compiler element byte-identically (proven), so
abandoned styling behaves as never-existed.

## 6. Styling UI behavior

The inspector gains a style section for a single selected unlocked
shape: fill color picker, stroke color picker plus No-stroke,
width 0–24, Apply button. Local draft state commits explicitly
(Apply, blur, Enter) — a picker drag never spams history.
Remounted per element+revision, so undo/redo and reselection
refresh values (proven in Chrome: fill `112233` committed at rev
2, panel back to compiler after undo at rev 3). Invalid width
reports inline without contacting the engine. Genuine no-ops
commit nothing. Panel inputs live outside the mount root, so no
canvas shortcut can fire from them. Text and multiselection get
no panel — explicit scope, not a half-wired toolbar.

## 7. Insertion-placement policy

`cascadeBox`: the nth human element on a slide steps 0.4in right
and down from center, cycling every 6, clamped on-canvas. The
index derives from content (human-element count), so placement is
stable across zoom, reload, and Edit toggles — scene inches, no
viewport math, no composition planner. Explicit boxes bypass the
cascade. Undo/redo preserve exact committed geometry and IDs.
Proven: three inserts at 0.4in steps, all on-canvas at 200% and
narrow; undo/redo byte-exact; caller input mutation cannot move
the scene. An `+ Ellipse` button rides the existing contract
(supported all along, previously buttonless).

## 8. Text-commit race resolution (§10.1)

A per-session in-flight guard with join semantics: a late trigger
(blur+Commit, double Commit, Ctrl+Enter+blur, navigation during a
commit) awaits the one in-flight submission and resolves with its
outcome — never a second envelope, never a second history entry.
Failed first commits reset the flag, so conflict→force retry
works and drafts are never discarded first. Navigation during a
commit waits via `commitPendingEdit`. Cancel-during-commit closes
the UI while the submitted op still lands honestly (engine
already holds it; documented edge, covered by test).

## 9. Double-click layout correction (§10.2)

Measured first: selecting moves the stage only by the inspector's
appearance. The fix is structural, not timing: the inspector
wrapper now always reserves one line (transparent border when
empty), so single-line selection cannot reflow the stage. Proven
in Chrome: title center identical within 1px before/after
selection, and a double-click at the ORIGINAL coordinates opens
editing. The 600ms selection hold stays as backstop for
multi-line inspectors (shape panels still grow the wrapper — but
shapes are never text-edited, so no dblclick path needs them).
Drag, shift-select, clearing, and keyboard behavior rerun green.

## 10. Undo/redo exactness

Resize, style, cascade-insert, and guarded text commits all undo
to byte-identical prior elements (geometry, paint, paragraphs,
all three ownership flags, provenance) and redo to the committed
state. One gesture is always one entry; duplicate triggers add
none.

## 11. Ownership and regeneration counterfactuals

Resized-only compiler shape → geometry kept, paint refreshed, no
style flag. Styled → human paint kept with flag. Both → compose.
Undo of first style → compiler byte-identical, recompile yields
compiler paint. Human-added (ellipse + styled) → carried with
paint and form. Detached → identical passthrough. Suppressed
elements → still suppressed (5C suite green). Resized text →
paragraphs identical, `contentCustomized` untouched either way.
Locked chrome → uneditable at every layer.

## 12. Native PPTX evidence

Asserted on real slide XML: styled `roundRect` carries human
fill+stroke hexes; undo round-trips compiler paint back and redo
restores human paint; resized geometry exports at new extents;
text stays editable with runs intact; charts/tables untouched;
preflight still fail-closed (5A suite green).

## 13. Test results

- `test/v2-resize-5e.test.js` — 23/23 (math, 8-handle visibility/
  alignment/cursors, locked/read-only exclusion, exact se/nw
  commits, non-uniform scales, release parity, cancel/Escape,
  undo/redo exactness, group/line/table/multi refusals, text
  preservation, overflow warning, handle-press isolation, chart
  allowance, cascade ×3, layer survival, detach).
- `test/v2-style-5e.test.js` — 14/14 (validation ×9, envelope
  boundary, normalization, commits, partials, null clearing,
  no-ops, undo/redo ownership, regeneration ×2, export ×2).
- `test/v2-textcommit-5e.test.js` — 6/6 (blur+Commit, triple
  press, failed retry, navigation wait, cancel race, conflict
  honesty).
- `test/v2-edit-chrome-5e.test.js` — 5/5 trusted Chrome (handle
  alignment + se equation + preview/committed shots, 200%
  scrolled nw equation, style commit + undo refresh, cascade
  offsets, no-jump dblclick).
- Baseline `73eb531` (isolated worktree): 18/21 fail across the
  three headless files (new APIs absent); the 3 passes are pure
  math over pre-existing helpers.
- Related suites rerun green (5d text, 5c adapter, 5b/5b1 engine,
  ownership, tombstones, selection); `npm run typecheck` clean;
  benchmark 50 cells L1 zero; production build green; full suite
  totals at close (BYOK locale out of scope; browser files
  isolated, none counted on kill/timeout).

## 14. Rich-run audit (V2-5F sizing, §11)

Text contract unchanged: structured text still refused, simple
text fully functional (5D suites green unmodified). Fixture audit
(4 viewer decks, 129 text elements): **83 simple** (editable
today), **46 multi-paragraph single-run** (the V2-5F target —
paragraph-aware drafts, uniform style carried per paragraph;
`buildUpdatedParagraphs` already splits lines), **0 multi-run**
(the compiler only emits single-run paragraphs; emphasis runs
arise only from future edit paths). V2-5F is paragraph editing,
not Word-style rich text — recorded in the roadmap, not built
here.

## 15. Remaining limitations

Tables/lines/groups unresizable (explicit); no aspect lock or
keyboard resize; style scope is fill/stroke/width (no alphas UI,
no text color — that is V2-5F formatting); cascade may cover
content after many inserts (user drags); cancel-during-commit
lands the op (documented); multi-line inspectors can still shift
the stage (hold backstop retained); no dark v2 fixture (handle
whites verified on light + shadow spec; dark proof is a gap).

## 16. Proposed V2-5F work

Multi-paragraph text editing (per-paragraph draft model reusing
`paragraphsToDraft`/`buildUpdatedParagraphs`), text color runs,
then chart/table editors and V2-6 persistence binding. Not
started here.

## 17. Validation totals

Focused at close: headless 43/43 (23+14+6), Chrome 5/5
(isolated), related suites green, typecheck clean, benchmark 50
cells L1 zero, production build green, real Chrome green. Full
`npm test`: exact totals at close (BYOK locale out of scope;
bounded-concurrency browser isolation, nothing counted on
kill/timeout).
