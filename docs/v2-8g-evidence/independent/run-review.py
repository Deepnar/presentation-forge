import datetime, hashlib, json, os, pathlib, re, shutil, signal, socket, subprocess, sys, time
ROOT=pathlib.Path('docs/v2-8g-evidence'); E=ROOT/'independent'; OUT=pathlib.Path('out/v2-8g-independent-20261022')
sys.path.insert(0,str(ROOT.resolve()))
from quiet_window import Window
SHA='f3e784ac6227f46628dc99a54762f6a861eeed64'; BASE='0cab854bce04b862060829812a9ab6ff0b765fd9'; PACKET='66a98665fba0213ec12e9fba1a1782b11297afc6'
E.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True); (E/'logs').mkdir(exist_ok=True)
def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def write(p,value):pathlib.Path(p).write_text(json.dumps(value,indent=2)+'\n')
source=['packages','src','test','app','tools','schema','themes','config','package.json','package-lock.json']
subprocess.run(['git','merge-base','--is-ancestor',SHA,PACKET],check=True)
subprocess.run(['git','diff','--quiet',SHA,PACKET,'--',*source],check=True)
subprocess.run(['git','diff','--quiet',SHA,'--',*source],check=True)
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==PACKET
assert subprocess.check_output(['git','rev-parse',f'{SHA}:src/agent/model-provider.js'],text=True)==subprocess.check_output(['git','rev-parse','ec67315:src/agent/model-provider.js'],text=True)
write(E/'source-equality.json',{'implementationSha':SHA,'acceptedBaseline':BASE,'reviewedPacket':PACKET,'sourceSubtrees':source,'sourceDeltaAfterFreeze':[],'workingTreeSourceDelta':[],'adapterEqualsEarlierStaticReview':True,'adapterSha256':digest('src/agent/model-provider.js'),'streamTestsSha256':digest('test/v2-provider-stream-8g.test.js')})
owned=json.loads((ROOT/'owned-postgres.json').read_text());meta=json.loads(subprocess.check_output(['docker','inspect',owned['id']],text=True))[0]
assert meta['Id']==owned['id'] and meta['Name']=='/forge-v28g-validation' and meta['State']['Running'] and meta['Image']==owned['imageId']
assert meta['NetworkSettings']['Ports']['5432/tcp']==[{'HostIp':'127.0.0.1','HostPort':'5544'}]
with socket.socket() as s:s.settimeout(1);assert s.connect_ex(('127.0.0.1',5544))==0
version=subprocess.check_output(['docker','exec',owned['id'],'psql','-U','postgres','-d','postgres','-At','-c','SHOW server_version'],text=True).strip();assert version=='15.18'
write(E/'owned-service-observation.json',{'implementationSha':SHA,'id':owned['id'],'name':owned['name'],'ports':meta['NetworkSettings']['Ports'],'serverVersion':version,'running':True,'stoppedByReviewer':False,'cleanupOwner':'/root'})
qualification=json.loads((OUT/'sustained-window.json').read_text());assert qualification['implementationSha']==SHA and qualification['sampleSeconds']>=180
Window().wait(30)
assert not (OUT/'backup').exists()
index=[]
for folder in sorted(pathlib.Path('docs').glob('v2-*-evidence')):
 for p in sorted(folder.rglob('*')):
  if not p.is_file():continue
  target=OUT/'backup'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
  h=digest(p);assert digest(target)==h;index.append({'path':str(p),'sha256':h,'bytes':p.stat().st_size})
write(OUT/'backup/index.json',index);write(E/'backup-manifest.json',index)
canonical=[]
for name in ['out/v2-7a-validation/shell-chart.pptx','out/v2-7a-validation/shell-table.pptx','out/v2-7b-1-validation/browser/imported-chart.pptx','out/v2-7b-1-validation/browser/imported-table.pptx','out/v2-7b-2-validation/browser/handoff.pptx']:
 p=pathlib.Path(name);assert p.is_file();target=OUT/'canonical'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target);h=digest(p);assert digest(target)==h;canonical.append({'path':name,'sha256':h,'bytes':p.stat().st_size})
