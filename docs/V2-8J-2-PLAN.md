# V2-8J-2 — immutable project web-source registry contract

Status: proposed; planning only. No runtime/storage code or migration is authorized
by this document. Accepted baseline f161901cf29bd7ebd2c12ef634a86cacf5f90ea3 (J1),
entry HEADf84c0158886d4fa513c5a2d583dcaf6dea8f300c, branchv2/origin/v2.
The2026-10-28 continuation authorizes preparing the next contract. The roadmap is
[the sole work registry](ROADMAP.md#assistant-project-source-registry).

## Problem and inspected prerequisites

J1 returns bounded immutable normalized web SourceRefs, but they disappear with
that headless invocation. A later citation must resolve to the same stored snippet
without relying on model text, search order or a changed page. Stable IDs alone
cannot establish project ownership, retained content or factual support.

Source-backed findings at the entry HEAD:

- source.schema.json defines immutable project-bound sources, with web/paper/file/
  user-provided vocabulary; F/J1 enforce a stricter normalized web subset.
- source-identity.ts hashes project+URL+title+excerpt+publication. Retrieval time,
  provider rank and query do not alter identity. Do not change this formula.
- intent.schema.json has slide sourceRefs and block evidenceRefs. The authoritative
  scene/project-document contracts carry no citation attachment. semantics.ts
  explicitly treats evidence existence as a project-boundary concern.
- legacy-conversion.js still refuses claim cites because the accepted scene/source
  contract cannot preserve them. Plain bibliography wording is not a resolved claim.
- Both project adapters expose the owner-checked locked runtime transaction seam.
  SQLite serializes BEGIN IMMEDIATE; PostgreSQL locks the parent project row.
  Child runtime rows already use project foreign-key cascade. Source storage is
  absent. Clearing H chat deletes conversation children, not the project/document.

Recommend a **headless web-snippet registry only**. Finish its durable identity,
owner isolation, bounded atomic writes, clear/delete lifecycle and read resolution
before adding citation attachments, verified locators or research orchestration.

## Human data-policy decision

Recommended policy, subject to explicit approval:

1. An explicit trusted owner-scoped registration saves selected normalized web
   SourceRefs. Research completion alone never registers them. Store only source
   ID/project ID, kind, canonical HTTP(S) URL, title, bounded excerpt, optional
   publication label, search provider and first retained retrieval timestamp,
   plus finite registry version/counter/timestamp metadata.
2. Treat URLs, titles and excerpts as private project data: only its exact owner
   can resolve/list/register/clear them, with ownerless local projects restricted
   to the established local-owner identity. No admin bypass in this new domain.
   No source data becomes provider context, public data or diagnostic logs.
3. Keep retained snippets until the owner explicitly clears project sources or
   deletes that project. Clearing chat and restoring a deck revision preserve the
   registry; clearing sources does not modify the deck/chat/history or pretend
   their source references remain resolvable. Project deletion removes all child
   source content atomically. Canonical project deletion retains its accepted
   owner/admin policy; this introduces no admin bypass for source operations.
   No auto-expiry or hidden oldest-row eviction.
4. No search query, raw backend/tool/provider transcript, model summary/claim,
   hidden reasoning, full page, file, DOI locator, credentials or embeddings are
   retained. No new external disclosure, page fetch or real provider call.
5. Source clear is deliberate data deletion. It is not restored by Version history;
   future citation consumers must report missing sources after clear. Backups and
   external backend logs retain their existing policies; no physical-media or
   external erasure promise is introduced.

Alternative: keep research sources ephemeral and defer durable source-backed
citations/creation. There is no safe automatic registration or shorter retention
assumption to substitute for the human policy decision.

## Bounded implementation after approval

### Canonical data and invariants

Use a dedicated strict stored-web-source record based on F/J1's normalized fields;
reuse/extract the strict validator vocabulary so the registry and canonical
web_search result cannot drift. Leave the permissive general SourceRef schema and
standalone F20/perHost5 ceilings intact. Reject foreign IDs/projects, unknown fields,
malformed/noncanonical credential-bearing URLs, unsupported kinds/locators,
invalid retrieval timestamps and executable/accessor/nonplain objects before effects.
Recompute the exact accepted webSourceId over validated content. Normalization is
not an excuse to repair a supplied ID or change existing citation meaning.

Each (projectId,sourceId) denotes one immutable semantic body. Changed URL/title/
excerpt/publication gets a new ID. Same-ID identical semantic content is an
idempotent no-op under current catalog preconditions; preserve the first stored
provider/retrieval metadata, even when
a later registration supplies different provenance. A same-ID semantic conflict or
corrupt persisted row refuses the whole operation; never overwrite or silently
repair it. Validation applies on reads as well as writes. No source existence or
identity result is labeled verified factual support.

Semantic equality is the exact accepted webSourceId tuple, including its absent
versus empty publication-label equivalence. publishedAt is a bounded label, not
a required parseable date. retrievedAt follows F/J1's finite Date.parse validation
and length bound; preserve its supplied representation without silently converting
it or certifying freshness. Replaying a successful write with old catalog tokens
is stale, not a new idempotency/billing receipt. Refreshed current preconditions
permit an unchanged-source no-op.

### Registry and operations

Use normalized project child tables in the existing configured backend, not another
project document or a registry list mirrored in project JSON. Recommended names:
v2_project_source_catalog (project_id,generation,revision,count,bytes,policy_version)
and v2_project_sources (project_id,source_id,payload,payload_bytes). Primary/unique
keys bind project plus source; both children cascade on canonical project deletion.
Counters reflect retained canonical UTF-8 payload bytes, not approximate tokens.
No content appears in counters, errors, receipts or logs.

Catalog generation/revision are nonnegative safe integers, policy_version is the
single supported version, count/bytes obey the retained ceilings. Check arithmetic
before increment; overflow refuses without mutation or wraparound. An absent
catalog means virtual0/0 only after a bounded child-row probe establishes absence.
Orphan rows, malformed/future-policy catalog data and mismatched aggregates fail
closed; never reset metadata to0 or adopt old rows as new authority.

For inspect/register/resolve/list, verify count and byte aggregates from at most
513 child metadata rows, including actual SQL UTF-8 length and declared length;
the extra row detects overflow. No full-payload materialization or parse of every
source is required. Actual byte lengths, counts, bounds and aggregate equality
must match the validated catalog. Parse/hash-validate only the selected/affected
source bodies (at most24); success makes no claim about unrequested body content.
An invalid selected body fails the entire read/batch, with no partial publication.

Persisted lengths are untrusted. Cap actual SQL byte lengths before returning any
text/identifier/payload to JavaScript; oversize/type failures return a bounded
invalid sentinel, not a truncated value. SQLite source identity and payload reads
must use capped BLOB projections and fatal UTF-8 decoding with explicit BOM
preservation before JSON/identity validation; the driver must never replace bytes
first. PostgreSQL uses octet_length and its UTF-8 text boundary. Helpers receive
an adapter-bound dialect, never an environment/model override that could mismatch
the injected transaction. Keep H's generic transaction/query contract unchanged.
Compare actual UTF-8 lengths, canonical serialization and payload_bytes for bodies
validated by the operation. Include malformed stored bytes, literal U+FFFD and BOM
controls; do not silently repair corruption or use payload_bytes for allocation.

The shared callable domain (e.g. src/projects/sources.js) reuses the canonical
owner-checked project transaction and existing backend selection. Add additive,
idempotent source DDL to both adapters; keep the transaction interface and H/run
schema/authority unchanged. No provider/network I/O inside transactions. Schema
initialization and project deletion must work even when no source operation has
run in the current process. No production migration/deployment is authorized.

Operations are headless, with strict named request DTOs and sanitized errors:

- inspect: return finite generation/revision/count/byte counters and policy version.
- register: require expected saved project revision, expected source generation
  and registry revision, plus1..24 selected normalized sources; validate/clone the
  complete binding/request before awaits. Atomically insert all new sources,
  preserve exact repeats and increment registry revision once only when changed.
- resolve: request1..24 distinct source IDs under one current owner/project and
  generation. Return explicit per-ID found/missing outcomes in request order plus
  snapshot generation/revision. Never search another project or fetch missing URLs.
- list: bounded stable source-ID order, limit1..24, with a strict continuation
  bound to project/generation/registry revision. Cursor is a <=512-byte strict
  plain object containing exactly projectId,generation,revision,afterSourceId;
  IDs use their canonical bounded forms. It is a position, never authorization.
  Use keyset ordering with SQLite BINARY/PostgreSQL C collation and matching
  indexes, not locale order or offsets. The parent lock binds catalog check and
  page read in one snapshot. At most25 bounded IDs/metadata establish has-more;
  fetch at most24 payloads. A changed snapshot refuses stale continuation.
- clear: require expected source generation/revision; delete all retained source
  rows, advance generation and registry revision atomically, reset counters. A
  stale/noop replay cannot delete a later generation. Increment generation even
  when empty so it remains an explicit fence for in-flight registration.

An absent-empty clear must persist generation1/revision1. Clear is a recovery
deletion operation: with valid owner and syntactically valid current catalog
identity/policy/counters, corrupt source bodies or aggregate mismatch do not block
deleting every child row and resetting counters. It reads no source payload.
Malformed/unknown-policy catalog metadata cannot be silently reconstructed;
canonical project deletion remains the final deletion path for that case.
Resolve treats well-formed unknown and foreign source IDs identically as missing
within the authorized project; no global existence query is permitted.

Every registration requires both document and catalog snapshot checks. Ordinary
source changes do not increment deck revision, save/history state or H conversation
counters. Returned catalog counters confer no scene edit or provider authority.
Clear may proceed without a saved-deck revision because it changes no deck; it
still requires current owner and exact catalog state. Resolve/list/inspect are
owner-authorized reads; no source IDs, existence or counters leak across owners.
Registering against an absent catalog uses its documented virtual generation0/
revision0 state, created atomically within the locked parent transaction.

Bounded here describes data size, query cardinality and test watchdogs. Retain the
existing adapter lock-wait semantics: SQLite currently has a5000ms busy timeout;
PostgreSQL's parent lock precedes the job without a per-operation lock/statement
timeout. This slice promises no new wall-clock completion/deadline/cancellation
guarantee. Do not use Promise.race to return a timeout while a write can commit
later, or change H/default adapter timeouts incidentally. Any later public
integration must settle its transaction-wait/cancellation contract explicitly.

Ceilings:24 sources per registration/resolve/page,16KiB canonical UTF-8 per source,
512 retained sources and4MiB retained source-payload bytes per project. Whole input
registration DTO <=384KiB; whole response <=384KiB. Refuse overflow without partial
insert, eviction, truncated source fields or a success response missing requested
citations. Duplicate inputs are invalid; exact stored repeats consume no new
retained capacity. Bound continuation/input lengths and all SQL result sets.

Source clear invalidates outstanding generation-bound requests; project deletion
serializes with registration through the parent lock. No automatic re-registration
from saved chat, previous J1 DTOs, restore or background jobs. A later explicit
registration may retain the same semantic ID again, using its then-current
provenance; IDs are not revocation tokens or proof of earlier retention.

### Surfaces and non-goals

Shared domain calls are the development/headless entry, with backend contract
fixtures. No HTTP route, editor control, automatic J1/H hook, new model tool or
operator CLI surface is added. Any later transport must call this same domain
with current owner authorization, not duplicate SQL or trust a model project ID.
No real API/model/search/local inference/GPU calls or production activation.
No second scene, document, queue or provider accounting authority.

No paper/file adapter, page fetching/SSRF, verified locator, claim assessment,
source-to-block/slide mapping, compiler/native rendering, intent mutation,
semantic creation or import-refusal removal. Stored data stays untrusted. General
SourceRef compatibility and existing legacy decks remain unchanged.

## Look-ahead and seams

The registry preserves exact F/J1 snippet identities for future citation mapping.
It deliberately does not attach sources to scenes or infer verified page locators.
A later approved citation contract must persist revisioned source-to-block/slide/
export mappings alongside authoritative editing/history and validate them on use.
Cleared/missing sources must produce an explicit unresolved outcome. A snippet
can support a snippet-relative match only; full-page/DOI/file locators need their
own trusted adapters and data policy before being called verified.

Future durable research registration must pin H generation/owner/revision and
explicit selection/approval to this registry seam. Source IDs include project ID:
project copy/import will need an explicit atomic source rebind and reference-remap
contract once citation attachments exist. Current copy/save/history carry no source
attachments, so this slice neither changes them nor silently copies the registry.
No global dedup or cross-project lookup. Retention/capacity changes require explicit
policy evolution; do not relax ceilings silently during implementation.

## Focused checks and gates after approval

Documentation planning now needs protocol/diff/link consistency only; no product
or model tests. Implementation should add a small shared contract inventory rather
than copying historical matrices:

- Pure validation/identity/immutability/bounds: strict JSON and fields, unchanged F
  IDs/publication-label equivalence, Unicode UTF-8 accounting, corrupt/hash/foreign-row rejection, exact repeat/
  first-provenance semantics, DTO limits and sanitized failure/no partial output.
- Actual temporary SQLite registry calls through the configured store: complete
  register/inspect/list/resolve/clear lifecycle, reopen persistence, exact owner/
  ownerless isolation, stale deck/catalog, all-or-nothing failed batches/capacity,
  pagination snapshot fencing, clear versus stale registration, canonical delete
  cascade and unchanged scenes/history/chat. Challenge orphan headers/counter
  drift, unknown policy/overflow, actual corrupt/oversized stored bytes, literal
  U+FFFD/BOM, empty clear fences and corrupt-body clear recovery. Include process reopen
  and one bounded conflict/rollback case, not the full old crash suite.
- The same new registry contracts on an owned isolated PostgreSQL backend, with
  a bounded two-connection parent-lock conflict/clear/delete challenge. Never use
  another project's database or recreate the removed I4 service. Missing PG means
  unexecuted, not passed; leave the affected backend gate pending rather than
  claim full dual-backend acceptance.
- Narrow existing source-identity/J1 and project-delete/history tests only where
  shared code actually changes. Generated-type drift/typecheck if applicable.
  Select new/adjacent governance inventory checks after the approved gates exist.

Record leaf counts, failures/skips/cancellations/unexecuted coverage, actual backend,
source SHA/delta, commands/exits, snapshots and all earlier attempts. Run serially
with watchdogs at low priority after measured CPU/memory/I/O headroom. No browser,
production build, rendering,50cell benchmark, old bulk matrix or live qualification:
no UI/compiler/export changes. Accepted unchanged evidence remains applicable.

Acceptance requires immutable owner-bound resolution, atomic bounded lifecycle,
real storage evidence for every changed backend, unchanged deck/H authority and a
separate exact-source ACCEPT/HOLD. Correctness, integrity, security/privacy,
compatibility and evidence gates apply; visual/undo/native/a11y/responsive reuse
accepted evidence for unchanged behavior. Standing BYOK locale, initial J1/I7
integration timing and inherited visual/native/I4 provenance limits remain separate.

After human policy direction, implement only this contract, propagate architecture/
roadmap/state/evaluation/handoff and push scoped commits to origin/v2. Stop after
J2 acceptance/closeout. Planning review is not human policy approval, and acceptance
will not authorize source attachments, live research, UI, paid infrastructure,
production migration or dependent implementation.
