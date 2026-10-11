# V2-5B Evaluation — atomic command engine & revisioned history

Date: 2026-10-11. Baseline `06a0211` (V2-5A accepted). No UI,
no persistence, no agent runtime. One product-code addition
(`packages/model/engine.ts`) plus two minimal extensions to
existing contracts (`contentCustomized` ownership flag,
`element.add` index for exact undo).

## Verdict

One deterministic, validation-backed, reversible command
system exists that human and AI editing can share. PASS
recommended; V2-5B `[~]` pending independent review, V2-5
parent stays `[~]`.

## 1. Primitive audit (reuse vs violation)

Reused untouched: all five `DeckCommand` variants and their
inverses, `assertEditable` locked rejection, `findElement`
(incl. groups), `compilerId`/`humanId`, the four pure deck
functions, `validateScene`, export preflight. Wrapper-fixed
without rewriting: in-place mutation (engine clones the
touched slide first), missing revision (envelope +
document), missing batch atomicity (single transaction),
missing duplicate protection (applied-id set), missing
undo/redo stacks, inverse-less deck ops (engine
synthesizes insert/delete/reorder inverses), and silent
state dirtying on effective no-ops (pre-apply skip). Two
contract extensions, both backward-compatible: optional
`contentCustomized` schema field (regenerated types, only
delta in output) and optional `element.add` index (omitted
by all existing callers).

## 2. Envelope and validation

`{ id, slideId, op, baseRevision, actor, agentId? }`;
batches carry `ops[]` under one id. Plain JSON only —
functions rejected by walk, NaN/Infinity/non-positive
extents/empty paragraphs/unknown types rejected with
field-level codes, element ops require a slideId and slide
ops require null. Untrusted payloads die in validation,
never inside apply.

## 3. Document state and API

`createDocument` (validates + clones seeds, revision 0),
`snapshot` (deep-frozen clone), `status`
(revision/canUndo/canRedo/historyLength), `log`
(serializable entry metadata), `apply`, `applyBatch`,
`undo`, `redo`. No browser globals (pure Node asserts in
suite); server/CLI import the same module the browser will.

## 4. Atomic transaction strategy

Touched-slide copy-on-write: clone, apply existing
primitives to the clone, schema-validate every touched
slide plus deck invariants (unique slide ids), compare
against pre-state, then swap the array reference. Any
failure — bad target, lock, invalid result, primitive
throw — returns a coded result with the committed state
untouched. Proven by rollback tests at every layer
(single, batch-middle, invalid-result, stale).

## 5. Revision semantics

`baseRevision === current` or structured conflict
(expected/actual, scenes and history intact, never
rebased). Every history-changing op advances by exactly
one — apply, batch, undo, and redo alike — so a stale
agent envelope cannot become valid again after an undo
(tested). Effective no-ops succeed without advancing or
recording (tested); the alternative (history pollution)
was rejected explicitly.

## 6. Undo/redo and inverses

Existing inverses reused verbatim; batch inverses reverse;
redo replays recorded forwards; new commands clear redo;
empty stacks fail explicitly with history intact; actor
attribution travels in entries; log entries serialize via
plain JSON round-trip. Undo-after-reorder/duplication
proven correct (inverses carry values, never positions).
One deliberate extension: delete inverts to indexed add,
so undo restores exact z-order instead of appending.

## 7. Element and slide operations

Move/resize/updateText/add/delete and insert/delete/
duplicate/reorder all run through the engine with stable
ids, lock respect, ownership marking, validation, and
inverses. Duplicate refuses id collision (`-copy` taken);
insert refuses slide-id collision and schema-invalid
scenes; delete refuses the final slide; reorder clamps by
documented policy (`reorderScene`) and inverts exactly.
Nested-group children address by id; locked descendants
reject. Mixed slide+element batches commit together.

## 8. Batch semantics

One transaction, one revision, one history entry;
last-write-wins for repeated targets in order; empty
batches succeed as no-ops; failures name the entry and
roll back predecessors (three-move, locked-middle,
unknown-id, and mixed cases tested with pre/post JSON
equality).

## 9. Duplicate-command handling

Reject-with-error (never replay-as-new, never silent
double-apply): the applied-id set rejects repeats even at
a fresh revision, and stale-plus-seen reports duplicate
over stale by documented precedence. The id set is
unbounded while undo depth caps at 200 with a stated
V2-6 compaction seam.

## 10. Human text/geometry preservation (§11 cases)

Counterfactuals A–E green (B/C fail on baseline by
targeted stash run): moved text refreshes wording at the
kept position; rewritten text survives regeneration
(`contentCustomized`, same-kind only, refit against the
deciding box); both dimensions compose; human-added
elements carry forward; detached returns identical.
Pre-engine human text without the flag keeps legacy
behavior — stated, not fixed retroactively.

## 11. Nested groups and locking

Covered in §7 and the readiness suite: group children are
command-addressable, selection stays parent-first, locks
reject at every layer including batch middles and undo
paths.

## 12. Demos and boundaries

`demo.html` left running untouched (verified lines
57/123); migration is three routed mutations plus a
history panel once V2-5B lands — appendix of the
architecture record. Browser/server share the module
(import-tested from both sides; no DOM dependency).
Export: engine-edited scenes render natively, and an
engine-added multi-series pie is caught by the V2-5A
preflight — the boundary holds for engine-introduced
unsafety too.

## 13. Test results

- `test/v2-engine-5b.test.js` — 27/27 (fails wholesale
  on `06a0211`, module absent).
- `test/v2-ownership-5b.test.js` — 5/5 (B/C fail on
  baseline).
- `test/v2-export-preflight-5a.test.js` — 10/10.
- `test/v2-readiness-5a.test.js` — 5/5.
- Preservation/renderer/scene suites — green (full run).
- `npm run typecheck` — clean (re-verify at close).
- Benchmark 50 cells L1 zero (re-verify at close).
- Full `npm test` with exact totals at close (expect
  BYOK + possible P2-1 flakes, separated honestly).

## 14. Known limitations and unresolved decisions

D1 tombstones (V2-5C decides), D2 commit-granularity text
(per-commit specified), D3 conflict UX (rejection
specified; surfacing belongs to the agent-turn slice),
D4 group-editing breadth, D5 clipboard formats. No style,
chart-data, theme, slide-add-UI, persistence, or agent
paths implemented — all specified as shapes only.

## 15. Proposed V2-5C interaction slice

Drag-move, nudge, and delete in the viewer through the
engine with transient previews; D1 implemented and
tested; no text editing yet. The viewer keeps owning
mechanics and selection; every commit crosses the engine.
