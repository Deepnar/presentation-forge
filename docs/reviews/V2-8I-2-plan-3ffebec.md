# V2-8I-2 plan review — READY_FOR_IMPLEMENTATION

The bounded contract at `3ffebec858b09d32e2e40cee837e2f73656044e6` is ready for
implementation against accepted I1 source
`5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`. Entry is
`d8f1de6fec61eb0eb980fbfdafaa59fb4446ada8`; branch/origin `v2` both contained the
reviewed contract when inspected. This is a separate plan-readiness assessment by
`/root/turn_contract_review`, not implementation acceptance. No product source or
current-source test execution exists for I2 yet.

The latest human continuation explicitly requests the next immediate work in the
recorded dependency order. A stateless explicit-turn worker and operator CLI are
within that direction. No additional human approval is needed for this contract:
it makes no UI/surface, provider-selection/fallback, credential/egress, paid
infrastructure, deployment or retention/context-policy decision. The later visible
Assistant and authenticated submission/scheduling remain separate roadmap scope;
this readiness does not authorize them.

## Seams inspected

Read [the I2 contract](../V2-8I-2-EVAL.md), its
[roadmap dependency](../ROADMAP.md#assistant-turn-worker), current handoff/state,
contributor protocol and relevant traps. Source inspection covered H's turn
service/store and input/accounting/reconciliation boundaries, B's runtime and
owner-checked transaction helpers, provider-run signal/profile/binding guards,
Node adapters and existing `agent-chat`/`agent-run` CLI behavior. No tests, model
APIs, local inference, service, generator or resource qualification ran.

The design composes existing authority appropriately. A worker selects only one
persisted turn under a copied owner/project binding. H performs preparation and
persists proposals; explicit approval alone links the canonical B run. The worker
must derive that run ID from persisted state. B owns claim/renew/advance, revision
checks, receipts and final lease/deadline guards. There is no second queue,
approval capability, database state machine, scene document or model layout path.
The new H exact-turn lookup avoids exporting/paginating private chat to select a
job while retaining bounded H loading, reconciliation and transactional ownership.

H already bounds preparation/provider exchange and races exchange completion
against signal/deadline. B already rejects expired/lost leases and stale project
revisions. A second timeout/lease implementation would add competing semantics;
it is neither necessary nor authorized. The contract correctly distinguishes the
invocation's eight-call bound from a database wall-clock timeout.

## Implementation and verification constraints

These are concrete readings of the approved contract, not added product scope:

- Snapshot binding, exact JSON work input and the options container synchronously
  before the first await at both new public entries. Capture the AbortSignal
  reference once while preserving its changing aborted state. Reject executable
  accessors/non-JSON work inputs using existing boundary patterns; do not repeat
  the earlier H mutable-binding closure failure. Include ordinary same-owner A/B
  binding reuse, input mutation and option/signal-container reuse across awaits.
- H `inspect` may return the existing owner-authorized `turnView`, as clarified by
  the implementer. `work` must build a fresh explicit metadata object rather than
  spread/serialize that view or preparation/advance results. Existing views contain
  request/reply and proposal edits; runtime results contain tool results. Exclude
  all of them, raw backend/provider errors and executable provider configuration
  from returned/logged worker status. Test private sentinel fields on success,
  refusal, unexpected errors and CLI stderr as well as stdout.
- A final owner/generation-checked inspection is authoritative. If another host
  approves between preparation and the final read, metadata may identify the work
  phase but must retain the actual persisted approved/run status instead of a
  stale assertion of waiting. After clear/revocation/deletion, do not substitute
  cached success data for the final refusal. `ok` describes the wrapper operation,
  not successful edits; failed/cancelled/expired run states and CLI exits stay
  truthful.
- Treat eight as an upper bound on canonical `advance` calls per invocation.
  Count committed advances separately if reporting steps. Busy/lost-lease/stale
  refusals terminate the invocation; there is no poll, sleep/reclaim loop or hidden
  retry. Reaching a cap or shutdown yields recoverable canonical state and does
  not release/forge a lease, replay provider history, cancel an approved run or
  requeue a plan. Renewal only uses the newly returned canonical token between
  operations, and no renewal timer remains after the invocation.
- Preserve H's no-retry-after-dispatch behavior, reservations and unknown usage
  across crashes/fences. Missing provider refuses without dispatch or fallback.
  Approved execution and observation must not require a provider or load an
  otherwise-unused provider file. Supplied ModelProvider code remains an explicit
  trusted host capability; this does not create provider resolution policy.
- Observe abort before starting new claims/steps and pass preparation abort
  through H's accepted cancellation behavior. An already-entered approved B
  transaction retains its existing commit/fencing rules; final status must describe
  what persisted. SIGINT/SIGTERM handlers are scoped to the CLI invocation, removed
  on completion, and the selected store is closed. No imported module starts work,
  background polling, a timer, server or provider connection.
- Current H approval creates one canonical edit-batch step. Preserve that real
  preparation/approval path in both-store/native tests. If an eight-call or
  between-step test needs more steps, use a narrow instrumented runtime contract
  or a valid canonical stored plan/digest fixture; do not weaken normal approval,
  forge an invalid plan, or imply current H naturally emits multiple run steps.
  Real invocation boundaries, abort during an entered step, fenced-lease restart,
  actual process kills and post-commit reopen still require behavioral evidence.

The existing H/B mechanisms resolve the important races: preparing a stale
snapshot rechecks generation/turn revision, and clearing cancels linked runs under
the same owner-checked project transaction used by claim/advance. Worker code
must preserve those refusals rather than infer permission from an earlier lookup.
Owner revocation is transactionally checked; there is no new session/logout fence
or public worker capability.

## Evidence and stop point

Three new entry files produce a complete 234-file inventory: SQLite contracts,
PostgreSQL contracts, and both-store real process/CLI checks. Freeze and assert
that union, including existing JavaScript and TypeScript entries; do not infer
leaf totals before execution. Extend governance for the new milestone/focused
gate without dropping I1 or inherited cases. Keep all nine required gates, actual
both-store/process negatives, full serial browser/build regression, build/typecheck,
50 cells, four distinct protocol/backend worker scenarios, native identity and
visual inspection, and independent exact-source review. Focused repeats and
PostgreSQL subsets overlap primary cases. The separate locale failure stays
failed outside the nine passing required gates; it needs no nonexistent-gate
waiver.

Fresh shared-machine admission, one owned isolated backend, per-job watchdogs,
all-current evidence/original snapshots and exact restoration remain necessary.
Earlier accepted I1 results and removed container supply no new-source pass.
Offline providers establish plumbing/preservation, not hosted Auto content quality.
After independent DB checks, save/fsync an actual empty catalog before exact-ID
cleanup and verify absence/port closure. Preserve failed attempts and original
archive bytes. Root owns implementation, state, validation and closeout; a separate
final ACCEPT/HOLD remains mandatory. Stop after I2, without dependent UI or
scheduling implementation.

No material plan blocker remains. Only this review note was written; no source,
state, test, evidence archive or snapshot was modified.
