import datetime, hashlib, json, os, pathlib, re, shutil, subprocess, time, sys, signal
from quiet_window import Window
root=pathlib.Path('docs/v2-8i-3-evidence');out=pathlib.Path(os.environ.get('FORGE_VALIDATION_OUT','out/v2-8i-3-validation'));out.mkdir(exist_ok=True)
class Tee:
 def __init__(self,stream,file):self.stream,self.file=stream,file
 def write(self,text):self.stream.write(text);self.stream.flush();self.file.write(text);self.file.flush()
 def flush(self):self.stream.flush();self.file.flush()
resume='--resume' in sys.argv
max_new_jobs=int(sys.argv[sys.argv.index('--max-new-jobs')+1]) if '--max-new-jobs' in sys.argv else None
assert max_new_jobs is None or 1<=max_new_jobs<=8
new_jobs=0
plan=json.loads((root/'validation-plan.json').read_text());sha=plan['implementationSha']
if resume:
 assert (out/'coordinator.json').is_file(), 'No acknowledged execution to resume; audit preserved logs first'
else:
 names=['conversation-http-gate','bulk',*[pathlib.Path(f).stem for f in plan['serial']+plan['postgres']],
  'production-build','typecheck','benchmark-50','headless','byok-locale','native-review','shell-native','http-native']
 existing=[str(out/name) for name in ['coordinator.json','coordinator.log','coordinator-complete.json',*[name+'.log' for name in names]] if (out/name).exists()]
 assert not existing, ('Existing execution must be audited and resumed; never truncate it',existing)
sys.stdout=Tee(sys.stdout,(out/'coordinator.log').open('a' if resume else 'w'))
signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
runs=json.loads((out/'coordinator.json').read_text()) if resume else []
assert all(r['implementationSha']==sha for r in runs)
subprocess.run(['git','merge-base','--is-ancestor',sha,'HEAD'],check=True)
subprocess.run(['git','diff','--quiet',sha,'--','packages','src','test','app','tools','schema','themes','package.json','package-lock.json','tsconfig.json'],check=True)
owned_url='postgres://postgres:probe@127.0.0.1:5544/postgres'
assert os.environ.get('TEST_PG_URL',owned_url)==owned_url, 'Refuse an external TEST_PG_URL; validation owns only loopback5544'
owned=json.loads((root/'owned-postgres.json').read_text())
assert owned['implementationSha']==sha and owned['port']==5544 and owned['name']=='forge-v28i3-validation'
meta=json.loads(subprocess.check_output(['docker','inspect',owned['id']],text=True))[0]
assert meta['Id']==owned['id'] and meta['Name']=='/'+owned['name'] and meta['Image']==owned['imageId'] and meta['State']['Running'] and meta['HostConfig']['AutoRemove']
assert meta['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':'5544'}]
query="SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres' ORDER BY datname"
databases=subprocess.check_output(['docker','exec',owned['id'],'psql','-U','postgres','-d','postgres','-At','-c',query],text=True).splitlines()
assert databases==[], ('Owned backend contains leftover databases; audit before resuming',databases)
with (out/'owned-entry-checks.jsonl').open('a') as stream:
 stream.write(json.dumps({'implementationSha':sha,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'id':owned['id'],'name':owned['name'],'imageId':owned['imageId'],'port':5544,'nonMaintenanceDatabases':databases,'resume':resume})+'\n')
env={**os.environ,'LC_ALL':'C.UTF-8','TEST_PG_URL':owned_url,'FORGE_RUNTIME_SOURCE':sha,'FORGE_HTTP_EVIDENCE_DIR':str((out/'http').resolve()),'FORGE_RUNTIME_METRICS_PATH':str((out/'recovery-metrics.jsonl').resolve())}
files=plan['bulk']+plan['serial']+plan['postgres']
actual={str(f) for f in pathlib.Path('test').glob('*.test.js')}|{str(f) for f in pathlib.Path('test').glob('*.test.ts')}
assert len(files)==len(set(files)) and set(files)==actual,(len(files),len(actual),set(files)^actual)
start=datetime.datetime.fromisoformat(runs[0]['atUtc']).timestamp() if runs else time.time()
def quiet_window():
 Window().wait()
