import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

root = Path.cwd()
out = root / 'docs/v2-7b-1-evidence/logs/independent'
out.mkdir(parents=True, exist_ok=True)
fixed = [root / f'docs/v2-7b-1-evidence/imported-{name}.png' for name in ['chart', 'table', 'stats', 'transition', 'narrow']]
fixed += [root / 'out/v2-7b-1-validation/browser', root / 'out/v2-7b-1-validation/section-ordinals.pptx', root / 'out/v2-7b-1-validation/hosted-import-measurements.json']
scratch = Path(tempfile.mkdtemp(prefix='forge-independent-evidence-'))
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
runs = []
commands = [
    ('focused', ['node', '--test', '--test-reporter=tap', 'test/v2-import-conversion-7b.test.js', 'test/v2-import-service-7b.test.js', 'test/v2-import-http-7b.test.js']),
    ('postgres-import', ['node', '--test', '--test-reporter=tap', 'test/v2-import-postgres-7b.test.js']),
    ('hosted-postgres', ['node', '--test', '--test-reporter=tap', 'docs/v2-7b-1-evidence/hosted-import-check.mjs']),
    ('actual-server-browser', ['node', '--test', '--test-reporter=tap', 'test/v2-import-chrome-7b.test.js']),
    ('typecheck', ['npm', 'run', 'typecheck']),
    ('protocol', ['npm', 'run', 'dev:protocol']),
    ('benchmark', ['node', 'tools/v2-benchmark.mjs', '--out', str(out / 'benchmark'), '--raster', 'none']),
]
try:
    for name, command in commands:
        bounded = ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7', 'timeout', '--signal=TERM', '--kill-after=10s', '5m'] + command
        start = time.monotonic()
        with (out / f'{name}.log').open('w') as log:
            result = subprocess.run(bounded, env=env, stdout=log, stderr=subprocess.STDOUT)
        runs.append({'id': name, 'implementationSha': '662f7d6a08647d431eded1ea17c5d13e7ca1c591', 'checkoutHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'command': bounded, 'exitCode': result.returncode, 'seconds': time.monotonic() - start, 'log': str((out / f'{name}.log').relative_to(root))})
        print(json.dumps(runs[-1]), flush=True)
        (out / 'runs.json').write_text(json.dumps(runs, indent=2) + '\n')
        if result.returncode:
            raise RuntimeError(f'{name} exited {result.returncode}')
finally:
    captures = out / 'fresh'
    captures.mkdir(exist_ok=True)
    for index, path in enumerate(fixed):
        if path.exists():
            destination = captures / (path.name if not path.is_dir() else 'browser')
            if destination.exists():
                shutil.rmtree(destination) if destination.is_dir() else destination.unlink()
            if path.is_dir():
                shutil.copytree(path, destination)
                shutil.rmtree(path)
            else:
                shutil.copy2(path, destination)
                path.unlink()
        backup = scratch / str(index)
        if backup.exists():
            shutil.copytree(backup, path) if backup.is_dir() else shutil.copy2(backup, path)
    for name, digest in before.items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
    (out / 'restored-evidence-hashes.json').write_text(json.dumps(before, indent=2) + '\n')
    shutil.rmtree(scratch)
