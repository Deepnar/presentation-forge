# V2-5B-1 Evaluation — concurrent command safety and exact undo/redo restoration

Date: 2026-10-11. Baseline `8e863f5` (V2-5B implemented,
pending acceptance). Narrow engine-correctness slice: one
file changed (`packages/model/engine.ts`), one test file
added, docs updated. No UI, no persistence, no vocabulary
changes.

## Verdict

Both review findings are fixed with regression proof and no
related-suite regressions (73/73). PASS recommended as a
correction to V2-5B; V2-5B stays `[~]` for independent
acceptance, V2-5C not started.

## 1. C1 root cause

`apply`/`applyBatch` checked `baseRevision` and duplicate
ids, then `await`ed `transact`, whose AJV validation
yields to the microtask queue. Two callers invoking
without awaiting between them both passed the pre-check
against revision N, cloned the same pre-commit state, and
committed sequentially — the second overwriting the first
while both reported success at revision N+1 instead of
N+2. Demonstrated loss, not theory: racer A's move
vanished under racer B's commit. Undo/redo shared the
hole (no checks at all beyond stack presence).

## 2. Serialization policy

One per-document FIFO promise queue (`serialize`): every
revision- or history-changing operation — apply, batch,
undo, redo — runs its checks and its validated commit
inside its acquired turn. Ordering is call-registration
order, deterministic and documented. The tail swallows
settlements so failures never poison the queue; domain
failures return `EngineResult`, unexpected throws reach
only their own caller. No mutexes, no persistence locks,
no CRDTs — a ~10-line in-memory boundary.

## 3. Concurrent behavior (proven)

Exactly one of two same-base racers commits; the other
gets `stale-revision` with expected/actual numbers, its
change absent, winner intact, single revision advance.
Same for apply-vs-batch. Apply-vs-undo serializes in call
order (undo then restores, net-original, revision +2).
Double undo restores once and reports `empty-history`.
Same-ID racers yield one commit plus `duplicate-id`
(check order preserved inside the turn). Mixed
valid/stale/malformed/valid sequences all behave with the
queue alive at the end.

## 4. C2 ownership root cause

Undo re-applied inverse primitives, and every primitive
marks ownership (`move`/`resize` set `customized` +
`human`; `updateText` sets `contentCustomized` + `human`).
Undoing a first human move therefore restored coordinates
while leaving the element customized, human-owned, on a
customized slide — and an undone text edit kept
`contentCustomized`, so regeneration wrongly protected
abandoned wording. Values right, metadata wrong.

## 5. Restoration strategy

History entries now carry exact state images alongside
the retained semantic forward/inverse ops (audit and
replay): per-touched-slide images for element-only
entries, full-array images for deck-wide (slide-op)
entries. Undo/redo swap the images back with the same
schema validation as commits; a missing slide id fails
explicitly with history intact (reachable only through
non-LIFO surgery, which the engine never performs). No
flag is ever blindly cleared — the target is the recorded
pre-command state, customized or not. Memory is
O(history × touched slides) under the existing 200-entry
cap; V2-6 persistence compacts to envelopes + inverses,
which are still recorded.

## 6. Regeneration counterfactual results

Case H green: updateText → undo → recompile flows
compiler wording (abandoned customization behaves as
never-existed); redo → recompile protects human wording.
Cases A–G likewise exact by full-snapshot JSON equality,
including pre-customized undo (D keeps prior
customization, never resets to compiler), stacked
move+text with ordered redo (E/F), and batch undo (G).
Slide delete/duplicate undo to exact deck JSON.

## 7. Batch and slide-operation restoration

Covered by G plus delete/duplicate round-trips and the
mixed slide+element batch in the base suite (still
green). Deck-wide entries swap whole arrays; element
entries replace by slide id.

## 8. Error handling and queue recovery

 mixed-sequence test: valid commits, stale/invalid
report codes, final valid command succeeds at the new
revision. Validation throws inside AJV cannot deadlock
(the queue holds no locks, only ordering); unexpected
throws propagate to their caller with the tail intact.
`EngineResult` covers all domain failures; only
programmer errors (e.g. uncloneable input shapes, which
validation rejects first) may throw.

## 9. Regression tests

`test/v2-engine-5b1.test.js` — 21/21 (7 concurrency, 8
ownership A–H, 6 history semantics). Baseline `8e863f5`:
12 fail, including the two required (concurrent race;
Case C/H regeneration). No old expectations changed;
base suites green without modification.

## 10. Full-suite and benchmark results

Recorded at close (re-verify): focused engine family
green, typecheck clean, benchmark 50 cells L1 zero, full
`npm test` with exact totals (BYOK standing; P2-1 flakes
separated with isolation re-checks).

## 11. History-memory considerations

Worst case ~200 entries × touched-slide images (KBs
each); applied-id set unbounded and tiny. V2-6 compacts
to envelopes + semantic inverses, which remain recorded
and replayable — the snapshot images are a runtime
cache, never the durable record.

## 12. Backward compatibility

Envelope shapes, result codes, log shape, revision
monotonicity, no-op policy, ownership marking on fresh
edits, and all 27+5 base tests unchanged. The only
observable differences are the two fixed defects: racers
now conflict, and undo restores metadata.

## 13. Remaining limitations

D1–D5 unchanged (tombstones → V2-5C). Snapshot history
is in-memory only (V2-6). No UI/persistence/agent paths.

## 14. Recommendation for V2-5B acceptance

Accept V2-5B with this correction: the architecture is
unchanged, both findings have failing-baseline proof,
and no regressions were introduced.
