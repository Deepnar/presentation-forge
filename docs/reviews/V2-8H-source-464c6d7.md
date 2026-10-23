# V2-8H exact-source review — 464c6d7

Date: 2026-10-23. Reviewer: `/root/turn_contract_review`, a separate context from
implementer `/root`. Reviewed source/test commit:
`464c6d787d77444b7110226d2fc14649acd8e5f1`. Accepted product baseline:
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
Inspection entry HEAD was `b1c673d22796828b554094f010166425938de70f`; the diff from
the reviewed commit to that HEAD contains no package, source, test, tool or
package.json change. Later working-tree corrections are outside this decision.

**Provisional decision: HOLD.** One reproduced cancellation defect blocks the
reviewed source. This is a source review before the required complete evidence
packet, not final implementation acceptance. No accepted baseline or development
state was changed by this review.

## Blocking finding

### P1 — an aborted preparation can recover into an executable submitted turn

At `packages/agent/turns.ts:247–254` in the reviewed commit, the publication
transaction always installs a pre-commit guard that throws when the caller's
AbortSignal is aborted. The same transaction then deliberately changes an aborted
turn to `cancelled`. The guard rolls that cancellation back too.

An abort after a preparation claim therefore leaves the durable turn `preparing`,
even when no exchange was dispatched. After its lease expires,
`packages/agent/turn-store.ts:165–169` returns that turn to `submitted`. Another
worker can prepare the same cancelled request and call the provider. This defeats
durable cancellation; it also leaves an ordinary in-flight abort busy until lease
expiry. An abort during publication similarly rolls back the visible result
without recording cancellation.

An independent lightweight probe reproduced the first path against the frozen
source with a transactional in-memory backend. It used the real turn service,
canonical scene fixture and a deterministic in-memory provider; it opened no
database, socket or service. The backend cloned its records per transaction,
executed the registered pre-commit guard before committing, and discarded the
clone on failure, matching the relevant backend contract. It aborted immediately
after the first `preparing` turn row was written, before any attempt reservation or
provider dispatch. It then read status, advanced the database clock by 31 seconds,
read status again and prepared the recovered turn with a different worker.

Observed output:

```json
{"abortResult":"invalid-document","stateAfterAbort":"preparing","stateAfterLease":"submitted","retryState":"complete","providerCalls":1}
```

Narrow correction: permit a fenced cancellation outcome to commit independently
of the guard that protects successful visible publication. If an abort arrives
during row writes and guarded publication rolls back, record cancellation in a
fresh owner-checked transaction only while the same generation, turn and worker
fence still own preparation. Do not cancel a replacement generation or worker.
Preserve any already committed usage and output reservations. Add direct tests
for abort after claim but before dispatch, abort while a provider is pending and
abort during publication; after lease expiry, none may resurrect the aborted
turn or make another provider call. The implementer was notified before full
validation began and acknowledged the correction requirement.

## Other source conclusions

The following are source-inspection conclusions, not independently executed
backend or concurrency passes:

- Approval uses the stored canonical plan and the internal queue primitive within
  the existing owner-checked project transaction. It composes one pre-commit
  guard, and cancellation/clear use the internal run cancellation primitive.
  No nested public runtime transaction or second edit queue was found.
- Identical committed decision replay checks owner/generation first and uses the
  saved digest of the full decision request before fresh revision/expiry checks.
  Changed expected revisions with the same decision key conflict. Approved
  proposal reads reload the canonical linked run and check plan digest, stable
  turn request ID, saved revision, immutable deadline and edit count.
- Private content and metadata have separate count/byte admission bounds.
  Submission reserves final-result capacity before dispatch. Clear removes old
  private records while retaining existing bounded unresolved settlement slots;
  expired slots compact into fixed counters. Source inspection found no further
  full-cap reconciliation blocker.
- Pre-dispatch recovery settles abandoned reserved attempts as not-dispatched,
  takes a fresh fence and sequences attempts within that fence. Total exchange
  count and reserved output remain bounded across all fences; reservations are
  not refunded. Any earlier dispatched exchange prevents automatic continuation.
- The earlier draft's body-loader mismatch is corrected by shared UTF-8 bounds
  and save-side validation. Visible text counts Unicode code points while the
  inherited provider text limit remains 32,000 UTF-16 units. The earlier missing
  final lease-expiry check is also corrected; the over-broad signal guard is the
  distinct remaining defect above.
- Valid accepted exchange usage is persisted before later conversation budget,
  tool execution, proposal and visible-reply refusals. A receipt-only crash has
  dispatched state and conservatively requires user action. Malformed whole
  exchanges still lack independently extracted usage and become unknown. This
  inherited limitation is explicitly retained; it is not a zero-usage, refund,
  exact-billing or automatic-rebill claim.
- New records remain children of the existing project. Stored preparation input
  is charged as private content. No new provider transcript, hidden reasoning,
  tool-result transcript, renderer layout authority, Assistant UI or web route
  was found in the implementation delta.

## Inspection and execution limits

Inspected the approved V2-8H contract, repository acceptance/reviewer guidance,
relevant baseline-to-source implementation diff, schemas/generated record types,
turn state/store/service, provider host hooks, extracted runtime primitives, both
backend transaction adapters, schema DDL, CLI binding, four new test entrypoints
and their shared contracts/process worker. Test inspection covered replay,
ownership, clear, usage, expiry, recovery, byte/count/settlement caps, corruption,
Unicode and independent-process race/crash scenarios. It does not establish that
those tests pass.

Independent execution in this exact-source pass: **one targeted in-memory
reproduction**, producing the failure above. **Zero test-suite executions,
database operations, services, model API calls, local inference calls, builds,
typechecks, benchmarks, browsers or visual/native export inspections.** Existing
implementer test results were not independently rerun or promoted into this
reviewer's execution totals.

Both-store contracts, actual PostgreSQL concurrency/fault behavior, complete
non-browser and bounded serial browser regression, production build, typecheck,
all 50 benchmark cells, native/browser preservation and original-archive checks
remain unexecuted by this reviewer. The standing BYOK locale failure remains
separate. No live quality or interactive Microsoft PowerPoint claim is made.
The reviewed source remains on HOLD; a corrected frozen source and its required
evidence need independent assessment before final ACCEPT can be considered.
