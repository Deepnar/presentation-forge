# V2-5I Evaluation — visual slide management

Date: 2026-10-11. Baseline `cd7d069` (V2-5H pending review).
No template gallery, Layers panel, persistence, or agent
paths. Drivers: `node tools/v2-5i-eval.mjs` (gitignored
`out/slide-management/`); headless `test/v2-slides-5i.test.js`;
browser `test/v2-edit-chrome-5i.test.js`. Curated evidence:
`docs/slide-management-evidence/` + README.

## Verdict

Slides add, duplicate, delete, reorder, multiselect, and detach
through the filmstrip with every commit crossing the same
revisioned engine, identity following navigation, and exact
undo/redo. PASS recommended; V2-5I `[~]` pending independent
review, V2-5 parent stays `[~]`.

## 1. Slide operation architecture

The engine deck stays the sole truth. React owns active-slide
identity, filmstrip selection (ids), menus, drag previews, and
confirmations — never a mutable slide collection. New adapter
entries (`insertSlide`, `duplicateSlide(s)`, `deleteSlides`,
`reorderSlide`, `detachSlide`) submit single or atomic-batch
slide envelopes at the fresh revision, sync via `replaceScenes`,
and return ids for identity-following navigation. Viewer
`goTo` (index-based) never records history. One gesture is one
entry; no-ops record nothing; failures surface with state
untouched.

## 2. Blank-slide generation

`+ Slide` inserts after the active slide: stable `s-` hex id
(with mint retry), deck dimensions, the sibling's background as
the theme baseline (never a white guess), zero elements,
`managed` state. No placeholder content, no copied chrome —
locked marks belong to compiler emission and freezing stale
marks into a human slide would lie about regeneration
ownership. The renderer draws background-only slides and the
preflight accepts them; an empty `elements` array is an
intentional blank, while malformed scenes (missing fields)
still fail validation. Undo removes the slide; redo restores
its exact identity and data; navigation follows the new id.

## 3. Duplication and identity policy

