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
execution for this slice. Entry was planning-only; current execution is below.

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
accepted owner length/identity semantics (nonempty string up to128UTF-16code units
or explicit null), with raw discovery owner/cursor identifiers required to round-trip
through UTF-8 unchanged and contain no U+0000. These stricter new discovery inputs
leave every existing H/I2/CLI action contract unchanged.
No administrator bypass, owner wildcard, omitted-owner fallback across accounts,
project payload, provider/configuration or executable/accessor input is accepted.
Input is exactly `{limit,cursor}`: integer limit1..50; cursor null initially or
exact `{projectId,turnId}`. Project IDs retain the canonical64-character ID rule;
turn IDs retain I2's actual nonblank128-UTF-16-code-unit lookup rule. A syntactically
valid foreign, deleted or nonexistent cursor position needs no existence/ownership
lookup; the owner predicate still scopes all returned rows. Bound/snapshot JSON and
reject extra fields, unsafe values, getters, symbols and malformed cursors before
backend I/O. A cursor supplies pagination only, never ownership or work authority.
The CLI permits no --project or --provider on discover, requires --input and emits
only bounded metadata/fixed errors. Existing CLI actions remain unchanged.

### Store and pagination boundary

Both existing SQLite/PostgreSQL adapters provide one purpose-built owner-scoped
metadata page method. Use parameterized owner predicates and keyset pagination
ordered by `(project_id,turn_id)` with explicit equivalent binary ordering across
stores, including non-ASCII accepted turn IDs. Read at most limit+1 rows from
canonical projects/turns/conversation headers in a single statement. Exact bytewise owner matching
applies in SQL before limiting, independently of database collation; exact null
sees only ownerless projects. Never implement this through listProjects (which
loads project bodies) or withRuntimeTransaction (which loads scenes/permits writes). Join to
the existing project row and header; a missing/mismatched header on a retained
turn fails fixed invalid-document rather than silently inventing a generation.
Deleted project rows cannot become accessible orphan work.

Never select private_payload, scene/project payload, proposal plans, requests,
replies, credentials or run payloads. SQL must byte-bound EVERY returned field before materializing it in the
application: project/owner/turn/generation identifiers and header/turn payloads.
Use SQLite length(CAST(value AS BLOB)) and PostgreSQL octet_length, not character
length (SQLite TEXT length stops at embedded U+0000). At-risk fields return a
bounded invalid sentinel, never an unbounded original or silently filtered/truncated
row. Enforce canonical per-field limits and raw-identifier UTF-8/non-NUL validity,
then existing UTF-8 payload byte ceilings, parseHeader/parseTurn invariants and
row/header/generation identity. Decoded header/turn generation and IDs also meet
I2's actual <=128UTF-16-code-unit nonblank lookup rule; JSON Schema's code-point
maxLength alone cannot establish that a hint can be consumed unchanged.
SQLite selects bounded BLOB values and fatal-decodes them before exposing the
unchanged text-row interface; TEXT decoding by the driver must never replace raw
identity bytes. Valid U+FFFD and BOM characters are preserved. Malformed or
oversized operational metadata refuses the whole page without echo or partial output. Existing idempotent runtime-table initialization may occur; no
new table/index/migration, conversation/turn/run row, project/history write, lease
or accounting mutation is introduced. Use the existing owner/project/turn indexes without inventing a covering
composite or C-collated index guarantee. Inspect actual both-store query plans;
retain legitimate many-row samples, possible sorts/scans and latency. If measured
plans cannot meet the bounded operational goal, stop for a scoped decision before
adding an index or another discovery architecture. Row/returned-byte bounds are not a claim of a
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
or an administrator/owner capability. The ENTIRE serialized result, including
cursor/envelope, is capped at131072UTF-8bytes before output (CLI adds only a final
newline); fixed failure replaces any oversized result, with no partial output.
Approved records can refer to finished runs:
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
  limits remain enforced. Actual-store SQLite NUL-prefixed oversized TEXT/IDs
  must hit bounded invalid sentinels; PostgreSQL has no literal-NUL TEXT storage,
  so exercise its actual oversized/invalid byte bounds and both-store pre-I/O
  non-NUL/UTF-8 identifier rejection without fake storage support. At-limit escaped
  identifiers exercise the complete131072-byte result ceiling. Actual query plans and at-limit many-row samples are
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

## Current execution status — corrected source

