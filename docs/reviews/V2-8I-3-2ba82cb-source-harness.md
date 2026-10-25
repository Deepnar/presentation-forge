# I3 source readiness — helper correction required

Read-only review of pushed packet
`85270a867a99d95e64a29cfcf5d4fce11fe22fff` covered frozen implementation/tests
`2ba82cb5c321c21d5648f577469f69e82cdcfb24` against accepted I2
`58662ecc074f7cc29bf29a0dd410d581ffca0eef`. Reviewer/context is
`/root/turn_contract_review`, separate from implementer `/root`, dated 2026-10-25.
Both HEAD and origin/v2 contained the packet when inspected. This is source/helper
readiness, not behavioral validation or implementation ACCEPT.

No material product-source blocker was found. One native-helper setup-failure
cleanup correction is required before preparation/execution. The implementer
acknowledged it during review and will bind the corrected helper hash separately;
this note assesses the original manifest bytes, not an uninspected correction.

## Required narrow correction

`docs/v2-8i-3-evidence/headless-check.mjs:49` registers PostgreSQL teardown before
awaiting `conversationHttpFixture`; `stopApi` is assigned only after that await
resolves. If fixture setup starts its API and then fails during project creation
or its assertions, `stopApi` remains undefined. The earlier teardown attempts DROP
while the API may still hold a PostgreSQL connection; the later fixture teardown
stops that API afterward. The successful path stops the API correctly, but the
setup-failure path can retain a database and report a cleanup failure.

Register final PostgreSQL teardown in a `finally` surrounding fixture setup, after
the fixture's API-stop cleanup has been registered on both success and failure.
Retain parent-store closure, actual DROP, maintenance-pool shutdown and environment
restoration; close the maintenance pool if CREATE fails. Preserve setup errors and
never terminate unrelated connections or hide a leftover catalog. Refresh the
helper manifest after this bounded correction. No product source/test change is
needed for this finding.

## Product and test assessment

The parser clarification was committed before source. Only Express-matching POST
`/conversation/turns` receives the larger parser, before the unchanged 8 KiB prefix
and global parsers. Private headers precede encoding rejection. Structured MIME
parsing rejects unknown/duplicate parameters, non-UTF-8 charsets and nonidentity
encoding; `inflate:false`, raw UTF-8 verification and the 262,144-byte entity limit
are followed by the operation-specific serialized byte guard. Lifecycle/unknown
paths and wrong methods retain their earlier admission. Case and trailing-slash
matching follow Express, while existing late raw-path errors remain sanitized.

Submission passes the exact body to accepted H under session-derived owner/project
authority, without administrator bypass or replacement revisions/request identity.
No provider, queue, run, scene writer, retention policy or new context resolution
was introduced. The added fixed allowlist maps conflicting-request/busy/storage
refusals to 409 and keeps unknown errors private. H remains authoritative for
transactional ownership, generation, replay precedence, reconciliation and bounds.

The shared additions cover real both-store authorization, local ownerless policy,
ownership change after session resolution, matching/distinct concurrency, stale
inputs, changed identity, storage admission, clear, post-commit response loss,
UTF-8/raw-wire boundaries and encoding/private-error negatives. Existing unsupported
`/submit` and execution assertions remain. Both protocol flows exercise actual HTTP
submission, trusted I2 preparation, HTTP approval and canonical execution; the
separate four native scenarios add reopen/history/native evidence. Tests and
scenario claims remain unexecuted at this checkpoint. No assertion weakening was
found in the governance delta; I3 adds the two required HTTP entries to the
existing exact-file focused-gate mechanism.

## Harness and fidelity assessment

Read preparation/coordinator/assembly/finisher, quiet-window/resource assessment,
native/render/archive helpers and exact-owned cleanup/verification. Existing-log
and snapshot guards precede backend creation; recorded same-ID recovery is limited
to pre-snapshot preparation. The coordinator pins loopback maintenance, verifies
owned identity/catalog before children, preserves unacknowledged logs, runs serial
low-priority jobs with watchdogs, and retains focused/subset overlap accounting.
Native/browser originals are copied before restoration; cleanup saves/fsyncs the
actual empty catalog before one exact-ID stop and records bounded observations.
No helper was executed to establish these statements.

Lightweight file reconciliation verified all seven changed source/test/governance
paths against their frozen blobs and hashes, all thirteen helper hashes against
the reviewed manifest, and the complete disjoint 234-file inventory (196 bulk,
26 serial, 12 PostgreSQL), with two focused overlapping entries. These checks
establish inspected identity/inventory only, not executed behavior or isolation.

Only this report and its JSON were written. No tests, services, model calls,
inference, browser, build, generator, backend preparation or snapshot mutation ran.
All current-source behavioral gates, source-bound raw counts, original-byte
preservation, visual/native inspection and separate final exact-source ACCEPT/HOLD
remain pending. No dependent scope is authorized; stop after I3.
