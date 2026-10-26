# V2-8I-4 plan review — READY_FOR_IMPLEMENTATION

The discovery plan at `2dbbc3b330bf6b16ac97bbe52d59a3bc3beef0dd` is ready with
the agreed clarifications below committed and checked before implementation.
Accepted baseline is I3 source `2ba82cb5c321c21d5648f577469f69e82cdcfb24`; entry is
`dbaa73ab99ddaf7d73d3b786e6c65f056b646aae`. Reviewer/context is
`/root/turn_contract_review`, separate from planner/implementer `/root`, dated
2026-10-26. HEAD and origin/v2 both contained the reviewed plan. This is conditional
plan readiness only, not implementation acceptance or behavioral validation.

The current continuation authorizes the immediate next dependency. A trusted
owner-scoped metadata read and operator CLI fit that direction without a new
surface, provider/spend decision, account authority, retention/context policy or
data disclosure. The same operator already addresses same-owner turns explicitly.
Future owner eligibility, scheduling/pickup, provider policy and Assistant behavior
remain separately contracted in the roadmap. No additional human product direction
is needed for this bounded primitive; readiness does not authorize those later
implementations, deployment, paid infrastructure or migrations.

## Required agreed clarifications

1. **Guard returned bytes in SQL.** Character limits alone are insufficient for
   SQLite corruption: `length(TEXT)` stops at U+0000. A NUL-prefixed oversized
   payload/identifier could pass that guard and be materialized before validation.
   Apply SQL byte guards to every returned TEXT field, including row identifiers,
   generation and header/turn payloads: SQLite `length(CAST(value AS BLOB))` and
   PostgreSQL `octet_length(value)`. Return a bounded invalid sentinel for bad
   metadata, then refuse privately. Do not silently filter, truncate, repair or
   advance past corrupt rows. Cover actual SQLite NUL-prefixed oversized metadata/
   IDs and both-store representable oversized/corrupt data; PostgreSQL cannot
   represent NUL in TEXT, so its fixture must not pretend otherwise.
2. **Preserve bytewise identity and cursor positions.** Explicit binary owner
   equality is required in addition to matching keyset ORDER BY/comparisons; owner
   case or Unicode normalization must never widen access. New discovery binding/
   cursor raw identifiers must be well-formed UTF-8-roundtrippable/non-NUL values.
   Do not replace, normalize or case-fold them. Reject invalid inputs before I/O.
   Stored output ID/generation validation must also satisfy I2's nonblank 128 UTF-16-
   unit lookup limits after schema parsing; JSON Schema maxLength counts Unicode
   points and alone does not prove the hint is consumable unchanged. Existing H/
   worker contracts stay unchanged. Include composed/decomposed Unicode owners,
   case variants, BMP/supplementary turn IDs and malformed input oracles.
3. **Bound the complete serialized result.** Enforce the agreed 131072 UTF-8-byte
   ceiling for the whole result, including items, cursor and envelope. Verify
   escaped/control and multibyte worst cases at limit 50, as well as raw backend
   row-count/field bounds. Limiting item count alone is not an output-byte check.
4. **Keep the dedicated read and its honest performance boundary.** Do not use
   `listProjects`, H read/export/inspect or `withRuntimeTransaction` to discover.
   The former loads project payloads before JS owner filtering; runtime/H paths
   load scenes/private bodies and can initialize/reconcile operational rows.
   Use the purpose-built single metadata statement, preserving missing-header
   detection and exact row/header/generation identity checks. A syntactically
   valid foreign/deleted/nonexistent cursor is a position, not an ownership or
   existence capability; it must not require an additional lookup. Owner scope
   still applies before limiting. Existing indexes do not guarantee a covering
   owner/project/turn or C-collated access path: inspect actual plans and legitimate
   many-row samples, without claiming no sort/physical scan or adding an unapproved
   index/migration. Escalate a material measured scope conflict before widening it.

The implementer acknowledged these conditions during review and will commit the
contract correction before code, followed by a narrow exact-delta check. The
original plan remains the reviewed historical input; no correction is assumed
already present in its bytes.

## Pagination, liveness and authority

The proposed raw-row pagination is coherent. Owner/null filtering belongs in SQL;
ordering and strict-greater comparisons must use the same binary order in both
stores. Avoid JS default UTF-16 sorting or localeCompare to reinterpret backend
positions. Scan at most limit rows and use lookahead for raw hasMore, never to seek
another candidate. Every scanned terminal/waiting row advances the cursor. Empty
candidate pages with hasMore=true are valid; last-scanned position, not last item
or the lookahead row, supplies nextCursor. A terminal page returns null. Test
quiescent complete traversals and restart through empty pages, including deletion
of the cursor row. No process-local watermark or snapshot/exactly-once claim is
needed. Live inserts before the cursor require the next explicit cycle.

Potential submitted/preparing/approved states are deliberately broader than
runnable work. Without reading forbidden run payloads, approved records can keep
hinting after their run finishes. Preparing/expired leases or deadlines are also
raw metadata until canonical work inspection. Discovery must not reconcile,
renew, revive, claim, cancel, dispatch or approve. I2 must recheck current owner,
generation, turn/run status and leases before action; stale hints grant no spend
or edit authority. Existing two-minute H preparation deadlines remain unchanged.
The eventual host has no pickup/fairness/latency guarantee from this primitive.

Snapshot exact plain owner binding/input before the first await, using accepted
JSON/accessor safeguards. Project IDs keep the actual ASCII 64-character rule;
null remains exact ownerless scope, never public/all owners. Return a fresh
allowlisted metadata object, without spreading header/turn rows or returning
request keys, digests, lease worker IDs, bodies, plans, run payloads or raw errors.
The CLI's omitted owner can mean explicit null local scope only; discover accepts
no project/provider override, adds no polling/signals/background worker and closes
the selected store. Existing actions retain behavior.

## Inspection and validation boundary

Inspection covered the committed contract/roadmap, accepted state/continuity and
protocol/traps, actual SQLite/PostgreSQL project/runtime schemas, indexes/access
predicates, runtime transaction loading, H metadata schemas/parsers/store, I2 work
and lookup input semantics, Node adapter and CLI. Product/test/governance source
still matches accepted I3. No tests, SQL query plans, backend, model, browser,
build, benchmark or generator executed, and no product/state/roadmap file changed.
Only these review records were written.

Four proposed test entry files should produce 238 files from the 234 accepted entries;
actual inventory and leaf totals remain to be frozen and executed. Require both
actual stores, malformed/oversized raw metadata and missing-header failures,
private/project-body nonmaterialization, complete binary pagination, read-only
row-byte equality, I2 revocation/clear/deletion/stale/terminal rechecks, real child
restart/CLI cleanup and four discover-to-native flows. Retain all nine gates,
standing locale separation, original-byte snapshots/restoration, corrected fresh
resource admission, exact owned-backend cleanup and separate final ACCEPT/HOLD.
No implementation result is supplied by accepted I3 or this readiness. Stop after
I4 acceptance/cleanup; no automatic host/provider/UI continuation.
