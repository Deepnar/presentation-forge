import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

root = Path('docs/v2-8e-evidence')
paused = root / 'paused-2026-10-21'
out = Path('out/v2-8e-validation-resumed-2026-10-21')
out.mkdir(exist_ok=False)
os.environ['FORGE_VALIDATION_OUT'] = str(out)
from quiet_window import Window

sha = json.loads((root / 'validation-plan.json').read_text())['implementationSha']
subprocess.run(['git', 'merge-base', '--is-ancestor', sha, 'HEAD'], check=True)
subprocess.run(['git', 'diff', '--quiet', sha, '--', 'packages', 'src', 'test', 'app', 'tools', 'schema', 'themes'], check=True)
runs = json.loads((paused / 'logs/coordinator.json').read_text())
assert len(runs) == 25
for run in runs:
    assert run['implementationSha'] == sha and run['exitCode'] == 0
    assert run['tests']['total'] == run['tests']['pass']
    assert not any(run['tests'][key] for key in ['fail', 'skip', 'cancelled'])
    log = paused / 'logs' / Path(run['log']).name
    assert log.is_file()
    run['retainedFrom'] = str(paused / 'logs/coordinator.json')
    run['retainedLogSha256'] = hashlib.sha256(log.read_bytes()).hexdigest()
    run['log'] = str(log)

Window().wait(180)
with socket.socket() as connection:
    connection.settimeout(1)
    assert connection.connect_ex(('127.0.0.1', 5544)) != 0
created = subprocess.run([
    'docker', 'run', '--rm', '-d', '--name', 'forge-v28e-resumed-20261021',
    '--cpus', '1', '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw,size=192m',
    '-p', '127.0.0.1:5544:5432', '-e', 'POSTGRES_PASSWORD=probe', 'postgres:15-alpine',
], check=True, capture_output=True, text=True)
cid = created.stdout.strip()
meta = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
assert meta['Id'] == cid and meta['Name'] == '/forge-v28e-resumed-20261021'
assert meta['NetworkSettings']['Ports']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '5544'}]
owned = {
    'id': cid, 'name': meta['Name'][1:], 'port': 5544, 'createdAtUtc': meta['Created'],
    'image': meta['Config']['Image'], 'imageId': meta['Image'], 'autoRemove': meta['HostConfig']['AutoRemove'],
    'cpus': meta['HostConfig']['NanoCpus'] / 1e9, 'memoryBytes': meta['HostConfig']['Memory'],
    'tmpfs': meta['HostConfig']['Tmpfs'], 'implementationSha': sha,
    'purpose': 'Owned isolated resumed V2-8E validation/review; original service already removed.',
}
owned_path = root / 'owned-postgres-resumed-2026-10-21.json'
owned_path.write_text(json.dumps(owned, indent=2) + '\n')
for attempt in range(30):
    result = subprocess.run(['docker', 'exec', cid, 'psql', '-U', 'postgres', '-At', '-c', 'SELECT 1'], capture_output=True, text=True)
    if result.returncode == 0 and result.stdout.strip() == '1':
        break
    time.sleep(1)
else:
    raise RuntimeError('Owned PostgreSQL readiness unavailable; no validation pass is claimed')
owned['version'] = subprocess.check_output(['docker', 'exec', cid, 'psql', '-U', 'postgres', '-At', '-c', 'SHOW server_version'], text=True).strip()
owned_path.write_text(json.dumps(owned, indent=2) + '\n')

index = []
for folder in sorted(Path('docs').glob('v2-*-evidence')):
    for source in sorted(folder.rglob('*')):
        if not source.is_file():
            continue
        destination = out / 'backup' / source
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        assert hashlib.sha256(destination.read_bytes()).hexdigest() == digest
        index.append({'path': str(source), 'sha256': digest, 'bytes': source.stat().st_size})
(out / 'backup/index.json').write_text(json.dumps(index, indent=2) + '\n')
(root / 'resumed-backup-manifest.json').write_text(json.dumps(index, indent=2) + '\n')
originals = json.loads((paused / 'browser-archives.json').read_text())
canonical = []
for row in originals:
    source = Path(row['source'])
    destination = out / 'prior-generated-backup' / source
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    assert hashlib.sha256(destination.read_bytes()).hexdigest() == digest
    canonical.append({'path': str(source), 'sha256': digest, 'bytes': source.stat().st_size})
(out / 'prior-generated-backup/index.json').write_text(json.dumps(canonical, indent=2) + '\n')

images = []
measure = root / 'measurements'
measure.mkdir(exist_ok=True)
for row in json.loads((paused / 'captures.json').read_text()):
    source = Path(row['file'])
    assert row['implementationSha'] == sha and hashlib.sha256(source.read_bytes()).hexdigest() == row['sha256']
    if source.suffix == '.png':
        target = root / 'regression-images' / row['source'].replace('/', '--')
        target.parent.mkdir(exist_ok=True)
        shutil.copy2(source, target)
        images.append({'source': row['source'], 'file': str(target), 'implementationSha': sha, 'sha256': row['sha256'], 'retainedFrom': str(source)})
    elif Path(row['source']).parent == Path('docs/v2-7a-evidence'):
        shutil.copy2(source, measure / row['source'].replace('/', '--'))
for row in json.loads((paused / 'measurements.json').read_text()):
    source = Path(row['file'])
    assert hashlib.sha256(source.read_bytes()).hexdigest() == row['sha256']
    shutil.copy2(source, measure / row['source'].replace('/', '--'))
for row in originals:
    source = Path(row['originalArchive'])
    assert row['modifiedDuringRun'] and hashlib.sha256(source.read_bytes()).hexdigest() == row['sha256']
    shutil.copy2(source, row['source'])
assert len(images) == 38
(out / 'seed-captures.json').write_text(json.dumps(images, indent=2) + '\n')
(out / 'coordinator.json').write_text(json.dumps(runs, indent=2) + '\n')
shutil.copy2(paused / 'logs/recovery-metrics.jsonl', out / 'recovery-metrics.jsonl')
preparation = {
    'implementationSha': sha, 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'output': str(out), 'ownedPostgres': str(owned_path), 'retainedCompleteJobs': len(runs),
    'retainedSource': str(paused / 'logs/coordinator.json'), 'retainedLogHashesVerified': True,
    'snapshotFiles': len(index), 'snapshotOriginalPptx': sum(r['path'].endswith('.pptx') for r in index),
    'canonicalOriginalsPreserved': len(canonical), 'retainedFreshImages': len(images),
    'actualPausedBrowserOriginalsRestoredForInspection': len(originals),
    'noArchiveReconstruction': True, 'sourceDelta': 'None in product/test/tools/schema/themes/app',
    'method': 'Fresh sustained qualification and full current-evidence snapshot; retain complete exact-source execution, merge saved fresh captures/originals, execute every remaining job serially.',
}
(root / 'resume-preparation.json').write_text(json.dumps(preparation, indent=2) + '\n')
print(json.dumps(preparation, indent=2), flush=True)
raise SystemExit(subprocess.run([sys.executable, '-u', str(root / 'run-validation.py'), '--resume']).returncode)
