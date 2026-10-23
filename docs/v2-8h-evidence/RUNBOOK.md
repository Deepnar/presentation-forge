# V2-8H exact-source validation

Source/tests are frozen by `validation-plan.json`. Node 24; offline injected or
loopback providers only. No production deployment, database or model endpoint is
used. The nine required gates and file mapping live in the state/checker.

From the repository root, first inspect Git, competing CPU/memory/I/O and existing
services. Do not overlap any browser/build job. Then qualify a sustained window:

```sh
mkdir -p out/v2-8h-validation
python3 -u docs/v2-8h-evidence/quiet_window.py
python3 -u docs/v2-8h-evidence/prepare-full-validation.py
```

The preparation command requires fresh 180-second qualification, verifies exact
source, creates one CPU/512 MiB isolated local PostgreSQL container on previously
closed port 5544, and records its exact identity with fsync before use. It does not
reuse any other database. It snapshots and hash-verifies all historical V2 evidence
(including ignored PPTX files) and the five canonical output originals before any
full regression. Snapshot creation refuses to overwrite a previous snapshot.

The serial coordinator runs the focused four-file gate, all 194 bulk files, each
of 26 browser/build-owning files alone, each of nine PostgreSQL files, production
build, typecheck, canonical 50 cells and persisted/native/browser-export checks.
Every job has a fresh 30-second admission window, low scheduling/I/O priority,
bounded process-group watchdog and raw log/counts. Three sustained critical samples
stop only the owned validation process group. A timeout, skip or absent PostgreSQL
is not a pass. The separate Indian-locale BYOK run is expected to retain its known
failure; it is not relabelled as a passing regression run.

If interrupted, inspect the exact owned container and database list, Git/source
and coordinator records before any resume. Do not invoke preparation over its
existing ownership/snapshot files. If its recorded service is still running and
owned, resume only the coordinator with `--resume`; it requires the same source and
retains only complete successful records. A missing service requires an explicit
identity/cleanup audit before replacement. Never overwrite an unacknowledged log.

Before restoration, copy fresh browser screenshots/measurements/exports into this
new namespace. Native checks rasterize the actual new exports. Inspect contact
sheets and full-size relevant screenshots for clipping/overlap and canvas movement;
record this separately from execution. Restore historical evidence and all five
canonical originals from verified snapshots, then verify every baseline hash.
Never reconstruct an original PPTX by rewriting ZIP entries.

After all database jobs, capture/fsync a fresh zero-test-database observation and
remove only the recorded container after verifying its ID/name/image/port. Confirm
port 5544 is closed. Commit bounded evidence, exact totals, inspected visuals,
performance and limitations. Separate exact-source ACCEPT/HOLD is mandatory; the
implementer cannot accept or start dependent Assistant work.

The first b095bba attempt stopped at a boundary assertion before any browser work.
Its snapshots and owned backend were retained. The corrected cc3ed18 run uses
`FORGE_VALIDATION_OUT=out/v2-8h-validation-r2`: qualify that directory with the same
180-second command, then `restart-corrected-validation.py`. This verifies the exact
recorded service and zero leftover databases and links the original immutable
snapshots; it never resnapshots possibly rewritten originals or erases failed logs.

A later coordinator process exited143 between suites, after three complete browser
files. No leaf was cancelled. Resume is now bounded with `--resume --max-new-jobs 3`
so each invocation hands off between complete jobs; repeat until
`coordinator-complete.json` exists. Complete recorded jobs are retained, and every
new job still gets its resource window, watchdog and unfiltered test command.
The final assembler still requires the complete 229-file inventory.
