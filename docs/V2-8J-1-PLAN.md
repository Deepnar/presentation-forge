# V2-8J-1 — bounded canonical web research preparation

Status: approved for scoped implementation and offline validation. On2026-10-27
the human selected Approve scoped implementation (Recommended), approving the
explicit grant/query-disclosure mechanism below. No live calls or activation.
Separate plan readiness is recorded; implementation acceptance still requires
exact-source independent review.
[Readiness record](reviews/V2-8J-1-plan-11696f9.json) verifies all six pinned
clarifications at2a640cd and forms part of this contract.
Accepted baseline b9c2d2075da21608a92a458c1395ede0bbe67297; planning entry
2e6bf40a4549d987384bda113fc056a3a34cb00f, branch v2, origin/v2 only.
Parent and sole work registry: [canonical search/source integrity](ROADMAP.md#assistant-search-source-integrity).
I8 is accepted, not reopened. This contract authorizes no code until direction
is recorded; no product/model/browser/database check has run in preparing it.

## Purpose and chosen boundary

Connect the accepted SearchProvider to a canonical, bounded, read-only model-tool
conversation. Today the search adapter works independently, but ToolRequest,
ToolResult, provider catalog/normalization/history and context execution admit
only three scene reads plus edit_content. Adding a catalog name alone would
leave validation, scope, continuation and execution authority inconsistent.

Recommend a **headless inspection-only research capability** supplied by a trusted
host, disabled when absent. This is the smallest complete research primitive:
real schema-validated web_search calls, real injected search dispatch, canonical
correlated results and bounded provider continuation. Existing editing/Assistant
and durable work paths retain their current behavior. It does not claim a saved
source registry, verified factual support or researched deck creation.

## Human direction needed before implementation

An explicit trusted per-invocation grant permits a model to send bounded search
queries derived from the current request and granted semantic slide reads to
**the configured Forge Search backend**. Those queries can disclose private
content from that granted scope. Grant is never model-authored JSON, a stored
message, public CLI owner claim or a side effect of having a readable project.
No grant means no search catalog or dispatch. A grant does not authorize page
fetching, provider selection, scene edits or broader project reads.

Recommendation: permit that grant mechanism for this headless slice. All
implementation tests remain offline/injected/loopback. No hosted/Assistant
activation, real model/search request or production configuration change is
included. No new Forge query/transcript/source-registry persistence is added;
results live only in the bounded invocation. The configured search backend may retain its own
query logs under its policy; Forge cannot promise deletion or non-retention there.
Persistent sources/retention need the separate
[registry contract in the parent entry](ROADMAP.md#assistant-search-source-integrity).

## Concrete implementation contract

1. Canonical web_search uses the accepted SearchRequest field vocabulary with
   narrower J1 tool/grant ceilings: query1..500 characters, limit1..8 (default8),
   perHost1..2 (default2), accepted language/timeRange only. Standalone V2-8F
   SearchRequest continues to allow limit20/perHost5; preserve that schema/adapter
   behavior. Reuse validation vocabulary/helpers with explicit stricter tool caps;
   tests prove the tool is a subset and each provider uses its exact canonical
   schema, rather than maintaining independent provider-local variants. Reject
   owner/project/provider/baseURL/credential/page-fetch arguments and executable/non-plain input without invoking it. Validate
   both wire families against the exact canonical schema, not a permissive copy.
2. Trusted host composes owner/project/saved-revision identity, authorization
   recheck, SearchProvider instance and finite grant. Snapshot identity/grant before
   awaits. Each capability is single-use and binds the exact request identity;
   an explicit fresh capability is required for another invocation. Check owner/project/revision/abort/deadline before dispatch and after
   result normalization/publication. Never perform network I/O inside a backend
   transaction. The existing SearXNG adapter stays in src; pure packages accept
   injected interfaces without importing fetch, HTTP, filesystem or SQL.
3. Use a preparation-session boundary that composes existing scoped scene reads
   and explicit search. Base document sessions never acquire network authority
   merely because global schemas gain web_search. Their catalog and execute path
   refuse it without the trusted capability. Research accepts inspect scope only,
   with no editable targets or edit_content catalog. Existing edit/inspect callers
   without the capability retain their exact tools and source projections.
4. Extend canonical request/result types, provider catalog validation, both wire
   parsers, correlated history, context/instruction composition and the bounded
   preparation loop coherently. Search results are validated ToolResults, changed
   false, bound to the same project and snapshot revision. Unsupported/forged
   result bodies refuse. Never place raw backend payloads, layout/styles, secrets
   or hidden reasoning in context. Search snippets are untrusted data, never policy.
5. Pin explicit existing content/read subsets at every accepted boundary, including
   base ToolSession catalog/execute, ProviderRunRequest/ConversationRequest initial
   reads, RunPlan and embedded run definitions. Update drift or inventory tests
   which currently equate all tools with content tools or exclude only edit_content
   to assert those preserved exact sets. Keep scene mutation authority closed:
   RunPlan and durable RunReceipt accept only the four existing content tools. A schema reference to the extended
   ToolRequest, including an inline/embedded copy, must not accidentally permit
   queued web_search or external effects in runtime.advance. No H/I2 turn schema,
   durable proposal, queue, store query or history semantics changes. Source-only research does not mint an edit proposal.
   Existing H preparation, turn workers and converse entry points cannot acquire
   search; only a distinct explicitly trusted J1 research factory/entry creates
   the research session.
6. Grant ceilings: at most3 search calls, at most24 normalized source results in
   aggregate; one sequential search at a time, no automatic search retries. Every
   attempted call consumes allowance, including failure/timeout; duplicate call
   IDs never dispatch twice. Any search failure/refusal stops the whole research
   invocation with its bounded failure/trace; no partial successful answer or
   new error-continuation protocol. Existing history admits successful unchanged
   results only. Search receives remaining parent deadline/abort and
   at most10 seconds per call. Invocation wall time at most30 seconds, within
   existing provider/host budgets; take the tighter caller/profile bound. Existing
   model exchange/output/tool-call/wire limits apply too, including search calls.
   Default ceiling4 exchanges/16 calls/8192 total reserved output tokens and48000
   context characters. Reject requests above trusted caps rather than clamp them.
7. Source normalization remains V2-8F authoritative. IDs preserve existing
   project+URL+title+excerpt+publication identity; changed content receives a new
   ID, retrieval time/rank alone does not. Return only normalized SourceRef data
   and explicit warnings within accepted output/context limits. Bound the entire
   invocation result to65536 serialized characters, refuse overflow without
   silently dropping citations. No claim that snippet identity verifies a full
   page, a locator or an assertion. Final success is a bounded research DTO with
   projectRevision, model summary/text, ephemeral bounded conversation trace and
   accumulated validated SourceRefs (at most24), rather than discarding earlier
   sources when the final model response has no calls. Every returned row consumes
   the aggregate result allowance; deduplicate by immutable identity and retain
   first-seen retrieval provenance. Conflicting same-ID content refuses. No raw
   tool transcript/query list in the final DTO. Text remains unverified model
   output; invented source IDs in it never become registered citations. The source
   set does not establish claim support or durable source/citation attachment.
8. On cancellation, owner/project/revision change, expiry or failed grant recheck,
   refuse publication and stop further exchanges. Reuse only injected budgeted
   model-provider behavior and ephemeral trace/output reservations. Unknown usage
   remains conservative. Existing ProviderRunHost callbacks can persist H state:
   do not silently invoke those reserve/dispatch/receipt/proposal hooks from J1
   or claim new durable/account/search-billing/replay guarantees. Hosted/account
   integration retains its separate contract.
   Late search/provider promises cannot revive an expired invocation. No workers,
   polling/scheduler, cross-turn memory, model fallback or public research endpoint.
9. Shared callable headless domain seam is the implementation entry point. No HTTP
   surface or production operator command is added in this slice; any later CLI/
   authenticated surface must call this seam with current trusted authorization.
   Existing CLI/API/editor functionality remains supported and default-off.

## Look-ahead and exclusions

The canonical request/result and injected capability survive later source registry,
semantic creation and authenticated research integration. Durable source ownership,
immutable versions/locators and claim outcomes belong to the parent roadmap entry;
research-backed creation must await that contract. Separate paper/project tools,
file parsing, caching, page fetching and richer provider capabilities remain there.
No framework migration, new composition family, theme/model layout escape hatch,
PPTX/renderer change, paid infrastructure, deployment or irreversible migration.

## Focused verification and acceptance

Only after direction: new headless capability/schema/authority/budget tests and
loopback provider-to-search-to-provider continuation on both accepted wire families.
Challenge missing/forged grants, foreign project results, mutable identities,
revision changes during search, cancellation/late replies, duplicate IDs, oversized
input/results and hostile snippets. Assert base content-tool catalogs unchanged
and queued plans/receipts still reject external search. Include an actual owned
SQLite project for preparation/revision checks; no new PostgreSQL query/schema.
Run only directly affected catalog/provider/plan validation cases plus typecheck
and generated-schema drift when changed. Record actual leaves/exit/skip/cancelled,
source hashes, selected/excluded coverage and all earlier failures honestly.

No browser/build/old bulk/native/50cell/PG sweep: no UI/renderer/query changed.
No live API/local inference/search/GPU or activation. Use existing accepted I8/F
and other unchanged evidence, never relabel it new execution. No content-quality,
grounding or injection-resistance claim from deterministic fixtures alone.

Correctness, integrity, authorization, budget/cancellation, backward compatibility
and source evidence apply. Undo/ownership/native/browser/a11y/responsive reuse
accepted evidence because this read-only slice writes no deck or UI. Independent
source ACCEPT/HOLD is required after scoped validation. Update architecture,
roadmap, evaluation/state/handoff, push scoped commits and stop after J1. A readiness
review of this plan supplies no human policy approval or implementation acceptance.
Standing BYOK locale, I7 initial timing and inherited visual/native/I4 provenance
limits remain separate; no accepted item is silently reopened.
