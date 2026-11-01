# V2-5F Evaluation — multi-paragraph editing and native text formatting

Date: 2026-10-11. Baseline `b69472a` (V2-5E pending review).
No substring formatting, chart/table editors, persistence, or
agent paths. Drivers: `node tools/v2-5f-eval.mjs` (gitignored
`out/v2-5f/`); headless `test/v2-paragraph-5f.test.js`,
`test/v2-textformat-5f.test.js`; browser
`test/v2-edit-chrome-5f.test.js`. Curated evidence:
`docs/v2-5f-evidence/` + README.

## Verdict

The common multi-paragraph slide structures (bulleted lists,
comparison bodies, process steps) edit in place with
per-paragraph styling intact, and bounded appearance controls
recolor/resize/emphasize whole runs through the same revisioned
engine under a wording-safe ownership model. PASS recommended;
V2-5F `[~]` pending independent review, V2-5 parent stays `[~]`.

## 1. Supported paragraph-editing structures

Editable iff **every paragraph holds exactly one run**
(`isEditableText`, `packages/editor/scene-text.js`) — one or more
paragraphs. Single-paragraph behavior is byte-identical to V2-5D.
The measured fixture population (129 texts: 83 simple, 46
multi-paragraph single-run, 0 multi-run) is now 129/129
enterable in the uniform case. Anything with a multi-run (or
zero-run) paragraph, or zero paragraphs, stays refused with its
counts named — formatting addresses whole runs only, never
substrings, and that boundary is unchanged from V2-5D.

## 2. Paragraph identity and split/join policy

The schema carries no paragraph IDs, so styles stick to **slots**,
never to words — deterministic, order-preserving, undo-exact:

- Same line count: wording-only edit, each line keeps its slot's
  style, align, and bullet.
- Appended lines: clone the last slot (adding a list bullet copies
  the bullet style — always right for uniform bodies).
- Inserted lines: the new line takes the pushed-down slot's style;
  following lines keep slots by index.
- Removed lines: their slots vanish with their style.
- Joins: words merge into the surviving slot.
- Empty lines: empty-text runs (schema-valid); trailing newlines
  round-trip back to trailing empty paragraphs.

Uniform bodies (the measured majority) cannot observe any
difference; mixed-style bodies get a predictable positional rule
that is stated in the UI ("each keeps its own style"), in this
doc, and in tests — never a silent flatten or a first-style
wash. Count-changing commits are therefore supported, not
refused: refusal would have made lists un-editable, while no
words, styles, or boundaries are ever lost under the slot rule.

## 3. Formatting-command contract

`element.setTextStyle { id, paragraphIndex?, style: { color?,
size?, bold?, italic? } }` (`packages/model/commands.ts`):
paragraph-scoped or whole-element targeting, never substrings;
mentioned keys only; `null` clears back to absence (explicit
`false` differs from absent `bold` under weight ≥ 600, proven);
all other run keys ride along. Validation up front: hex color,
6–144pt size, booleans, non-empty patch, in-range index, text
kind, unlocked, existing, single-run targets. No-op commits
(same values, case-insensitive) record nothing. The inverse
restores prior paragraphs wholesale, so undo is exact whatever
was mentioned. One edit is one history entry through the
unchanged engine (FIFO, validation, snapshot undo).

## 4. Inspector behavior

The format dock (below the scroll viewport — see §6) shows one
row per paragraph for a single selected supported text: color
picker, size, bold/italic toggles, per-row Apply, committing on
Apply/blur/Enter to that paragraph only. Rows display their own
values with a "mixed paragraph styles" note, so mixed bodies
never read as falsely uniform. Invalid values report inline
without engine contact; genuine no-ops commit nothing; remount
per element+revision refreshes every row on undo/redo (proven in
Chrome: `#c00000` committed, sibling untouched, undo restored).
Panel inputs live outside the mount root — no canvas shortcut
can fire from them. Locked text gets no panel; read-only mode
shows none; multi-run bodies get none.

## 5. Text appearance ownership

`customized` (geometry), `contentCustomized` (wording), and
`styleCustomized` (shape paint) were insufficient: recoloring a
heading must not hand its wording to the human, nor may a
rewrite surrender its paint. The slice adds the narrow
`formatCustomized` boolean (schema + regenerated types, set only
in `applyCommand`) with a same-kind per-index carry in
`recompileSlide` mirroring the content rule: format-only edits
keep human run appearance over FRESH compiler wording (proven
with rewritten intent: new words arrive painted); rewrites keep
human words (existing carry, idempotent with the style carry);
move/resize/format compose across all three flags; compiler
restructures (changed paragraph counts or multi-run sides) fall
back to fresh rather than guessing. Undo of a first format edit
restores the compiler element byte-identically. No field-level
CRDT anywhere.

## 6. Editing conflicts and draft lifecycle

The V2-5E in-flight guard, conflict/force policy, deleted-target
handling, deck-switch commits, and no-op/cancel semantics are
unchanged and re-exercised for multi-paragraph sessions
(conflict preserves a 2-line draft; force commits 2 paragraphs;
deleted targets keep drafts; navigation waits). The textarea
overlay positions from the element box exactly as before
(measured ≤ 0.02px on a 4-bullet body); its type mirrors the
first paragraph's run, and an editing hint names the paragraph
count for multi bodies. Double-click/Enter/open-shortcut
behavior is unmodified (5D suites green untouched).