Accepted baseline remainsI3 `2ba82cb5c321c21d5648f577469f69e82cdcfb24`.
Corrected implementation is `8378a20a819de569ef7b10b747d7ba6c481f529e`.
The current complete238-file inventory/helper/source manifests and fresh runbook
are in [the corrected evidence lineage](v2-8i-4-corrected-evidence/RUNBOOK.md).
All9required corrected-source gates are unexecuted. Source/helper delta readiness,
fresh180second qualification/admission, complete new originals snapshots, full
execution, separate exact-source acceptance and cleanup remain required.
No partial pass from the original source is a corrected-source pass.

### Plan and original-source execution

Plan2dbbc3b received conditional readiness atc473afc, followed by clarified
byte/identifier/result/query-cost delta7215b97 and separate exact-delta readiness
before code. Source review caught a malformed-file UTF-8 replacement defect;
actual CLI test reproduced5pass/1fail, discovery-only strict decoding at1c83881
passed6/6. Helper review caught stale plan labels, an incomplete source guard,
coordinator snapshot bypass and then imported hash-function shadowing. Those were
corrected before first preparation, with a real preparation-block fail-first oracle
(8pass/1error→9/9). Original readiness at16c7469 was validation-only, not acceptance.
[Its delivered message record](reviews/V2-8I-4-175a016-source-harness.json) remains.

Original source175a016 qualified180.587seconds and used exclusive PostgreSQL15.18.
Its35complete jobs passed231primary files2899/2899 (198bulk2569,26serial208,
7PG122) plus47overlapping focused cases, with0fail/skip/cancelled. Seven primary
files plus command/native/visual gates remained incomplete. All raw results, exact
original ownership/helper bytes, current screenshots and seven actual browser/HTTP
PPTXs are preserved in [the retired attempt](v2-8i-4-evidence/attempts/175a016/retirement.json).
The additional raw corruption probe failed0pass/1fail; shell overall0 resulted
from a following cat command and is explicitly not a pass.

### Product regression and narrow corrections

The probe demonstrated that SQLite permits malformed TEXT and Node's replacement
decoding can change a stored identifier before identity validation. A corresponding
literal-U+FFFD TurnRecord could then produce a hint with different raw bytes.
The committed actual-store oracle failed13pass/1fail before correction.
SQLite now selects only already byte-capped BLOB fields; the adapter fatal-decodes
all six non-null values, preserves nulls and maps decoding failure to fixed private
invalid-document. SQL owner/join/keyset/order semantics and PostgreSQL are unchanged.
No schema/index, H/I2 contract, provider or execution authority changed.

A valid leading-BOM control exposed an additional false refusal in the discovery
identifier round-trip decoder (intermediate23pass/1fail of24); preserving BOM there
corrected it. All24unit/SQLite cases now pass24/24, including malformed ID,
generation, header and turn bytes plus valid U+FFFD/BOM controls. Governance35/35
and corrected snapshot/adoption helper12/12 also pass. These are development checks,
not the fresh238-file matrix. Raw probes, failures and corrected logs are retained
under corrected-evidence/development. No assertion was weakened.

### Preservation and backend lineage

Before correction, all7423historical files/246original PPTXs and5canonical outputs
were restored and hash-verified from actual backups, without reconstruction.
The retired attempt retains fresh old-source artifacts separately. No original
service was replaced or stopped. The same exclusively ownedI4 ID
`e08ed2564f60da2fd9fffca5d57229d2f111640689a242f97f06d5a04ba571ce`
is explicitly adopted for corrected source in
[the saved/fsynced identity chain](v2-8i-4-corrected-evidence/source-correction-adoption.json).
Original ownership bytes/hash, exact identity/resources/final TCP listener and
actual PostgreSQL15.18 empty catalog were verified. Preparation/coordinator recheck
that chain; corrected preparation has no container creation path. Fresh qualification
and snapshots are still required before new generators. Root owns all slots.

### Limits and stop point

Original-source local128-turn/3page samples were8.283msSQLite/10.757msPG; these are
retired samples, not corrected performance. PostgreSQL plans showed sequential
scans/hash joins/sorting; SQLite used existing indexes and a temporary sort.
No fixed physical-work/timeout or production-percentile guarantee is made.
Original-source120-slide opening was1539ms, chart/table canvas delta<0.031px and
initial full-size screenshots showed no new overlap; corrected final frontend/
native evidence must execute again. Inherited narrow partial canvas/overflow,
SVG mixed-run/chart-consumer differences, standing BYOK locale failure, unexplained
I/O PSI/iowait, live-provider qualification and interactive PowerPoint limits remain.
No real model API or local inference has run. Stop after I4 independent acceptance
and exact-owned cleanup; no hosted provider/scheduler/Assistant implementation.
