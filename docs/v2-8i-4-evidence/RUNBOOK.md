# I4 exact-source validation

Read AGENTS, the I4 evaluation, state and current HANDOFF. Current phase is helper
readiness before expensive execution. No I4 owned database/full matrix exists yet.
Source/tests are pinned in validation-plan.json; helper-source-manifest.json pins
the reviewed coordinator and supporting scripts. Old I3 helpers are frozen and
must never be executed. All providers use offline loopback/injected fixtures.

After separate helper readiness, obtain fresh180-second corrected quiet qualification
and30-second admission before preparation. Use a new exclusive recorded
forge-v28i4-validation PostgreSQL15.18 container from the existing pinned image,
with no image pull; verify final TCP listener and actual empty catalog. Preparation
saves/fsyncs identity before use, snapshots/hash-verifies ALL current historical V2
evidence including ignored PPTXs plus5canonical output originals. It refuses any
previous ownership/snapshot/execution. Never reuse an unrelated service. No generator
may run before snapshots complete. Initial commands for this namespace only:

```sh
mkdir -p out/v2-8i-4-validation
python3 -u docs/v2-8i-4-evidence/quiet_window.py
python3 -u docs/v2-8i-4-evidence/prepare-full-validation.py --prepare-only
python3 -u docs/v2-8i-4-evidence/run-validation.py --max-new-jobs 3
```

If preparation fails after identity is saved but before snapshot/test creation,
retain the failure and inspect that same exact service. Only fresh qualification
plus the guarded --resume-owned-preparation --prepare-only path may recover it;
never create another service or replace the saved identity. Once coordinator.json
exists, audit owned identity/catalog, source and retained logs, then use only:

```sh
python3 -u docs/v2-8i-4-evidence/run-validation.py --resume --max-new-jobs 3
```

Bounded batches yield with no active test process. Every job gets fresh30-second
admission, low priority, process-group watchdog and running-resource observations.
Unknown blocked-task metadata blocks admission; only PF_KTHREAD-positive tasks are
exempt. High unexplained I/O PSI remains an environment limitation. All browser/
Vite/build jobs are serial. Interrupted/unacknowledged logs are preserved exclusively;
never count them as passing or silently truncate an earlier attempt. Source drift,
untracked implementation files or external TEST_PG_URL refuse execution.

The primary238files are198bulk/26serial/14PG-process, with complete disjoint union
assertion. The focused discovery gate overlaps those files. Four extra distinct
both-store/both-protocol cases run HTTP submission→discovery→I2 preparation→explicit
HTTP approval→discovery→I2 execution→reopen/history→native export. No real model
API/local inference is used. Existing HTTP/native archives and designated fault
suites remain required. Separate Indian-locale BYOK9/1 is a diagnostic standing
failure, never a green gate. Unavailable PostgreSQL means unexecuted, not passing.

After ordered execution, assemble actual results, preserve fresh original browser/
native/HTTP archives, rasterize and inspect all final images. Finishing is ONCE:
its guard refuses a second run after original canonical outputs are restored.

```sh
python3 docs/v2-8i-4-evidence/assemble-results.py
python3 docs/v2-8i-4-evidence/finish-evidence.py
node docs/v2-8i-4-evidence/inspect-native-ids.mjs
FORGE_VALIDATION_OUT=out/v2-8i-4-validation python3 docs/v2-8i-4-evidence/assess-resources.py
```

Inspect clipping/overlap/dialogs/canvas movement and original OOXML identities;
rasters/generated files alone are no inspection or interactive PowerPoint claim.
Save actual query plans/128-row pagination times without production percentile or
fixed physical-work promises. Preserve all failed attempts and classify corrections.

Release DB/testing slots to the separate reviewer for exact-source checks. After
its explicit DB-slot release, save/fsync an ACTUAL0project-database observation
before one exact-owned-ID stop; verify bounded and fresh independent absence/5544
refusal. Do not run cleanup while any reviewer/test owns the backend.

```sh
FORGE_VALIDATION_OUT=out/v2-8i-4-validation python3 docs/v2-8i-4-evidence/cleanup-owned.py --after-review-database-checks
```

Record the separate exact-source ACCEPT/HOLD, state, architecture, roadmap and
handoff. Push scoped commits to origin/v2, verify remote and STOP after I4. No
hosted provider/scheduler, Assistant UI, migration or deployment follows automatically.
