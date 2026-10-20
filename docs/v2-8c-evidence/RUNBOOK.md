# V2-8C validation reproduction

Frozen implementation e41d509c20fca21a70b9a0c587ccb83684aee7e6; accepted entry
baseline1fb39ff75cd473ecaf2884232d5d7465d50a9af2. Later evidence commits contain
no product/test delta. Read the active state, evaluation, development protocol and
reviewer role before running anything. This is the bounded exchange primitive,
not live provider or content-quality qualification. Fixtures require no live keys.

The exact source is now independently accepted in reviews/V2-8C-e41d509.json.
Both contexts completed their planned executions; the owned service was removed
after a saved/fsynced zero-database observation and port5544closure (cleanup.json).
A reproduction needs its own fresh isolated service and current-evidence snapshot.
The independent snapshot covered3473 files/50 originals and preserved10 new originals
beyond the13 implementer originals; preserve all of them before new generators.

## Environment and execution

environment.json records Node24.16.0, Chrome151.0.7922.173, Python3.14.7,
LibreOfficeDev26.8 and Poppler26.05. Owned PostgreSQL15.18 uses localhost5544,
1CPU/512MiB and192MiB data tmpfs. Original and replacement container identities
are separate. Never reuse another project's database or stop unrelated services.

Before generators, preserve every existing file under docs/v2-*-evidence, including
ignored PPTXs, under a new owned backup with path/byte/hash index. Preserve the five
existing canonical browser archives separately: out/v2-7a-validation/shell-{chart,table}.pptx,
out/v2-7b-1-validation/browser/imported-{chart,table}.pptx and
out/v2-7b-2-validation/browser/handoff.pptx. Preserve only originals that actually
exist; do not invent missing bytes. This packet's active snapshot was3198 files,
including32 original archives, plus those five separately saved browser originals.
Keep the13 new originals in this slice before independent generators too.

The coordinator uses out/v2-8c-validation and its backup/index.json. Do not overwrite
a prior run: archive its owned output directory first and prepare a fresh snapshot.
Do not replace or reset a checkout to match a prompt. Current unrelated untracked
paths are .agents/ and the two PRESENTATION_FORGE_V2_* prompt/workdoc files.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -u docs/v2-8c-evidence/resume-after-quiet.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8c-evidence/assemble-results.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8c-evidence/finish-evidence.py
npm run dev:protocol
```

The recovery wrapper creates a new isolated service only when its owned name is
absent, then uses run-validation.py --resume. Resume requires the existing exact-source
coordinator.json/logs and snapshot; it retains only recorded completed zero exits
and repeats unacknowledged jobs. A brand-new execution instead uses run-validation.py
without --resume after preparing the isolated service/snapshot. Exact child commands
are in logs/coordinator.json. Inventory is215 files:183 bulk at concurrency4,
26 browser/build owners serially, six PostgreSQL files serially. Every child has
nice/ionice and a15-minute watchdog (bulk30 minutes). Never overlap a browser file
with another browser/build. Missing PostgreSQL is unexecuted, not passing.

quiet_window.py qualifies sustained CPU/memory/backing-storage headroom and obtains
two fresh15-second acceptable samples per new job. It logs ongoing jobs and stops
only owned validation on sustained critical contention. resource-assessment.json
documents thresholds, actual backing mounts and the unresolved elevated global PSI/
iowait limitation. Keep raw pressure/queue/blocked-thread observations; do not
attribute all pressure to an observed graphics worker. Failed, interrupted or
timed-out jobs remain incomplete; no assertion or timeout adjustment is authorized
by this runbook.

## Outputs and interpretation

full-matrix.json counts2529 successful inventory leaves. The four headless persisted
provider/native cases are distinct;66 provider-focus and46 resource-qualification
leaves are repeats, as are25 governance-index checks (137 repeats total). The separate locale probe intentionally retains its observed
9pass/1standing-failure result. No required case is unexecuted in this packet.
The earlier cancelled source52821fb and unacknowledged pre-restart selection output
remain historical attempts, not added to successful totals.

The coordinator collects76 fresh browser PNGs and measurements before restoring
and hash-checking the evidence snapshot. assemble-results.py records eight execution
gates; it does not accept the implementation or complete visual inspection.
finish-evidence.py preserves five fresh browser PPTXs, restores the five previous
canonical originals, combines115 images and builds20 contact sheets. It does not
automatically inspect images. Run it only immediately after fresh capture: its
source hashes deliberately refuse stale canonical originals after restoration.

images.json and VISUAL-REVIEW.md cover76 browser,23 native and16 SVG rasters.
native-archives.json owns eight fresh persisted before/after originals;
browser-archives.json links five fresh browser originals. OriginalArchive/PPTX
paths in those manifests are authoritative after canonical out/ files are restored.
Contact sheets alone cannot establish small-text legibility: inspect narrow dialogs
and edited text/chart/table output at full resolution. OOXML/native rasters are
not interactive Microsoft PowerPoint or live model quality qualification.

Independent review uses a fresh independent/ namespace and owned scratch outputs,
backs up all current evidence/original archives, then restores and verifies hashes.
Root releases the exclusive heavy slot and makes no tracked edits during that
snapshot. A separate exact-source ACCEPT/HOLD is required; green reports cannot
self-accept. After review, save/fsync the current service's remaining non-template
database count before stopping its exact ID. Poll boundedly for auto-removal and
port closure. The old service lost to host restart has no saved pre-removal count.

Stop after scoped review, cleanup and handoff. Later work lives only in the roadmap.
