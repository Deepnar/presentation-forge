# V2-8J-4 evaluation — independently accepted

Frozen implementation `665cd0459b0f267b32e808a59046e3d0b914e74f`, branch v2, push
origin/v2 only. Entry accepted baseline was J3
`edda5ec7c2105bebff4a429a04b3fbe5b09048b4`; entry d267b37.
Human approved **Approve bounded J4 (Recommended)** on2026-10-28 after
[readiness](reviews/V2-8J-4-plan-d58a8a1.json) for plan bbfbf8c. Approval and the
[fixed gate inventory](v2-8j-4-evidence/validation-plan.json) were pinned b0cb7aa
before runtime changes. [Contract](V2-8J-4-PLAN.md) governs the bounded metadata/
history, current-owner qualification and cited-copy/export containment policy.
Independent [ACCEPT](reviews/V2-8J-4-665cd04.json) on2026-10-29 names this exact
source after the pushed ef1d11ac packet audit; root committed the stable decision
unchanged at452bc61e. State now promotes only that independently accepted source.

## Result and scope

Optional scene-owned unverified citation IDs/source generations/ranges/content
hashes round-trip through generic saves, commands, undo, duplication, regeneration
and canonical history. Headless owner-bound attach/replace/remove/inspect reuse
canonical project/catalog locking, scalar quote checks and atomic scene/history
writes. Remove needs no source catalog. Inspection separates exact target,
content equality, retained/stale source and range facts; support is not-assessed.
No new source bodies/quotes/claims, provenance receipt or provider authority.
Generic cited project creation/copy and native export refuse centrally; existing
uncited behaviour remains. No new UI/HTTP/CLI, live model/search or activation.
As-built details are in [architecture](ARCHITECTURE.md#v2-8j-4-revisioned-scene-citation-lifecycle).

The frozen source includes model schema/types/validation and citation metadata,
shared exact-target/content helpers, engine/duplicate/compiler preservation,
project admission, native preflight, the headless citation domain, narrow adapters
and range helper, and focused fixtures. J3 reuses the shared target index with its
previous slide-existence semantics. [Source manifest](v2-8j-4-evidence/source-manifest.json)
records21 changed runtime/test paths and exact hashes. Runtime bytes are identical
to initial6628bb4; later source commits add only a negative fixture and correct
fault-fixture verification order. Unrelated untracked files remain untouched.

## Executed checks

Node24.16.0, nice10/idle I/O, bounded serial child groups with90sec watchdog.
Commands, original invocation SHAs, complete file markers, raw TAP, source hashes
and exact frozen applicability are in each linked result. No timeout occurred.

| Gate | Final leaf pass/fail/skip/cancel | Duration | Evidence |
|---|---|---|---|
| Citation lifecycle/schema/engine/hash/preservation/preflight |13/0/0/0|515ms|[result](v2-8j-4-evidence/citation-lifecycle.json)|
| Actual SQLite shared storage contracts |7/0/0/0|716ms|[result](v2-8j-4-evidence/citation-write-sqlite.json)|
| Actual PostgreSQL shared storage contracts |7/0/0/0|1066ms|[result](v2-8j-4-evidence/citation-write-postgres.json)|
| Core/type drift/accepted J3 pure boundary checks |14/0/0/0|1216ms|[result](v2-8j-4-evidence/citation-boundaries.json)|
| Typecheck |exit0, no leaf tests|1866ms|[result](v2-8j-4-evidence/typecheck.json)|

**Selected required41/41 pass,0fail/skip/cancel; no required gate unexecuted.**
Initial complete pure12/12 ran before one new negative test was added. Its isolated
probe passed1/1; complete current pure13/13 then passed. That isolated probe overlaps
final coverage and is not another unique selected test. All root product attempts
**68=66pass/2fail/0skip/0cancel**, retaining repeated/failed attempts. Typecheck is a
separate command, not a leaf count. No passed unchanged boundary/type gate was
repeated: all its runtime/config and old fixture inputs are byte-identical from
invocation6628bb4 to frozen665cd04, explicitly compared in the manifest.
[Summary](v2-8j-4-evidence/execution-summary.json) keeps independent checks separate.

## Findings and corrections

No product regression was found. Two initial backend files each passed6/7 and
failed the same **test-fixture verification**: after the expected injected history
failure, snapshot() called listRevisions while the BEFORE INSERT trigger remained
active. Canonical history listing performs idempotent baseline insertion, which
also triggers the fixture. Move the unchanged complete rollback assertion after
trigger teardown (665cd04); no product code/assertion was relaxed. Both corrected
complete affected files passed7/7. Original TAP/exit1/results remain retained.

A source-review regex hypothesis was disproved. The added trailing-line-feed
negative test passed before any correction; the actual unflagged JavaScript
patterns reject those inputs. The reviewer withdrew the finding. The original
probe metadata prematurely called this a defect, and its Python harness asserted
an expected nonzero exit after the product test passed. Preserve the original
record and [explicit correction](v2-8j-4-evidence/fixed-format-assessment.json);
that harness assertion is not a failed product leaf. No regex broadening/change.
The private first runner also omitted propagating the child exit to its shell;
raw child exit1/totals were retained and both independent backend files ran. The
corrected runner propagates exits. No failure was relabeled green.

## Resources, storage and cleanup

Admission uses the established two consecutive15sec samples: CPU<25%, iowait<20%,
CPU PSI<10, memory PSI<1, available>8GiB, backing disk busy<5%/weighted queue<.5/
inflight<=1, and no userspace/unknown D-thread blocker. The read-only
[observer](v2-8j-4-evidence/resource-observer.py) positively classifies PF_KTHREAD;
no unrelated process/model was stopped or reused. Global I/O PSI remains recorded
with unresolved provenance, not attributed to an assumed graphics worker.

Attempt1 admitted nothing. [Attempt2](v2-8j-4-evidence/storage-admission-attempt-2.json)
admitted fixture startup after two ready samples (CPU20.84%/12.07%, disk2.99%/2.51%);
startup age45.34sec was within60sec. Actual first backend files used the admitted
owned fixture. Attempt3 admitted no corrected storage work.
[Attempt4](v2-8j-4-evidence/storage-admission-attempt-4.json) admitted corrected files
(CPU14.55%/14.98%, disk3.30%/3.07%). No readiness limit was weakened.

SQLite used unique cleaned-up tmpfs files. PostgreSQL is the exact new owned
localhost-only container in [identity](v2-8j-4-evidence/owned-postgres.json), image
postgres:15-alpine,1CPU/512MiB and256MiB private tmpfs. Initial actual user-DB catalog
was empty. Test databases/pools closed/dropped. This proves actual backend
contracts, not physical-media or power-loss durability. The reviewer closed/dropped its unique database and released the slot. Root
saved/fsynced the [actual empty catalog](v2-8j-4-evidence/owned-postgres-final-catalog.json)
before removing the exact owned ID once; working-daemon absence and private
credential deletion are in [cleanup](v2-8j-4-evidence/owned-postgres-cleanup.json).
No owned service remains. No old I4/J2/J3 service was recreated.

## Limits and review gate

Metadata/anchors remain unverified and staleable, with no factual support or
page/DOI/file integrity claim. Source clear is not history-restorable; backup/media
erasure is not newly promised. Existing adapter lock waits have no new cancellation
or wall-clock guarantee. Citation traversal/hash/capacity bounds are explicit;
these short fixture timings are not a large-deck benchmark.

Source-aware copy, live-editor adoption and native citation presentation remain
[separate contracts](ROADMAP.md#assistant-search-source-integrity). No browser,
accessibility, responsive, new visual/native interaction or rendering-quality claim
is made; unchanged accepted evidence is reused. No old legacy/provider/browser/
build/native/benchmark/broad-fault sweep, model/API/search/local inference/GPU,
production migration/deployment or activation. Standing BYOK locale, earlier J1/I7
timing and native/visual/I4 provenance limits stay separate and unrerun.

Independent source inspection has no remaining concrete finding; its initial
regex hypothesis is explicitly withdrawn. [Two new actual-PG challenges](v2-8j-4-evidence/independent/challenge-final.json)
passed2/2 in5272ms process time under the reviewer's own fresh two-ready-sample
admission. Remove succeeded for orphan/locked metadata under unknown-policy catalog
without reading/repairing sources; stale-generation inspection skipped a byte-
coherent hash-corrupt re-registered body, while current selection refused the
whole result. Unique reviewer database/pools closed/dropped; source/probe and exact
invocation665cd04 are retained separately from root totals. Its metadata-only
private-file key-name read preceded identity verification; only [url] was printed,
with no URL/secret/connection, and exact identity was checked before connection use.
That sequence is retained honestly. The final packet/hash/count/cleanup audit
reported0errors and issued [exact-source ACCEPT](reviews/V2-8J-4-665cd04.json).
No blocker or required unexecuted gate remains. Acceptance is limited to J4;
source-aware copy, citation presentation and later roadmap implementation are
not authorized. No product check was repeated during the final continuation;
only documentation, hashes, governance and cleanup absence were checked.
Stop after acceptance propagation and scoped push.
