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

## Current status and corrections

Plan review is READY_FOR_IMPLEMENTATION. Initial source `b07052c` completed a
qualified-window development run:108leaf tests,106pass,2fail,0skip/0cancelled.
[Raw results](v2-8i-2-evidence/development/checks.json) retain the source, command,
resource qualification and log hash. Typecheck did not run after this failure.
These are development attempts, not final-source gate passes.

Both failures were incorrect fixtures: matching B parsePlan/digest does not satisfy
H's stricter one-batch proposal invariant in turn-store.ts. The new tests now retain
that rejection explicitly. The internal execution-loop helper exercises actual B
nine-step runs, the eight-call cap, shutdown and renewal/recovery without changing
H. Current H proposals cannot reach the cap; no CLI-cap execution is claimed.
An entered one-batch H transaction may finish despite shutdown and must report
its persisted success. The [initial source review](reviews/V2-8I-2-b07052c-source.md)
corrects its initial mistaken fixture assessment and grants no acceptance.

That review also found a product CLI status defect: unfinished busy/lease-lost/
aborted/capped work could exit0. Corrected source uses this explicit table:

| Final result | Exit |
|---|---|
| Refusal or failed/expired/cancelled run or refused/expired/needs-user-action/cancelled turn |1|
| Unfinished busy/lease-lost/aborted/step-limit, or preparing turn |1|
| Persisted succeeded run, including a completion race |0|
| Ordinary observation, settled reply/rejection or awaiting explicit decision |0|

The succeeded run check precedes unfinished reasons. Real CLI held-run/held-
preparation/provider-refusal/signal checks and a complete status table pin the
behavior. There is no assertion weakening, H invariant relaxation or provider
retry. Source inspection also keeps final status awaits inside the sanitized
error boundary and skips unused provider-file loading for approved work.

Corrected candidate: `58662ecc074f7cc29bf29a0dd410d581ffca0eef`. Corrected development passed120/120 (113SQLite/adjacent plus7realCLI),
0fail/skip/cancelled, and typecheck exited0. See
[exact correction records](v2-8i-2-evidence/correction-v2/checks.json).
These test executions overlap the final primary inventory. Remaining final validation is pending;
this source needs fresh affected checks, complete234-file matrix, build/type/
benchmark/native/frontend evidence and a separate exact-source decision. Only
injected/loopback providers are permitted. Accepted baseline remains I1 source.

A transitional governance check initially rejected an unaccepted task pointer
identical to its accepted baseline; committing and identifying the real candidate
corrected the state record. It was not a behavioral regression gate.


Final preparation recorded the new owned PG15.18 service, all6488historical
files/196ignored original PPTXs and five canonical originals before generators.
[Qualification provenance](v2-8i-2-evidence/qualification-provenance.json) retains
the actual recent same-source180-second samples; preparation and every new job
still require fresh30-second admission. No thresholds changed. Full execution is
now underway in bounded serial batches; no primary totals are asserted yet.
