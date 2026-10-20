import hashlib, json, pathlib, shutil, socket, subprocess, sys
from quiet_window import Window

root = pathlib.Path('docs/v2-8d-evidence')
out = pathlib.Path('out/v2-8d-validation')
sha = json.loads((root / 'validation-plan.json').read_text())['implementationSha']
subprocess.run(['git', 'merge-base', '--is-ancestor', sha, 'HEAD'], check=True)
subprocess.run(['git', 'diff', '--quiet', sha, '--', 'packages', 'src', 'test', 'app', 'tools', 'schema', 'themes'], check=True)
Window().wait(180)
owned = json.loads((root / 'owned-postgres.json').read_text())
meta = json.loads(subprocess.check_output(['docker', 'inspect', owned['id']], text=True))[0]
assert meta['Id'] == owned['id'] and meta['Name'] == '/forge-v28d-validation' and meta['State']['Running']
assert meta['NetworkSettings']['Ports']['5432/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '5544'}]
with socket.socket() as connection:
    connection.settimeout(1)
    assert connection.connect_ex(('127.0.0.1', 5544)) == 0

if '--resume' not in sys.argv:
    assert not (out / 'backup').exists(), 'Preserve the existing snapshot; do not overwrite a prior run'
    assert not (out / 'coordinator.json').exists(), 'Existing execution must be audited before resuming'
    index = []
    for folder in sorted(pathlib.Path('docs').glob('v2-*-evidence')):
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
    (root / 'backup-manifest.json').write_text(json.dumps(index, indent=2) + '\n')
    originals = []
    for source in map(pathlib.Path, [
        'out/v2-7a-validation/shell-chart.pptx', 'out/v2-7a-validation/shell-table.pptx',
        'out/v2-7b-1-validation/browser/imported-chart.pptx',
        'out/v2-7b-1-validation/browser/imported-table.pptx',
        'out/v2-7b-2-validation/browser/handoff.pptx',
    ]):
        assert source.is_file(), f'Existing original unavailable before execution: {source}'
        destination = out / 'prior-generated-backup' / source
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        assert hashlib.sha256(destination.read_bytes()).hexdigest() == digest
        originals.append({'path': str(source), 'sha256': digest, 'bytes': source.stat().st_size})
    (out / 'prior-generated-backup/index.json').write_text(json.dumps(originals, indent=2) + '\n')
    print('Snapshot verified', len(index), 'files;', sum(row['path'].endswith('.pptx') for row in index), 'evidence originals and', len(originals), 'canonical out originals', flush=True)

raise SystemExit(subprocess.run([sys.executable, '-u', str(root / 'run-validation.py'), *(['--resume'] if '--resume' in sys.argv else [])]).returncode)
