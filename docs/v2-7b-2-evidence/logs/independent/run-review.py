import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

root = Path.cwd()
evidence = root / 'docs/v2-7b-2-evidence'
out = evidence / 'logs/independent'
out.mkdir(parents=True, exist_ok=True)
fixed = sorted(evidence.glob('*.png'))
fixed += [root / 'out/v2-7b-2-validation/browser', root / 'out/v2-7b-2-validation/hosted-import-measurements.json']
scratch = Path(tempfile.mkdtemp(prefix='forge-handoff-independent-'))
before = {}
for index, path in enumerate(fixed):
    if path.exists():
        destination = scratch / str(index)
        if path.is_dir():
            shutil.copytree(path, destination)
        else:
            shutil.copy2(path, destination)
            before[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()

env = dict(os.environ, LC_ALL='C.UTF-8', TEST_PG_URL='postgres://postgres:probe@127.0.0.1:5544/postgres')
runs = json.loads((out / 'runs.json').read_text()) if (out / 'runs.json').exists() else []
commands = [
    ('focused-sqlite', ['node', '--test', '--test-reporter=tap', 'test/v2-handoff-7b.test.js', 'test/v2-handoff-chrome-7b.test.js'], {}),
    ('governance', ['node', '--test', '--test-reporter=tap', 'test/dev-protocol.test.js'], {}),
    ('handoff-postgres', ['node', '--test', '--test-reporter=tap', 'test/v2-handoff-chrome-7b.test.js'], {'FORGE_HANDOFF_TEST_BACKEND': 'postgres'}),
    ('hosted-double-click', ['node', '--test', '--test-reporter=tap', 'docs/v2-7b-2-evidence/hosted-import-check.mjs'], {}),
    ('typecheck', ['npm', 'run', 'typecheck'], {}),
    ('protocol', ['npm', 'run', 'dev:protocol'], {}),
    ('benchmark', ['node', 'tools/v2-benchmark.mjs', '--out', str(out / 'benchmark'), '--raster', 'none'], {}),
]
if os.environ.get('FORGE_REVIEW_ONLY') == 'diagnostic':
    commands = [('diagnostic-restore', ['node', '--test', '--test-reporter=tap', '--test-name-pattern=^completed chat', str(out / 'instrumented-handoff.test.mjs')], {'FORGE_HANDOFF_TEST_BACKEND': 'postgres'})]
elif os.environ.get('FORGE_REVIEW_ONLY') == 'diagnostic-full':
    commands = [('diagnostic-full-postgres', ['node', '--test', '--test-reporter=tap', str(out / 'instrumented-handoff-full.test.mjs')], {'FORGE_HANDOFF_TEST_BACKEND': 'postgres'})]
elif os.environ.get('FORGE_REVIEW_ONLY') == 'remaining':
    commands = [item for item in commands if item[0] in ['hosted-double-click', 'typecheck', 'protocol', 'benchmark']]
try:
    for name, command, delta in commands:
        if any(record['id'] == name and record['exitCode'] == 0 for record in runs):
            continue
        bounded = ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7', 'timeout', '--signal=TERM', '--kill-after=10s', '5m'] + command
        start = time.monotonic()
        with (out / f'{name}.log').open('w') as log:
            result = subprocess.run(bounded, env=dict(env, **delta), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        runs.append({'id': name, 'implementationSha': '03cc89ef233db5469066599391cbaac68c2fc646', 'checkoutHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'command': bounded, 'environmentDelta': delta, 'exitCode': result.returncode, 'seconds': time.monotonic() - start, 'log': str((out / f'{name}.log').relative_to(root))})
        print(json.dumps(runs[-1]), flush=True)
        (out / 'runs.json').write_text(json.dumps(runs, indent=2) + '\n')
        if name in ['focused-sqlite', 'handoff-postgres', 'hosted-double-click', 'diagnostic-restore', 'diagnostic-full-postgres']:
            captured = out / 'fresh' / name
            captured.mkdir(parents=True, exist_ok=True)
            for path in fixed:
                if path.exists():
                    destination = captured / path.name
                    shutil.copytree(path, destination, dirs_exist_ok=True) if path.is_dir() else shutil.copy2(path, destination)
        if result.returncode:
            raise RuntimeError(f'{name} exited {result.returncode}')
finally:
    for index, path in enumerate(fixed):
        if path.exists():
            shutil.rmtree(path) if path.is_dir() else path.unlink()
        backup = scratch / str(index)
        if backup.exists():
            shutil.copytree(backup, path) if backup.is_dir() else shutil.copy2(backup, path)
    for name, digest in before.items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
    (out / 'restored-evidence-hashes.json').write_text(json.dumps(before, indent=2) + '\n')
    shutil.rmtree(scratch)
