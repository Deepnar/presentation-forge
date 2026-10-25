import datetime
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import signal
import subprocess
import sys
import time

sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[3]
os.chdir(ROOT)
EVIDENCE = pathlib.Path(__file__).resolve().parent
OUT = ROOT/'out/v2-8i-2-independent'
OUT.mkdir(exist_ok=False)
SHA = '58662ecc074f7cc29bf29a0dd410d581ffca0eef'
CID = '865d147c807070d1984ada6148346f2a9cffeea55e1f8e68315ba81f2af84d8d'
URL = 'postgres://postgres:probe@127.0.0.1:5544/postgres'
SOURCE = ['packages','src','test','app','tools','schema','themes','package.json','package-lock.json','tsconfig.json','docs/development-state.schema.json']
assert subprocess.check_output(['git','diff','--name-only',SHA,'--',*SOURCE],text=True) == ''
assert subprocess.check_output(['node','--version'],text=True).startswith('v24.')
assert os.environ.get('TEST_PG_URL',URL) == URL
os.environ['FORGE_VALIDATION_OUT'] = str(OUT)
spec = importlib.util.spec_from_file_location('quiet',ROOT/'docs/v2-8i-2-evidence/quiet_window.py')
quiet = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quiet)

def persist(name,value):
    with (EVIDENCE/name).open('w') as stream:
        json.dump(value,stream,indent=2);stream.write('\n');stream.flush();os.fsync(stream.fileno())

