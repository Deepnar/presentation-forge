# V2-8A tool and model-context boundary

Implementation independently accepted on 2026-10-18 at `d4f446c`; acceptance/evidence
are indexed in state.
The approved task and later-work ownership are in
[ROADMAP.md](ROADMAP.md#v2-8a-scope-proposal).

`packages/tools/session.ts` binds an existing live EditorHandle and trusted
application authority. The application supplies project/owner/actor identity,
agent identity, readable slides, explicitly editable targets, selection and budgets.
This is an internal headless capability, not an HTTP authentication mechanism.
Binding a document requires the application to have already authenticated and
loaded the correct owned project. Model arguments cannot supply authority, choose
another project, widen grants or override the engine actor. The session is frozen;
its grant arrays are copied and filtered against readable slides. Empty effective
edit grants produce an inspection-only catalog/context mode.

Requests and results have JSON Schemas, AJV validation and checked-in generated
TypeScript contracts. Strict Node24 TypeScript includes tools/agent/skill packages;
the dependency matrix permits tools→model, agent→tools/skill and skill→itself,
with no provider, network, renderer, app or storage imports in these packages.

Tool requests contain semantic data only:

- `get_project`: paged allowed-slide metadata, without content or theme state.
- `get_slide`: paged element content from an allowed slide.
- `get_selected_elements`: caller-bound selection, never an implicit whole deck.
- `edit_content`: one atomic batch of existing text-run, chart-data or table-row
  changes using an observed engine revision and a trusted call identifier.

Read projections allowlist IDs/kinds, protected/hidden/editability state and text/
chart/table content. They exclude coordinates, resolved fonts/colours/theme tokens,
media URLs, semantic/compiler internals and caller credentials. Document wording
remains user content; this is structural exclusion of machine configuration, not
redaction of arbitrary words that happen to name a colour or font.

Text edits address existing paragraph/run indices and replace wording only; run
and paragraph formatting stays intact. Multiple different runs of one element
are merged into one text command, and duplicate writes to the same run/data target
refuse. Chart and table operations reuse native canonical commands and validation. Table
updates retain the existing row and column counts because cell structure owns
resolved layout. Success results have tool-discriminated exact nested contracts;
unknown renderer/credential fields are rejected by their result schemas.
Geometry, styling, untouched content, tombstones and detached state are preserved
in the authoritative scene. Existing mixed-run SVG styling differs from native
PPTX and is registered separately in the roadmap; this is not a pixel-parity claim.
The canonical command currently marks explicitly edited content as human-owned;
the envelope/log actor remains agent. This keeps the existing regeneration contract
and does not introduce a new ownership policy. Undo/redo belongs to the same live
engine; no extra document, persistent undo or saved-project mutation is introduced.

Foreign-owner reads/writes fail before inspecting the handle. Target grants and
read scope both apply. Locked/hidden targets and their ancestors refuse. The
engine remains final revision/command/result authority: concurrent edits cannot
both commit the same base revision; failed batches leave scenes/history unchanged.
Existing duplicate-envelope semantics are retained, without durable idempotency
claims. Session call/input/output budgets are trusted configuration; output-size
refusal for a mutation acknowledgement happens before engine submission. Input
copying rejects executable accessors, cycles, functions, unsafe keys, sparse arrays,
nonfinite numbers, excessive depth/nodes/characters and extra schema fields.
Errors use bounded static messages and do not echo payloads or raw exceptions.

`packages/skill/sections.ts` holds core invariant policy and separate inspection/
content-editing sections. `packages/agent/context.ts` obtains context only through
read-only scoped queries. Policy is a system message; the request and projected
content are encoded user data. Only the effective scope's tool catalog and skill
section are included. The composer includes policy, tool schemas, request and data
in a deterministic character budget, with an explicitly approximate chars/4 token
estimate. Oversized or refused context returns an error, not silent truncation.
Revision changes between reads or immediately after the final read refuse mixed
context. This module does not invoke a provider or execute edits while composing.

No Assistant UI, model adapter, autonomous run loop, durable job/store, provider
credentials, research/search integration, deployment or migration is shipped here.
Later integration must bind fresh trusted scope and preserve these authority and
revision boundaries; its work is recorded only in the roadmap.

<a id="v2-8b-durable-run-core-implementation-under-review"></a>

## V2-8B durable run core

`packages/agent/runtime.ts` injects a `RuntimeBackend`, with no storage or network
imports. `run-state.ts` is the named Node/AJV schema-loading boundary. Run plans,
records and receipts have exact schemas/generated types; drift tests also compare
the embedded tool contract to the canonical request schema. Plans reject executable
objects and exceedances before schema work. Grants and scripted semantic steps are
immutable under a project-scoped request identity; replay with different content
refuses. Persisted digests are checked again when loading. Model arguments contain
no owner, project, lease or privilege override. Scope is a trusted application grant.

`src/agent/index.js` resolves the existing backend. `npm run agent-run -- start
--project ID --owner OWNER --plan FILE` persists a plan and exits. `work --project ID
--owner OWNER --run RUN_ID` claims and executes at most 64 steps, renewing its lease
between steps; `status` and `cancel` use the same shared core. Omit owner for an
ownerless local project. These are trusted operator entrypoints, not a new public
HTTP authentication mechanism. A future transport must derive authority from its
session. No browser connection or SSE lifetime owns the worker. No provider runs
inside the database transaction and no worker automatically starts on server boot.

Runs persist version, plan, cursor, expected durable project revision, attempts,
failures, absolute deadline, status, monotonic fence and current worker lease.
Queued → running → succeeded/failed/cancelled/expired; expired leases can be claimed
with a larger fence. The DB clock owns deadlines and lease comparisons. A separate
transaction reserves an attempt before a tool executes. A crash after reservation
consumes that attempt; restart does not reset budgets. A live pending reservation
cannot be executed by a second concurrent advance. Takeover invalidates it and
reserves another attempt. A bounded plan has at most 64 steps/attempts, 16 allowed
failures, 24-hour initial deadline and a 65,536-character JSON input budget; records cap at
131,072 characters and each exact-schema receipt at 2,048 characters. Per-tool input/output limits still
apply. Receipts contain result codes, changed flag and revisions, not read contents,
raw scenes, prompts or credentials. The script/cursor/receipts suffice for recovery;
this is not persistence of a conversational model transcript.

Both store adapters provide a host-only transaction seam. SQLite uses its existing
FIFO lane and BEGIN IMMEDIATE. PostgreSQL uses FOR UPDATE on the project before
any run mutation, including cancel/claim/renew; cold DDL uses a separate advisory
lock. Additive tables initialize only on explicit runtime invocation. Runs reference
the project; receipts reference the run, both with ON DELETE CASCADE. Authorization
is exact owner matching, including null local owner; admin override is absent here.
Every operation rechecks project existence, ownership and schema. The run remains
bound to its original owner. It cannot outlive or become a retained copy of a deck.

Each effect loads the current canonical scene into a fresh command engine and
executes the existing scoped tools. The engine starts at revision zero for that
transaction. Tool baseRevision is an engine revision; the run independently compares
its expected saved project revision before touching the scene. Run revision counts
control/checkpoint changes. There is no automatic rebase across a human save.
The engine's ownership flags, locks, command validation and human-preservation rules
remain final. Project metadata stays unchanged; only canonical result scenes enter
the shared project validator. Project payload + existing history/pruning + receipt
+ run cursor commit in one transaction, with a final DB-time lease/deadline guard.
A guard failure rolls back all effects while retaining the prior attempt reservation.
Reads, refusals and noops record receipts without inventing project history.

Cancellation orders against commits through the project lock. If cancel commits
first, a later worker cannot edit. If the edit commits first, it stays committed and
cancel prevents subsequent steps. A completed run stays completed. A process killed
before receipt commit leaves no project/history effect; killed after commit resumes
at the next cursor. Stored checkpoint/receipt corruption fails closed. Session undo
is unchanged and does not survive this worker. Durable project history supplies
restoration. The core supplies exactly-once committed database edit receipts only;
it makes no claim about arbitrary future network/provider side effects.

No live provider, Assistant UI, public run route, search, new composition, persistent
undo, framework adoption, production migration or deployment is part of this slice.
Exact source1fb39ff is [independently accepted](reviews/V2-8B-1fb39ff.md).
Validation, retained limitations and cleanup are indexed by state/[evaluation](V2-8B-EVAL.md).


<a id="v2-8c-provider-exchange-boundary-implementation-under-review"></a>

## V2-8C provider exchange boundary

Source `e41d509c20fca21a70b9a0c587ccb83684aee7e6` is independently
[accepted](reviews/V2-8C-e41d509.json) for this bounded exchange contract.
[The evaluation](V2-8C-EVAL.md) records execution, inspection and limitations.

`packages/agent/provider.ts` defines the typed ModelProvider, explicit capability
profile, bounded request preparation and normalized response/tool validation.
`src/agent/model-provider.js` owns injected credentials and Node fetch, separately
from deterministic context, commands and project transactions. OpenAI-compatible
Chat Completions and Anthropic Messages use different system/tool/auth/usage wire
mappings and return one provider-neutral proposal. The caller supplies configured
model/capabilities; there is no model-name inference or app/default routing change.

Requests consume composeInstructions output and its scoped tool catalog. Policy
and semantic context remain distinct from credentials, authority and scene layout.
Responses are bounded JSON, with explicit truncation/refusal/text/tool outcomes;
all tool IDs/names/arguments and edit base revisions validate before proposals
return. The actual command engine/runtime still enforces scope, locks, ownership
and stale durable revisions. Provider calls do not run inside project transactions.
Transport limits cover headers/body and cancellation, reject credential-bearing
URLs/redirects, never automatically retry and return sanitized diagnostics.

Only text/client-tool exchange is implemented. Structured output, reasoning,
vision, files and streaming are explicit unsupported features; there is no live
provider loop, conversation persistence, Assistant UI, public transport, new key
storage, search or provider qualification claim. Protocol fixtures exercise actual
HTTP and canonical persistence on both backends. Current review/evidence is in
[the evaluation](V2-8C-EVAL.md) and development-state.json.

Normalized usage inputTokens includes reported cached input once. Anthropic's
uncached/cache-read/cache-write fields are summed; Chat Completions prompt_tokens
is already inclusive and its cache details remain breakdowns. Missing usage stays
null and unavailable cache breakdowns are omitted. Invalid counters refuse; the
transport does not enable or configure prompt caching.


<a id="v2-8d-provider-backed-run-preparation-implementation-under-review"></a>
<a id="v2-8d-provider-backed-run-preparation"></a>

## V2-8D provider-backed run preparation

`packages/agent/provider-run.ts` supplies `createProviderRunner(backend, provider)`;
`src/agent/index.js` resolves the configured project backend for trusted callers.
The strict generated request contract reuses the run scope and canonical read
queries. Sanitization rejects executable objects before ordinary-JSON conversion
for AJV object uniqueness comparisons. No framework, transport route, credential
configuration or provider default is added.

`prepare` copies the trusted binding/request before any await, acquires an exact-
owner/current-revision snapshot in a short local transaction, then builds scoped
semantic context through accepted tools. One bounded provider attempt executes
outside transactions. Normalized requests still cross canonical validation. Text,
refusal and bounded read results create no run or project-row mutation. The
backend may initialize the already accepted runtime tables on explicit invocation;
no new schema or journal is introduced. Edit calls at one engine
revision merge into one batch (maximum32 edits); mixed read/edit output, duplicate
writes, protected/foreign targets and invalid structures refuse atomically through
the actual local command engine. Fresh durable revision checks invalidate stale
results. Engine revision starts at0 independently of the stored project revision.

An edit proposal exposes an immutable semantic preview and summary. Its object
identity maps weakly to a private cloned binding/plan; copied objects, other runner
instances and added caller fields cannot rebind authority. `enqueue` uses that exact
host proposal, the existing run request/digest identity and commit-time deadline/
cancellation guards. Concurrent repeats return the same run; conflicting plans
refuse. Queueing reports queued, never completed editing. Existing worker/CLI
claim/advance/status/cancel owns execution, atomic project/history receipts and
cross-process recovery. Proposed reads/edits never execute on a second durable
project document.

Requests cap JSON at65536 characters, user text at16000, context at100000 and
normalized results/previews at65536. Configured provider output limits remain
binding. The absolute deadline is at most24hours; an individual network attempt
also caps at120seconds and does not retry. Queued plans contain one atomic batch,
8reserved-attempt allowance and1failure allowance. Ephemeral proposals expire and
cannot be recovered after host restart; queued runs retain accepted recovery.
No prompt, raw response, credential, transcript or new journal/table is stored.
An explicit new preparation may call the provider again; no network exactly-once
or conversational runtime claim is made. Exact source8c1e5c4 is independently
[accepted](reviews/V2-8D-8c1e5c4.json). [The evaluation](V2-8D-EVAL.md) and state
index validation/review; later scope lives in the roadmap.


## V2-8E bounded tool-conversation preparation

The existing provider runner now offers `converse` beside unchanged single-exchange
`prepare`. Its generated request reuses the accepted scope/read contract and adds
explicit exchange, tool-call and aggregate reserved-output limits. One ephemeral
worker invocation executes scoped canonical reads and continues with validated,
correlated read rounds. Adapters translate these rounds to assistant/tool messages
or adjacent assistant/tool_result blocks. Result schemas exclude geometry/styling;
policy and grants remain application-owned. Each actual serialized wire request
includes accumulated history in its context-budget check.

The loop shares accepted snapshot, normalized-response validation, preflight and
queue authority. It checks owner/revision between exchanges/read groups, stops on
refused reads, duplicate IDs, mixed read/edit output or exhausted bounds, and makes
no automatic retry. The internal tool-session allowance separately covers initial
context reads and final preflight. Full per-call output allowances are reserved
before network I/O with no refund; absent/failed usage remains unknown.

A whole-invocation 120-second/deadline guard starts before the first await. Its
lifetime is separate from the trusted proposal deadline. Late async work checks
cancellation before another provider call. Bounded trace metadata is attached
before an edit proposal is frozen and registered in the existing private WeakMap.
Arguments, content, raw IDs, responses, prompt text and keys are absent from trace.
Pending measurements may be null rather than falsely reported as zero.

Terminal text/refusal or a canonical atomic edit proposal ends preparation. Only
explicit existing enqueue persists the semantic plan; existing workers/history own
execution/recovery. No durable transcript, new schema/table, public route, UI or
provider-default/configuration change is introduced. Conversations/proposals are
host-instance ephemeral; queued runs retain accepted durability. This is not the
hosted cross-request approval contract or live provider/content qualification.
Exact source `c71d65e` is [independently accepted](reviews/V2-8E-c71d65e.json).
[Evaluation](V2-8E-EVAL.md) and state index complete validation, independent
execution and preserved limitations; future work remains only in the roadmap.


<a id="v2-8f-shared-search-boundary-implementation-under-review"></a>

## V2-8F shared search boundary

`packages/agent/search.ts` defines SearchProvider separately from ModelProvider;
`src/agent/search-provider.js` supplies the SearXNG implementation and
`src/agent/search-sources.js` owns Node/schema/HTML/hash normalization. The pure
agent contract reaches SourceRef types through the existing tools facade; the
accepted package dependency matrix remains unchanged. The host owns
project binding and backend configuration. Strict generated SearchRequest arguments
contain only query, result/diversity counts, language and optional time range.
The adapter posts form data to the configured /search JSON endpoint; project
identity and result/output budgets remain local. No legacy pipeline or public
surface is automatically rewired, and no new model-tool catalog entry is exposed.

Ranked candidates normalize to existing SourceRef objects: plain text title/excerpt,
HTTP(S) URL, optional publication and retrieval/provenance metadata. Script/style /
template/embedded markup is removed without page fetching or execution. URL
credentials and non-HTTP(S) schemes refuse; fragments are removed for page-level
deduplication, while query semantics remain intact. Duplicate canonical URLs and
per-host limits preserve first-ranked eligible results. Malformed rows, partial
upstream results and result-limit truncation have explicit bounded warning codes.
Malformed envelopes refuse rather than appearing as successful empty searches.

Citation IDs hash a versioned tuple of project identity, normalized URL, title,
excerpt and publication value. Query, rank, backend identity and retrieval timestamp
are excluded: identical bounded citation content keeps its identity across search
requests, while content/project changes mint another ID. This is a snippet identity,
not a full-page integrity or freshness claim. Source objects/results are frozen;
there is no new source persistence or transcript journal.

The operator-configured endpoint accepts HTTPS or loopback HTTP, no URL userinfo,
query or fragment. Redirects are rejected. One operation bounds header/body time,
UTF-8 response bytes and complete serialized normalized output, with no retry.
Cancellation/timeout fences late fetches and body reads, including non-cooperating
injected transports. Monotonic deadline checks and periodic event-loop yielding
prevent immediately resolved empty chunks from starving timers or caller aborts.
Response storage uses one fixed-size byte buffer, and cancellation is requested
before the reader lock is released on self-detected or timer-driven expiry.
Visible block/BR boundaries remain spaces while inline word fragments stay joined. Failure messages contain no raw upstream body, endpoint or
credentials. Snippets remain untrusted data, not instructions or HTML to render.

Exact source `0cab854` is [independently accepted](reviews/V2-8F-0cab854.json).
[The evaluation](V2-8F-EVAL.md) and state index complete validation, independent
execution, preservation and limitations. [The roadmap](ROADMAP.md#v2-8-remaining) owns
later tool/source/Assistant scope and the separate hosted approval-lifetime seam.


## V2-8G model response stream bounds

Exact implementation `f3e784a` retains both accepted model protocols and existing
configuration, tool normalization, usage, privacy and no-retry contracts. The Node
adapter now reads into one fixed response-byte buffer; monotonic whole-attempt
checks and periodic event-loop yielding bound immediately resolved empty reads.
It fences late header/body results and requests cancellation before releasing the
reader on expiry/abort. This is a transport correction, not model streaming output,
new provider capability, conversation persistence or framework adoption.
[Evaluation](V2-8G-EVAL.md) records failed probes, unchanged assertions, complete
224-file validation and current native/visual/resource observations. Exact source
`f3e784a` is [independently accepted](reviews/V2-8G-f3e784a.json); 668 independent
executions and retained-image inspection found no blocking issue. No live-model
quality or process peak-memory claim follows from these bounded fixture checks.

## V2-8H durable visible conversations and approval

Implemented boundary, **independently accepted at `22e7c97`** in
[the exact-source decision](reviews/V2-8H-22e7c97.json).
`packages/agent/turns.ts` is backend-injected; `src/agent/index.js:turnService`
selects the existing project store. `agent-chat` exposes read/export, submit,
prepare, decide, cancel and clear to trusted local operators. It adds no HTTP route
or Assistant UI itself. The separately accepted I1 lifecycle transport derives
owner/project binding from its session; JSON never supplies authority. Future
worker/provider and Assistant integration is tracked
in [the roadmap](ROADMAP.md#v2-8-remaining).

The project owns conversation/header, turn, proposal and attempt child tables in
both backends. SQLite serializes through `BEGIN IMMEDIATE`; PostgreSQL uses the
existing project row lock. Header version 1 fixes a server-issued generation,
conversation revision and seven cumulative safe-integer counters. Visible request/
reply and trusted preparation inputs occupy private payloads; canonical pending
plans are stored separately from operational metadata. Both budgets are 4 MiB per
project; simultaneous count/record limits and final-result reservations are in
`turn-state.ts` and the [approved contract](V2-8H-EVAL.md). Schemas own runtime
validation and generated TypeScript types. Serialized UTF-8 bounds include JSON
escaping and multibyte text, with matching save/load bounds.

Every public entry snapshots validated host owner/project fields synchronously
before any await. All later transaction jobs, run lookups/queue calls and provider
callbacks capture that private copy, so reusing a caller-owned binding cannot switch
project identity after authorization.

Submission requires the current generation and conversation revision. It deduplicates
an immutable request identity within that generation; one submitted/preparing/
awaiting-decision turn is admitted per project. Every new turn binds a saved project
revision. Preparation claims a monotonically fenced, expiring 30-second lease;
active calls renew it every ten seconds without extending the immutable 120-second
preparation deadline. It freezes a separate 20-minute canonical plan deadline at
submission. The provider runner's host-only bridge reserves metadata/output allowance,
commits a dispatch marker before each call, settles validated exchange usage before
later tool/publication refusal, and passes internally validated plans directly to
storage. Model/request arguments cannot install the bridge. Default `prepare`,
`converse` and exact-object WeakMap `enqueue` retain their existing contracts.

`run-transaction.ts` contains internal queue/lookup/cancel primitives shared with the
public run wrapper. Approval reads the stored plan and verifies its digest, scope,
saved revision, explicit generation and expected revisions. It records one decision
and queues one existing run inside the same project transaction. One composed
pre-commit guard rechecks database-time approval/plan expiry. Identical committed
decision replay precedes fresh revision/expiry checks; a changed decision identity
conflicts. Run cursors/receipts remain authoritative. No second edit queue, scene,
command engine, persisted undo stack or provider-session authority is introduced.

Only a turn with **no prior dispatched exchange** can resume preparation after lease
loss. Old reservations remain counted, with per-fence exchange sequencing and total
per-turn attempt/output limits. After any dispatch, lost volatile continuation
requires explicit user action; prior hidden history/read results are never rebuilt.
A response whose entire canonical exchange fails the inherited provider boundary
has no validated receipt and remains conservatively unknown. Accepted exchanges
settle usage before subsequent session/tool/admission failures. This does not infer
zero cost or exactly-once provider billing from an ambiguous network attempt.

Owner-authorized reads/exports reconcile logical expiry under the project lock.
Clear increments generation, cancels linked nonterminal runs atomically, removes all
visible/private conversation and duplicate proposal bodies, and keeps already
committed scenes/history/run records under their existing policy. Up to 128 bounded
content-free settlement slots can survive across generations. Known receipts settle
once; deadline-unknown receipts compact into fixed counters and release their slot.
A late receipt cannot revive a cleared turn or change an already compacted outcome.
No raw provider transcript, instruction/context body, read result or hidden reasoning
is persisted. Visible free text may itself be sensitive; existing project access and
storage protections apply, without a new encryption or secure-erasure guarantee.


## V2-8I-1 authenticated lifecycle transport

The independently accepted [I1 transport](reviews/V2-8I-1-5170adc.json) supplies
five thin authenticated HTTP operations over the H service: read, export, stored
decision, cancel and clear. It keeps owner-only chat authority even when project
CRUD grants an administrator bypass. Its bounded private JSON parser and late
raw-path error boundary sanitize failures that precede route execution. H retains
revision, replay, queue, cancellation and clear authority; session revocation is
resolved per request. No public submission, preparation, execution or worker loop
is introduced. The [main architecture](ARCHITECTURE.md#v2-8i-1-authenticated-conversation-lifecycle-transport)
records the transport as built; future integration remains only in the roadmap.
