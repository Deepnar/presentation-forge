# V2-8I-7 — exact-turn wake evaluation

Implementation source **3da0801f64e88f7911f655cee288bb9b750c7c3d**, branch v2,
accepted baseline **dce562834f2d4641280d8df6f61dd4872d566b87**. Entry33e45b7;
proposalb026dd8 and approved clarification78a0056 precede runtime code. Human
selected **Exact project and turn (Recommended)** on2026-10-27. Read the
[approved contract](V2-8I-7-PLAN.md), [plan review](reviews/V2-8I-7-plan-b026dd8.json)
and [roadmap](ROADMAP.md#assistant-targeted-wake). Implementation acceptance is
pending a separate exact-source decision. No dependent feature is authorized.

## Result and architectural boundaries

POST /api/v2/projects/:id/conversation/wake admits exact generation/turnId input
under the existing private Bearer numeric/email identity and host flags. Its
2048-byte strict UTF-8/identity parser precedes conversation/generic parsers;
the route precedes the private conversation fallback. Fixed no-store responses
carry accepted/coalesced or sanitized refusals, with bounded retry hints.

Target and owner-wide wakes use one coordinator, two owner slots, one job/owner,
128cooldown records, five-second cooldown and110second deadline. Different
active target/mode is503busy without changing its target or dirty bit. Identical
pending callers share first admission; already-admitted coalesced receipts make
no fresh-validity or dispatch promise. First target inspection occurs inside the
reserved slot and deadline before first202. All work/follow-up re-enters H/I2.

The shared pinned Auto-target adapter performs no discovery scan. It rechecks the
numeric account around opening/awaits, clears ambient account/meter contexts,
inspects current canonical state and resolves provider/configuration/secret only
for submitted preparation. Approved/terminal work uses no provider lookup. I5
owns admission and settlement; H/I2 owns proposals, approval, run claims, leases,
scene revisions, history and cancellation. No new mutable scene/queue/store schema.
One call plus at most one same-target dirty follow-up fits the original deadline;
unfinished/error/refusal/interruption outcomes stop. CLI work-auto uses the same
adapter, exact2048-byte input, trusted owner lookup,110second signal cleanup,
metadata output and existing workExitCode. CLI concurrency across processes is
still governed by canonical/account authority, not HTTP-local slots.

## Executed evidence

Node24.16.0, temporary SQLite project/account databases, injected/loopback provider
fixtures only. Production-process tests launch the actual Express entry with an
isolated temporary configuration. No real API/local inference/GPU calls occurred.
All jobs used serial nice10/idle-I/O processes with55second process-group watchdogs.
[Resource observation](v2-8i-7-evidence/resources.json): load9.43, memory available
6618740kB and elevated existing I/O pressure; only short headless work ran. No
heavy render/build/browser matrix or unrelated process/service was touched.

| Selected final check | Pass | Fail | Skip | Cancelled | Process duration |
|---|---:|---:|---:|---:|---:|
| New target contracts plus directly affected I6 coordinator |19|0|0|0|668ms|
| Actual SQLite and CLI processes |8|0|0|0|3373ms|
| HTTP and production-process registration/restart |6|0|0|0|3219ms|
| Typecheck | exit0 | — | — | — |2118ms|
| Four affected governance inventory contracts |4|0|0|0|717ms|

Required product leaf total **33/33**, consisting of19 new and14 directly affected
accepted coordinator cases. Governance **4/4** is separate. Final selected product
plus typecheck took9378ms; governance added717ms. These are fixture/process timings,
not provider throughput or production latency measurements. Raw logs, commands,
exit statuses and invocation hashes are retained alongside the
[gate records](v2-8i-7-evidence/validation-plan.json).
[Source manifest](v2-8i-7-evidence/source-manifest.json) compares each gate's relevant
tested working bytes to frozen source. Tests ran before freeze commits; later
fixture/governance edits affect only their applicable gate. No SHA-only reruns.

The SQLite oracle forbids readTurnMetadataPage on the target adapter, performs
prepare/explicit approve/execute/replay, reopens persisted scene/history, checks
Auto event/lifetime62, and exercises missing/foreign/deleted/stale targets,
account recreation, clear after preflight, human save and cancellation. It also
seeds101 approved historical **index metadata hints** from a completed template,
verifies a50-row approved discovery page, and observes the exact terminal target
without discovery. Those synthetic hints are not separately qualified canonical
runs; no historical H reconstruction or fairness claim is made. The forbidden
scan boundary establishes independence from owner-prefix length; actual new-turn
preparation and approved execution use real canonical records.

HTTP checks include exact private identity, authority/media/UTF-8/raw-size failures,
malformed URI/fallback sanitation, shared busy response, default-off production
registration, existing submit/decide compatibility and approved execution after a
process restart. Operator processes test actual prepare/approve/execute/replay and
invalid authority/bytes/default-off exits. No production activation occurred.

## Earlier attempts and corrections

- Initial fail-first runner timed out at30s because deferred fixture work could
  remain unresolved on assertion failure. Its runner raised before preserving
  captured TAP; exact counts/exit are unavailable, with no pass credit. The
  [harness limitation](v2-8i-7-evidence/fail-first-harness.json) records this.
- The next pre-implementation fail-first run retained two failed targeting
  assertions before its30s watchdog killed the group (exit-9); no completed TAP
  totals. A missing target implementation allowed a capacity assertion to await
  an admission the old core would not reserve as intended. Deferred release in
  cleanup and2000ms per-test bounds were added without weakening assertions.
  [Partial raw output](v2-8i-7-evidence/fail-first.log) and metadata are retained.
- An exploratory four-case coordinator pass appeared in tool output before the
  final metadata case was added; no separate raw file is available. It overlaps
  the final gate and receives no additional acceptance count.
- First SQLite run: **7pass/1fail/0skip/0cancelled**, exit1. The human-save case
  timed out while waiting for initial awaiting-decision state, before its save.
  Initial state/refusal code was not retained, so the cause is **unresolved
  intermittent fixture/provider timing**, not a demonstrated product regression
  or a proven environmental explanation. An admission assertion was added;
  the isolated case passed1/1 exit0, then the final file passed8/8 exit0 with
  the101-hint oracle added. Assertions and five-second state wait were preserved.
  All [initial raw evidence](v2-8i-7-evidence/target-wake-sqlite-attempt-1.tap),
  [isolated result](v2-8i-7-evidence/human-save-diagnostic.json) and final run remain.

No actual product regression was found and no accepted H/I2/I5 behavior was
modified to make tests green. The new functionality implements the authorized
missing targeting path. Test cleanup/admission diagnostics are the corrections.
The initial timing uncertainty is explicitly part of independent review.

## Exclusions and remaining limitations

No old bulk/browser/build/benchmark/native/visual/export matrix was rerun. No UI,
renderer or export changed; accepted evidence for those subsystems is reused,
not re-labelled execution. PostgreSQL contracts/concurrency/fault/browser tests
are **unexecuted**, not passing. No project SQL/schema/query changed. Only four
new/adjacent governance cases ran;34 unchanged bodies are unexecuted this slice.
No real-provider quality, live budget behavior or interactive PowerPoint was
qualified. Standing BYOK locale and inherited visual/native/live-provider limits
remain separate in the roadmap. No old I4 helpers, removed service or artifacts
were recreated; its unavailable pre-removal count/cause remains unknown.

Exact wake improves reach, not completion, fairness, dispatch availability or
status receipts. I6 owner-wide finite-prefix behavior stays unchanged. Capacity
is process-local and account budgets require the existing shared account DB.
Unknown usage remains conservatively reserved. Close/expiry cannot atomically
revoke entered SQL/commit effects; no hard SQL deadline or global signal drain is
claimed. A coalesced admitted receipt may arrive after state change or close.
CLI has no HTTP receipt/host-capacity promise. Restart needs an explicit wake;
ambiguous dispatched work cannot automatically replay. No Assistant, scheduler,
search tool integration, provider expansion or activation follows acceptance.

Recommendation: independent exact-source review of the bounded contract and
retained evidence, with narrow new challenges, especially the first-run timing
uncertainty. Root does not accept its own implementation. All temporary process,
HTTP listener and database cleanup hooks completed; no persistent service acquired.
Stop after review and documentation/commit/push closeout to origin/v2.