def backend_check(stage):
    saved=json.loads((ROOT/'docs/v2-8i-2-evidence/owned-postgres.json').read_text())
    meta=json.loads(subprocess.check_output(['docker','inspect',CID],text=True))[0]
    assert saved['id']==meta['Id']==CID and saved['implementationSha']==SHA
    assert meta['Name']=='/forge-v28i2-validation' and meta['Image']==saved['imageId']
    assert meta['State']['Running'] and meta['HostConfig']['AutoRemove']
    assert meta['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':'5544'}]
    assert meta['HostConfig']['NanoCpus']==1000000000 and meta['HostConfig']['Memory']==536870912
    command=['docker','exec','-e','PGPASSWORD=probe',CID,'psql','-h','127.0.0.1','-U','postgres','-d','postgres','-At','-c']
    version=subprocess.check_output([*command,'SHOW server_version'],text=True).strip()
    databases=subprocess.check_output([*command,"SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname"],text=True).splitlines()
    assert version.startswith('15.18') and databases==[]
    persist('backend-'+stage+'.json',{'implementationSha':SHA,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':CID,'version':version,'imageId':meta['Image'],'port':5544,'nonMaintenanceDatabases':databases})

backend_check('before')
quiet.Window().wait(180)
shutil.copy2(OUT/'sustained-window.json',EVIDENCE/'sustained-window.json')
quiet.Window().wait(30)
index=[]
for folder in sorted((ROOT/'docs').glob('v2-*-evidence')):
    for source in sorted(folder.rglob('*')):
        if not source.is_file() or source.is_relative_to(EVIDENCE):continue
        relative=source.relative_to(ROOT); destination=OUT/'backup'/relative
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,destination)
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        assert hashlib.sha256(destination.read_bytes()).hexdigest()==digest
        index.append({'path':str(relative),'sha256':digest,'bytes':source.stat().st_size})
persist('backup-manifest.json',index)
canonical=[]
for relative in ['out/v2-7a-validation/shell-chart.pptx','out/v2-7a-validation/shell-table.pptx','out/v2-7b-1-validation/browser/imported-chart.pptx','out/v2-7b-1-validation/browser/imported-table.pptx','out/v2-7b-2-validation/browser/handoff.pptx']:
    source=ROOT/relative; destination=OUT/'canonical-backup'/relative
    destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
    digest=hashlib.sha256(source.read_bytes()).hexdigest();assert hashlib.sha256(destination.read_bytes()).hexdigest()==digest
    canonical.append({'path':relative,'sha256':digest,'bytes':source.stat().st_size})
persist('canonical-manifest.json',canonical)
print('SNAPSHOT',len(index),'files,',sum(x['path'].endswith('.pptx') for x in index),'PPTXs and5canonical originals',flush=True)

tests=['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs']
jobs=[
 ('worker-both',tests+['test/v2-turn-worker-sqlite-8i.test.js','test/v2-turn-worker-postgres-8i.test.js','test/v2-turn-worker-process-8i.test.js'],79),
 ('http-both',tests+['test/v2-conversation-http-8i.test.js','test/v2-conversation-http-postgres-8i.test.js'],34),
 ('turns-both',tests+['test/v2-turns-8h.test.js','test/v2-turns-sqlite-8h.test.js','test/v2-turns-postgres-8h.test.js','test/v2-turns-process-8h.test.js'],92),
 ('boundary',tests+['test/v2-core-boundary.test.js'],6),
 ('runtime-both',tests+['test/v2-runtime-8b.test.js','test/v2-runtime-process-8b.test.js','test/v2-runtime-postgres-8b.test.js'],69),
 ('protocol',tests+['test/dev-protocol.test.js'],33),
 ('typecheck',['npm','run','typecheck'],None),
 ('worker-native-repeats',['node','--test','--test-reporter=tap',str(EVIDENCE/'headless-check.mjs')],4),
]
env={**os.environ,'TEST_PG_URL':URL,'LC_ALL':'C.UTF-8','FORGE_RUNTIME_SOURCE':SHA,'FORGE_RUNTIME_METRICS_PATH':str(EVIDENCE/'recovery-metrics.jsonl'),'FORGE_HTTP_EVIDENCE_DIR':str(EVIDENCE/'http-archives')}
records=[]
for name,args,expected in jobs:
    assert subprocess.check_output(['git','diff','--name-only',SHA,'--',*SOURCE],text=True)==''
    backend_check('entry-'+name)
    quiet.Window().wait(30)
    command=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args]
    log=EVIDENCE/(name+'.log'); started=datetime.datetime.now(datetime.timezone.utc); tick=time.monotonic()
    print('START',name,flush=True)
    with log.open('x') as stream:
        child=subprocess.Popen(command,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
        monitor=quiet.Window();critical=0
        try:
            while True:
                try:child.wait(timeout=15);break
                except subprocess.TimeoutExpired:
                    row=monitor.observe('running:'+name);critical=critical+1 if row['critical'] else 0
                    if critical>=3:raise RuntimeError('Sustained critical resource window')
        except BaseException:
            os.killpg(child.pid,signal.SIGTERM)
            try:child.wait(timeout=10)
            except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
            raise
    raw=log.read_text();counts=None
    if expected is not None:
        counts={k:int(re.findall(r'^# '+v+r' (\d+)\s*$',raw,re.M)[-1]) for k,v in {'total':'tests','pass':'pass','fail':'fail','skip':'skipped','cancelled':'cancelled'}.items()}
    record={'implementationSha':SHA,'name':name,'atUtc':started.isoformat(),'durationSeconds':time.monotonic()-tick,'command':command,'exitCode':child.returncode,'tests':counts,'log':str(log.relative_to(ROOT)),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()}
    records.append(record);persist('checks.json',records);print(json.dumps(record),flush=True)
    assert child.returncode==0
    if counts is not None:assert counts=={'total':expected,'pass':expected,'fail':0,'skip':0,'cancelled':0}

backend_check('after')
for group,manifest in [('backup',index),('canonical-backup',canonical)]:
    changed=[]
    for row in manifest:
        original=ROOT/row['path']; backup=OUT/group/row['path']
        assert hashlib.sha256(backup.read_bytes()).hexdigest()==row['sha256']
        if hashlib.sha256(original.read_bytes()).hexdigest()!=row['sha256']:
            changed.append(row['path']);shutil.copy2(backup,original)
    assert all(hashlib.sha256((ROOT/row['path']).read_bytes()).hexdigest()==row['sha256'] for row in manifest)
    persist('restoration-'+group+'.json',{'implementationSha':SHA,'files':len(manifest),'pptx':sum(x['path'].endswith('.pptx') for x in manifest),'changedAndRestored':changed,'allHashesMatch':True,'archiveBytesReconstructed':False})
shutil.copy2(OUT/'resource-window.jsonl',EVIDENCE/'resource-window.jsonl')
print('ALL INDEPENDENT DATABASE CHECKS FINISHED;313 primary repeated leaves plus4 supplemental native repeats and typecheck; backups verified.',flush=True)
