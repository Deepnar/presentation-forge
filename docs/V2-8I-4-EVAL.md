# V2-8I-4 — owner-scoped durable work discovery

## Authority and entry

The2026-10-26 continuation requests the immediate next dependency after accepted
I3. Existing-deck-first ordering and recommended bounded steps are already given.
This contract isolates durable discovery inside the host/orchestration roadmap
entry, before provider selection, scheduled pickup and the visible Assistant. It
changes no public surface, data retention, provider context or credential policy.
The existing trusted operator can already address each same-owner turn explicitly;
this adds bounded metadata enumeration over that same owner scope.

Accepted baseline `2ba82cb5c321c21d5648f577469f69e82cdcfb24`, separately accepted in
[the I3 decision](reviews/V2-8I-3-2ba82cb.json). Entry HEAD
`dbaa73ab99ddaf7d73d3b786e6c65f056b646aae`; branch/push `v2`/`origin/v2`.
The original `.agents/` and both untracked master/architecture prompt files remain
untouched. I3 tests, original archives and cleanup are accepted prerequisites, not
execution for this slice. No I4 code/tests/backend/model calls have run.

This is the concrete proposed implementation contract. Separate plan-readiness
review precedes source changes; implementation proceeds only within this bounded
dependency and the current continuation. Any need for hosted policy, broader
authority or another product direction stops for a concrete human decision.

## Bounded contract

Add a backend-injected agent discovery service plus a thin adapter and
`agent-chat discover --input FILE [--owner OWNER]`. It returns one page of potential
turn work for one explicitly trusted owner (including exact null for local
ownerless projects). It performs no preparation, provider resolution, approval,
claim, execution, reconciliation or scheduling. No HTTP/browser/model entry exists.
The operator owner flag retains the accepted CLI trust boundary; it is never an
HTTP authorization source.

### Scope and input

Snapshot/validate a plain exact trusted owner binding before any await, with the
accepted owner semantics (nonempty string up to128characters or explicit null).
No administrator bypass, owner wildcard, omitted-owner fallback across accounts,
project payload, provider/configuration or executable/accessor input is accepted.
Input is exactly `{limit,cursor}`: integer limit1..50; cursor null initially or
exact `{projectId,turnId}`. Project IDs retain the canonical64-character ID rule;
turn IDs retain the existing nonblank128-character rule. Bound/snapshot JSON and
reject extra fields, unsafe values, getters, symbols and malformed cursors before
backend I/O. A cursor supplies pagination only, never ownership or work authority.
The CLI permits no --project or --provider on discover, requires --input and emits
only bounded metadata/fixed errors. Existing CLI actions remain unchanged.

### Store and pagination boundary

Both existing SQLite/PostgreSQL adapters provide one purpose-built owner-scoped
metadata page method. Use parameterized owner predicates and keyset pagination
ordered by `(project_id,turn_id)` with explicit equivalent binary ordering across
stores, including non-ASCII accepted turn IDs. Read at most limit+1 rows from
canonical projects/turns/conversation headers in a single statement. Owner filtering
applies in SQL before limiting; exact null sees only ownerless projects. Join to
the existing project row and header; a missing/mismatched header on a retained
turn fails fixed invalid-document rather than silently inventing a generation.
Deleted project rows cannot become accessible orphan work.

Never select private_payload, scene/project payload, proposal plans, requests,
replies, credentials or run payloads. SQL must bound returned header/turn metadata
text before materializing it in the application; then enforce existing UTF-8 byte
limits and parseHeader/parseTurn invariants and row/header/generation identity.
Malformed or oversized operational metadata refuses the whole page without echo
or partial output. Existing idempotent runtime-table initialization may occur; no
new table/index/migration, conversation/turn/run row, project/history write, lease
or accounting mutation is introduced. Existing indexes support the query; inspect
the actual both-store query plans. Row/returned-byte bounds are not a claim of a
hard database timeout or fixed physical work under arbitrarily corrupt storage.

Scan up to limit rows, using the extra row only for hasMore. Return candidates
whose persisted state is submitted, preparing or approved. Every scanned row,
including waiting/terminal rows filtered from the candidate list, advances the
keyset. An empty candidate page can have hasMore=true. nextCursor addresses the
last SCANNED row when more raw rows exist, else null. Never infer end-of-scan from
items.length, use OFFSET, enumerate all projects or export all conversations.
No process-local watermark or second durable work queue is created.

Return only `{ok:true,items,scannedRows,hasMore,nextCursor}`; each item is
`{projectId,generation,turnId,turnRevision,state,preparationDeadline,leaseUntil}`.
Do not return request keys/digests, visible/private bodies, proposal/run contents
or an administrator/owner capability. Approved records can refer to finished runs:
these are potential-work hints, not a runnable/lease/approval guarantee. The later
host must invoke I2 under its trusted owner binding and let canonical inspection
recheck ownership, generation, current turn/run state, deadlines and leases.
Discovery never extends H's two-minute preparation deadline or revives expired work.

