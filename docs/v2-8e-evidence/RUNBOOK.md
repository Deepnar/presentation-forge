# V2-8E validation reproduction

**Session stopped at the human's request on2026-10-21.** See
[the paused assessment](paused-2026-10-21/assessment.json) and current state/evaluation.
The old coordinator stopped between files after25complete jobs. Original evidence
and canonical out/ archives have been restored; the owned PostgreSQL service was
removed after saved/fsynced zero and verified5544closure. No validation runs remain.
Do not blindly run --resume or finish-evidence.py against this restored state.
On continuation, audit completed exact-source records, establish a fresh owned
service identity and snapshot ALL current evidence/originals into a fresh namespace.
Preserve the paused captures and actual fresh PPTXs when merging a continuation,
or rerun affected serial generators; do not let assembly silently omit23completed
browser files or replace their current-source outputs with historical originals.
Completed bulk/focused results remain valid evidence; source corrections require
affected reruns. The full scripts below describe an uninterrupted reproduction.

Read the active state/evaluation, roadmap contract and development protocol.
The implementation SHA in validation-plan.json is the source under evaluation;
later documentation/harness commits must have no product/test delta. Fixtures
exercise actual local HTTP for two protocols, not live provider or Auto quality.

## Execution and preservation

Use Node24, the installed Chrome, LibreOffice/Poppler and an explicitly owned
PostgreSQL service. owned-postgres.json identifies this run's PostgreSQL15.18,
localhost5544,1CPU/512MiB and192MiB data tmpfs. Verify its exact ID/name/port;
never reuse another project's database. Missing PostgreSQL leaves its checks
unexecuted. For a new run create a fresh owned service only after measured headroom.

Prepare a fresh output directory; do not overwrite an earlier snapshot or execution.
prepare-full-validation.py waits for180seconds of measured sustained headroom,
verifies the owned service and snapshots every file in docs/v2-*-evidence,
including ignored PPTXs. It separately preserves the five canonical browser
originals in out/. Both snapshots verify hashes before any generators. Exact
counts/paths come from backup-manifest.json and the saved out/ snapshot indices.

```sh
PYTHONDONTWRITEBYTECODE=1 nice -n 10 ionice -c 2 -n 7 python3 -u docs/v2-8e-evidence/prepare-full-validation.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8e-evidence/assemble-results.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8e-evidence/finish-evidence.py
npm run dev:protocol
```

Resume only after auditing the exact-source coordinator and snapshot; --resume
retains recorded complete zero exits, not unacknowledged TAP output. The full
inventory is221 distinct files:187bulk at concurrency4,26 serial browser/build
owners and8 serial PostgreSQL files. Focused three-file execution is a separate
repeat of inventory cases. Run commands and UTC exits/totals are retained in
logs/coordinator.json. Every new job requires two fresh15-second readiness samples,
low CPU/I/O priority and a15-minute process-group watchdog (30minutes for bulk).
Long jobs are monitored; sustained critical contention stops only owned work.
Never overlap browser/build owners. Assertion/timeout weakening is not authorized.

Resource observations include CPU/memory, actual backing NVMe activity/queues,
blocked userspace threads and raw PSI/iowait. Elevated global PSI retains unresolved
provenance; a graphics worker is not proof of its cause. Preserve samples and
environment limitations rather than declaring zero pressure. The separate en_IN
BYOK probe retains its expected standing failure; default bulk uses C.UTF-8.

## Output and inspection

The coordinator captures fresh browser screenshots/measurements before restoring
and hash-verifying its entire evidence snapshot. assemble-results.py indexes raw
logs and eight executed gates; it does not accept work or visually inspect output.
Four extra persisted/native scenarios exercise the new conversation preparation/queue boundary,
both protocols/backends, actual edits, reopen/history restore, native OOXML and
SVG/native rasterization. They are distinct from the221-file primary inventory.

finish-evidence.py must run immediately after fresh capture. It preserves five
fresh browser originals, restores/hash-checks the five previous canonical out/
originals, assembles the image/measurement manifests and contact sheets. Its fresh
source hash checks deliberately refuse running again against restored originals.
Do not reconstruct missing archive bytes or relabel old captures as current.
Read native-archives.json/browser-archives.json for the authoritative new originals.
Inspect all final screenshots and native output, using full-size narrow/native
risk cases as well as contact sheets. Record overlap, clipping and canvas movement.
Native rasterization does not qualify interactive Microsoft PowerPoint.

Save exact test leaf totals, repeats, failures, skips, cancellations and unexecuted
cases. Preserve earlier failed/cancelled development attempts separately. The
independent reviewer needs a fresh namespace and complete current-evidence/original
snapshot; root releases the heavy slot and makes no tracked edits during that
snapshot. Green evidence never supplies self-acceptance. After review or an explicit
pending-review handoff, save/fsync the owned service's project-database count before
stopping its exact ID, then bounded-poll actual removal and port closure.

Stop after this slice's review/cleanup/handoff. Future work lives only in the roadmap.
