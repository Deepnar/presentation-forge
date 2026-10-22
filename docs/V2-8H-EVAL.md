# V2-8H — durable conversations and approval ownership

## Status and authority

**Contract and recommended data-retention direction approved; implementation
explicitly deferred until human resume.** The 2026-10-22 continuation produced
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

## Approved product and data direction — not implemented

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

## Approved implementation contract — deferred until resume

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
ACCEPT/HOLD; do not self-accept or start Assistant UI. The human's explicit deferral
currently prohibits implementation or scheduled work.

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
