import datetime, hashlib, json, os, pathlib, re, shutil, subprocess, time, sys, signal
from quiet_window import Window
root=pathlib.Path('docs/v2-8h-evidence');out=pathlib.Path(os.environ.get('FORGE_VALIDATION_OUT','out/v2-8h-validation'));out.mkdir(exist_ok=True)
class Tee:
 def __init__(self,stream,file):self.stream,self.file=stream,file
 def write(self,text):self.stream.write(text);self.stream.flush();self.file.write(text);self.file.flush()
 def flush(self):self.stream.flush();self.file.flush()
resume='--resume' in sys.argv
max_new_jobs=int(sys.argv[sys.argv.index('--max-new-jobs')+1]) if '--max-new-jobs' in sys.argv else None
assert max_new_jobs is None or 1<=max_new_jobs<=8
new_jobs=0
sys.stdout=Tee(sys.stdout,(out/'coordinator.log').open('a' if resume else 'w'))
signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
plan=json.loads((root/'validation-plan.json').read_text());sha=plan['implementationSha'];runs=json.loads((out/'coordinator.json').read_text()) if resume else []
assert all(r['implementationSha']==sha for r in runs)
subprocess.run(['git','merge-base','--is-ancestor',sha,'HEAD'],check=True)
subprocess.run(['git','diff','--quiet',sha,'--','packages','src','test','app','tools','schema','themes','package.json','package-lock.json','tsconfig.json'],check=True)
env={**os.environ,'LC_ALL':'C.UTF-8','TEST_PG_URL':os.environ.get('TEST_PG_URL','postgres://postgres:probe@127.0.0.1:5544/postgres'),'FORGE_RUNTIME_SOURCE':sha,'FORGE_RUNTIME_METRICS_PATH':str((out/'recovery-metrics.jsonl').resolve())}
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
 if resume and log.exists():shutil.copy2(log,log.with_suffix('.unacknowledged-before-reboot.log'))
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
tests('turn-approval-gate',['test/v2-turns-8h.test.js','test/v2-turns-sqlite-8h.test.js','test/v2-turns-postgres-8h.test.js','test/v2-turns-process-8h.test.js'])
tests('bulk',plan['bulk'],4)
for file in plan['serial']:tests(pathlib.Path(file).stem,[file])
for file in plan['postgres']:tests(pathlib.Path(file).stem,[file])
for name,args in [('production-build',['node_modules/.bin/vite','build','--config','app/web/vite.config.js']),('typecheck',['npm','run','typecheck']),('benchmark-50',['node','tools/v2-benchmark.mjs','--out','out/v2-8h-benchmark','--raster','none'])]:run(name,args)
run('headless',['node','--test','--test-reporter=tap',str(root/'headless-check.mjs')])
tests('byok-locale',['test/byok-budget.test.js'],changes={'LC_ALL':'en_IN.UTF-8'},expected=1)
run('native-review',['node',str(root/'native-review.mjs')])
run('shell-native',['node',str(root/'shell-native.mjs')])
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