Layout stability went further this slice. Selecting used to
shift the stage twice over: the inspector line (reserved since
V2-5E) and — found by measurement, not by reading code — the
toolbar *wrapping* on the longer "N selected" status and the
format panels shrinking the scroll viewport into a refit. All
three are now structural: one-line inspector reserve, a
never-wrapping non-shrinking toolbar row (horizontal scroll
instead), and a floating format dock outside layout flow. Proven
in Chrome: title pixel-identical before/after selection, and a
double-click at the original coordinates opens editing. The
600ms selection hold remains as backstop for multi-line
inspectors. Narrow viewports scroll the toolbar instead of
wrapping it (drivers scroll buttons into view first).

## 7. Undo/redo exactness

Multi-paragraph commits, structural edits, format edits, and
guarded sessions all undo to byte-identical prior elements
(paragraph counts, per-paragraph styles, bullets, alignment,
all four ownership flags, provenance) and redo to the committed
state. One session is one entry; duplicates add none.

## 8. Regeneration counterfactuals

Edited multi text keeps human wording (incl. appended bullets);
moved-only multi refreshes with no content flag; moved+recolored
keeps geometry, paint, and fresh wording; rewritten+recolored
keeps both; recolor-only keeps paint over fresh words;
resized+formatted composes all three; undo-of-format recompiles
to compiler paint; detached passes through identical;
suppression holds (5C suite green); resized text keeps
paragraphs with `contentCustomized` untouched (5E suite green).

## 9. Native PPTX evidence

Asserted on real slide XML: multiple paragraphs as native
breaks, per-paragraph colors/sizes/emphasis, bullet metadata
(`2022`), wording intact, no `autoFit`, undo round-trips
compiler paint back and redo restores human paint, charts/
tables untouched, preflight fail-closed (5A suite green). No
renderer changes were needed — the Layer-C projection already
carries every edited field verbatim.

## 10. Real Chrome visual evidence

Five curated shots (`docs/v2-5f-evidence/`): multi-line draft
with appended bullet mid-edit; five bullets committed in one
revision; second bullet natively blue with siblings ink plus
per-paragraph dock rows, mixed note, and an honest overflow
warning (5 lines in a 4-line box — landed whole, rev 2);
undo-restored bullet color; mixed label+body reworded on chrome
with label bold intact and chrome untouched.

## 11. Tests, typecheck and benchmark

- `test/v2-paragraph-5f.test.js` — 15/15 (contract helpers,
  slot mapping incl. append/insert/delete/join/empty/trailing,
  entry, per-style preservation, bullet append, positional
  delete/join, empty validity, multi-run + empty-list refusal,
  no-op/cancel, conflicts, undo/redo, keyboard isolation,
  overflow, regeneration).
- `test/v2-textformat-5f.test.js` — 18/18 (validation ×11,
  envelope boundary, normalization, whole-element + per-para
  commits, partials, null-clearing + explicit-false semantics,
  no-ops, undo/redo ownership, six ownership combinations,
  detached, export ×2).
- `test/v2-edit-chrome-5f.test.js` — 5/5 trusted Chrome
  (bullet append in one rev, mixed-style paint intact, panel
  commit + sibling isolation + undo refresh, multi-line caret
  isolation + whole-cancel, no-jump dblclick).
- Baseline `b69472a` (isolated worktree): new text-format APIs
  absent — required fail-first proof recorded at close.
- Related suites rerun green (5d text incl. one expectation
  widened for the two new `describeStructure` fields, 5e
  resize/style/commit, 5c adapter/chrome, 5b/5b1 engine,
  ownership, tombstones, selection, export); `npm run
  typecheck` clean; benchmark 50 cells L1 zero; production
  build green; full suite totals at close (BYOK locale out of
  scope; browser files isolated, none counted on
  kill/timeout).

## 12. Remaining limitations

Multi-run paragraphs uneditable (honest refusal, zero fixture
cases); no substring formatting or run splitting; format scope
is color/size/bold/italic (no family/weight/tracking UI —
engine-carried where present); compiler restructures fall back
to fresh paint (documented); multi-line inspectors can still
shift the stage (hold backstop); no dark v2 fixture (dock dark
theme verified on light slides + dark shell chrome).

## 13. Proposed next editor slice

Chart/table data editors through new narrow commands, then
slide add/duplicate/delete UI and V2-6 persistence binding.
Layers panel, layout-library new-slide, and frontend
consolidation enter the roadmap as planning entries only (§14
of the slice brief). None started here.

## 14. Validation totals

Focused at close: headless 33/33 (15+18), Chrome 5/5
(isolated), related suites green, typecheck clean, benchmark 50
cells L1 zero, production build green, real Chrome green. Full
`npm test`: exact totals at close (BYOK locale out of scope;
bounded-concurrency browser isolation, nothing counted on
kill/timeout).
