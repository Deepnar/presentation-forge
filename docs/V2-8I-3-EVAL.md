# V2-8I-3 — authenticated durable turn submission

## Authority and entry

The 2026-10-25 continuation requests the immediate next work after I2 acceptance.
The existing-deck-first dependency order and preference for proceeding with the
recommended bounded step are already given. This implements the submission
transport dependency of [the approved sequence](ROADMAP.md#assistant-surface-integration).
It preserves the explicitly approved H retention/ownership policy and adds no
provider dispatch or new data disclosure. No further product choice is inferred.

Accepted baseline: `58662ecc074f7cc29bf29a0dd410d581ffca0eef`, independently
[accepted as I2](reviews/V2-8I-2-58662ec.json). Entry checkout:
`aeeb9de5f504c04f7269a1bb6259df005dc5bcff`; branch/push: `v2`/`origin/v2`.
Original `.agents/` and both untracked master/architecture prompt files stay intact.
At plan preparation no new product code, tests, services or model calls had run.
Source/tests are now committed at `2ba82cb5c321c21d5648f577469f69e82cdcfb24`.
The [source manifest](v2-8i-3-evidence/source-manifest.json) binds seven changed
source/test/governance files and the new validation helpers. Syntax/protocol checks
passed at the initial checkpoint; resumed execution is recorded below.
Full exact-source validation and independent implementation acceptance are pending.
The [separate source/helper review](reviews/V2-8I-3-2ba82cb-source-harness.json)
found no material product blocker. Its required native fixture setup-failure
cleanup correction was committed at `d09b61c`, with old/new helper hashes in
[the correction record](v2-8i-3-evidence/helper-review-correction.json). The same
reviewer subsequently checked the exact delta and confirmed readiness, without
executing tests or issuing implementation acceptance. Quiet-window qualification
did not admit execution; the admission-only attempt is closed below.

## Admission-only checkpoint — behavioral execution unexecuted

[The retained assessment](v2-8i-3-evidence/admission-only-2026-10-25/assessment.json)
records 45 samples over 677.38 seconds: mean CPU 22.18%, peak 79.77%, five samples
at or above 50%, and no qualified 180-second window under unchanged thresholds.
Global I/O PSI/iowait provenance remains unresolved. Only the exact owned read-only
sampler was interrupted (exit130); no test leaf was started or cancelled, and no
backend, build, benchmark, generator or model call started. Unrelated work was
untouched. Old evidence and original exports still hash-match.

| Current-source behavioral result | Count |
|---|---:|
| Executed / pass / fail / skip / cancelled leaves | 0 / 0 / 0 / 0 / 0 |
| Unexecuted primary entry files | 234 |
| Unexecuted focused files, overlapping primary | 2 |
| Unexecuted distinct persisted/native scenarios | 4 |
| Unexecuted required gates | 9 |

Production build, typecheck and all 50 benchmark cells remain unexecuted. Leaf totals
are undetermined until actual execution; syntax/protocol checks and read-only
review are not behavioral passes. Implementation acceptance remains pending; the
recommendation is to withhold acceptance until full validation and independent
review complete. Resume with fresh qualification/preparation in the linked runbook,
then stop after I3. No validation process or I3 owned service remains.

## Resumed validation — 2026-10-26

Fresh qualification passed after the host restart: 180.42 seconds, mean CPU4.72%
and backing-storage busy2.34%, with unchanged thresholds and fresh admission.
[Provenance](v2-8i-3-evidence/qualification-provenance.json) distinguishes the new
window from the preserved prior attempt. A new exact owned PostgreSQL15.18 instance
at loopback5544 is recorded in [the ownership record](v2-8i-3-evidence/owned-postgres.json).
Preparation snapshotted/hash-verified all6965historical files/221original PPTXs and
five canonical outputs before any generator.

The [focused HTTP gate](v2-8i-3-evidence/conversation-http.json) passed66/66 across
the actual SQLite and PostgreSQL entries, with0fail/skip/cancelled. These two files
overlap the complete primary inventory; no complete matrix total is inferred.
The196-file nonbrowser bulk set also passed2545/2545,0fail/skip/cancelled. The
remaining full regression/native/build/typecheck/benchmark/visual gates are
in progress or unexecuted, and implementation acceptance remains pending. Only
injected/loopback providers are used; no real model API or local inference ran.

The first7A browser attempt was cancelled by three critical backing-storage samples
at97.87/97.96/98.27%busy. Its retained partial TAP records20passing leaves and8
uncompleted/unreported leaves, no final summary and no reported leaf failure/skip/
cancellation total. The file is cancelled, not passed; all28leaves must run again.
[The interruption packet](v2-8i-3-evidence/resource-interrupted-7a-attempt-1/assessment.json)
retains raw logs, samples and available captures. No Node/Chrome validation process
remained; an unrelated system fstrim was observed and left untouched, without
claiming exclusive causation of the disk contention.

The resource audit then found executable-link visibility could misclassify a
permission-denied userspace process as a kernel task. The validation helper now
uses readable per-thread stat PF_KTHREAD flags; only positively identified kernel
tasks are exempt, and unknown metadata blocks admission. Numeric resource
thresholds are unchanged. [The correction record](v2-8i-3-evidence/blocked-thread-classifier-correction/record.json)
binds old/new helper hashes and10passing metadata-oracle checks, separately from
product leaf cases. Old samples remain unchanged; the disappeared trim task's old
flags are unavailable and are not reconstructed. Fresh corrected qualification and
admission are required before retry. Product/tests/governance remain exact2ba82cb.

## Bounded contract

Add **POST `/api/v2/projects/:id/conversation/turns`**, a thin transport to existing
H `submit(binding, input)`. Resolve `{owner,id}` through the existing session/project
policy, never the body. Hosted anonymous access is 401; missing/cross-owner access,
including administrators reading another owner's private chat, is 404. Local
ownerless mode retains accepted access behavior. H rechecks project ownership in
its transaction; no atomic in-flight session-revocation fence is claimed.

Input is exactly the accepted `TurnSubmission` schema: generation, conversation
revision, request key, saved project revision, scoped readable slides/editable
targets/selection, visible request, bounded semantic reads and existing context/
exchange/token limits. Reject extra authority, provider/configuration, credentials,
scene/layout, edits, run identity or execution fields. Clients supply expectations
and bounded requests; H remains the authority on admission, revisions, replay,
storage reservation, deadlines and all subsequent decisions. No new schema, SQL,
queue, store authority or credential resolver is introduced.

The new endpoint accepts `application/json`, optionally declaring `charset=utf-8`,
with absent or `identity` Content-Encoding only. Other charsets and compressed
entities return private 415 without body decoding. The submission parser admits
at most **262,144 UTF-8 wire bytes**, matching H's existing serialized submission
ceiling. Install it on this exact Express-matching POST route before the
existing 8 KiB conversation-prefix parser and global 8 MiB parser. Preserve 8 KiB
admission on every lifecycle route, unsupported private path and other method.
Valid Unicode requests above 8 KiB must work. Oversized wire bodies are 413 even
when their parsed representation is smaller; parsed submissions are bounded again
before service dispatch. Domain validation still rejects semantically invalid
requests. Malformed JSON, URI/case variants, unsupported media types, queries and
unexpected backend errors retain fixed private JSON errors without input echo.
All responses, errors and refusals carry `Cache-Control: private, no-store`.

Return 200 with H's persisted result for a fresh submission or matching request-key
replay. A successful response truthfully reports the current saved turn, not a
provider invocation or edit. Matching replay uses H's existing identity/revision
rules even if the original response was lost or the conversation has advanced.
Changed identity for the same key is `conflicting-request` 409; active-turn
contention is `busy` 409; storage admission refusal is `storage-limit` 409.
Stale generation/conversation/project is 409; invalid input 400/422, absence 404,
disabled storage 403 and unavailable/misconfigured storage 503 retain existing
sanitization. A disconnect does not undo a committed submission; retry reopens the
same durable turn. Exact HTTP errors must not expose private requests or SQL.

Submission alone must leave deck/history unchanged and create no proposal,
provider attempt or run. Existing trusted worker preparation, explicit HTTP
approval and canonical worker execution can subsequently consume the submitted
turn without transport-specific adapters. CLI parity already exists in
`agent-chat submit`; preserve its behavior. Existing `/submit`, `/prepare`,
`/claim`, `/advance` and worker routes remain unsupported private 404s.

## Non-goals and look-ahead

No browser UI, automatic turn execution, provider/default/fallback/credentials,
host discovery/scheduler/daemon, account billing policy, new cross-turn context,
search/creation tools, storage/retention change, dependency, deployment or migration.
No live API-backed model or local inference is permitted. Use injected/loopback
fixtures only. Future orchestration derives authority and policy from the host,
discovers work over existing stored identities, and reuses I2; submitting a client
token budget is not host authorization to spend it. Save/draft synchronization and
visible proposal/cancel/status interactions retain the next surface contract.
All future work lives only in [the roadmap](ROADMAP.md#assistant-surface-integration).
The separate [plan readiness review](reviews/V2-8I-3-plan-a20ebad.json) is
READY_FOR_IMPLEMENTATION with the UTF-8/identity clarification above; it supplies
no implementation acceptance or test execution.

## Verification and acceptance contract

Extend the existing shared HTTP contract and its actual SQLite/PostgreSQL entry
files, without removing the prior unsupported `/submit` assertions. Verify:

- Persist/read/export and identical request-key replay, including concurrent
  submissions and response loss; changed identity, busy, stale generation,
  conversation/project and storage-limit refusals.
- Signed-out, cross-owner, administrator, local-ownerless, deleted project,
  ownership change and revoked session behavior; no mutation on refusal.
- Exact payload policy, queries/media types, malformed/oversized wire bytes and
  valid large Unicode input. The larger parser must never widen lifecycle/unknown
  path/method admission; URI/case failures remain private and sanitized.
- Actual persisted submission leaves scene/history and provider/proposal/run rows
  unchanged. A real loopback preparation → explicit HTTP approval → I2 execution →
  reopen/history/export flow preserves text/chart/table edits and unrelated human
  properties. Cover both stores and the accepted two provider protocols.
- Unexpected backend failures are fixed JSON; client disconnect/retry reuses the
  committed turn. Current H/B/worker/CLI contracts remain intact.

All common gates apply through the same nine-check inventory: conversation-http,
complete nonbrowser bulk, bounded serial browser/build files, PostgreSQL contracts,
designated cross-process faults, production build, typecheck, canonical 50-cell
benchmark and frontend/native visual inspection. The prepared
[234-file inventory](v2-8i-3-evidence/validation-plan.json) is complete and disjoint;
freeze its implementation SHA only after source/test/helper review. The focused
HTTP gate repeats two primary files; fault/project subsets and development repeats
must not be added to distinct coverage. The locale probe remains a separate
standing failure, never a pass or inferred waiver.

Before expensive work qualify a quiet shared-machine window, then fresh admission
per job. Run serially at low priority with process-group watchdogs and exact leaf
pass/fail/skip/cancel/unexecuted counts. Retain every failed attempt and classify
product, fixture, timing, environment or governance corrections. No assertion may
be weakened to obtain green results. PostgreSQL checks without the actual owned
backend are unexecuted. Never reuse another project's database or stop its work.

Use a new I3 evidence/output namespace and newly recorded owned PostgreSQL instance,
with no image pull. Refuse occupied port/existing records before creation; save/
fsync identity before use and verify final TCP readiness/empty project DB catalog.
Snapshot/hash-verify all current V2 evidence, including ignored original PPTXs and
five canonical outputs, before generators. Never execute old finishers against
restored outputs. Retain exact fresh browser/HTTP/headless originals and inspect
final screenshots/rasters for clipping, overlap and canvas movement. Audit per-part
native IDs. Restore/hash-verify every historical original without reconstruction.
Record code SHA/delta, actual backends, resources, performance and limitations.

Acceptance requires the original full scope, all applicable completed gates and a
separate exact-source ACCEPT/HOLD. The implementer cannot accept its own work.
After the reviewer's DB release, save/fsync an actual empty catalog before one
exact-owned-ID stop and verify bounded absence/closed port. Attach only the actual
decision, update architecture/roadmap/state/handoff, push scoped commits to origin/v2
and **STOP after I3**. No dependent scheduler or Assistant implementation follows
automatically. Interactive Microsoft PowerPoint and live Auto quality remain
unexecuted unless separately authorized; no claim of either follows from fixtures.

Corrected classifier qualification passed180.41seconds across12fresh samples,
meanCPU6.73% and NVMe1.16%, after separate helper readiness review of6504064.
The full7A retry then passed28/28,0fail/skip/cancelled; the cancelled first
attempt remains excluded from complete primary totals. Bounded serial execution
continues on unchanged runtime/test source2ba82cb.

The bounded serial checkpoint preserves147/147 leaves across19of26complete files,
0fail/skip/cancelled, in [serial-progress-19-files](v2-8i-3-evidence/serial-progress-19-files/checkpoint.json).
This checkpoint is incomplete and does not mark the serial gate passed. The
remaining seven serial files and subsequent PostgreSQL checks are in progress.

The complete26-file serial set subsequently passed208/208,0fail/skip/cancelled,
with fresh per-job admission and no overlapping builds. The earlier19-file
checkpoint and cancelled7A attempt remain chronological evidence. PostgreSQL and
subsequent gates are still pending.
