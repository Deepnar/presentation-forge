import datetime, hashlib, json, os, pathlib, shutil, socket, subprocess, sys, time
from quiet_window import Window
from validation_guards import validate_source, validate_snapshots, digest

root = pathlib.Path('docs/v2-8i-4-evidence')
out = pathlib.Path(os.environ.get('FORGE_VALIDATION_OUT', 'out/v2-8i-4-validation'))
plan = json.loads((root/'validation-plan.json').read_text())
sha = plan['implementationSha']
validate_source(root, plan)
out.mkdir(parents=True, exist_ok=True)
assert '--resume' not in sys.argv, 'Resume completed jobs through run-validation.py --resume, never backend preparation'
artifacts=['backup','prior-generated-backup','coordinator.json','coordinator.log','coordinator-complete.json','snapshot-complete.json']
assert not any((out/name).exists() for name in artifacts), 'Existing snapshot/execution requires audit; refuse backend creation'
resume_owned = '--resume-owned-preparation' in sys.argv
assert resume_owned or not (root/'owned-postgres.json').exists(), 'Do not replace an existing owned identity'
if resume_owned:
    assert not (out/'backup').exists() and not (out/'coordinator.json').exists(), 'Preparation recovery must precede snapshots and tests'
qualification=json.loads((out/'sustained-window.json').read_text())
assert qualification['implementationSha']==sha and qualification['sampleSeconds']>=180
assert time.time()-(out/'sustained-window.json').stat().st_mtime<300, 'Sustained qualification is stale'
Window().wait(30)
image='sha256:cd17e2ac98240fce1541ad2a803b34009b4eea5aec8a832363cdc7eca62e722e'
if resume_owned:
    owned=json.loads((root/'owned-postgres.json').read_text())
    assert owned['implementationSha']==sha and owned['imageId']==image and owned['name']=='forge-v28i4-validation' and owned['port']==5544
    cid=owned['id']
else:
    with socket.socket() as probe:
        probe.settimeout(1)
        assert probe.connect_ex(('127.0.0.1',5544)) != 0, 'Port5544 already owned; do not reuse or stop it'
    subprocess.run(['docker','image','inspect',image],check=True,stdout=subprocess.DEVNULL)
    cid=subprocess.check_output(['docker','run','--detach','--rm','--pull=never','--name','forge-v28i4-validation','--cpus','1','--memory','512m','--tmpfs','/var/lib/postgresql/data:rw,size=192m','-e','POSTGRES_PASSWORD=probe','-p','127.0.0.1:5544:5432',image],text=True).strip()
    meta=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
    owned={'id':cid,'name':'forge-v28i4-validation','port':5544,'createdAtUtc':meta['Created'],'imageId':meta['Image'],'autoRemove':meta['HostConfig']['AutoRemove'],'cpus':meta['HostConfig']['NanoCpus']/1e9,'memoryBytes':meta['HostConfig']['Memory'],'tmpfs':meta['HostConfig']['Tmpfs'],'implementationSha':sha}
    with (root/'owned-postgres.json').open('x') as stream:
        json.dump(owned,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
    fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
meta=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
assert meta['Id']==owned['id'] and meta['Name']=='/forge-v28i4-validation' and meta['Image']==image and meta['State']['Running'] and meta['HostConfig']['AutoRemove']
assert meta['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':'5544'}]
assert meta['HostConfig']['NanoCpus']==1000000000 and meta['HostConfig']['Memory']==536870912
# The entrypoint's temporary initialization server accepts Unix sockets only.
psql=['docker','exec','-e','PGPASSWORD=probe',cid,'psql','-h','127.0.0.1','-U','postgres','-d','postgres','-At','-c']
for _ in range(30):
    ready=subprocess.run([*psql,'SELECT 1'],text=True,capture_output=True,timeout=5)
    if ready.returncode==0 and ready.stdout.strip()=='1':break
    time.sleep(.5)
assert ready.returncode==0 and ready.stdout.strip()=='1', 'Owned final TCP PostgreSQL not ready; preserve identity for recovery'
owned['version']=subprocess.check_output([*psql,'SHOW server_version'],text=True).strip()
query="SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname"
databases=subprocess.check_output([*psql,query],text=True).splitlines()
assert databases==[], 'Preparation requires an empty owned test catalog'
with (root/'owned-postgres.json').open('w') as stream:
    json.dump(owned,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
with socket.socket() as connection:
    connection.settimeout(1)
    assert connection.connect_ex(('127.0.0.1',5544))==0
if resume_owned:
    with (root/'owned-preparation-recovery.json').open('x') as stream:
        json.dump({'implementationSha':sha,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':cid,'sameRecordedIdentity':True,'finalTcpReady':True,'version':owned['version'],'nonMaintenanceDatabases':databases,'snapshotOrTestExistedBeforeRecovery':False},stream,indent=2);stream.write('\n')

assert not (out / 'backup').exists(), 'Preserve the existing snapshot; do not overwrite a prior run'
assert not (out / 'coordinator.json').exists(), 'Existing execution must be audited before resuming'
index = []
for folder in sorted(pathlib.Path('docs').glob('v2-*-evidence')):
    if folder == root: continue
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
proof={'implementationSha':sha,'complete':True,'historicalFiles':len(index),'canonicalFiles':len(originals),'historicalIndexSha256':digest(out/'backup/index.json'),'canonicalIndexSha256':digest(out/'prior-generated-backup/index.json')}
with (out/'snapshot-complete.json').open('x') as stream:
    json.dump(proof,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())
fd=os.open(out,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
validate_snapshots(root,out,sha,False)
print('Snapshot verified', len(index), 'files;', sum(row['path'].endswith('.pptx') for row in index), 'evidence originals and', len(originals), 'canonical out originals', flush=True)

if '--prepare-only' in sys.argv:
    print('Owned backend and original snapshots ready; no test coordinator started.',flush=True)
    raise SystemExit(0)

raise SystemExit(subprocess.run([sys.executable, '-u', str(root / 'run-validation.py')]).returncode)
