# V2-8I-1 validation tooling readiness

**READY_FOR_BOUNDED_VALIDATION. No remaining material tooling blocker found.**
This is source/evidence preparation review, not implementation acceptance or a
claim that any final gate has executed.

Reviewer/context: `/root/turn_contract_review`, separate from implementer `/root`.
Date: 2026-10-24. Inspected pushed tooling/evidence commit:
`8e64c834f6233d48e093203443b1c1a276ded24b`, confirmed contained in `origin/v2`.
Frozen implementation/tests: `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`;
accepted baseline: `22e7c9749865f3e7c2d62fb8724136e0f19048b0`.
The scoped product/test/configuration diff from the freeze is empty.

The reviewer read preparation, coordinator, assembly, finisher, HTTP/native/shell
export and identity helpers, guarded cleanup and relevant qualification/headless
dependencies. No test, service, database call, browser, build, benchmark, native
generator or helper was executed. No source/evidence/snapshot was changed; only
this note was written. Root retains the resource/execution/database slots.

## Findings resolved before full execution

- The coordinator previously inherited `TEST_PG_URL` independently of the service
  preparation verified. It now rejects a nonmatching override before database or
  child work, supplies only the owned loopback-5544 maintenance URL, and checks
  recorded source/ID/name/image/running/auto-remove/port identity plus the actual
  empty nonmaintenance catalog at each initial/resume entry. Source-bound entry
  checks are retained and copied by the assembler. This closes the identified
  possibility of running fixtures against a different caller-supplied database.
- Initial coordinator execution now rejects existing coordinator records or any
  named job log before opening/truncating `coordinator.log`. Qualification/driver
  logs are distinct from the guarded job names, so a fresh qualified run remains
  admissible. Resume requires acknowledged coordinator records.
- Every unacknowledged job log encountered on resume is copied to an exclusive
  `time_ns`-named file before its active path is reused. File and directory fsync
  precede truncation. Repeated interruptions can no longer overwrite the earlier
  fixed-name retained attempt; an unlikely name collision fails closed.
- The HTTP export label `PostgreSQL` produces `postgresql-approved.pptx`. The
  raster helper now maps its `postgres` backend label to that actual source path,
  while retaining the intended archive/backend naming. Its run/source marker,
  successful counts and freshness checks remain present.

Root's retained black-box negative records were inspected: external fixture-URL
admission and existing sentinel-log admission both exit one as expected, with no
test leaf or actual backend execution. The sentinel record reports unchanged bytes;
raw logs identify the intended guard assertions. These are inspected implementer
harness checks, not independent reviewer execution or final product passes.

## Other inspected properties

Preparation checks frozen source and fresh qualification, refuses replacement of
recorded ownership/snapshots, creates an explicitly isolated pinned-image service,
and saves/fsyncs its identity. Historical evidence and the five canonical original
outputs are copied and hash-verified before tests/generators. Existing unrelated
services are not substituted or stopped.

The coordinator asserts the complete disjoint 231-file inventory, runs bulk at
concurrency one, and serializes all browser/build-owning files. Fresh per-job
admission, low priority, process-group watchdog and owned-process interruption
handling remain. Nonzero exits, skips and cancellations cannot become passing
primary jobs. The separate locale failure remains separately classified. Four
persisted/native scenarios are distinct supplements; focused HTTP repeats and
archive/visual inspection must not be added as new primary leaves.

The capture/export helpers run before historical restoration. The finisher
preserves actual new browser archive bytes before restoring the five canonical
original outputs, with source-hash guards against mistaking restored originals
for new exports. Native/HTTP archive and raster records retain hashes; identity
audits inspect numeric uniqueness within each OOXML part. No ZIP reconstruction
or interactive Microsoft PowerPoint claim is introduced.

Assembly preserves the designated PostgreSQL subsets separately from the full
inventory and focused overlap. Final acceptance still requires independent
reconciliation of raw counts, source identity, backend records, restored hashes,
all relevant images and residual limitations. Generated rasters are not an
inspection record, and a source-only audit does not prove successful execution.

Cleanup is restricted to the exact recorded identity, verifies its actual empty
catalog, saves/fsyncs the observation before stop and bounds subsequent read-only
absence/port checks. Its actual outcomes must remain truthful, including a failed
immediate observation if one occurs; a saved script supplies no cleanup evidence.
No cleanup may precede release of the reviewer's eventual database checks.

Full exact-source gates, independent applicable execution and the final ACCEPT/HOLD
remain pending. Offline-only constraints, historical preservation, resource-pressure
provenance limits and the I1 stop point remain unchanged.
