# V2-8B durable run core evaluation

The durable run core is independently accepted at
`1fb39ff75cd473ecaf2884232d5d7465d50a9af2` in
[the separate decision](reviews/V2-8B-1fb39ff.md). The task entered from accepted
V2-8A baseline `d4f446c7b2fcae851c37d1a46288cf91317c38b4`; task-entry checkout
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

All required checks of corrected source `1fb39ff` passed and the separate reviewer
issued ACCEPT. Earlier pending/HOLD passages below are execution chronology.
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
on both real backends; the reviewer confirmed the correction read-only. That source completed the first full matrix below and later received HOLD for
remount click readiness. The baseline remains V2-8A pending corrected-source review.

The final coordinator uses separate process sessions, watchdogs and visible progress
heartbeats. A quiet window was sampled before execution; CPU/memory/I/O pressure
was observed during the run. No unrelated process was stopped. Missing or
interrupted execution stays explicit.

## First complete source501f2f8 implementer results

Frozen code501f2f864bc1004c026c4e8ef53f4e907491e428; Node24.16.0, owned isolated
PostgreSQL15.18 and temporary SQLite WAL stores. All212 required files executed.
The [full matrix](v2-8b-evidence/full-matrix.json), [per-job commands/logs](v2-8b-evidence/logs/coordinator.json),
[performance](v2-8b-evidence/performance.json) and [visual review](v2-8b-evidence/VISUAL-REVIEW.md)
identify exact provenance. These results predate the later remount test correction;
they are not counted as execution of1fb39ff.

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

## Independent HOLD and remount correction

[Independent review501f2f8](reviews/V2-8B-501f2f8.md) ran232 primary tests:231pass/
1fail,0skip/cancel. The full7A repeat was27/28, timing out waiting for the editor
after activating Delete. An unchanged filtered diagnostic passed1/1, which did not
explain the original untraced sequence. A controlled actual generated-source response
then reproduced0/1: Open moved32px upward when loading status disappeared; trusted
pointer down/up/click at the old coordinates hit Delete. Controlled cause is proven;
no claim is made to reconstruct the original untraced events. Build/type/benchmark/
new native evidence were unexecuted in that halted independent attempt.

