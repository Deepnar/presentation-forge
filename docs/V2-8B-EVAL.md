# V2-8B durable run core evaluation

Implementation and required validation complete; independent review pending. Accepted baseline remains
`d4f446c7b2fcae851c37d1a46288cf91317c38b4`; task-entry checkout
`fa1ba84378af33fe3a1654d4bd177523e1dbf080`, branch `v2`, push `origin/v2`.
The human selected the recommended scope on 2026-10-19. The approved contract and
sole future-work registry are [the roadmap](ROADMAP.md#v2-8b-scope-proposal).

## Frozen implementation contract

Shared headless control/worker APIs and CLI, existing Node/Express stack, no new
public transport or Assistant UI. A bounded immutable scripted semantic plan binds
trusted owner/project/read/edit/selection scope at start. Persist request identity,
plan, cursor, expected durable project revision, attempt/failure budgets, absolute
deadline, lease/fencing token and concise receipts. Read results are delivered to
the caller but not copied into durable trace; a scripted plan needs only its cursor
and receipts to recover. No prompts, credentials or raw scene copies in run records.

Claim/renew/cancel/reserve/execute use the same project lock order. Reserve an
attempt durably before execution, including crashes before effects; recovery never
refunds attempts. A lease takeover fences every old reservation. A step executes
canonical tools against a fresh validated engine in the project transaction; its
engine revision starts at zero. Tool `baseRevision` refers to that engine only;
the run separately checks its expected durable revision. No automatic rebasing
over human edits. Project payload, existing history and receipt commit together.
Noop/read/refusal receipts do not create project history. Cancellation serializes
with commit and prevents subsequent effects. Deadline/lease checks repeat before
durable effects. A stale worker cannot commit. Session undo remains unchanged;
durable history is the restoration mechanism. No external exactly-once claim.

Additive tables initialize only when the runtime is explicitly invoked. They use
the existing chosen backend, project-scoped uniqueness and deletion cascades.
Both SQLite FIFO/BEGIN IMMEDIATE and PostgreSQL project FOR UPDATE transactions
must satisfy the same contract. No production schema application is authorized.

## Required checks and common gates

The validation plan extends every accepted 209-file test with three runtime files
(contract, actual process recovery/races, isolated PostgreSQL contract/process
execution). All 26 browser/build owners remain serial with watchdogs, no overlapping
Vite or native renderer. Full bulk, PostgreSQL backend/import/concurrency/fault,
production build, strict typecheck and canonical 50 cells remain mandatory.
Run focused runtime tests on both backends, real kill/restart/fencing/cancellation,
atomic fault injection, duplicate identity, stale saves, bounded records/budgets,
owner/deletion/lock refusals and exact preservation. Export the saved edited project,
inspect native OOXML and native/SVG raster output. Record local claim/commit/recovery
latencies and trace bytes without production percentile claims.

Correctness, integrity, security/ownership, regeneration/undo, native output,
regression, compatibility and documentation gates apply directly. Browser,
accessibility and responsive gates use unchanged-UI regression evidence. Deployment,
live-provider quality and new UI gates are outside this slice. Wait for a quiet
window; missing PostgreSQL means unexecuted. Independent high-effort exact-source
review supplies ACCEPT/HOLD; the implementer does not accept. Stop after this slice.

## Validation status and known limitations

All required final-source checks passed; independent acceptance remains pending.
No V2-8A result is execution of this source. Standing BYOK locale, old B2 restore timeout, Fit/narrow/capture,
mixed-run SVG fidelity and original ignored-PPTX provenance limitations retain their
[existing records](V2-8A-EVAL.md). No provider or hosted-content quality claim.

## Execution chronology (not final acceptance)

The first source `1f309d02f5e564b7ea4fbbd6aebb3faf02a57aa9` passed focused67 and
bulk2177. Chrome emitted complete28/28 TAP, but the coordinator exited143 before
recording the watchdog result; that attempt cannot satisfy the Chrome gate.
Remaining25 serial files,5 PG files, build/type/benchmark/headless were unexecuted
in that attempt. Output, images and the explicit interruption record are retained
under `v2-8b-evidence/attempts/source-1f309d0/`. Earlier evidence bytes were restored.

A separate read-only review found a product checkpoint-integrity defect: the loader
accepted some schema-valid receipts with impossible earlier revisions or counters.
A shared fail-first test reproduced this as a missing rejection. Correction source
`501f2f864bc1004c026c4e8ef53f4e907491e428` reconciles every receipt with the plan,
changed-driven saved/engine revisions, monotonic run revisions and failure totals,
and rejects impossible active cursors/reservations. All69 runtime tests passed
on both real backends; the reviewer confirmed the correction read-only. Full final
matrix execution is refrozen to that source. The baseline remains V2-8A, and
independent behavioral review/acceptance remains pending.

The final coordinator uses separate process sessions, watchdogs and visible progress
heartbeats. Rising shared I/O pressure pauses it before heavy bulk/browser work;
no unrelated process is stopped. Missing or interrupted execution stays explicit.

## Final implementer results

Frozen code501f2f864bc1004c026c4e8ef53f4e907491e428; Node24.16.0, owned isolated
PostgreSQL15.18 and temporary SQLite WAL stores. All212 required files executed.
The [full matrix](v2-8b-evidence/full-matrix.json), [per-job commands/logs](v2-8b-evidence/logs/coordinator.json),
[performance](v2-8b-evidence/performance.json) and [visual review](v2-8b-evidence/VISUAL-REVIEW.md)
identify exact provenance. No runtime/test/tool delta follows the frozen source.

| Check | Pass | Fail | Skip | Cancelled | Unexecuted |
|---|---:|---:|---:|---:|---:|
|181-file non-browser bulk|2178|0|0|0|0|
|26 serial browser/build owners|208|0|0|0|0|
|Existing PG backend/import contracts|23|0|0|0|0|
|Existing PG cross-process/faults|19|0|0|0|0|
|New PG runtime contracts/process cases|34|0|0|0|0|
|**Complete212-file matrix**|**2462**|**0**|**0**|**0**|**0**|
|Distinct persisted native evidence cases|2|0|0|0|0|
|Focused runtime repeat (excluded from distinct totals)|69|0|0|0|0|
|Separate standing en_IN BYOK probe|9|1|0|0|0|

Required distinct cases total2464/2464. Final execution including the69-case repeat
and separate locale probe is2543 leaf executions:2542pass,1standingfail,0skip,
0cancelled. Development/first-source attempts and later independent repeats are
separate. Production build/typecheck passed; canonical benchmark50/50 cells. All99
final images inspected:76 browser,15 native and8 SVG. The2575 prior evidence files
including ignored artifacts were restored with matching hashes. No assertion was
weakened; receipt corruption and pooled-listener defects were corrected narrowly.

Local samples: SQLite/PG claim1.25/4.61ms, atomic commit7.88/10.73ms, trace1285bytes
each. Actual killed-worker checkpoint recovery (claim through separate worker
commit, excluding lease wait)195–263ms SQLite and222–254ms PG across final-source
full/focus repeats.120slides/120thumbnails opened in1538ms; canvas delta≤0.031px.
These are local measurements, not production percentiles.

The implementer recommends acceptance of the bounded headless core, subject to the
separate exact-source decision. Assistant UI, providers/search/generation, external
network exactly-once effects, production schema application and deployment were not
implemented or claimed. All standing limitations above remain separate.
