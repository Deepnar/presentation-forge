# V2-8 AI architecture gap audit

2026-10-22 · **inspection and planning only; no implementation acceptance**.
Entry checkout `ee52b50bac2ce5704eda39a89ae959259497f331`, branch `v2`.
Accepted source remains `0cab854bce04b862060829812a9ab6ff0b765fd9` through the
[V2-8F independent decision](reviews/V2-8F-0cab854.json). Read-only Git comparison
found no product/test/tooling/schema delta between those commits. The three
pre-existing untracked paths were preserved. No accepted state or evidence changed.

Future work, priority, dependencies and authorization live only in
[the audit follow-up registry](ROADMAP.md#v2-8-audit-followups). Interfaces below
are proposals, not as-built contracts. No recommendation authorizes implementation.

## Assessment

**Keep the Forge-native runtime. No framework migration is justified by this
inspection.** V2-8A–F already establish canonical tools, scoped semantic context,
two bounded provider protocols, revision-safe persisted edits, fenced leases and
recovery, an ephemeral tool-conversation loop, and provider-independent web search.
Replacing these would reopen accepted correctness and authority boundaries.

The first Assistant is blocked by integration contracts, not an absent agent loop:
durable user turns and approval ownership, authenticated orchestration, safe editor
save/conflict coordination, and explicit tool coverage. The current loop edits
existing text/chart/table content; it cannot yet satisfy the parent promise of
researching and creating a deck conversationally. That promise remains distinct
from an existing-deck editing Assistant and needs an explicit surface decision.

Most headline gaps were already acknowledged in the roadmap. This audit makes
previously underspecified controls concrete: durable admission for provider costs,
proposal rejection/expiry/races, retention/deletion rules, source-reference integrity,
versioned tracing, and bounded visual inspection. These are not retroactive defects
in the deliberately smaller accepted slices.

A source-inspected transport resource concern also remains: the model adapter uses
a timer-only read loop and retains a chunk array, unlike the corrected search
adapter. **No failure was reproduced during this audit.** It requires future bounded
validation under the [existing transport item](ROADMAP.md#model-provider-stream-resource-bounds).

## Evidence and classification

**Implemented** means confirmed in inspected source; **Planned** means explicitly
in the entry roadmap, without implying code; **Partially implemented** means only
some required parts exist. **Missing at entry** means absent from inspected V2
source and not concretely specified in the entry roadmap; this audit registers a
proposal, without claiming an exhaustive absence proof across every legacy path.
**Requires validation** means inspection cannot establish behavior or quality.
Historical tests/evaluations below were read, never reexecuted.

| Capability | Classification at entry | Evidence and practical boundary |
|---|---|---|
| Scoped semantic reads and content tools | Implemented | [Tool session](../packages/tools/session.ts#L93), [request schema](../packages/tools/request.schema.json#L4): three reads plus `edit_content`; no generic command/scene escape. [8A tool tests](../test/v2-tools-8a.test.js). |
| Ownership, locks, revisions, human preservation | Implemented | [Tool checks and batch](../packages/tools/session.ts#L149), [runtime commit path](../packages/agent/runtime.ts#L397), [preservation tests](../test/v2-preservation.test.js). Engine revisions and saved project revisions differ. |
| Durable plans, receipts, leases, takeover, cancellation | Implemented | [Runtime](../packages/agent/runtime.ts#L228), [run/receipt tables](../src/agent/schema.js#L1), [process contract](../test/v2-runtime-process-contract.js). Applies to queued canonical plans, not provider turns. |
| SQLite / PostgreSQL shared authority | Implemented | [SQLite transaction](../src/projects/store.js#L711), [PostgreSQL project lock](../src/projects/store-postgres.js#L725); [8B evaluation](V2-8B-EVAL.md). Multi-instance edit fencing exists. |
| Provider-independent bounded exchanges | Implemented | [Profile and normalization](../packages/agent/provider.ts#L7), [HTTP adapter](../src/agent/model-provider.js#L4), [8C tests](../test/v2-provider-8c.test.js). Two protocols, not qualification of every advertised vendor/model. |
| Tool conversations within one invocation | Implemented | [Loop](../packages/agent/provider-run.ts#L134), [whole-invocation guard](../packages/agent/provider-run.ts#L253), [8E tests](../test/v2-conversation-8e.test.js). Up to eight exchanges; no automatic retry. |
| Durable user-turn history / cross-request continuity | Planned | [Parent](ROADMAP.md#v2-8-remaining); [history starts empty](../packages/agent/provider-run.ts#L279). Legacy [browser-local chats](../app/web/src/lib/chats.js#L73) are not a V2 server conversation store. |
| Proposal preview and expiry | Partially implemented | [Proposal registration](../packages/agent/provider-run.ts#L219), [exact-object enqueue](../packages/agent/provider-run.ts#L284): WeakMap capability, deadline, preflight and stale checks exist; no durable approval/rejection lifecycle. |
| Hosted approval, restart-safe turn recovery | Planned | [Explicit 8D lifetime seam](ROADMAP.md#v2-8d-provider-run-preparation). A copied proposal or another host cannot enqueue it; queued plans do recover. |
| Public Assistant authentication and request admission | Partially implemented | Existing [project owner resolution](../app/server/v2-projects-routes.js#L28); [runner binding](../packages/agent/provider-run.ts#L54) is trusted internal input. No Assistant HTTP binding, turn API or distributed provider-attempt admission exists in inspected V2 paths. |
| Context budgets and compaction | Partially implemented | [Composer](../packages/agent/context.ts#L18), [actual wire-size checks](../packages/agent/provider.ts#L114): scoped paging, refusals and approximate tokens. No durable summary/memory compaction contract. |
| General web search and stable source IDs | Implemented | [SearchProvider](../packages/agent/search.ts#L4), [normalization](../src/agent/search-sources.js#L62), [8F tests](../test/v2-search-8f.test.js). Immutable project/snippet identity and deterministic URL/host selection; no full-page integrity guarantee. |
| Canonical model `web_search` integration | Planned | [Parent](ROADMAP.md#v2-8-remaining). [Provider catalog allowlist](../packages/agent/provider.ts#L125) and [receipt tool enum](../packages/agent/receipt.schema.json#L11) still admit only four content tools. Wiring requires coordinated canonical schemas/results/budgets, not a catalog-only addition. |
| Academic search | Partially implemented | Legacy [arXiv/Crossref search](../src/papers.js#L80) exists; scoped V2 `paper_search` is [planned](ROADMAP.md#v2-8-remaining), not implemented by that legacy function. |
| Project-document / slide retrieval | Planned | Scoped slide reads exist; normalized `project_search` and file ingestion/index lifecycle remain in [V2-8/V2-9](ROADMAP.md#v2-8-remaining). No V2 vector index was found. |
| Citations and source-to-slide attribution | Partially implemented | [SourceRef](../packages/model/source.schema.json#L5), [slide refs](../packages/model/intent.schema.json#L66), [block ref collection](../packages/model/semantics.ts#L61) exist. No V2 source registry/resolver or end-to-end scene/export citation tool was found. Legacy [source-mapped references](ROADMAP.md#legacy-source-mapped-references) do not supply that registry. |
| Citation verification / unsupported claims | Missing at entry | No inspected V2 policy verifies source existence, ownership, locator support and claim entailment together. A valid ID/URL does not prove a claim. Registered under [source integrity](ROADMAP.md#assistant-search-source-integrity); semantic accuracy requires future validation. |
| Shared retrieval cache lifecycle | Missing at entry | No V2 query/result cache with ownership, TTL, source version and deletion invalidation was found. Optional [retrieval follow-up](ROADMAP.md#assistant-retrieval-scale); not a prerequisite for small bounded searches. |
| Semantic creation / regeneration tools | Partially implemented | [Compiler](../packages/compiler/compile.js#L245) and [preserving recompile](../packages/compiler/compile.js#L259) exist. Canonical model tools only edit existing objects; [creation contract](ROADMAP.md#assistant-semantic-creation) is needed for full topic-to-deck behavior. |
| Deterministic quality checks / agent visual feedback | Partially implemented | [Quality analysis](../packages/compiler/quality.ts#L346), [scene geometry](../packages/core/scene-quality.ts#L76) exist; no agent render/inspection tool. Geometry validity deliberately does not classify overlap or prove text fit after every content edit. |
| Vision, files, streaming, structured modes | Planned | [Capabilities explicitly refuse](../packages/agent/provider.ts#L49) all except tool calling. No silent vision fallback or inferred support from a model name. [Visual contract](ROADMAP.md#assistant-visual-feedback) remains proposed. |
| Error recovery / budget exhaustion | Partially implemented | [Static error codes](../packages/agent/provider-run.ts#L12), [bounded loop admission](../packages/agent/provider-run.ts#L137), leases/attempts exist. No cross-turn bounded repair/retry policy or account-wide spend admission. |
| Metadata trace and accounting | Partially implemented | [ConversationTrace](../packages/agent/provider-run.ts#L82), [usage aggregation](../packages/agent/provider-run.ts#L191), durable receipts. No durable exchange ledger with instruction/catalog/configuration versions and price provenance. [Trace/budget contract](ROADMAP.md#assistant-trace-budget) proposed. |
| Parallel reads / multi-agent orchestration | Planned, intentionally deferred | Existing [read loop is sequential](../packages/agent/provider-run.ts#L226); [parent](ROADMAP.md#v2-8-remaining) keeps delegation disabled pending measured need. No demonstrated workload justifies more agents. |
| External-effect exactly-once execution | Planned | [Parent carve-out](ROADMAP.md#v2-8-remaining). Database receipt atomicity is not exactly-once provider billing, export delivery or remote calls. |
| Prompt-injection resistance and live quality | Requires validation | [Core policy](../packages/skill/sections.ts#L1), canonical validation and scoped tools provide structural controls; [hostile-content test](../test/v2-context-8a.test.js#L23) is historical deterministic evidence, not proof that real models always resist instructions in data. |
| Native editability / human-rated slide quality | Implemented / Requires validation | Existing native export and preservation are accepted; [8F decision](reviews/V2-8F-0cab854.md) retains native shape-ID and SVG/narrow limitations. Interactive PowerPoint and live Assistant quality remain unexecuted. |

## Framework decision

This is an architectural fit assessment using local source and retained guidance,
not a current-version feature or licensing qualification. No framework documentation
was fetched, package installed or prototype executed. Exact supported APIs, current
features and migration compatibility **require future validation** if adoption is
reconsidered. The candidate roles below do not assert a particular SDK version.

| Candidate / problem considered | Genuinely missing? Duplication? | State and migration risk | Smaller Forge alternative | Decision |
|---|---|---|---|---|
| LangGraph: explicit graph transitions, checkpoint/interrupt orchestration | Durable user-turn/approval coordination is missing; durable edit execution already exists. | A graph checkpointer owning edit progress would duplicate run state. A graph can remain stateless, but mapping its interruptions/retries to fences, revisions and approvals still needs a contract. | A small turn/approval state machine over the existing backend; invoke the accepted queue/runtime only at the approval transition. | No adoption now. Reconsider only if measured branching/checkpoint complexity makes that module inadequate. |
| LangChain: provider/tool/retrieval composition utilities | Accepted provider adapters, canonical schemas and bounded loops already cover current editing needs; later ingestion adapters remain. | Stateless utilities need not add workflow state. Agent/memory wrappers could; replacement schemas, implicit retries and broad document context could weaken accepted guarantees. | Add only the missing scoped adapter/tool to the existing catalog and runner. | No migration. A narrowly justified stateless utility could be reviewed later. |
| LlamaIndex: ingestion/retrieval/index abstractions | V2 project-document retrieval is genuinely unfinished; small web searches do not need an indexing framework. | An index may be derived data, never project/source authority. Wrong ACL, deletion, source-ID or chunk-version mapping would leak or misattribute content. | Parse → stable source/version → bounded chunks → lexical retrieval with locators; measure retrieval first. | Later, conditional on V2-9 corpus and measured retrieval quality/maintenance needs. |
| Lightweight custom state machine | User-turn/proposal/approval lifecycle really is missing. | One new orchestration record is legitimate; a second scene, queue or independent committed-edit cursor is not. Races and privacy policy still need design. | Extend Forge with explicit transitions, compare-and-swap and existing run IDs. | Recommended minimal addition after retention/approval direction. |
| Existing Forge-native runtime | Correct edit authority, recovery and provider independence are already present. | Keeping it avoids migration risk, but cannot make missing conversation/search/UI contracts disappear. | Compose accepted modules behind thin authenticated adapters. | Recommended base now. |

AI SDK/Eve are also unnecessary migrations for this established non-Eve stack.
A provider SDK might reduce future wire maintenance; it would not resolve project
ownership, proposal policy, source integrity or editor save races. Neither a new
SDK nor an orchestration framework supplies permission to persist private content.
No replacement is selected here.

## Critical seams and minimum durable state

The [turn/approval proposal](ROADMAP.md#assistant-turn-approval-contract) should
keep the project store authoritative and persist only what the promised experience
requires. Recommended conceptual records, subject to a human data-policy decision:

- **Conversation / user turn:** project and authenticated owner binding, conversation
  ID, turn ID and revision, caller request key, base project revision, bounded
  user-visible request/result or protected content reference, parent turn, state,
  cancellation generation, deadlines, created/updated times and retention-policy
  version. A digest alone cannot recover a lost user request. Summaries are optional
  derived hints with provenance, never authority or instructions.
- **Proposal / decision:** opaque ID, immutable canonical semantic plan or secure
  reference plus digest, originating turn, owner/project, expected saved revision,
  expiry, state, decision actor/time and linked existing run ID. Suggested transitions:
  pending → queued/rejected/expired/cancelled/superseded; queued references the run's
  terminal outcome. Approve+enqueue and replay resolution must be atomic.
- **Provider attempt / admission:** turn/attempt IDs, fence, reserved limits,
  status, provider/configuration/instruction/catalog digests, measured/unknown
  usage, sanitized error and timestamps. A crash after dispatch can have unknown
  billing; never report it as zero or automatically repeat it without policy.

These records must not persist hidden reasoning, raw provider responses, credentials,
full read results or deck copies by default. Existing queued semantic plans already
contain edited content: “no raw transcript” does not mean “no private data stored.”
Define content retention, encryption/access needs, deletion/export handling and
expiry values before adding storage. Project deletion must cascade new children and
invalidate derived indexes/caches. Hosted approval cannot rely on a process WeakMap,
a client-supplied owner, or a stateless token containing an unverified edit plan.

Derive identity from the authenticated request, not model arguments. Recheck owner,
project revision, expiry and cancellation at approval and existing run boundaries.
Two tabs/hosts approving concurrently must converge on one run. Reject/approve,
cancel/commit, ownership changes and process crashes need explicit ordering tests.
Do not hold a project transaction open across provider, search, rendering or human
approval waits. Never automatically rebase a stale proposal.
The current `enqueue` accepts only the exact in-memory capability; restoring JSON
must not weaken that check. A durable adapter needs a separately reviewed host-only
transactional queue seam. Do not nest public `start`/`enqueue` transactions inside
a proposal transaction and assume atomic composition already exists.

The editor must settle or explicitly handle pending drafts/saves before capturing
the server revision, and refresh/conflict-check before displaying a queued result.
The server's saved-revision check alone cannot protect an unsaved browser draft.
Session undo and durable history restoration remain distinct. These UX choices
require the [Assistant surface contract](ROADMAP.md#assistant-surface-integration).

## Proposed boundaries and flow

Names are illustrative, not new files/APIs or permission to widen the package graph.
Detailed work ownership stays in the linked roadmap entries.

| Boundary | Proposed contract / responsibility |
|---|---|
| Authenticated transport | Thin submit/read/decide/cancel adapters derive principal and project access; return opaque IDs and bounded status. CLI uses the same domain service with explicit trusted operator binding. |
| Turn service | `submitTurn(binding, requestKey, baseRevision, input)` / `getTurn` / `cancelTurn`; own orchestration transitions, deadlines and admission, not scene mutations. |
| Proposal service | `decideProposal(binding, proposalId, expectedProposalRevision, decision)`; persist approval ordering and invoke existing runtime start atomically. Approval never grants wider targets. |
| Provider/context layer | Existing `converse` remains a bounded preparation primitive. Add versioned, scoped cross-turn context explicitly; preserve canonical schemas and actual wire-size checks. No unbounded chat log. |
| Source service | `searchSources(scope, query)` / `resolveSources(scope, ids)`; adapters for web, paper and project data; immutable sources, locators, dedup and reference validation. Trusted host owns external-search permission and query disclosure. |
| Semantic generation tools | Validated intent proposals → deterministic compiler → preserving canonical application; refuse unsupported composition/fit. No model scene/geometry/style patch or independent save. |
| Inspection service | Read-only revision-bound diagnostics/artifacts for authorized slides; renderer access lives in a host adapter. Keep renderer/network/storage imports out of pure agent modules. |
| Run core / editor | Existing runtime, project store, command engine and history remain sole committed-edit authority. |

One agent should perform bounded **inspect/research → semantic proposal → preflight →
explicit approval → canonical run → report/inspect** stages. Parallelize only
independent read-only work when a measured latency benefit justifies it, under one
snapshot/grant and aggregate budget; merge deterministically and discard stale
results. Writes stay sequential and revision-safe. No delegation now.

For tool errors, stop or permit a separately bounded repair with an actionable code;
never retry writes blindly. Provider retries must count every attempt and distinguish
pre-dispatch failure from ambiguous post-dispatch billing. Background provider
recovery, timeouts, cancellation after disconnect and user interruption must be owned
by durable turn state, not SSE/browser lifetime. Keep external-effect receipts
separate from existing database-edit exactly-once semantics.

## Search, retrieval and claim integrity

The V2-8F source ID hashes the project, normalized URL, bounded title/excerpt and
publication value; query, rank, backend and retrieval time do not change it.
A changed full page outside that snippet can retain the same ID. URLs are citations,
not an authorized page-fetch capability. Canonical URL dedup is not DOI/work-level
identity; future paper results need DOI/arXiv normalization without conflating versions.

Before research-backed generation, resolve every proposed source reference within
the authorized project, retain immutable evidence/locators and distinguish source
availability from claim support. Block unknown/foreign IDs and fabricated locators;
label unsupported/uncertain claims or ask for evidence. Numeric/string matching is
not entailment. A model verdict is not proof; human review and a labeled future
corpus must assess claim support. Source links must survive intent → scene → export
without inventing bibliography entries. Legacy grounding must not silently become
V2 authority.

Start with a conventional retrieval pipeline: parse approved project content, retain
source/version/locator, chunk deterministically, retrieve a bounded lexical candidate
set, optionally rerank. A vector database is **not justified now**: there is no
measured V2 corpus, recall problem or cross-project-safe ingestion lifecycle to
optimize. Embeddings, hybrid search and LlamaIndex remain conditional improvements,
with ACL/deletion propagation and a reproducible recall benchmark before adoption.

If caching is later useful, key by owner/project scope, query/options, source/corpus
version and backend-policy version; bound size/TTL, keep immutable source versions
and invalidate deletion/access changes. Public-web caching must not expose private
queries. Retention and freshness are policy decisions, not defaults to invent here.
Treat retrieved text, metadata and rendered document text as untrusted data. Markup
stripping and system-policy separation do not defeat semantic prompt injection;
canonical capabilities, source resolution and real adversarial qualification remain
necessary. General page fetching would require its own network/SSRF policy; it is
not authorized by returning an HTTP(S) search URL.

## Visual feedback proposal

Reuse existing renderers and deterministic findings. A future read-only
`inspect_slides`-style request should accept trusted project binding, observed
revision and a bounded slide-ID list. Return revision/hash-bound opaque artifact
references plus sanitized findings `{slideId, elementIds, code, severity, message}`.
Host limits cover slide count, pixels, bytes, render time, concurrency and artifact
expiry. URLs/artifacts require ownership checks; no arbitrary URL/file fetch.

Render only changed slides and necessary neighbors after commit, or render a
clearly labeled ephemeral preflight candidate before approval without persisting a
second authoritative scene. Include scene/theme/font/renderer fingerprints so an
old raster cannot validate a newer revision. A separately qualified vision-capable
provider may inspect those artifacts; current profiles explicitly reject vision.
Never send raw scene coordinates or theme tokens as model context.

Use deterministic fit/geometry/native assertions first. They cannot fully classify
clipping, intentional overlap or communicative quality. Bound optional vision repair
rounds, total images, tokens and time; report uncertainty. Vision suggestions remain
semantic proposals, with no authority to move locked furniture, discard human
formatting, reattach detached scenes or trigger an automatic redesign. Validate any
accepted change through the existing compiler/command/preservation path. Compare
raster and native objects/workbooks; a clean screenshot does not prove editability.
Full vision refinement is P2; honest fit/refusal behavior and preservation are P0.

## Observability and security

Reuse run IDs, receipt codes, actual provider/model identity, wire characters,
reserved output tokens, measured latency and nullable usage. Add a privacy-preserving
trace envelope only through the [trace/budget contract](ROADMAP.md#assistant-trace-budget):
turn/run/attempt correlation, instruction/skill/schema/catalog/configuration versions,
normalized result codes, revision transitions and pricing-version provenance.
Per-account concurrency/admission and durable reservation must precede dispatch;
per-invocation limits alone cannot cap parallel requests or uncertain retries.

OpenTelemetry-style parent/child spans are a useful vocabulary, not a reason to add
an exporter or external telemetry service. Default traces contain no request/result
bodies, excerpts, secrets or hidden reasoning. Debug captures need explicit policy,
access control and retention. Digests do not make low-entropy private content safe
to publish; use opaque versions or scoped keyed digests where appropriate.
Deterministic replay can cover accepted semantic plans against a matching snapshot
and engine versions; live model/network/vision output and billing are not replayable
from metadata alone. Store only approved fixture/redacted captures when exact
failure reconstruction is required. No telemetry dependency is selected.

| Threat | Existing control | Remaining architectural requirement |
|---|---|---|
| Tool manipulation / privilege escalation | Strict canonical schemas, trusted grants, no model owner/project/geometry fields | Extend every catalog/result/receipt boundary together; recheck grants on new tools. |
| Foreign project / malicious source | Exact-owner runtime transactions and scoped read projections | Authenticate turn/source/artifact endpoints, filter before retrieval, invalidate deleted/revoked indexes; no admin bypass inherited automatically. |
| Stale or replayed approval | In-memory exact-object capability, deadlines, plan digest and saved revision | Durable decision revision, immutable digest, reject/approve races and atomic one-run linkage across hosts. |
| Unbounded loops / corrupted response | Explicit exchange/tool/output/time bounds, canonical normalization | Qualify model-stream resource risk; durable cross-turn and account admission; stop on uncertainty. |
| Secret leakage / injected instructions | Credentials in transport closure, static errors, core policy separates data | Search-query egress policy, safe transcript/trace UI, source/citation integrity and future real-model adversarial tests. |
| External duplicate effects / forged audit | Atomic database edit receipts and plan digest | Separate external-effect keys/ambiguous outcomes; versioned restricted audit access. A digest is consistency evidence, not signed tamper-proof storage. |

<a id="future-evaluation-design"></a>

## Future evaluation design — not executed

The [qualification registry](ROADMAP.md#assistant-live-qualification) owns execution
approval. Deterministic offline tests and live-model qualification answer different
questions; historical HTTP fixtures do not establish real-model success.

| Scenario | Offline oracle / future live expected outcome |
|---|---|
| Natural-language text change | Exact targeted wording, observed revision and changed flag; no unrelated/run-format delta. Live model selects the correct existing paragraph/run. |
| Chart/table update | Exact numeric cells, series and table dimensions; one atomic batch; native cache/workbook agreement. Live model preserves units and labels. |
| Human formatting / selection | Exact styles/geometry, locks, tombstones, human additions and detached slides preserved; outside-selection writes refuse. |
| Multi-turn / approval | A follow-up resolves prior intent across requests; reload/other host can decide one immutable proposal; stale revision, expiry, rejection and duplicate approval never edit. |
| Research-backed creation | Both providers use the same Forge backend; only registered project sources/locators are cited, factual claims are supported or marked uncertain; deterministic compilation and native objects survive. |
| Errors / cancellation / restart | Malformed or refused tools produce actionable bounded results; cancellation fences later writes; crash recovery does not repeat committed edits or silently rebill unknown provider attempts. |
| Injection / privacy | Malicious page/document/slide text cannot widen grants, reveal private slide content, call unknown tools, invent sources or send credentials. Include indirect instruction and encoded content cases. |
| Quality / interoperability | Equivalent semantic outcomes for both protocols; changed-slide fit checks and human rating; report SVG/native differences and real consumer limitations separately. |

Suggested first live sample after approval: **8 bounded scenarios × 2 materially
different provider protocols = 16 scenario executions**. Seven scenarios use one
user turn; the multi-turn scenario uses two, totaling 18 invocations. Initially cap
each invocation at 3 exchanges and 1,024 output tokens/exchange: at most 54 exchanges /
55,296 reserved output tokens, excluding
separately approved retries or vision. These are proposed ceilings, not forecasts.
Measure actual serialized input, cumulative input/output/cache usage, unknown usage,
latency and provider identity. Existing `ceil(chars/4)` is an estimate, not billing.
No grounded price/cost estimate or service-time percentile is available without a
selected model, current pricing and measurements; do not reserve capacity now.

Use small 3–5-slide fixtures plus the accepted large-deck fixture for scoped-context
checks. Keep deterministic privacy/preservation/idempotency oracles strict: zero
unauthorized changes, unknown citations or duplicate committed effects. Report task
success as numerator/denominator, plus refusals and incorrect edits separately.
A 16-scenario / 18-invocation pilot is diagnostic, not statistical production qualification.
Human scorecards should cover factual support, readability, density, narrative and
edit usefulness on a defined 1–5 rubric, with blind provider labels when practical.
A proposed release gate is no critical factual/layout defect and median at least
4/5, subject to product agreement and retained individual ratings.

A separate optional vision pilot could cap inspection at 2 modified slides per
invocation (36 images for the 18-invocation design), with explicit image-byte/pixel
and token budgets; image pricing and quality require future validation. Run browser,
PostgreSQL, native and full regressions only in an approved future quiet window,
using existing serial isolation, watchdogs and original-evidence preservation.
Auto remains the hosted content-quality reference; local inference exercises
plumbing only. Do not reinterpret a second provider's protocol pass as Auto quality.

## Priorities and bounded next milestones

The authoritative [P0/P1/P2 registry](ROADMAP.md#v2-8-audit-followups) separates
first-Assistant requirements from hosted release and conditional improvements.
The immediate technical recommendation is the already recorded
[model transport lifetime/buffering item](ROADMAP.md#model-provider-stream-resource-bounds),
whose concrete bounded contract is now prepared. It changes neither persistence
policy nor the Assistant surface, and should be qualified before live evaluation.
**This audit starts its planning only; it does not implement or test it.**

After that, choose the [turn/approval contract](ROADMAP.md#assistant-turn-approval-contract)
and retention direction before new durable data, then the
[Assistant surface](ROADMAP.md#assistant-surface-integration). Canonical
[search/citation](ROADMAP.md#assistant-search-source-integrity) and
[creation](ROADMAP.md#assistant-semantic-creation) contracts are dependencies of
full parent V2-8, not evidence that an editing-only interface completes it.
Trace/account admission, public release qualification and conditional retrieval/
vision improvements retain their own linked gates. No milestone is promoted here.

## Execution record and limits

**Executed tests/evaluations: 0.** No live provider/search/API calls, local inference,
browser/Chrome automation, screenshot generation, rasterization, PowerPoint/
LibreOffice use, Docker/PostgreSQL service, background worker, benchmark, typecheck,
build, installation or environment/configuration/runtime-state change occurred.
No external framework documentation was fetched. No processes were stopped,
restarted or modified. Only local text/Git inspection and scoped documentation
editing were used; any Git publication is documentation-only. No subagents were
started. Existing binary evidence was neither generated nor overwritten.

Historical [8E evaluation](V2-8E-EVAL.md) and [8F evaluation](V2-8F-EVAL.md), with
their separate review records, supply prior evidence only. Their totals are not
new audit execution. All behavioral, live-model, deployment and consumer claims
not established by source or retained records require future validation. This
report is an implementer-authored architecture assessment, not independent
acceptance or a security certification. Accepted state remains unchanged.
