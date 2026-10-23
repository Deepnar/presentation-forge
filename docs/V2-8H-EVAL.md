# V2-8H — durable conversations and approval ownership

## Status and authority

**Approved contract resumed on 2026-10-23; implemented, pending final validation and independent acceptance.** The 2026-10-22 continuation produced
this prepared contract; the subsequent human reply approved it and requested
an immediate stop before implementation. Approval and deferral authority are in
[the roadmap](ROADMAP.md#assistant-turn-approval-contract). No implementation
acceptance is implied.

Branch/push: `v2` / `origin/v2`. Planning-entry HEAD:
`2e0e40d4007be462c111bc2a0fe38398a048f7ba`. Accepted source:
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`, independently accepted in
[the native-ID decision](reviews/V2-PPTX-ID-45c2c4c.json).
No product source, schema, database or provider configuration changes in this
planning phase. No model API, local inference, service, build, browser or benchmark
execution. Prior accepted tests remain historical, not executions of V2-8H.

## Observed boundary

The browser is the primary presentation editor. Direct canvas edits, commands,
undo/history and saved projects already exist. Microsoft PowerPoint qualification
concerns the exported file, not a requirement to edit the browser project.

`packages/agent/provider-run.ts` creates in-memory `WeakMap` proposals; `enqueue`
requires the exact object. Each `converse` call begins with empty exchange history.
Its validated semantic edit plans can be queued durably, but a browser reload,
different host or process restart cannot recover the unqueued approval capability.
Do not relabel accepted edit-run durability as saved conversational continuity.

`packages/agent/runtime.ts:start` already owns canonical plan validation/digest,
request-key replay, run creation and the only edit cursor. SQLite uses
`BEGIN IMMEDIATE`; PostgreSQL locks the project row `FOR UPDATE`. Both expose
`withRuntimeTransaction`, database time and a pre-commit guard. The public `start`
opens its own transaction, so calling it inside an approval transaction would not
make approval and enqueue atomic. Existing run/receipt tables are project children
with cascade deletion. Scene/history private content already persists separately.

## Approved product and data contract

Recommendation: **project-linked, owner-only visible conversation**, retained until
the owner clears it or deletes the project. Store bounded user requests, displayed
assistant replies and validated pending semantic proposals in the existing project
backend. Use a versioned policy; no external conversation store or new infrastructure.
The alternative is a fixed rolling visible-chat lifetime, requiring an agreed
expiry and reliable cleanup contract before implementation.

Proposed limits are admission limits, not silent truncation: 128 turns in the
current conversation generation, 4 MiB aggregate serialized UTF-8 private Assistant
content per project, existing 16,000-character request limit, displayed reply capped
at 16,000 characters, and 128 KiB per canonical pending plan. Existing stricter
schema/wire/tool limits still apply, including the plan parser's 65,536-character
limit. The provider's existing 32,000-UTF-16-unit text acceptance is unchanged;
this new service refuses an over-limit visible reply after settling valid usage,
without truncation or an automatic replacement call.
Refuse storage admission overflow before dispatch/publication;
offer authorized conversation export and explicit clear rather than deleting old
content or secretly changing the model context. Clearing starts a new generation.

Do not store provider wire messages, instruction prompts, read-tool results,
hidden reasoning, environment secrets or connection credentials. Visible free text
can itself contain sensitive user content; this policy is not a claim that arbitrary
user wording contains no secrets. Do not add message bodies to ordinary logs or
telemetry. Use existing project access/storage protections; no end-to-end encryption
or new at-rest encryption guarantee is implied.

Owner-authorized conversation export contains the bounded visible transcript and
published proposal/status summaries, not hidden provider/context data. Exported
JSON never confers approval authority. Clear fences ongoing preparation, invalidates
pending proposals, cancels nonterminal linked runs in the same project transaction,
and removes visible conversation and duplicate canonical proposal bodies, including
approved copies whose existing linked run already owns the plan. Committed deck edits,
existing revision history and existing run records remain under their accepted
policies; they may contain previously approved edit content. Clear is not an erase-
all-project-data operation or undo. Project deletion cascades all new conversation,
proposal and attempt records with the existing project children. Do not claim secure
erasure of backups or physical database pages.

Freeze deadlines at submission: preparation is at most 120 seconds; the immutable
canonical plan deadline is at most 20 minutes after submission. Proposal approval
expiry is `min(publication + 15 minutes, plan deadline - 2 minutes)`. Refuse
publication if no positive approval window remains. Approval never extends a
deadline or changes the digested plan. These are authorization deadlines, not
storage-erasure guarantees. Expired/rejected/cancelled/superseded unapproved plan bodies are
removed when that terminal transition is reconciled; logical expiry is enforced at
every read/decision even before physical cleanup. No background-erasure deadline
is promised while the host is stopped.

## Approved implementation contract

Deliver a complete headless conversation/turn/proposal service over both existing
backends, with authenticated-equivalent host bindings, bounded reads/export/clear,
restart-safe status and explicit decision/cancellation. Existing provider adapters
are used only with deterministic injected fixtures during validation. No Assistant
UI, routes, model quality run, search tool, semantic deck-creation tool, framework,
new scene authority or separate edit queue is part of this slice.

Conceptual records:

| Record | Required binding/state |
|---|---|
| Conversation | Project/owner, current generation and revision, policy version, content/record admission counters, bounded timestamps |
| User turn | Opaque server ID, generation, client request key, immutable request identity, saved project revision, trusted scope, visible content, state, cancellation fence and deadline |
| Proposal | Server ID, turn/generation, immutable canonical plan/digest, expected project/proposal revisions, expiry, terminal decision and existing run ID |
| Provider attempt | Turn/generation, exchange ID/fence, reserved output allowance, provider/config/instruction/catalog versions, dispatch state, known/unknown usage and sanitized error |

Bound serialized UTF-8 metadata separately from the 4 MiB private-content budget:
at most 4 MiB metadata per project, a single 16 KiB conversation header,
128 current-generation turns, 128 proposals (one per turn), 1,024 current-generation
attempts (eight exchanges per turn), and one in-place decision per proposal.
Turn/proposal metadata is at most 4 KiB each; attempt metadata is at most 2 KiB.
Trusted scope/preparation input belongs in private-content admission, never an
uncapped metadata field. Count and byte caps apply simultaneously and may admit
fewer turns. Existing run/history payloads retain their prior policy and are not
misrepresented as covered by these new Assistant budgets.

Reserve sufficient private-content and metadata capacity for a bounded final
reply/proposal and usage/status write **before dispatch**. Release unused storage
reservation after the terminal outcome. Output-token reservation is separate:
retain its full admitted amount irrespective of smaller output, rejection or clear.
Full admission caps must not prevent status/expiry/cancel/clear reconciliation.

Submit, decision and clear require the server-issued conversation generation and
expected revision. Never substitute the current generation for a missing or old
one. Clear advances generation atomically and deletes old turn/proposal/decision
rows without indefinite private tombstones. A fixed set of safe-integer cumulative
reservation/known-usage/unknown-attempt counters survives clear in the header;
no map keyed by provider/model/generation is allowed to grow without a bound.
Exactly-once accounting is guarded by attempt state/fence under the project lock,
not re-added whenever rows are cleared. These counters are not a pricing ledger
or proof of per-account spend admission.

Allow at most 128 content-free unresolved settlement slots **across generations**,
at most 2 KiB each and within the metadata cap. Reserve a slot before dispatch;
clear strips its private content and retains that existing slot without allocating
another. Its immutable settlement deadline is at most 120 seconds after dispatch,
also bounded by the preparation deadline. A valid known receipt or deadline-
unknown outcome settles once, rolls into the fixed counters and releases the slot.
After compaction a stale callback cannot settle again or publish; unknown never
becomes zero or a refund. At slot exhaustion refuse new dispatch temporarily;
reads/export/clear/deck edits remain available, and expiry reconciliation releases
slots. Reconcile on startup and before admission/read/decision; no separate service
or stopped-host cleanup guarantee. Project deletion removes every new child.

Existing user content edits stay on the canonical revisioned command path. A turn
can publish a bounded clarification/final result or one edit proposal; a proposal
never executes merely because a provider returned it. Saved conversation is not
automatically unbounded cross-turn model context: the existing provider/context
contract stays intact until its separately scoped integration is approved.
Permit at most one preparing or awaiting-decision turn per project. Another fresh
submit returns busy until explicit decision/cancellation; identical replay remains
idempotent. This is a service admission rule, not a new UI wizard or question flow.
Later browser orchestration can make follow-up intent explicit through the same
cancel/submit contracts. A linked run's status remains canonical; every new turn
still binds its own saved revision. Preparation uses an expiring lease, monotonically
increasing fence and compare-and-swap turn revision; project revision alone cannot
fence a stale preparation worker on another host.

## Atomicity and recovery contract

1. Derive owner/project authority from the trusted caller. Browser/model arguments
   never supply grants. SQLite local-owner behavior stays local; no admin bypass
   is added to the runtime binding. Every read/export/clear/decision rechecks access.
2. Submit deduplicates within the explicitly supplied current generation. Identical replay
   returns the existing turn; conflicting content/scope/revision is refused. Allocate
   a server turn ID as the stable canonical run request ID. Serialize races through
   the existing project transaction, not a process mutex or second queue.
3. Preparation, context reads and provider calls occur outside write transactions.
   A host-only sink receives the runner's internally validated canonical proposal;
   persisted plans are never reconstructed from client-echoed proposal JSON.
   Existing exact-object `enqueue` remains unchanged for its current callers.
4. Publish only after rechecking owner, generation, cancellation, saved revision,
   deadline and admission under the project lock. Stale output never overwrites a
   newer turn or editor draft. A draft still needs the later browser save/submit
   coordination contract; saved-revision checks alone do not protect unsaved text.
5. Extract a narrowly internal transaction-scoped queue primitive from `start`.
   Its public wrapper preserves all existing validation/replay/refusal behavior.
   The durable decision service loads the stored immutable plan, verifies digest,
   ownership, generation, expected revisions/expiry and scope, then writes approval
   and queues the existing run in **one transaction**. Crash before commit writes
   neither; crash after commit leaves one recoverable run. No nested public `start`.
   Backend `beforeCommit` currently retains one callback: collect and register one
   composed guard, including internal queue guards and a final database-time
   approval/plan expiry check. Registering independent guards would overwrite one.
6. Recheck current ownership/generation first, then return an identical committed
   decision and existing run identity before fresh expiry/project/proposal-revision
   checks. Its own run may already have edited the saved revision or finished;
   replay is not new approval. Cleared generations still refuse. Use internal
   transaction-scoped run lookup, not nested public `inspect`. Conflicting
   decisions, stale revisions, cleared generations and expired/rejected proposals
   refuse. Approval never automatically rebases. A single proposal cannot create
   multiple runs across hosts. The run's existing cursor/receipts remain authoritative.
7. Cancellation/clear and edit commits share the same project serialization point.
   Reuse a narrowly internal transaction-scoped form of current run cancellation;
   invalidate leases/fences before allowing a late worker to commit. Already
   committed edits remain committed; report the actual winning order, never imply
   rollback. No public cancel call nested inside the clear transaction.
8. Persist attempt reservation and a dispatch marker before each external exchange.
   A marker-to-network crash is conservatively ambiguous; exactly-once billing
   cannot be inferred. Automatic preparation recovery is allowed only if **no
   exchange in the entire turn was ever dispatched**, with fresh scope/revision
   checks and a new lease fence. After any dispatch, lost volatile continuation
   becomes needs-user-action even if a later exchange was only reserved: its prior
   hidden history/read results were deliberately not persisted. Preserve known
   prior usage; never automatically rerun/reconstruct/rebill that conversation.
   A dispatched attempt without a recorded response remains unknown.
   A late result cannot publish after
   cancellation/generation change. Reconstruct no hidden transcript/read results.
9. Persist validated usage before later tool/admission/publication refusal. Final
   attempt status and visible turn/proposal publication should commit together;
   if only a usage receipt committed before a crash, recovery is needs-user-action,
   not a second provider call. A refusal may settle usage without a proposal; do
   not roll that receipt back merely because publication was refused. An ambiguous
   attempt remains unknown, not zero. An explicit retry is a new authorized turn,
   refreshed from the current saved revision, subject to the same bounds. Per-account
   spend admission remains its separately registered contract.

## Look-ahead and acceptance evidence

Search/source tools and semantic creation will reuse these owner/generation/revision
bindings. Assistant UI will consume bounded views of the same records and existing
run status, settle pending saves before submit, and protect unsaved drafts on result
arrival. Do not introduce another document, command engine, queue, persistent undo
stack or vendor session authority. Those work items remain only in the roadmap.

Required implementation evidence, all currently **unexecuted**:

- Fail-first schema/state-machine/idempotency/limits tests and both-store contracts.
  Cover reload/other host, stale/expiry boundaries with database time, corrupt
  records/digests, cross-owner reads/export/clear, conflicting keys/decisions and
  project deletion. Inspect stored rows and logs for forbidden private fields.
- Independent-process approve/approve, reject/approve, cancel/commit, clear/publish
  races and fault injection before/after dispatch, proposal publication and atomic
  approval+enqueue commit; exactly one linked run, no duplicate edit or auto-rebill.
- Existing runtime/provider/preparation/conversation suites unchanged on SQLite
  and PostgreSQL, including exact-object capability refusal and usage accounting.
- Complete non-browser regression inventory, bounded serial browser files with
  watchdogs and no concurrent Vite builds, PostgreSQL contracts and cross-process
  faults, production build, typecheck and all 50 canonical benchmark cells. Absent
  PostgreSQL is unexecuted, never green. Preserve separate standing BYOK locale.
- Persisted semantic edit/native export preservation, final relevant browser and
  raster evidence and original-archive hash preservation. No live content-quality
  claim; interactive Microsoft PowerPoint remains separately unexecuted if absent.

Common gates: correctness, data integrity, authorization, ownership, backward
compatibility, regression and documentation are directly applicable. Existing
undo/history/native/browser behavior needs preservation evidence. No new browser
surface means no new accessibility/responsive design claim; existing interactions
still need regression. Deployment safety means no production deployment/migration.

On explicit human resume, freeze the exact file/gate inventory and update the
state schema/checker for V2-8H together. The policy/contract approval is already
recorded; do not re-ask it. After implementation stop for separate exact-source
ACCEPT/HOLD; do not self-accept or start Assistant UI. The overnight deferral prohibited implementation and scheduling until the
explicit 2026-10-23 resume recorded below.

## Planning evidence

Source inspection only against planning-entry HEAD. Product/test source unchanged;
zero tests, builds, browsers, benchmarks, services or provider calls executed for
this contract. Lightweight governance/document checks and any separate plan review
are recorded after completion, distinct from implementation acceptance.


### Independent planning review and current gate

Plan `9ead920004a6c6b83678ccc25852ad69d05395fe` was independently reviewed by
`/root/native_id_review` (separate from author `/root`). Decision:
**READY_FOR_POLICY_DECISION**, committed at `8599638` in
[the review](reviews/V2-8H-plan-9ead920.json) and its supporting report.
No implementation or human policy approval was granted. No code or user data
was changed by review; its test/provider/database/service/build/browser/benchmark
execution counts are all zero.

The review corrected the initial preparation-recovery hole after a completed
read round, required generation/revision on every state-changing request, fixed
metadata/settlement caps and clear compaction, decision replay precedence,
composed pre-commit guards, exact deadlines, stale-worker leases and reservation
ordering. Those corrections are incorporated above; no remaining plan-readiness
finding was reported. This is source-backed design review, not executed failure
reproduction or implementation acceptance.

The prepared retention choice and implementation contract were presented for
human direction. The subsequent reply explicitly approves the recommendation,
then says not to start now and to stop. The approved scope is preserved for the
next explicit resume; no implementation or scheduling is authorized during this
stop. The accepted product source and historical validation remain unchanged.
Lightweight `npm run dev:protocol` reports zero errors/warnings and `git diff
--check` passes; these do not validate the proposed implementation. No tests were
run for prose-only changes, and no resource-intensive validation was started.


### Human decision and session stop

On 2026-10-22 the human approved the prepared V2-8H implementation contract with
project-linked visible-chat retention, then explicitly deferred implementation
and ended the session. No further policy confirmation is needed for this scope.
The next session must wait for an explicit resume before starting implementation;
that resume lifts the deferral, not the offline-only, scope or independent-review
constraints. No V2-8H implementation, data writes or resource-intensive validation
were started before stopping.

## Implementation resume — 2026-10-23

Explicit continuation lifts the overnight deferral. The approved policy is unchanged.
Entry HEAD is `431a6fb3980c5fa28868830145ce771571d72b72`; accepted source remains
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`. Nine gates are required: focused
turn/approval contracts, complete non-browser bulk, serial browser/build owners,
PostgreSQL contracts, cross-process faults, production build, typecheck, canonical
50-cell benchmark and inspected visual/native preservation. The frozen inventory
contains 229 files (194 bulk, 26 serial, nine PostgreSQL), including four planned
V2-8H files. Historical results supply no current-source passes. No live provider
or local inference is authorized. Independent exact-source acceptance remains
required; no Assistant UI or dependent feature is authorized by this resume.

### Frozen implementation and preliminary development checks

Source/tests: `464c6d787d77444b7110226d2fc14649acd8e5f1`. The runtime composition
seam was committed separately at `6a2ddf3`, service/schema/CLI at `8b544e6`,
and focused state/process contracts at `464c6d7`. All nine acceptance gates are
still unexecuted on the frozen source. The 229-file inventory remains unchanged.

Working-tree checks during development included 35 existing runtime/process cases,
159 focused compatibility/state/process/drift cases, then further bounded admission
and Unicode/cancellation cases; overlapping reruns do not add distinct coverage.
Typecheck and development-protocol checks passed. Preliminary checks used SQLite
and deterministic injected/loopback fixtures only; PostgreSQL, full bulk/browser,
production build, canonical benchmark and final visual preservation remain pending.

Separate draft source review by `/root/turn_contract_review` identified a serialized
body load/admission mismatch, reserved-before-dispatch recovery sequencing, and
final publication lease/AbortSignal fences. All received narrow corrections and
focused regression cases before source freeze. This draft review is not acceptance.
The inherited provider boundary accepts usage only with a validated whole canonical
exchange. Malformed wire/tool payloads therefore retain unknown usage, never zero
or a refund; later session/tool/budget/publication refusals preserve validated usage.
The associated trace/receipt follow-up remains only in the roadmap.
Visible request/reply character limits follow Unicode code points (as AJV request
limits do); the inherited provider limit of 32,000 UTF-16 units is unchanged.

### Independent source HOLD and cancellation correction

The separate [source review](reviews/V2-8H-source-464c6d7.md) holds `464c6d7`:
a successful-publication AbortSignal guard also rolled back cancellation outcomes.
A no-dispatch aborted turn could become submitted after lease expiry and call the
provider on recovery. This is a product regression, independently reproduced with
one in-memory transactional probe and no database/service/network execution.

New fail-first cases on that source ran 23 SQLite cases: 21 pass, two fail, zero
skips/cancellations. Correction `b095bbac40ccbe0be7a38724f7854b9e8e15d313` records
a matching generation/fence cancellation before applying visible-publication guards;
a mid-write abort rolls back the visible result and then commits only cancellation
in a separate project transaction. Cleared/newer-fence work remains fenced. The
corrected unit/SQLite/independent-process set passes **40/40**, zero failures/skips/
cancellations, with typecheck passing. These development checks do not substitute
for the still-pending nine complete gates on the replacement source.

Independent [correction review](reviews/V2-8H-source-b095bba.md) reports
**READY_FOR_FULL_VALIDATION** on `b095bba`, with 5/5 standalone in-memory probes
covering the three abort timings plus replacement generation/fence safety. It
grants no final acceptance. The historical [HOLD JSON](reviews/V2-8H-source-464c6d7.json)
remains attached to its rejected source; current implementation acceptance is pending.

### First complete-matrix attempt and boundary correction

On `b095bba`, the focused four-file gate passed **76/76** (SQLite, owned
PostgreSQL15.18, CLI and real independent-process race/fault cases). Bulk ran
**2,474** leaves: **2,473 pass, one fail, zero skips/cancellations**, then the
coordinator stopped before browsers/build. Logs and records are preserved in
`v2-8h-evidence/prior-attempt-b095bba/`; these are not replacement-source passes.

The one boundary-test leaf reported two violations. The new turn-state module
introduced filesystem schema reads outside the named Node record adapter: a
product boundary regression, corrected by lazy fixed-name loading in existing
`run-state.ts`. The accepted baseline's PPTX identity helper already imports
JSZip; its stale boundary test policy was corrected with an exact-file exception,
preserving global bans and the denial in render.ts/core/model/turn service.
No assertion was weakened to accept general filesystem/archive dependencies.

Replacement source **`cc3ed185afda2058afa6f9b177f2d497fe30719c`** passes 38 affected
boundary/unit/SQLite/native cases and typecheck. Separate review checked the
three-file delta and ran 10/10 boundary/unit leaves (no skips/cancellations), with
no blocker or broad assertion weakening. The full nine-gate matrix will execute
afresh on this source using the recorded owned PostgreSQL instance and the
original verified pre-test snapshot. Prior partial results are retained separately.

### Superseded cc3 partial execution

A fresh sustained window qualified on `cc3ed18`: 180.76 seconds, mean CPU14.99%,
iowait9.71%, physical NVMe busy0.99%, weighted queue0.045, no observed userspace
blocked thread or memory pressure, followed by nine ready samples. Raw global I/O
PSI remains elevated with unresolved provenance; no cause is claimed. Before any
replacement test, the [backend recheck](v2-8h-evidence/corrected-owned-backend.json)
verified the exact recorded PostgreSQL15.18 instance and zero leftover databases.
Original pre-test snapshots were linked and preserved, not replaced.

At that source, completed gates: **focused76/76**, **bulk2474/2474**, all zero fail/skip/
cancelled. The full serial browser sequence has begun; remaining PostgreSQL files,
build/type/benchmark and fresh visual/native preservation still await completion.
No acceptance is implied by these passing subsets.

### Mutable binding HOLD and replacement-source validation

Independent source inspection found ordinary caller reuse of a mutable binding
could change the project after authorization. A tiny in-memory clear probe deleted
B's submitted turn while advancing A's header and leaving A unreadable. Linked-run
reads/cancel can fail closed; decision/preparation can lose stable project identity.
This is a product correctness defect, not malicious-host behavior or a timing waiver.

Correction **`ac8749613bfbd927dab629f479d3d05f10a99195`** snapshots validated binding
fields at all seven public entries, before any await, and captures that private copy
throughout. Seven new both-backend contracts exercise immediate same-owner project
reuse and preserve B's entire stored conversation/run rows. All seven SQLite cases
fail on old product source. Corrected development unit/SQLite/process **47/47** and
typecheck pass; [raw correction evidence](v2-8h-evidence/binding-correction.json)
is separate from complete gates.

The cc3 partial run retained76 focused,2474 bulk and73 serial leaves (nine of26
files), all passing without skips/cancellations. It stopped between jobs before
this correction; no job was cancelled. Its [raw records and fresh partial visuals](v2-8h-evidence/prior-attempt-cc3ed18/assessment.json)
remain historical. All5725 historical files (including164 PPTXs) and five canonical
output originals were restored/hash-verified before the replacement run. All nine
current gates are reset to unexecuted until fresh exact-source execution, and the
accepted baseline remains `45c2c4c`.

### Inherited timing assumptions and final fixture correction

On `ac87496`, focused90/90 passed; fullbulk ran2481 leaves:2480pass,1fail,
zero skip/cancel. Existing runtime after-project rollback recovery returned running
instead of succeeded with its2slease. CPUbusy rose from12% admission to73.3%, with
CPU PSI13.18; the exact refusal stage was unlogged and causal attribution remains
inferred. The unchanged runtime file in isolation ran26/27; original recovery now
passed, but admission of a150msdeadline failed correctly after it elapsed. All
raw runs are [retained](v2-8h-evidence/prior-attempt-ac87496/assessment.json).

A narrow controlled-time fixture correction then ran60/61 across SQLite/PG;
all53 in-process contracts passed, but an inherited PGprocess recovery's3slease
covered child bootstrap and returned running rather than succeeded. This remains
a failed run. The correction freezes one actual DB timestamp for five deadline/
rollback cases, advances explicit logical boundaries, and additionally proves the
run remains active1ms before its deadline and expires at the exact boundary.
Actual project/history/receipt transactions and every prior assertion remain.
Process kill/checkpoint fixtures boot their child to cached module readiness before
acquiring unchanged1500/3000msleases. Realprocesskills, wallclockleaseexpiry,
takeover and persistence assertions remain; module readiness does not warm the
worker's first store connection. Other realclocklease/process checks are unchanged.

Corrected development checks pass69/69 across bothstores and processcases; no skips/
cancellations. Independent source assessment found this fixture correction
appropriate, with no productlease relaxation. Formal frozen source is
**`22e7c9749865f3e7c2d62fb8724136e0f19048b0`**. It has no further product-source
delta from the binding correction. Every gate executes afresh in
`out/v2-8h-validation-r4`, with nonbrowserbulkconcurrency1 and strict serialbrowser/
build isolation. Recovered-claim timings now explicitly exclude worker module
bootstrap and leasewait while including store setup; they are not speedup
comparisons with older claim-then-spawn measurements. Acceptedbaseline is unchanged.

### Final-source execution in progress

Source `22e7c97` qualified a fresh180.61-second window: meanCPU12.07%, iowait9.85%,
NVMe busy1.40%, weightedqueue0.068, twelve final ready samples, no observed userspace
blocked thread or memory pressure. Raw globalI/OPSI remains elevated with unresolved
provenance. The per-source backend recheck verified the exact owned instance and
zero leftover DBs before use; original snapshots were reused without replacement.

Current complete gates: **focused90/90**, **nonbrowserbulk2481/2481**, zero fail,
skip or cancelled. Bulk uses concurrency1; the full serialbrowser sequence has
started. Remaining gates and final independent acceptance are pending. Raw commands
and counts are indexed by state and the current coordinator; prior source results
are retained separately, never added to these totals.

### Complete browser regression and partial visual inspection

All26 final-source serial files passed **208/208**, zero failure/skip/cancel. The
[current browser packet](v2-8h-evidence/browser-captures.json) preserves76 fresh
screenshots with hashes. Root inspected all via13 contact sheets and15 selected
full-size images, including narrow dialogs, dark project cards, toolbar overflow,
read-only, history/conflict/restart and imported chart/table states. No new overlap
or clipped dialog actions were found. Existing horizontal scrollers, inspector
overlay, Fit/100%-zoom bounds and injected failure/retry states are intentional.
The project Assistant remains a placeholder, and the legacy question cards remain.
No new conversational UI or live-provider quality is claimed.

The120-slide/120-thumbnail shell sample opened in1545ms. Chart/table edit canvas
movement was at most0.04966px in the7A sample; final aggregate measurements are
still pending. Dedicated PostgreSQL, build/type/50-cell/native checks, historical
restoration/owned cleanup and separate final acceptance remain pending.
