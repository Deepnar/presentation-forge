# V2-8H mutable-binding source review — cc3ed18

Date: 2026-10-23. Reviewer/context: `/root/turn_contract_review`, separate from
implementer `/root`. Exact source:
`cc3ed185afda2058afa6f9b177f2d497fe30719c`. Accepted product baseline remains
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.

**Provisional decision: HOLD.** A demonstrated mutable-reference defect violates
project binding and transaction serialization. This historical source decision
remains valid after later corrections; it is not a final full-evidence review.

## P1 — caller binding reuse can clear a different project's chat

`packages/agent/turns.ts:29–35` copies the binding for backend authorization and
state load/save. Public-operation closures still capture the original caller
object. In `clear`, the project-qualified DELETEs at lines 100–104 read that
original object after asynchronous state loading. An ordinary caller can start
an operation for project A and then reuse its own object for project B:

```js
const pending = service.clear(sharedBindingA, generationAndRevisionA);
sharedBindingA.id = 'B';
await pending;
```

The transaction remains authorized for A, but deletes B's turn/proposal rows.
It then advances A's conversation generation without deleting A's old rows.
Subsequent A reads fail validation because its retained turn has the previous
generation. This is wrong-project data deletion and a broken A conversation,
not merely refusal of an invalid request.

An independent tiny transactional in-memory probe used the real service and two
valid same-owner projects, each with one legitimate submitted turn. It performed
only the caller reuse above. It did not forge a provider response, mutate backend
authority, bypass the public service or invoke another project's store directly.
Observed output on the frozen source:

```json
{"clearResult":true,"authenticatedProject":"A","mutatedCallerProject":"B","remainingBVisibleTurns":0,"remainingARows":1,"aReadError":"invalid-document"}
```

The trusted-host boundary establishes the provenance of owner/project values.
It does not document a requirement to retain exclusive ownership of a mutable
object throughout an asynchronous operation. The accepted runtime's `start`
already makes a private synchronous copy before its first await. This defect
arises through ordinary object reuse and therefore warrants the same narrow
protection; a broader malicious-host sandbox or accessor policy is unnecessary.

The `decide` path also rereads the original object when calling
`queueRun(inner, checkBinding(binding), ...)` after authorization and plan digest
awaits. That can direct queue SQL to another project while using the original
project's transaction/document. Read/export/cancel linked-run lookups usually
fail closed after a changed project ID, but still lose stable operation identity.
Preparation can likewise change bindings between its claim, runner and receipt
transactions. These are source-derived consequences; only clear's destructive
path was independently executed for this historical decision.

Narrow correction: make one private `checkBinding` copy synchronously at each of
the seven public entrypoints, before any await, and capture that copy throughout
all jobs/results/preparation callbacks. Preserve existing backend ownership and
generation checks. The [saved probe](V2-8H-binding-probe.mjs) contains an equivalent
historical clear reproduction under `--expect-broken`, guarded to require the
named frozen source bytes; it must be run with that source, not the later fix.

## Execution and limits

Independent historical execution: one in-memory defect reproduction; zero test
suites, database operations, services, network/model API calls, local inference,
builds, browsers, benchmarks or native export checks. The reviewed `turns.ts`
SHA-256 was `f361ecae94a636bb8294938922a98f9aa69e1a372b29b13965eceb63e922ac05`.

Existing root test/evidence results are not reclassified as independent execution
or passes for a replacement source. The accepted baseline and development state
remain unchanged by this review. The correction and its required complete
evidence need separate assessment before final ACCEPT.
