# V2-8I-2 — bounded turn-worker orchestration

## Authority and entry

The latest2026-10-24 human continuation requests starting the next immediate work.
The recorded dependency order is I1 authenticated lifecycle transport, worker/provider
orchestration, then the existing-deck Assistant. This contract implements the
bounded headless worker primitive within that next dependency. It changes neither
surface direction nor approved retention/provider-context policy. No human decision
about infrastructure, credentials, data egress or the visible interface is made.

Accepted source baseline: `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`, independently
accepted in [the I1 decision](reviews/V2-8I-1-5170adc.json). Entry checkout:
`d8f1de6fec61eb0eb980fbfdafaa59fb4446ada8`; branch/push `v2`/`origin/v2`.
Original three untracked paths remain untouched. I1 validation and cleanup are
complete historical prerequisites, not execution of this new source. The previous
owned service is absent; any new PostgreSQL validation needs a newly recorded
exclusive service and all-current evidence/original snapshots.

## Bounded implementation contract

Add a backend-injected, stateless `createTurnWorker` in the existing agent package
and an adapter/CLI entry through `agent-chat work`. One invocation addresses one
explicit `{generation, turnId, workerId}` and a separately trusted `{owner,id}`
binding. Validate exact input keys and limits, reject executable/accessor inputs,
and snapshot binding/input/options synchronously before asynchronous work.

Add owner-checked H `inspect(binding,{generation,turnId})` for one persisted turn,
with existing reconciliation, generation checks and fixed not-found refusal.
This avoids exporting or paginating the full conversation to select one job. It
has no new HTTP route. Preserve existing read/export behavior and all H storage,
lease, accounting, approval and retention rules.

The worker composes only accepted H and B operations:

- Submitted turns use the existing `prepare` operation with the saved turn revision,
  the explicit worker identity and the operator-supplied bounded ModelProvider.
  Missing provider refuses before dispatch; no provider is selected automatically.
  Existing provider deadlines, preparation leases, conservative accounting and
  no-retry-after-dispatch recovery remain authoritative. Waiting proposals are
  returned as waiting; no automatic decision or run queueing is permitted.
- Approved turns derive the run ID only from persisted turn state, claim that run
  and advance through existing revisioned commands/receipts. Renew its canonical
  lease between steps; bound each invocation to at most8advance calls. No caller
  plan, run ID, edit batch, owner override, credentials or provider settings enter
  the work input. No new queue, SQL state machine or scene authority is introduced.
- Busy preparation/run claims, completed/refused/rejected/cancelled/expired turns,
  lost leases, stale generations, cleared/deleted projects and owner revocation
  retain their existing refusal/state. Repeated or racing invocations cannot
  duplicate provider dispatch or committed edits. Restart uses saved state and
  existing fences, never reconstructs hidden provider history or pending plans.
- Abort before dispatch starts no provider/run work. Abort during preparation is
  passed through H's existing cancellation semantics. During approved execution,
  abort stops new claims/steps; an already-entered canonical transaction may commit
  under its existing ownership, revision and lease/deadline guards. Host shutdown
  does not manufacture a user cancellation of the approved run. An unfinished run
  remains recoverable after its lease expires. No atomic in-flight abort fence is
  claimed. Existing hard preparation/provider/run deadlines remain unchanged;
  per-invocation step bounds are not a new hard database-query timeout guarantee.

Return only bounded persisted status metadata and fixed worker disposition/reason:
turn ID/state/revision/code, conversation generation/revision, run view and count
of advanced steps. Never return visible request/reply, proposal edit bodies, tool
results, provider/context bodies, credentials or hidden reasoning in worker logs.
Any success wrapper must retain actual persisted run status; failed/cancelled runs
must not be described as successful edits. Re-read status after work so clear/
revocation/races are authoritative. No rollback is implied by an ambiguous response.

The existing operator CLI accepts `work --project ID --input FILE` with optional
`--owner` and `--provider FILE`, reusing the existing validated transport config.
The config is needed only to prepare a submitted turn; approved execution needs
no provider. Handle SIGINT/SIGTERM with an AbortController, remove handlers and
close the selected store after completion, with bounded/sanitized status output.
No server auto-start, polling daemon, task schedule or background process starts
as a side effect of import, HTTP request or validation.

## Look-ahead and non-goals

The explicit-turn worker is the consumer primitive for the later authenticated
submission/host scheduling integration. It can be called independently of browser/
SSE lifetime and uses the same durable turn/run rows across processes. Later work
must supply trusted bindings/provider resolution and bounded durable job discovery;
that policy is not approximated here with a second queue or a full database scan.
The Assistant can poll existing I1 status and decide through accepted approvals.
Saved chat still does not become model context.

No new public submission/preparation/execution route, provider registry/default/
fallback, hosted worker deployment, framework/SDK/Gateway, credential policy,
account-level spend policy, database migration, source/search/creation tool, layout
vocabulary, visible UI or automatic cross-turn context is included. No real model
API or local inference may run; validation uses injected/loopback fixtures only.
No deployment, paid infrastructure or production service is authorized.