write(OUT/'canonical/index.json',canonical);write(E/'canonical-manifest.json',canonical)
print('FRESH SNAPSHOT',len(index),'files',sum(r['path'].endswith('.pptx') for r in index),'native archives;',len(canonical),'canonical originals',flush=True)
env={**os.environ,'LC_ALL':'C.UTF-8','TEST_PG_URL':'postgres://postgres:probe@127.0.0.1:5544/postgres','FORGE_RUNTIME_SOURCE':SHA,'FORGE_RUNTIME_METRICS_PATH':str((OUT/'recovery-metrics.jsonl').resolve()),'FORGE_VALIDATION_OUT':str(OUT)}
runs=[]
execution_started=time.time()
signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
def run(name,args,files=None,changes=None,expected=0):
 Window().wait(30)
 cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args];log=E/'logs'/f'{name}.log';started=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat();print(name,'START',flush=True)
 with log.open('w') as stream:
  p=subprocess.Popen(cmd,env={**env,**(changes or {})},stdout=stream,stderr=subprocess.STDOUT,start_new_session=True);monitor=Window();critical=0
  try:
   while True:
    try:p.wait(timeout=15);break
    except subprocess.TimeoutExpired:
     row=monitor.observe('running:'+name);critical=critical+1 if row['critical'] else 0;print(name,'RUNNING',round(time.monotonic()-started),flush=True)
     if critical>=3:raise KeyboardInterrupt('Owned validation stopped for sustained critical contention')
  except BaseException:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   write(E/'interrupted.json',{'name':name,'exitCode':p.returncode,'countedPassing':False});raise
 row={'name':name,'implementationSha':SHA,'reviewedPacket':PACKET,'command':cmd,'files':files or [],'exitCode':p.returncode,'atUtc':at,'durationSeconds':time.monotonic()-started,'log':str(log),'logSha256':digest(log),'backend':(changes or {}).get('FORGE_HANDOFF_TEST_BACKEND','temporary SQLite and/or owned PostgreSQL15.18 as named in files')}
 if files is not None:
  text=log.read_text();row['tests']={k:int(re.findall(r'^# '+label+r' (\d+)\s*$',text,re.M)[-1]) for k,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
 runs.append(row);write(E/'executions.json',runs);print(name,'EXIT',p.returncode,row.get('tests',''),flush=True)
 assert p.returncode==expected,(name,log.read_text()[-5000:])
 if files is not None and expected==0:assert not any(row['tests'][k] for k in ['fail','skip','cancelled'])
 return row
def tests(name,files,changes=None,expected=0):return run(name,['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',*files],files,changes,expected)
affected=['test/v2-provider-stream-8g.test.js','test/v2-provider-8c.test.js','test/v2-provider-durable-8c.test.js','test/v2-provider-run-8d.test.js','test/v2-provider-run-sqlite-8d.test.js','test/v2-conversation-8e.test.js','test/v2-conversation-sqlite-8e.test.js','test/v2-context-8a.test.js','test/v2-tools-8a.test.js','test/v2-runtime-8b.test.js','test/v2-runtime-process-8b.test.js','test/v2-core-boundary.test.js','test/v2-preservation.test.js','test/v2-ownership-5b.test.js','test/v2-engine-5b.test.js','test/v2-engine-5b1.test.js','test/v2-projects-6c-sqlite.test.js','test/v2-import-service-7b.test.js','test/v2-handoff-7b.test.js','test/v2-export-preflight-5a.test.js','test/dev-protocol.test.js']
tests('affected-domain',affected)
plan=json.loads((ROOT/'validation-plan.json').read_text())
tests('postgres-all-eight',plan['postgres'])
tests('full-shell-7a',['test/v2-edit-chrome-7a.test.js'])
tests('full-import-7b',['test/v2-import-chrome-7b.test.js'])
# Preserve this backend's complete browser evidence before the same canonical paths are reused.
def capture(name,folders):
 rows=[]
 for folder in map(pathlib.Path,folders):
  for p in sorted(folder.rglob('*')):
   if not p.is_file():continue
   old=next((r for r in index+canonical if r['path']==str(p)),None)
   if old and digest(p)==old['sha256']:continue
   if old is None and p.stat().st_mtime<execution_started:continue
   target=E/name/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target);h=digest(p);assert digest(target)==h;rows.append({'source':str(p),'file':str(target),'sha256':h})
 write(E/(name+'.json'),rows)
capture('fresh-shell-import',['docs/v2-7a-evidence','docs/v2-7b-1-evidence','out/v2-7a-validation','out/v2-7b-1-validation/browser'])
tests('full-handoff-sqlite',['test/v2-handoff-chrome-7b.test.js'])
capture('fresh-handoff-sqlite',['docs/v2-7b-2-evidence','out/v2-7b-2-validation/browser'])
tests('full-handoff-postgres',['test/v2-handoff-chrome-7b.test.js'],{'FORGE_HANDOFF_TEST_BACKEND':'postgres'})
capture('fresh-handoff-postgres',['docs/v2-7b-2-evidence','out/v2-7b-2-validation/browser'])
run('production-build',['node_modules/.bin/vite','build','--config','app/web/vite.config.js'])
run('typecheck',['npm','run','typecheck'])
run('benchmark-50',['node','tools/v2-benchmark.mjs','--out',str(OUT/'benchmark'),'--raster','none'])
run('headless-native',['node','--test','--test-reporter=tap',str(E/'headless-check.mjs')],[str(E/'headless-check.mjs')])
for family in ['openai-compatible','anthropic']:
 for count in [5000,200000]:run(f'memory-{family}-{count}',['node','--expose-gc',str(ROOT/'stream-resources.mjs'),'--sample',family,str(count)])
tests('standing-locale',['test/byok-budget.test.js'],{'LC_ALL':'en_IN.UTF-8'},1)
run('browser-native',['node',str(E/'browser-native.mjs')])
run('protocol',['npm','run','dev:protocol'])
print('INDEPENDENT EXECUTION COMPLETE; restoration and visual inspection remain',flush=True)
