# V2-8B durable run core evaluation

Implementation in progress; independent review pending. Accepted baseline remains
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

All new implementation checks are pending, not passing. No V2-8A result is execution
of this source. Standing BYOK locale, old B2 restore timeout, Fit/narrow/capture,
mixed-run SVG fidelity and original ignored-PPTX provenance limitations retain their
[existing records](V2-8A-EVAL.md). No provider or hosted-content quality claim.