## Verification and acceptance

Focused actual SQLite/PostgreSQL worker contracts and real child-process/CLI
checks must cover: preparation without mutation/approval, waiting/idempotence,
approved execution/reopen/history/human preservation, repeated/racing claims,
clear/cancel/delete/ownership and human-save races, mutable binding/input isolation,
provider refusal/no fallback, abort before/during preparation, shutdown between
approved steps, lost preparation/runtime leases, crash before/after dispatch or
commit, explicit recovery and fixed private status output. Preserve actual storage,
provider exchanges, assertions and process kills. Test the new single-turn lookup
on both stores, including same-owner project switching and stale generation.

Add three entry files to the existing231-file inventory: SQLite worker contracts,
PostgreSQL worker contracts and both-store process/CLI worker checks. Freeze the
actual complete234-file inventory before final validation; focused repeats overlap
that primary inventory. The nine gates are worker contracts, nonbrowser bulk,
bounded serial browser/build files, PostgreSQL contracts, cross-process faults,
production build, typecheck,50-cell benchmark and inspected frontend/native evidence.
All common integrity/auth/preservation/native/browser/accessibility/responsive/
compatibility gates apply through new contracts and the full regression inventory.
Deployment safety means no deployment/migration. Standing BYOK locale remains a
separate failed probe; absent PostgreSQL is unexecuted, not green.

Wait for a fresh quiet resource window before expensive checks. Use one serial
browser/build process, watchdogs, an owned isolated backend and new I2 snapshots of
all historical evidence/ignored originals before generators. Produce four distinct
both-backend/both-protocol worker preparation→explicit approval→worker execution→
reopen/export cases, inspect actual browser/native rasters and identity uniqueness,
and retain exact originals before restoring/hash-verifying all previous bytes.
Report source SHA/delta, all leaf pass/fail/skip/cancel/unexecuted counts, overlapping
repeats, setup/test/product corrections, resources, opening/canvas/performance samples,
known limitations and acceptance recommendation. Preserve failing attempts.

Independent source/evidence review must issue exact-source ACCEPT/HOLD. The
implementer cannot accept this work. After independent DB checks, save/fsync an
actual empty catalog before removing only the new recorded service, then verify
exact absence/port refusal. Update architecture/roadmap/state/handoff to actual
facts, push scoped commits to origin/v2 and stop after I2; no dependent interface
or scheduling implementation follows automatically.

## Final implementation and validation

Source `58662ecc074f7cc29bf29a0dd410d581ffca0eef`; accepted baseline remains I1 source5170adc. Product/test working
delta is empty. The [source manifest](v2-8i-2-evidence/source-manifest.json) names
all17changed source/test/governance files and helper hashes. Exact source/helper
[readiness review](reviews/V2-8I-2-58662ec-source-harness.md) found no remaining
material source blocker; it did not execute tests or supply acceptance.

| Executed group | Files/cases | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Primary nonbrowser bulk |196files|2528|0|0|0|
| Primary serial browser/build |26files|208|0|0|0|
| Primary PostgreSQL set |12files|279|0|0|0|
| Complete primary matrix |234files|3015|0|0|0|
| Distinct worker/persisted/native flows |4cases|4|0|0|0|
| Focused worker repeat |3primary files|79|0|0|0|
| Corrected development repeat |SQLite/adjacent113 + CLI7|120|0|0|0|
| Separate standing BYOK locale |10cases|9|1|0|0|

There are3019distinct required primary/native passes. Focused79 and development120
are repeated primary cases, not extra distinct coverage. Designated PG project/
import23 and designated cross-process/fault19 are overlapping subsets;
the additional worker/process28 produces47combined process cases in a separate
complete report. All required cases
executed; none remain skipped, cancelled or unexecuted. The locale failure is
retained separately and is neither green nor a required-gate waiver.

All nine gates pass. Production build/typecheck exit0 and canonical benchmark
passes50cells (616ms compiler/ZIP; recorded documentation HEAD9be96f0, unchanged
implementation58662ec). The [full matrix](v2-8i-2-evidence/full-matrix.json),
[coordinator](v2-8i-2-evidence/logs/coordinator.json), gate JSON/TAP and
[runbook](v2-8i-2-evidence/RUNBOOK.md) retain exact commands, ordering and source.
All48ordered jobs ran through watchdogs and bounded serial isolation. Actual
backends were temporary SQLite and the new owned PostgreSQL15.18 instance at
loopback5544; [identity](v2-8i-2-evidence/owned-postgres.json) is exact and exclusive.
No live model API/local inference, deployment or migration ran.

## Corrections and failed attempts