def run(name,args,files=None,changes=None,expected=0):
 global new_jobs
 previous=next((r for r in runs if r['name']==name),None)
 if previous:
  assert previous['exitCode']==expected and previous['files']==(files or [])
  assert pathlib.Path(previous['log']).exists()
  if files and expected==0:assert not any(previous['tests'][k] for k in ['fail','skip','cancelled'])
  print(name,'RETAINED recorded complete execution',previous.get('tests',''),flush=True);return previous
 if max_new_jobs is not None and new_jobs>=max_new_jobs:
  (out/'coordinator-yield.json').write_text(json.dumps({'implementationSha':sha,'nextJob':name,'newCompleteJobs':new_jobs,'reason':'Intentional bounded coordinator handoff; no test process active'},indent=2)+'\n')
  print('COORDINATOR YIELD before',name,'with no active test process',flush=True);raise SystemExit(0)
 quiet_window()
 cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','30m' if name=='bulk' else '15m',*args]
 log=out/(name+'.log');at=datetime.datetime.now(datetime.timezone.utc);print(name,'START',flush=True)
 if resume and log.exists():
  retained=log.with_suffix(f'.unacknowledged-{time.time_ns()}.log')
  with retained.open('xb') as target,log.open('rb') as source:
   shutil.copyfileobj(source,target);target.flush();os.fsync(target.fileno())
  fd=os.open(out,os.O_RDONLY|os.O_DIRECTORY);os.fsync(fd);os.close(fd)
 with log.open('w') as stream:
  process=subprocess.Popen(cmd,env={**env,**(changes or {})},stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  monitor=Window();critical=0
  try:
   while True:
    try:process.wait(timeout=15);break
    except subprocess.TimeoutExpired:
     sample=monitor.observe('running:'+name);critical=critical+1 if sample['critical'] else 0
     print(name,'RUNNING',round((datetime.datetime.now(datetime.timezone.utc)-at).total_seconds()),'seconds',flush=True)
     if critical>=3:raise KeyboardInterrupt('Owned validation stopped for sustained critical shared-machine contention')
  except BaseException:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
   (out/'interrupted.json').write_text(json.dumps({'name':name,'implementationSha':sha,'exitCode':process.returncode,'classification':'cancelled coordinator/job; incomplete execution is not a pass'},indent=2)+'\n')
   raise
  result=process
 record={'name':name,'implementationSha':sha,'command':cmd,'files':files or [],'exitCode':result.returncode,'atUtc':at.isoformat(),'durationSeconds':round((datetime.datetime.now(datetime.timezone.utc)-at).total_seconds(),6),'log':str(log)}
 text=log.read_text()
 if files:
  record['tests']={key:int(re.findall(r'^# '+label+r' (\d+)\s*$',text,re.M)[-1]) for key,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
 runs.append(record);(out/'coordinator.json').write_text(json.dumps(runs,indent=2)+'\n');print(name,'EXIT',result.returncode,record.get('tests',''),flush=True)
 if result.returncode!=expected or files and expected==0 and (record['tests']['fail'] or record['tests']['skip'] or record['tests']['cancelled']):
  print(text[-7000:],flush=True);raise SystemExit(result.returncode or 1)
 new_jobs+=1
 return record

def tests(name,selected,concurrency=1,changes=None,expected=0):
 return run(name,['node','--test',f'--test-concurrency={concurrency}','--test-reporter=./tools/validated-tap.mjs',*selected],selected,changes,expected)
tests('conversation-http-gate',plan['focused'])
tests('bulk',plan['bulk'],1)
for file in plan['serial']:tests(pathlib.Path(file).stem,[file])
for file in plan['postgres']:tests(pathlib.Path(file).stem,[file])
for name,args in [('production-build',['node_modules/.bin/vite','build','--config','app/web/vite.config.js']),('typecheck',['npm','run','typecheck']),('benchmark-50',['node','tools/v2-benchmark.mjs','--out','out/v2-8i-3-benchmark','--raster','none'])]:run(name,args)
run('headless',['node','--test','--test-reporter=tap',str(root/'headless-check.mjs')])
tests('byok-locale',['test/byok-budget.test.js'],changes={'LC_ALL':'en_IN.UTF-8'},expected=1)
run('native-review',['node',str(root/'native-review.mjs')])
run('shell-native',['node',str(root/'shell-native.mjs')])
run('http-native',['node',str(root/'http-native.mjs')])
seed=out/'seed-captures.json'
images=json.loads(seed.read_text()) if seed.exists() else []
images={row['source']:row for row in images}
for folder in pathlib.Path('docs').glob('v2-*-evidence'):
 if folder==root:continue
 for source in folder.rglob('*.png'):
  if source.is_relative_to(root):continue
  if source.stat().st_mtime<start:continue
  destination=root/'regression-images'/str(source).replace('/','--');destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
  images[str(source)]={'source':str(source),'file':str(destination),'implementationSha':sha,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()}
images=list(images.values())
assert all(row['implementationSha']==sha and hashlib.sha256(pathlib.Path(row['file']).read_bytes()).hexdigest()==row['sha256'] for row in images)
(root/'regression-images.json').write_text(json.dumps(images,indent=2)+'\n')
measure=root/'measurements';measure.mkdir(exist_ok=True);sources=list(pathlib.Path('docs/v2-7a-evidence').glob('*.json'))
for folder in pathlib.Path('out').glob('v2-7*-validation/browser'):sources+=list(folder.glob('*.json'))
for source in sources:
 if source.stat().st_mtime>=start:shutil.copy2(source,measure/str(source).replace('/','--'))
backup=out/'backup';index=json.loads((backup/'index.json').read_text())
for row in index:
 source=backup/row['path'];assert hashlib.sha256(source.read_bytes()).hexdigest()==row['sha256'];shutil.copy2(source,row['path'])
assert all(hashlib.sha256(pathlib.Path(row['path']).read_bytes()).hexdigest()==row['sha256'] for row in index)
(root/'historical-evidence-restoration.json').write_text(json.dumps({'implementationSha':sha,'restored':len(index),'includesIgnoredFiles':True,'allHashesMatch':True},indent=2)+'\n')
(out/'coordinator-complete.json').write_text(json.dumps({'implementationSha':sha,'runs':len(runs),'orderedExecutionComplete':True},indent=2)+'\n')
print('Ordered execution complete; visual inspection and independent review remain.',flush=True)
