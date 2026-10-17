import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

root = Path.cwd()
evidence = root / 'docs/v2-7c-1-evidence'
output = evidence / 'logs/independent'
fixed = sorted(evidence.glob('*.png')) + [root / 'out/v2-7c-1-validation/browser', root / 'out/v2-7c-1-validation/hosted-import-measurements.json']
scratch = Path(tempfile.mkdtemp(prefix='forge-cover-independent-'))
before = {}
for index, path in enumerate(fixed):
    if path.exists():
        target = scratch / str(index)
        if path.is_dir():
            shutil.copytree(path, target)
        else:
            shutil.copy2(path, target)
            before[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()

commands = [
    ('focused-sqlite', ['node', '--test', '--test-concurrency=1', '--test-reporter=tap', 'test/v2-project-covers-7c.test.js', 'test/v2-project-covers-http-7c.test.js', 'test/v2-project-covers-chrome-7c.test.js'], {}),
    ('governance', ['node', '--test', '--test-reporter=tap', 'test/dev-protocol.test.js'], {}),
    ('postgres-covers', ['node', '--test', '--test-reporter=tap', 'test/v2-project-covers-chrome-7c.test.js'], {'FORGE_COVERS_TEST_BACKEND': 'postgres'}),
    ('postgres-http', ['node', '--test', '--test-reporter=tap', 'test/v2-project-covers-http-7c.test.js'], {'FORGE_COVERS_TEST_BACKEND': 'postgres'}),
    ('hosted', ['node', '--test', '--test-reporter=tap', 'docs/v2-7c-1-evidence/hosted-import-check.mjs'], {}),
    ('typecheck', ['npm', 'run', 'typecheck'], {}),
    ('protocol', ['npm', 'run', 'dev:protocol'], {}),
    ('benchmark', ['node', 'tools/v2-benchmark.mjs', '--out', str(output / 'benchmark'), '--raster', 'none'], {}),
]
records = []
environment = dict(os.environ, LC_ALL='C.UTF-8', TEST_PG_URL='postgres://postgres:probe@127.0.0.1:5544/postgres')
try:
    for name, command, delta in commands:
        bounded = ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7', 'timeout', '--signal=TERM', '--kill-after=10s', '5m'] + command
        started = time.monotonic()
        with (output / f'{name}.log').open('w') as log:
            result = subprocess.run(bounded, env=dict(environment, **delta), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        record = {'id': name, 'implementationSha': 'f79ae07d6ad1696da3106a2a1148ae0ce7f58f51', 'checkoutHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'command': bounded, 'environmentDelta': delta, 'exitCode': result.returncode, 'seconds': time.monotonic() - started, 'log': str((output / f'{name}.log').relative_to(root))}
        records.append(record)
        (output / 'runs.json').write_text(json.dumps(records, indent=2) + '\n')
        print(json.dumps(record), flush=True)
        if name in ['focused-sqlite', 'postgres-covers', 'hosted']:
            captured = output / 'fresh' / name
            captured.mkdir(parents=True, exist_ok=True)
            images = list(evidence.glob('covers-*.png')) if name != 'hosted' else [evidence / 'completed-chat.png', evidence / 'postgres-double-click.png']
            for path in images:
                shutil.copy2(path, captured / path.name)
            source = root / 'out/v2-7c-1-validation/browser' if name != 'hosted' else root / 'out/v2-7c-1-validation/hosted-import-measurements.json'
            if source.is_dir():
                shutil.copytree(source, captured / 'measurements', dirs_exist_ok=True)
            elif source.exists():
                shutil.copy2(source, captured / source.name)
        if result.returncode:
            raise RuntimeError(f'{name} failed with exit {result.returncode}')
finally:
    for index, path in enumerate(fixed):
        if path.exists():
            shutil.rmtree(path) if path.is_dir() else path.unlink()
        source = scratch / str(index)
        if source.exists():
            shutil.copytree(source, path) if source.is_dir() else shutil.copy2(source, path)
    for path, digest in before.items():
        assert hashlib.sha256((root / path).read_bytes()).hexdigest() == digest
    (output / 'restored-hashes.json').write_text(json.dumps(before, indent=2) + '\n')
    shutil.rmtree(scratch)