Initial sourceb07052c development executed108leaves:106pass/2fail/0skip/0cancelled;
[raw evidence](v2-8i-2-evidence/development/checks.json) is retained. Both were
incorrect fixtures: B parsePlan/digest validity does not satisfy H's one-batch
proposal invariant. H stayed strict. A negative test now retains its rejection;
actual multistep B runtime transactions exercise the extracted internal loop's
cap, between-step shutdown, renewal and recovery. Current H work cannot reach
the eight-call cap; no multistep H or reachable CLI-cap execution is claimed.
The reviewer corrected its initial mistaken fixture assessment in the retained
[initial source review](reviews/V2-8I-2-b07052c-source.md).

Source review also found a product CLI status defect: unfinished busy/lost-lease/
aborted/capped work could exit0. Corrected code returns1 for unsuccessful/refused,
failed/expired/cancelled or unfinished work (including preparing turns). Final
persisted succeeded run takes precedence in a completion race and returns0;
ordinary observation, settled reply/rejection and awaiting explicit decision
return0. Real CLI held-preparation/held-run/provider-refusal/signal probes and a
complete exit table pass. An already-entered one-batch commit may finish after
shutdown; its test asserts persisted success without inventing user cancellation.
Final status awaits remain inside the sanitized error boundary; approved work/
observation skip unused provider-file loading. No assertion was weakened.

Review caught two validation-helper defects: a failed development child could
leave its supervisor exiting0, and preparation could create a container before
rejecting existing snapshots/coordinator artifacts. The corrected supervisor
propagates failure/skip/cancel after preserving records. Preparation rejects
stale artifacts/--resume before creation; only guarded same-ID pre-snapshot
recovery is permitted. Two [negative guard probes](v2-8i-2-evidence/harness-guards/results.json)
actually refused before backend creation. The original failed child always remained
failed evidence despite its old supervisor exit defect. One admission-only
coordinator was stopped to repair it: zero child jobs/leaves started/cancelled;
[the exact attempt](v2-8i-2-evidence/correction-admission-attempt-1/record.json)
is retained. A transitional governance pointer error was corrected before testing;
it is not a product regression. Final governance also rejected an unsupported
state enum and a combined47-case report at the designated19-case gate. The existing
validated enum and separate designated/combined reports correct those metadata
errors without changing product/tests or discarding cases. Their failed attempts
are retained. No further product failure appeared in the final run.

## Resources, performance and visual evidence

The [qualification provenance](v2-8i-2-evidence/qualification-provenance.json)
retains actual recent same-source180-second samples followed by fresh30-second
admission before preparation and every job. Resource thresholds were unchanged;
intermittent CPU/storage contention delayed jobs between executions. The
[resource assessment](v2-8i-2-evidence/resource-assessment.json) validates all job
admissions over205samples, with0critical samples and no cancelled leaf. Elevated
global I/O PSI/iowait provenance remains unresolved; no unrelated process was stopped.

[Performance](v2-8i-2-evidence/performance.json) records120slides/120thumbnails
opening in1540ms, maximum canvas delta0.0694122314453125px, fixture
worker preparation45.9–103.0ms, approved execution9.9–28.1ms, reopen0.46–8.88ms,
and1306-byte bounded runtime traces. Each protocol/backend sample used three
fixture exchanges. These are local observations, not live-provider latency/content
quality or production percentiles. Existing process-recovery measurements retain
their stated clock/bootstrap/lease-wait limitations.

All119indexed images (76browser,43native/SVG/export) were visually inspected and
hash-verified in [the visual review](v2-8i-2-evidence/VISUAL-REVIEW.md). Fifteen
exact original PPTXs (8headless/5browser/2HTTP) pass per-part nonvisual identity
checks:107OOXML parts,365properties, no duplicate IDs. No interactive Microsoft
PowerPoint consumer session was executed. Before generators all6488historical
files/196PPTXs, including ignored originals, and5canonical output originals were
snapshotted; all were restored/hash-verified. No original bytes were reconstructed.

## Limitations and recommendation

Inherited narrow horizontal overflow/partial canvas, scroll/transition/loading
captures, SVG first-run text styling, native chart-consumer differences and fixture
fit limits remain unchanged. The signed-out/owner-revocation checks do not create
an atomic in-flight logout/commit fence. A per-invocation step cap is not a hard DB
query timeout. Unknown usage stays conservative; no network exactly-once guarantee
or automatic retry/refund is claimed. Saved chat does not become provider context.

The bounded worker adds no public submission/execution route, provider resolver/
default/fallback, daemon, hosted scheduler or Assistant UI. Remaining parent work
lives only in [the roadmap](ROADMAP.md#assistant-surface-integration). Offline
correctness is not live Auto usefulness or full native PowerPoint qualification.

Implementation recommendation: ACCEPT this bounded I2 contract after separate
exact-source review. All implementer gates/evidence are complete; independent
acceptance and guarded owned cleanup are still pending. The implementer has not
accepted its own work. Stop after I2; do not advance a dependent feature.
