# Durable runtime validation reproduction

Freeze exact implementation SHA and inventory before execution. Required files are
all 209 prior tests plus three runtime files. The runtime PostgreSQL file runs both
shared domain contracts and real process races/crash/recovery. Focus repeats are
separate from distinct full-matrix totals.

Inspect live CPU utilization, free memory, CPU/memory/I/O pressure and competing
work. Run at niceness 10 / I/O priority 7. Use only an owned ephemeral postgres:15-alpine
on 127.0.0.1:5544, 1 CPU/512MiB, 192MiB tmpfs; record its exact ID. Missing service
means applicable checks unexecuted. Never use another project's database.

Before browser/native generators, preserve all earlier evidence including ignored
PPTXs. The local backup inventory includes every regular file in prior evidence
directories, not just git-tracked files. Collect fresh images and measurements into
this slice, then restore original files from those exact bytes and verify hashes.

The exact original snapshot setup (before the first full run) was:

```sh
mkdir -p out/v2-8b-validation
python3 - <<'PYBACKUP'
from pathlib import Path
import shutil, hashlib, json
backup=Path('out/v2-8b-validation/backup')
backup.mkdir(exist_ok=False)
index=[]
for folder in Path('docs').glob('v2-*-evidence'):
    if folder.name=='v2-8b-evidence': continue
    for source in folder.rglob('*'):
        if not source.is_file(): continue
        target=backup/source
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
        index.append({'path':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':source.stat().st_size})
(backup/'index.json').write_text(json.dumps(index,indent=2)+'\n')
PYBACKUP
```

For any later rerun, separately back up **this slice too**, including all four
original native PPTXs, or adapt the generator to a fresh namespace. The snapshot
above restores prior slices only; it does not restore this slice's overwritten
outputs. Never relabel a regenerated archive as the original.

Run `python3 -u docs/v2-8b-evidence/run-validation.py`. All 26 browser/build-owning
files run serially with watchdogs; never overlap Vite, browser or native rendering.
The runner stops on unexpected failure and retains partial output; failures require
classification and a documented correction/rerun. Full bulk, backend/process/fault,
production build, typecheck and canonical 50 cells are mandatory. Headless evidence
exports freshly persisted projects on both backends and inspects OOXML/native/SVG.
The standing en_IN locale probe stays separate. Inspect final images and canvas
measurements before recording frontend-visual as passed.

Freeze/push code, retain exact totals and attempts, then give a separate high-effort
reviewer the exclusive heavy slot. ACCEPT/HOLD names that exact implementation.
Before stopping the exact owned PostgreSQL container, save/fsync the zero remaining
project-database count, then verify auto-removal and port closure. Stop after this
slice; provider/UI work needs its own scope decision.