The old helper remapped top-level ids only and refused repeats
on `-copy` collision. Reworked (`duplicateScene`): deep JSON
clone, then EVERY id — nested group children included —
remapped against the live deck domain with a derooted counter
(`X-copy`, `X-copy-2`, …), so repeats and duplicates-of-
duplicates never collide. Semantic refs are retained as origin
audit (per-slide 1:1 uniqueness preserved); non-locked
compiler provenance flips to human (a future regen must not
reconcile the copy as the original's twin); locked chrome
keeps provenance and lock; suppression tombstones travel;
managed becomes human-arranged (`customized`), detached stays
detached. Source slides are never mutated (proven: post-dupe
source edits leave the copy byte-identical). Undo/redo restore
exact deck states. The engine's old collision rejection is
gone with the shallow remap — an intentional, tested behavior
change.

## 4. Delete behavior

Filmstrip menu or bulk bar, always two-step inline confirm
(no native dialogs — untestable headless); the last remaining
slide refuses with the deck intact. Deleting the active slide
lands on the same-index neighbor (or the new tail), never a
dangling index. Multi-delete is one atomic batch: a failed
member rolls everything back with no history. Undo restores
exact position and content; redo removes the same slide.
Stale revisions and duplicate envelopes behave per the shared
path. Text drafts on other slides commit first and block on
failure; a draft on the deleted slide is cancelled with its
overlay (committing to a deleted slide is pointless) — no
stale overlays survive.

## 5. Reordering behavior

Filmstrip drag with a DOM-drawn insertion marker (refs, never
render state — re-rendering mid-gesture replaces the drag
source and Chrome cancels the drop, found live). Drop commits
one `slide.reorder` by id (indices never cross the command
boundary); cancellation and no-op drops record nothing; active
identity follows the drag; selection preserved. Keyboard
alternative: Alt+ArrowUp/Down on a focused thumb. No
interference with canvas drags (separate roots); lazy-safe
(ids from events, state in React). Long synthetic drags fight
strip autoscroll — tests use adjacent swaps and document it;
headless suites prove end-to-end moves. Undo/redo restore
exact order with monotonic revisions.

## 6. Multiselection

Click navigates+selects; Ctrl/Cmd toggles without navigating;
Shift extends a contiguous range from the anchor; Escape
settles back to the active slide. Canvas and filmstrip
selections are independent id sets that never confuse each
other. Bulk duplicate preserves deck order with new ids
selected; bulk delete is atomic; bulk reorder is deliberately
unoffered. A failed member aborts the whole batch (proven).

## 7. Detached-slide semantics

Menu action "Detach from AI layout" with its consequence
stated ("current scene becomes authoritative… no reattach")
commits `slide.setLayoutState → detached` (new narrow op;
inverse restores the prior state, so undo/redo work while no
user reattach exists — a naive reattach would let the
compiler overwrite manual work). All objects preserved, never
rasterized; locked chrome keeps its rules; regeneration
returns detached slides identical (proven); states display as
thumb badges (`Manual`/`Custom`/none) plus the status line.

## 8. Draft lifecycle

Text sessions gate every slide mutation (commit elsewhere,
cancel on the deleted slide, block on failure — the V2-5D
guard reused, never bypassed). Chart/table panels are
explicit-Apply and unmount with navigation by design
(documented, unchanged). Duplication copies committed content
only. Reorder never discards drafts. Undo/redo refresh panels
through the existing remount keys. Deck replacement and
Edit/Done transitions keep their commit-or-hold behavior.

## 9. Undo/redo

Every slide op undoes to the exact prior deck (deckWide state
images) and redoes to the committed deck, with revision +1 per
entry and no-ops at +0. Proven across insert/duplicate/delete/
reorder/detach at all positions including repeats.

## 10. Compiler regeneration behavior

No deck-level regeneration exists in the product:
`recompileSlide` is single-slide and test-only with no UI, API,
or pipeline caller — so blank and duplicated slides cannot
disappear or be overwritten today, and the missing integration
is documented rather than claimed. Within single-slide
recompile, exact-id matching keeps duplicates distinct (ids
differ by construction), human provenance + `customized` state
preserve arrangement, and detached slides pass through
identical. Human-added slides carry via the orphan rule.

## 11. Native PPTX evidence

Asserted on real archives: exact slide counts after
insert/duplicate/delete sequences, order preserved,
background-only blank slides with no misleading warnings,
duplicated text/charts/tables independent in OOXML (edited
copy exports while sources stay clean), two native chart parts
after chart-slide duplication, duplicated tables still
`<a:tbl>`, slide relationships complete, preflight still
fail-closed.

## 12. Chrome evidence

Six trusted suites: blank insert + navigate + undo; duplicate
with content preserved; adjacent drag with marker + one
revision + identity follow; shift-range bulk delete with
two-step confirm; detach with badge; narrow-viewport insert.
Ten curated shots with slide-ID order in the manifest.

## 13. Focused/full test totals

- `test/v2-slides-5i.test.js` — 29/29 (blank ×5, identity
  ×6, deletion ×6, reorder ×3, detach ×3, drafts ×3, export
  ×3).
- `test/v2-edit-chrome-5i.test.js` — 6/6 (blank, duplicate,
  drag, bulk, detach, narrow).
- Baseline `cd7d069` (isolated worktree): new slide APIs
  absent — required fail-first proof recorded at close.
- Related suites rerun green (engine 5b/5b1 incl. the
  intentional duplicate-collision behavior change, chart/table
  editors, 5d/e/f editor, 5c adapter/chrome, viewer/selection,
  renderer, preservation, export); `npm run typecheck` clean;
  benchmark 50 cells L1 zero; production build green; full
  suite totals below (BYOK locale out of scope; browser files
  isolated, none counted on kill/timeout).

## 14. Remaining limitations

Middle row/column-style insert and bulk reorder unoffered;
filmstrip autoscroll during long drags untested beyond
adjacent swaps; no reattach (by design); no deck-level regen
to preserve against (documented gap); menu clipping avoided
by wrapper-width docking (verified in shot); slide management
requires Edit mode (consistent with all engine ops).

## 15. Recommended next slice

V2-6 persistence binding (snapshots + log per the V2-5A §13
seam) — slide management makes unsaved work more valuable
and more losable. Then Layers panel and the layout-skeleton
gallery per the retained backlog. Nothing started here.
