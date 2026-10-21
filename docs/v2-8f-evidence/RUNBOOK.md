# V2-8F validation reproduction

Read AGENTS.md, active state/evaluation and the approved roadmap contract. The
implementation SHA in validation-plan.json is frozen source; later docs/harness
changes must have no source delta. Use Node24, Chrome, LibreOffice/Poppler and a
new explicitly owned isolated PostgreSQL service. No live Auto/search relevance
claim is made by fixture runs.

The preparation script qualifies 180 seconds of sustained CPU/memory/backing-NVMe
headroom before starting its test-owned cached PostgreSQL15 container. Existing
port5544 ownership is a refusal, never permission to reuse or stop that service.
The identity is saved before readiness/snapshot work. It then copies/hash-verifies
ALL current v2 evidence files, including ignored original PPTXs, plus all five
canonical browser out/ originals, into a fresh output namespace before generators.
Never overwrite or rerun a completed namespace.

```sh
PYTHONDONTWRITEBYTECODE=1 nice -n10 ionice -c2 -n7 python3 -u docs/v2-8f-evidence/prepare-full-validation.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8f-evidence/assemble-results.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8f-evidence/finish-evidence.py
npm run dev:protocol
```

Every file/build job gets two fresh15-second readiness samples, low priority,
a process-group watchdog and continued contention monitoring. All browser/build
owners run serially; the full223-file inventory is189bulk at concurrency4,
26serial and8PostgreSQL. Focused search repeats are separate from distinct primary
leaves. Required build/type/actual50cells,4persisted native supplements, local
search timing, separate en_IN locale and browser/native export inspection are
captured in raw coordinator/log records. Missing PG is unexecuted, never green.

The coordinator preserves fresh browser captures/measurements before restoring
its complete historical evidence snapshot. finish-evidence.py must run once while
fresh browser original PPTXs are still in canonical out/ paths: preserve those
actual bytes first, then restore/hash-check all5old originals. It deliberately
refuses stale-source originals; never reconstruct missing bytes. Assemble all115
hashed images and inspect full-size narrow/dialog/native cases and contact sheets.
Rasters do not qualify interactive PowerPoint; inherited duplicate native IDs
remain tracked separately.

The independent reviewer needs a fresh full-current evidence/original snapshot,
its own headroom and explicit release of the exclusive heavy slot. Root makes no
tracked edits or heavy jobs while it executes/restores. Only a separate exact-source
ACCEPT/HOLD can advance acceptance. Before exact owned-service removal save/fsync
its fresh actual project-database count, then prove absence and closed5544.

Stop after this slice's review, cleanup and handoff. Future work is only in ROADMAP.
