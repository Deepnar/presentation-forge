# V2-8J-3 — citation-reference checker evaluation

Frozen source **edda5ec7c2105bebff4a429a04b3fbe5b09048b4**, branch `v2`, from accepted
J2 **6d51cd409945e94266e23596b57f925553e62e31**. Human approved the reviewed
read-only foundation on2026-10-28, pinned8a01b6c before runtime changes. The
[contract](V2-8J-3-PLAN.md), separate [readiness](reviews/V2-8J-3-plan-7321c5f.json)
and [roadmap](ROADMAP.md#assistant-citation-reference-checks) bound this work.
Independent exact-source implementation acceptance is pending.

## Implemented result and changed paths

The shared headless `createCitationReferenceChecker(backend).check(binding,request)`
captures the strict complete owner/request before awaits. One canonical exact-owner
parent transaction checks the saved project revision, source generation/revision,
live target identity and retained snippet body. No separate document/source read
window or nested registry transaction is introduced. Source IDs/identity and private
first provenance retain J2 meaning; `source-read.js` shares its unchanged catalog/
body validators. Existing source and H/runtime transaction shapes remain unchanged.

Targets are exact saved slide/element IDs including group children. No semanticRef,
compiler-role, tombstone or cross-slide fallback invents a match. Hidden/locked/
chrome/group existence grants no edit privilege. Duplicate live element IDs report
ambiguity. Iterative traversal allows10000 elements across requested element-target
slides and128 child levels, with whole-request refusal on overflow.

Optional locators check half-open UTF-8 byte ranges against only the retained
excerpt and an exact scalar quote. They preserve normalization, line endings and
literal BOM/replacement characters. Lone-surrogate excerpts remain retained but
report unsupported-excerpt before encoding could repair them. Locator precedence
and target/source observations stay independent; claimSupport is always
not-assessed. Complete results are strict, frozen and bounded384KiB, with no source
URL/title/excerpt/quote or unrelated scene content. Missing/stale/corrupt outcomes
are explicit and never become partial attachment success or reusable approval.

Six runtime paths changed: src/projects/citation-references.js, snippet-locator.js,
source-read.js, sources.js, store.js and store-postgres.js. Four new test/contract
paths plus the narrow governance inventory test, validator and state schema cover
the selected scope. No dependency/package/model/schema/generated type, renderer,
compiler, authoritative scene, project payload, command, public route or UI changed.
No new retained content or source/document/history/chat counter write is added.

## Exact focused execution

Node24.16.0, serial nice10/idle-I/O checks through the
[retained runner](v2-8j-3-evidence/run-focused.py),55sec process-group watchdogs,
15sec new storage cases. [Inventory](v2-8j-3-evidence/validation-plan.json) was
committed before execution. Actual temporary SQLite files and actual isolated
PostgreSQL temporary databases were used; no unavailable backend was counted green.

| Selected gate | Pass | Fail | Skip | Cancelled | Process observation |
|---|---:|---:|---:|---:|---:|
| New pure input/result/Unicode/target checks |7|0|0|0|265ms|
| New actual SQLite contracts |5|0|0|0|618ms|
| New actual PostgreSQL contracts |5|0|0|0|567ms|
| Affected J2 pure4/SQLite13/PostgreSQL10 |27|0|0|0|1918ms|
| Package import boundaries |6|0|0|0|518ms|
| Supplemental selected governance |2|0|0|0|365ms|

Required test leaves **50/50**; selected including governance **52/52**, all
0fail/skip/cancel. All root product-test attempts equal that selection: no failed
product test or successful product-test repeat occurred. Typecheck exited0 in
1367ms. These are fixture process durations, not production latency or a benchmark.
Actual file identities/counts are retained in the TAP reporter markers and
[execution summary](v2-8j-3-evidence/execution-summary.json).

Storage contracts exercise exact owner/local/foreign isolation; stale document and
catalog tokens; reopen and history restoration; nested/hidden/locked/ambiguous/
missing targets; retained/missing/corrupt sources; captured mutable identity/target/
quote input; no content-bearing output; unchanged saved document/history/chat/
source rows across reads; read failure lock release; and clear blocked by the same
parent lock until both target and source observations complete. PostgreSQL observes
an actual competing Lock wait in its unique fixture database. Pure checks establish
exact UTF-8 boundaries, unpaired-surrogate policy, strict no-storage refusal and
whole-request traversal limits. Affected J2 contracts qualify the extracted reads,
unchanged clear/rollback/capacity and canonical-delete behavior.

## Source applicability and non-product corrections

[Collector](v2-8j-3-evidence/collect-evidence.py) and
[source manifest](v2-8j-3-evidence/source-manifest.json) bind every retained new
runtime/test hash to frozen source. Pure/governance/typecheck invocation904cd67,
SQLite/boundary invocation4d592c8 and PostgreSQL/affected invocationedda5ec are
preserved in original attempt records. Canonical gate records distinguish actual
invocation from reviewed final source; later differences were metadata/runner only.
The original capture included model/tools/agent package paths, not every unchanged
package used by the boundary/type commands. The collector explicitly compares all
package TS/JS/JSON committed invocation, current and final bytes, listing otherwise
uncaptured paths. No missing-capture result was silently claimed as a rerun.

No actual product regression or assertion weakening was needed. Three preparation
issues are retained separately from test counts:

- The development-state record used an unsupported implementationStatus value;
  dev:protocol reported1error. The state now uses the existing
  implemented-pending-validation enum; protocol then passed0errors/0warnings.
- The first owned-service startup attempt refused because its otherwise-ready
  admission was over60sec old. This happened before Docker/credential mutation;
  a fresh observer run preceded the actual service startup.
- A runner adaptation formed a tuple environment key. Popen refused before the
  PostgreSQL child started, so PG attempt1 has no executed test count and its
  original empty log remains. Corrected explicit string keys produced actual
  attempt2:5/5. SQLite5/5 was retained without repeating it; the affected27/27
  subsequently ran once. No URL/credential was printed or stored in evidence.

[Initial observations](v2-8j-3-evidence/initial-observations.json) and the explicit
[unexecuted launcher attempt](v2-8j-3-evidence/citation-postgres-attempt-1.json)
record these limitations without labeling preparation failures as passing tests.

## Resources and lifecycle

Read-only admission ran in the fresh J3 namespace before actual storage/service
work. First attempt found two ready15sec samples but aged out before startup.
Attempt2 first observed a blocked userspace thread and admitted nothing; its next
consecutive ready samples measured CPU10.59%/11.12%, backing-disk2.19%/3.07%,
adequate memory and no userspace/unknown D-thread blocker. Existing thresholds were
unchanged. Global I/O PSI retains unresolved provenance; no unrelated work or
model/server process was stopped, reused or controlled. Pure/governance/type/boundary
checks were short and light while waiting.

The exact owned localhost-only postgres:15-alpine fixture has1CPU/512MiB and256MiB
private tmpfs limits. [Identity](v2-8j-3-evidence/owned-postgres.json) records the
actual container/image/port and initial empty user-database catalog. This supplies
real backend behavior, not a hardware/power-loss durability qualification. Root
storage databases and pools closed/dropped; SQLite files were removed. The service
is temporarily retained solely for coordinated independent challenges; root owns
its eventual saved-catalog exact-ID cleanup. No production migration or persistent
infrastructure is authorized.

## Independent review and limits

Separate /root/i8_source_review is inspecting exact source and retained evidence;
its new challenge and final ACCEPT/HOLD record are pending. Root cannot self-accept.
Only this read-only slice can be accepted; target/source observations are not saved
citations, claim verification, page/file/DOI integrity or injection qualification.
They may become stale immediately after lock release. Existing SQLite/PG lock waits
remain, with no new wall-clock deadline/cancellation guarantee.

Old J1/provider/browser/build/render/native/50cell/bulk/broad-fault suites remain
unexecuted in this slice; unchanged accepted evidence is reused. No visual/export
change means no new screenshot/native fidelity claim. Standing BYOK locale, earlier
J1/I7 timing and inherited I4/native/visual operational provenance remain separate
and unrerun. No live API/model/search/local inference/GPU call or activation ran.

Implementation recommends acceptance of the approved J3 boundary once independent
review and owned cleanup are complete. All further attachment/copy/export/creation
scope lives in the roadmap. Stop after review, documentation and scoped origin/v2
push; no dependent implementation, deployment or paid infrastructure follows.
