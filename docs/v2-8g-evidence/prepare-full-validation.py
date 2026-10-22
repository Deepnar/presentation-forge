import datetime, hashlib, json, os, pathlib, shutil, socket, subprocess, sys, time
from quiet_window import Window

root = pathlib.Path('docs/v2-8g-evidence')
out = pathlib.Path(os.environ.get('FORGE_VALIDATION_OUT', 'out/v2-8g-validation'))
sha = json.loads((root / 'validation-plan.json').read_text())['implementationSha']
subprocess.run(['git', 'merge-base', '--is-ancestor', sha, 'HEAD'], check=True)
subprocess.run(['git', 'diff', '--quiet', sha, '--', 'packages', 'src', 'test', 'app', 'tools', 'schema', 'themes'], check=True)
out.mkdir(parents=True, exist_ok=True)
assert not (root/'owned-postgres.json').exists(), 'Do not replace an existing owned identity'
qualification=json.loads((out/'sustained-window.json').read_text())
assert qualification['implementationSha']==sha and qualification['sampleSeconds']>=180
assert time.time()-(out/'sustained-window.json').stat().st_mtime<300, 'Sustained qualification is stale'
Window().wait(30)
with socket.socket() as probe:
    probe.settimeout(1)
    assert probe.connect_ex(('127.0.0.1',5544)) != 0, 'Port5544 already owned; do not reuse or stop it'
image='sha256:cd17e2ac98240fce1541ad2a803b34009b4eea5aec8a832363cdc7eca62e722e'
subprocess.run(['docker','image','inspect',image],check=True,stdout=subprocess.DEVNULL)
cid=subprocess.check_output(['docker','run','--detach','--rm','--pull=never','--name','forge-v28g-validation','--cpus','1','--memory','512m','--tmpfs','/var/lib/postgresql/data:rw,size=192m','-e','POSTGRES_PASSWORD=probe','-p','127.0.0.1:5544:5432',image],text=True).strip()
meta=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
owned={'id':cid,'name':'forge-v28g-validation','port':5544,'createdAtUtc':meta['Created'],'imageId':meta['Image'],'autoRemove':meta['HostConfig']['AutoRemove'],'cpus':meta['HostConfig']['NanoCpus']/1e9,'memoryBytes':meta['HostConfig']['Memory'],'tmpfs':meta['HostConfig']['Tmpfs'],'implementationSha':sha}
with (root/'owned-postgres.json').open('x') as stream:
    json.dump(owned,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
for _ in range(30):
    ready=subprocess.run(['docker','exec',cid,'psql','-U','postgres','-d','postgres','-At','-c','SELECT 1'],text=True,capture_output=True,timeout=5)
    if ready.returncode==0 and ready.stdout.strip()=='1':break
    time.sleep(.5)
assert ready.returncode==0 and ready.stdout.strip()=='1', 'Owned PostgreSQL not ready; leave identity for exact cleanup'
owned['version']=subprocess.check_output(['docker','exec',cid,'psql','-U','postgres','-d','postgres','-At','-c','SHOW server_version'],text=True).strip()
(root/'owned-postgres.json').write_text(json.dumps(owned,indent=2)+'\n')
meta = json.loads(subprocess.check_output(['docker', 'inspect', owned['id']], text=True))[0]
assert meta['Id'] == owned['id'] and meta['Name'] == '/forge-v28g-validation' and meta['State']['Running']
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