Scoped correction source1fb39ff waits for actual saved/generated loading statuses,
mount motion, fonts and a stable unobscured Open target before each remount click.
All3loops, one mounted save machine and exactly1durable commit assertions remain.
No runtime or product UI code changed. The inherited catalog loading layout shift
is [separate roadmap work](ROADMAP.md#catalog-loading-layout-stability). Fresh
complete execution and final independent review use `v2-8b-evidence/final/`; earlier
501f2f8 artifacts and hashes remain intact. The accepted baseline stays V2-8A.

## Corrected source1fb39ff complete implementer results

Exact source `1fb39ff75cd473ecaf2884232d5d7465d50a9af2`; later commits contain
reports/evidence only. Node24.16.0, temporary SQLite WAL stores and the same owned
isolated PostgreSQL15.18 on127.0.0.1:5544. A quiet window sampled4.96% CPU busy,
zero CPU/memory PSI and zero I/O avg10, with49.6GB available memory. No overlapping
browser/build/native jobs or unrelated service/database use occurred.

The [fresh matrix](v2-8b-evidence/final/full-matrix.json),
[exact commands and watchdog exits](v2-8b-evidence/final/logs/coordinator.json),
[performance](v2-8b-evidence/final/performance.json) and
[visual review](v2-8b-evidence/final/VISUAL-REVIEW.md) retain complete results.

| Check | Pass | Fail | Skip | Cancelled | Unexecuted |
|---|---:|---:|---:|---:|---:|
|181-file non-browser bulk|2178|0|0|0|0|
|26 serial browser/build owners|208|0|0|0|0|
|Existing PG backend/import contracts|23|0|0|0|0|
|Existing PG cross-process/faults|19|0|0|0|0|
|New PG runtime contracts/process cases|34|0|0|0|0|
|**Complete212-file matrix**|**2462**|**0**|**0**|**0**|**0**|
|Distinct persisted native evidence cases|2|0|0|0|0|
|Focused runtime repeat, excluded from distinct totals|69|0|0|0|0|
|Separate standing en_IN BYOK probe|9|1|0|0|0|

Required distinct total2464/2464; including the separate69-case focused repeat and
10-case locale probe,2543 executions yield2542pass/1standingfail,0skip/cancelled.
Full7A is28/28 with all3remount loops and original single-machine/revision1 checks.
Build/typecheck pass; canonical benchmark50/50 cells. No assertions were weakened.
All99 fresh images were inspected:76browser,15native,8SVG. The2871 snapshot files,
including ignored and current-slice archives, were restored with matching hashes.
Fresh four original PPTX archives are force-tracked separately from earlier exports.

Local SQLite/PG claim1.41/3.17ms; atomic commit11.93/9.44ms; trace1285bytes each.
Actual killed-worker checkpoint recovery is226–230ms SQLite and261–278ms PG,
excluding lease wait.120slides/120thumbnails opened in1532ms. Maximum measured
canvas delta across7A/B1/C3 is0.102898px;7A alone0.018990px, below1px gates.
These local samples do not establish production percentiles. Native exports
preserve real runs/charts/tables and unrelated scenes; SVG mixed runs still flatten.

The separate reviewer accepted the bounded durable core. The inherited 32px
catalog loading reflow, locale/Fit/capture/timeout/SVG and historical original-PPTX limits remain separate.
No provider, Assistant UI, production migration or deployment was added.

## Independent acceptance and cleanup

[The exact-source decision](reviews/V2-8B-1fb39ff.json) accepts only the approved
headless durable core. Review commit `467b2e77e988af97728d814e35ce7d61680d7621`
retains the separate context, source-delta proof, diagnostics and inspected evidence.
Fresh independent execution is **65/65**: full Chrome 28, controlled remount 1,
governance/boundary/drift/usage 34 and persisted native 2, with zero failures,
skips or cancellations. Build, typecheck, protocol and all 50 cells also passed.
The controlled case excluded 27 cases by name filter; the complete file separately
executed every one. All three delayed-response cycles held point null/Open events
zero, then all nine trusted pointer events targeted Open after release. The original
single-machine and saved-revision-1 assertions passed.

Earlier independent 204 successful checks on `501f2f8` remain prior-source evidence,
with explicit proof that runtime/tools/stores were unchanged. They overlap fresh
execution by 34 and are not relabeled or blindly added. The complete implementer
matrix was independently reconciled and inspected, rather than independently
repeated in full. The reviewer inspected all 99 final images and 28 fresh images,
including native/SVG output and exact rich-run OOXML preservation. All 3,193 backup
hashes, including 28 original archives, matched after restoring 16 changed paths.
Six fresh independent archives have separate paths/hashes. The brief usage-limit
interruption occurred after all eight independent jobs completed; final inspection,
restoration and the explicit decision resumed without fabricating acceptance.

Two additional metadata-only governance repeats passed 24/24 each: one while
review was pending and one after attaching acceptance. Their 48 repeated cases
are excluded from the 2,464 distinct required cases and the matrix/focus/locale
2,543-execution subtotal. Including those repeats, final implementer execution
is 2,591 leaves: 2,590 pass, 1 standing locale failure, zero skip/cancelled.
These repeats do not represent additional product coverage or independent review.

The state file now attaches this independent decision and advances the accepted
baseline to the reviewed source. The previous HOLD remains historical. Scoped
corrections comprise checkpoint consistency, PostgreSQL checkout listener cleanup
and remount test readiness; no product redesign or weakened assertion was applied.

[Cleanup evidence](v2-8b-evidence/final/cleanup.json) records the exact owned
PostgreSQL container, a saved/fsynced zero-database observation before stopping,
auto-removal and closed localhost port 5544. The first immediate post-stop probe
raced asynchronous removal; the subsequent bounded observation confirmed cleanup.
No unrelated service/database was stopped or reused. Missing PostgreSQL for a
future run leaves those checks unexecuted and does not alter historical results.

Acceptance recommendation is satisfied by the independent ACCEPT. Stop after this
slice. Provider/Assistant/search and other remaining V2 work require their own
roadmap scope; this acceptance grants no deployment or production schema migration.