Pagination is a bounded live view, not a snapshot/notification/exactly-once or
latency guarantee. Rows inserted before a cursor appear in a fresh cycle; clears,
ownership changes and deletes between pages/dispatch remain ordinary fenced races.
A complete cycle returns nextCursor=null; the future host explicitly starts its
next cycle from null. No promise of global fair scheduling is made by this read.
Fixed sanitized errors follow existing invalid-input/document, not-found and
misconfigured/unavailable storage conventions without payload or SQL echo.

## Non-goals and look-ahead

No model API/local inference, provider keys/defaults/registry/fallback, spend or
data-egress policy, daemon, cron, server auto-start, deployment, migration, paid
infrastructure, new schema/retention/context, automatic execution/approval,
background worker tied to browser/SSE, source/search/creation tool or UI change.
New framework/SDK dependencies are unnecessary in the established native stack.

The future host supplies an eligible owner set, provider policy and bounded pickup
cycle, consumes these metadata pages, and delegates actual work to I2. Stale hints
cannot authorize spending or edits. The Assistant settles drafts before revision
capture and uses accepted HTTP status/decision routes. These dependencies remain
only in [the roadmap](ROADMAP.md#assistant-surface-integration); discovery does not
complete hosted orchestration or the parent V2-8 promise. No later subsystem needs
to replace the authoritative rows, canonical worker or document.

## Verification and acceptance

Add pure input/backend-contract, actual SQLite, actual PostgreSQL and both-store
process/CLI entry files. Required behavior:

- Exact owner/null isolation, no admin bypass, forged owner/cursor/extra fields,
  mutable binding/input and executable/accessor rejection before I/O.
- Deterministic multi-page traversal across projects and turn IDs; Unicode order;
  limits1/50; empty stores and filtered pages; cursor advances after scanned terminal/
  awaiting-decision rows; no duplicates/omissions on a quiescent store.
- Oversized/malformed/missing/mismatched headers/metadata fail privately; private
  bodies/project scenes are not loaded. All domain/storage byte and returned-row
  limits remain enforced. Actual query plans and at-limit many-row samples are
  retained, with no invented production latency or physical-scan claims.
- Database row bytes, revisions/history, conversations, leases, attempts and
  accounting remain unchanged on discovery, including expired/leased turns.
  Clear/delete/ownership/revision races between discovery and I2 are rechecked.
  Submitted hints cannot cause dispatch; approved terminal hints cause no edits.
- Real child-process pagination/restart and CLI cleanup against both stores; no
  hidden polling child, provider request or signal handler leakage. CLI output is
  bounded, private and truthful; existing explicit-turn worker/HTTP behavior passes.

The expected inventory is234existing+4newfiles=238; freeze actual full/disjoint
inventory and implementation SHA after source/helper review, never invent leaf
totals. The nine gates are turn-discovery focused contracts, nonbrowser bulk,
bounded serial browser/build, PostgreSQL contracts, designated process/faults,
build, typecheck, canonical50-cell benchmark and frontend/native inspection.
Schema/milestone gate mapping changes belong to implementation with meaningful
governance assertions. All common gates apply through the inherited regression
sets and four distinct discover→canonical worker→explicit approval→execution→
reopen/history/native flows across both stores/protocols. Focused/designated and
independent repeats overlap primary inventory. Standing locale stays a separate
9/1 probe; unavailable PostgreSQL is unexecuted, never passing.

Before expensive checks qualify a quiet CPU/memory/storage window with the corrected
classifier, fresh admission per job, low priority/watchdogs and serial Vite/build
isolation. Create a NEW exclusive recorded owned PostgreSQL instance with no image
pull, save/fsync identity, verify actual final listener/catalog and refuse unrelated
services/occupied ports. Snapshot/hash-preserve ALL current V2 evidence, including
ignored original PPTXs and canonical outputs, before generators in a new I4
namespace. Retain failures, actual fresh originals and inspected browser/native
images; restore exact historical bytes without reconstruction. Do not execute old
I3 finishers or recreate its removed backend.

Record exact source/delta, commands, actual stores, pass/fail/skip/cancel/unexecuted
totals, overlaps, query/pagination performance, resource provenance, corrections and
limits. Full original scope, all required gates and separate exact-source ACCEPT/
HOLD are necessary. After independent DB-slot release, save/fsync actual0catalog
before one exact-owned-ID stop; verify bounded/fresh absence and port refusal.
Update architecture/roadmap/state/handoff, push scoped commits to origin/v2 and
STOP after I4 acceptance/cleanup. No hosted provider/scheduler/UI implementation
follows automatically.

## Current execution status

Contract preparation only. Source unchanged from acceptedI3; no I4 test, build,
benchmark, database, provider or generator execution. No implementation acceptance
is implied by planning or readiness. All intended runtime checks remain unexecuted.
