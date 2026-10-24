import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import time

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[3]
os.chdir(ROOT)
OUT = pathlib.Path(__file__).resolve().parent
SHA = '22e7c9749865f3e7c2d62fb8724136e0f19048b0'
# The complete recorded identity is required before any database test.
CONTAINER = 'd89e445e3e9ac94460781fbe5932cc35b7ed8752814e1146ee7fa751e467d4b2'
assert subprocess.check_output(['git', 'diff', '--name-only', SHA, '--', 'packages', 'src', 'test', 'app', 'tools', 'schema', 'themes', 'package.json', 'package-lock.json', 'tsconfig.json'], text=True) == ''
assert subprocess.check_output(['node', '--version'], text=True).startswith('v24.')
owned = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER], text=True))[0]
assert owned['Id'] == CONTAINER and owned['Name'] == '/forge-v28h-validation'
ownership = json.loads((ROOT/'docs/v2-8h-evidence/owned-postgres.json').read_text())
assert owned['State']['Running'] and owned['Image'] == ownership['imageId']
assert owned['NetworkSettings']['Ports']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '5544'}]
(OUT / 'owned-backend-before.json').write_text(json.dumps({'implementationSha': SHA, 'containerId': CONTAINER, 'name': owned['Name'], 'image': owned['Config']['Image'], 'ports': owned['NetworkSettings']['Ports'], 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}, indent=2)+'\n')
os.environ['FORGE_VALIDATION_OUT'] = str(OUT)
spec = importlib.util.spec_from_file_location('quiet', ROOT/'docs/v2-8h-evidence/quiet_window.py')
quiet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quiet)
window = quiet.Window()
prefix = ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7', 'timeout', '--signal=TERM', '--kill-after=10s', '15m']
tests = ['node', '--test', '--test-concurrency=1', '--test-reporter=./tools/validated-tap.mjs']
jobs = [
    ('turn-approval', tests+['test/v2-turns-8h.test.js', 'test/v2-turns-sqlite-8h.test.js', 'test/v2-turns-postgres-8h.test.js', 'test/v2-turns-process-8h.test.js'], 90),
    ('core-boundary', tests+['test/v2-core-boundary.test.js'], 6),
    ('runtime', tests+['test/v2-runtime-8b.test.js', 'test/v2-runtime-process-8b.test.js', 'test/v2-runtime-postgres-8b.test.js'], 69),
    ('typecheck', ['npm', 'run', 'typecheck'], None),
]
records = []
env = dict(os.environ, TEST_PG_URL='postgres://postgres:probe@127.0.0.1:5544/postgres')
for name, command, expected in jobs:
    window.wait(30)
    log = OUT / (name+'.log')
    assert not log.exists()
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    start = time.monotonic()
    print('START', name, flush=True)
    with log.open('x') as stream:
        child = subprocess.Popen(prefix+command, stdout=stream, stderr=subprocess.STDOUT, env=env, start_new_session=True)
        critical = 0
        while child.poll() is None:
            time.sleep(1)
            if time.monotonic()-window.previous[0] >= 15:
                sample = window.observe('running:'+name)
                critical = critical+1 if sample['critical'] else 0
                if critical >= 3:
                    import signal
                    os.killpg(child.pid, signal.SIGTERM)
                    child.wait(timeout=15)
                    raise RuntimeError('critical resource window stopped owned job')
    raw = log.read_text()
    counts = None
    if expected is not None:
        keys = {'total': 'tests', 'pass': 'pass', 'fail': 'fail', 'skip': 'skipped', 'cancelled': 'cancelled'}
        counts = {k: int(re.findall(r'^# '+v+r' (\d+)\s*$', raw, re.M)[-1]) for k,v in keys.items()}
    record = {'implementationSha': SHA, 'name': name, 'atUtc': started, 'durationSeconds': time.monotonic()-start, 'command': prefix+command, 'exitCode': child.returncode, 'tests': counts, 'expectedTests': expected, 'log': str(log.relative_to(ROOT)), 'logSha256': hashlib.sha256(log.read_bytes()).hexdigest()}
    records.append(record)
    (OUT/'checks.json').write_text(json.dumps(records, indent=2)+'\n')
    print(json.dumps(record), flush=True)
    assert child.returncode == 0
    if counts is not None:
        assert counts == {'total': expected, 'pass': expected, 'fail': 0, 'skip': 0, 'cancelled': 0}
print('ALL INDEPENDENT DATABASE CHECKS FINISHED', flush=True)
