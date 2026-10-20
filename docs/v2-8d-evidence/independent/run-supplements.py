import datetime, hashlib, json, os, pathlib, re, shutil, signal, subprocess, time
from quiet_window import Window

ROOT = pathlib.Path('docs/v2-8d-evidence/independent')
OUT = pathlib.Path('out/v2-8d-independent')
PLAN = json.loads((ROOT / 'supplement-plan.json').read_text())
SHA = PLAN['implementationSha']
subprocess.run(['git', 'merge-base', '--is-ancestor', SHA, 'HEAD'], check=True)
subprocess.run(['git', 'diff', '--quiet', SHA, '--', 'packages', 'src', 'test', 'app', 'tools', 'schema', 'themes'], check=True)
owned = json.loads(pathlib.Path('docs/v2-8d-evidence/owned-postgres.json').read_text())
meta = json.loads(subprocess.check_output(['docker', 'inspect', owned['id']], text=True))[0]
assert meta['Id'] == owned['id'] and meta['Name'] == '/forge-v28d-validation' and meta['State']['Running']
assert meta['NetworkSettings']['Ports']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '5544'}]
env = {**os.environ, 'LC_ALL': 'C.UTF-8', 'TEST_PG_URL': 'postgres://postgres:probe@127.0.0.1:5544/postgres', 'FORGE_RUNTIME_SOURCE': SHA, 'FORGE_RUNTIME_METRICS_PATH': str((ROOT / 'recovery-metrics.jsonl').resolve())}
runs = json.loads((ROOT / 'runs.json').read_text())
assert runs[-1]['name'] == 'benchmark-50' and runs[-1]['exitCode'] == 0
for job in PLAN['jobs']:
    Window().wait()
    cmd = ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7', 'timeout', '--signal=TERM', '--kill-after=10s', '15m', *job['args']]
    at = datetime.datetime.now(datetime.timezone.utc)
    log = ROOT / (job['name'] + '.log')
    print(job['name'], 'START', at.isoformat(), flush=True)
    with log.open('w') as stream:
        process = subprocess.Popen(cmd, env=env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        monitor, critical = Window(), 0
        try:
            while True:
                try:
                    process.wait(timeout=15)
                    break
                except subprocess.TimeoutExpired:
                    sample = monitor.observe('running:' + job['name'])
                    critical = critical + 1 if sample['critical'] else 0
                    print(job['name'], 'RUNNING', round((datetime.datetime.now(datetime.timezone.utc)-at).total_seconds()), flush=True)
                    if critical >= 3:
                        raise KeyboardInterrupt('Sustained critical contention')
        except BaseException:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            (ROOT / 'interrupted.json').write_text(json.dumps({'job': job['name'], 'exitCode': process.returncode, 'classification': 'cancelled; incomplete cases not passing'}) + '\n')
            raise
    row = {'name': job['name'], 'implementationSha': SHA, 'command': cmd, 'files': job['files'], 'exitCode': process.returncode, 'atUtc': at.isoformat(), 'durationSeconds': (datetime.datetime.now(datetime.timezone.utc)-at).total_seconds(), 'log': str(log)}
    if job['files']:
        text = log.read_text()
        row['tests'] = {key: int(re.findall(r'^# '+label+r' (\d+)\s*$', text, re.M)[-1]) for key, label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
    runs.append(row)
    (ROOT / 'runs.json').write_text(json.dumps(runs, indent=2) + '\n')
    print(job['name'], 'EXIT', row['exitCode'], row.get('tests', {}), flush=True)
    if row['exitCode'] or job['files'] and any(row['tests'][k] for k in ['fail', 'skip', 'cancelled']):
        print(log.read_text()[-10000:], flush=True)
        raise SystemExit(1)
    if job['name'] == 'full-7a':
        records = []
        for file in pathlib.Path('docs/v2-7a-evidence').iterdir():
            if file.is_file() and file.stat().st_mtime >= at.timestamp():
                target = ROOT / 'fresh-7a' / file.name
                target.parent.mkdir(exist_ok=True)
                shutil.copy2(file, target)
                records.append({'source': str(file), 'file': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        for kind in ['chart', 'table']:
            source = pathlib.Path(f'out/v2-7a-validation/shell-{kind}.pptx')
            assert source.stat().st_mtime >= at.timestamp()
            target = ROOT / 'browser-archives' / source.name
            target.parent.mkdir(exist_ok=True)
            shutil.copy2(source, target)
            records.append({'source': str(source), 'file': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
        (ROOT / 'fresh-7a.json').write_text(json.dumps(records, indent=2) + '\n')
print('All planned independent jobs completed; visual inspection and snapshot restoration remain.', flush=True)
