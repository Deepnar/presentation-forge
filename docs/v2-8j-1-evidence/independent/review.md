# Independent J1 exact-source review

Reviewer/context: `/root/i8_source_review`, separate from implementer `/root`.
Accepted baseline: `b9c2d2075da21608a92a458c1395ede0bbe67297`.
Initial review source: `cff2e73bb079c25e72107c83275341e7682c93a8`.
**ACCEPT** exact source `f161901cf29bd7ebd2c12ef634a86cacf5f90ea3`.
Final review-ready packet: `deb2e202cc9e75dacb9e5524a06fb91a9b52736d`.
No blocking findings remain. Review completed on 2026-10-28.

## Source and contract assessment

Read the approved J1 contract and plan-readiness record, current contributor/
protocol/role/acceptance guidance and state, roadmap and relevant accepted source
boundaries. Reviewed the actual delta in request/result schemas and generated
types, content sessions, provider compatibility, research entry, source identity,
F adapter normalization, tests and governance inventories. This review does not
reopen accepted I8 behavior or repeat its checks.

The new entry is a distinct headless research factory. Existing H preparation,
converse, workers and hosted/UI/CLI paths do not receive it. Base sessions retain
the exact content-only catalog and explicitly refuse search. Initial-read schemas,
durable plans, embedded run definitions and receipts remain content-only. Provider
catalog validation accepts canonical search schemas while rejecting search mixed
with edit authority. Real search remains a Forge tool through an injected provider.

Preparation copies the request and binding, scopes semantic reads through the
existing projection, and rechecks authorization, saved revision and deadline around
provider/search work. Network callbacks run outside backend transactions. Context,
queries and history supplied to callbacks are copied/frozen; credentials, raw scene
geometry and backend payloads are not model context. The explicit research policy
keeps retrieved snippets untrusted and makes no factual-support claim.

Search attempts, results, model exchanges, tool calls, output reservations, context,
per-search time, invocation deadline and complete publication size are bounded.
Search failures stop continuation; duplicate call IDs cannot dispatch again.
Cancellation and expiry abort parent/child reads, refuse late publication and retain
unknown model usage conservatively. No H persistence/accounting hooks are attached.

Search results are canonical ToolResults with unchanged scene status and matching
project/provider identity. URLs and source fields are constrained, and IDs must
match the accepted versioned snippet-content formula extracted without changing
F identity behavior. The final result retains accumulated normalized sources,
counts all returned rows, deduplicates immutable identity and keeps first retrieval
provenance. It stores no sources, claims, locators, transcript or proposals.

## Independent correction and challenges

The initial runner-local `used` flag did not enforce the approved single-use
capability across factories. A new concurrent cross-runner challenge at `cff2e73`
reproduced two successful invocations from one capability. The second new challenge
passed: individually valid bounded search sources and final text that exceed the
complete 65,536-character DTO cap produce failure without text/source publication.
Initial result: 2 cases, 1 pass, 1 fail, no skip/cancellation, 567 ms process,
with nice 10 and a 15-second process-group watchdog. Exact script/source hashes
and the initial challenge source are retained.

The correction uses private WeakMap state keyed by the trusted capability and
binds the full canonical request. Source review verifies sorted-key identity,
snapshot immutability, same-ID text/scope mismatch refusal without spending, and
synchronous shared consumption before the first await. The final independent run
passes the same two cases on frozen `f161901`: 2 pass, 0 fail/skip/cancelled,
exit 0, 616 ms process with nice 10 and the same watchdog. Text/scope checks are
inside the capability challenge. No successful implementation suite is duplicated.

## Execution and evidence limits

This context acquires no DB/browser/build/service slot. Independent challenges use
injected framework-free fixtures only: no HTTP, model, external search, local
inference, GPU, production configuration or activation. Root owns all integration,
shared execution, Git/state and cleanup. Only this independent namespace and its
separate review record are written by the reviewer.

The initial OpenAI integration case timed out at its unchanged 15-second case
bound without retained stage diagnostics. Its cause is unresolved; the other three
cases passed. That cancelled case is not a pass. The later four-case run passed
with diagnostics and complete grant fixtures; it is separately retained and bound
to final source. It cannot establish the original timeout cause.

The lightweight independent packet audit read 552 captured paths across seven
selected gates, confirmed every reported mismatch/count against actual hashes,
and verified the exact single type-erased assertion replacement. Final changed
runtime/test/governance files match frozen Git bytes. Eight named durable
schema/runtime/preparation boundaries are byte-identical to accepted I8 source.
Research import lines are unchanged across the final correction; the corrected
runner is outside the retained old-case dependency paths. The audit reports no
errors. Thus the retained affected and graph/drift evidence is applicable without
repeating those successful cases or expanding to the old matrix.

Selected implementation evidence is 153 passed leaves with no failure, skip or
cancellation: 16 new unit, 4 SQLite/loopback, 7 graph/drift, 120 directly affected,
2 exact schema-subset and 4 selected governance. Final typecheck exits 0. Raw TAP
counts and total attempts independently sum to 185 root executions: 181 pass,
3 fail, 0 skip, 1 cancelled. The independent initial 1 pass/1 fail and final 2/2
are separately retained; repeats are not distinct coverage. Earlier fixture,
resource-cleanup and compiler failures are explicitly classified, not hidden.

No UI, native renderer, compiler, persistence query/schema or deployment changes
justify another old browser/native/benchmark/PostgreSQL/fault matrix. Those checks
remain unexecuted this slice. Deterministic loopback continuation establishes
transport/correlation/authority behavior, not live-model usefulness, assertion
grounding, query-retention control or injection resistance. Existing BYOK locale,
I7 initial timing and inherited visual/native/I4 operational provenance remain
separate. No missing historical artifact is reconstructed.

Root's resource-closeout record reports no persistent service acquired and owned
observers finished. The pre-existing API PID1723 is now absent, with no task action
reported and external lifecycle unknown. This reviewer inspected that record;
it acquired no service, performed no cleanup and does not certify a cause for
the unrelated process absence or reconstruct old I4 provenance.

Acceptance is only for the approved headless boundary and permits planning the
next contract. It does not activate search, add a public surface, register durable
sources, qualify live usefulness/grounding, or authorize dependent implementation,
paid infrastructure, production deployment or migrations. Link the independent
record, finish scoped origin/v2 closeout, then stop.
