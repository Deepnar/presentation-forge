# I2 exact-source validation

Read the contract, state and current HANDOFF first. `validation-plan.json` freezes
source/tests. All providers are offline injected/loopback fixtures; no real model
API, local inference, deployment or production database is authorized.

Use Node 24. Check Git, competing CPU/memory/storage and existing listeners before
expensive work. Do not overlap browser/build jobs. After any development coordinator
has released its slot, qualify a sustained window and prepare a fresh backend:

```sh
mkdir -p out/v2-8i-2-validation
python3 -u docs/v2-8i-2-evidence/quiet_window.py
python3 -u docs/v2-8i-2-evidence/prepare-full-validation.py --prepare-only
python3 -u docs/v2-8i-2-evidence/run-validation.py --max-new-jobs 3
```

Preparation requires fresh 180-second qualification plus a fresh 30-second admission.
It verifies unchanged frozen source and previously closed port 5544, creates one
CPU/512 MiB PostgreSQL container from the existing pinned image with no pull, and
saves/fsyncs its identity before use. It snapshots and verifies all current historical
V2 evidence, including ignored PPTXs, and five canonical output originals. It refuses
to replace existing ownership or snapshot records. Readiness probes the final TCP
listener, since the initialization server is Unix-only. If startup fails after
the identity is saved but before snapshots/tests, retain the failure and verify
that exact owned ID. Only then may `--resume-owned-preparation --prepare-only`
recover it with fresh qualification/admission, empty catalog and absent backup/
coordinator guards; it does not create a replacement service. Do not execute I1 or older helpers; they are historical evidence.

The coordinator runs the three-file worker gate, 196 nonbrowser files, 26 serial browser/
build files, 12 PostgreSQL files, production build, typecheck, 50 cells, four persisted/
native cases and fresh native exports. It asserts complete disjoint 234-file inventory.
Every new job has fresh 30-second admission, low priority and a process-group watchdog.
The separate Indian-locale BYOK probe retains the standing failure and is not green.

After inspecting recorded source, exact owned backend/catalog and completed jobs,
resume bounded batches until `coordinator-complete.json` exists:

```sh
python3 -u docs/v2-8i-2-evidence/run-validation.py --resume --max-new-jobs 3
```

Every coordinator entry/restart rejects an external `TEST_PG_URL`, verifies the
recorded container ID/name/image/running state/loopback5544 binding and queries its
actual empty test-database catalog before child work. The maintenance URL is fixed
to that owned service. An initial invocation refuses existing coordinator/job logs;
resume preserves every unacknowledged attempt under an exclusive name before reuse.

Never reuse an unrelated service or count skips/timeouts/cancellations as passes.
Interrupted/unacknowledged logs must be retained; only recorded complete successful
jobs are retained on resume. If source changes, preserve that attempt and execute
fresh exact-source gates rather than retagging results.

The final helpers preserve fresh screenshots, measurements and original exports
before restoring historical files. In addition to eight headless and five actual
browser exports, the HTTP tests preserve two authenticated approval/run/export
archives (SQLite and PostgreSQL) and rasterize all four of their slides.

```sh
python3 docs/v2-8i-2-evidence/assemble-results.py
python3 docs/v2-8i-2-evidence/finish-evidence.py
node docs/v2-8i-2-evidence/inspect-native-ids.mjs
FORGE_VALIDATION_OUT=out/v2-8i-2-validation python3 docs/v2-8i-2-evidence/assess-resources.py
```

The finisher runs once against fresh exports. After restoration its hash guards
refuse to mistake old canonical outputs for current evidence. Never reconstruct
an original archive. Independently inspect contact sheets and relevant full-size
rasters for clipping, overlap and canvas movement; generated images are not an
inspection record. Identity uniqueness is per OOXML part, and LibreOffice rendering
does not qualify interactive Microsoft PowerPoint behavior.

Release the database slot to the independent reviewer for fresh checks. After the
reviewer finishes, save/fsync an actual zero-database observation and remove only
the exact owned container, with bounded read-only absence/closed-port verification:

```sh
FORGE_VALIDATION_OUT=out/v2-8i-2-validation python3 docs/v2-8i-2-evidence/cleanup-owned.py --after-review-database-checks
```

Record exact counts, failed attempts, evidence hashes, performance and limitations.
The reviewer issues exact-source ACCEPT/HOLD separately. Stop after this slice.

The internal loop cap/yield tests use actual B multistep plans. H proposals retain
their one-batch validation, so a multistep visible-turn or CLI-cap claim is invalid.
Development attempt/correction logs are separate and never substituted for gates.
