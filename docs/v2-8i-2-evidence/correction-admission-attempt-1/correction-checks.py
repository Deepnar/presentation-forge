import datetime,hashlib,json,os,pathlib,re,signal,subprocess,time
from quiet_window import Window
root=pathlib.Path('docs/v2-8i-2-evidence');out=pathlib.Path('out/v2-8i-2-correction');out.mkdir(exist_ok=False)
os.environ['FORGE_VALIDATION_OUT']=str(out)
# Imported quiet-window defaults are overridden before constructing any sampler.
import quiet_window
quiet_window.OUT=out
sha=json.loads((root/'validation-plan.json').read_text())['implementationSha']
source=['app','packages','src','test','tools','schema','themes','package.json','package-lock.json','tsconfig.json']
subprocess.run(['git','diff','--quiet',sha,'--',*source],check=True)
evidence=root/'correction';evidence.mkdir(exist_ok=True)
Window().wait(180)
records=[]
jobs=[('sqlite-adjacent',['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',
 'test/v2-turn-worker-sqlite-8i.test.js','test/v2-turns-8h.test.js','test/v2-turns-sqlite-8h.test.js','test/v2-turns-process-8h.test.js','test/v2-core-boundary.test.js','test/dev-protocol.test.js']),
 ('sqlite-cli',['node','--test-reporter=./tools/validated-tap.mjs','--input-type=module','--eval',"import { workerCliContract } from './test/v2-turn-worker-process-contract.js'; import { scenario } from './test/v2-runtime-fixture.js'; workerCliContract('SQLite',scenario);"]),
 ('typecheck',['npm','run','typecheck'])]
for name,args in jobs:
 Window().wait(30);subprocess.run(['git','diff','--quiet',sha,'--',*source],check=True)
 log=evidence/(name+'.log');assert not log.exists()
 command=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args]
 started=datetime.datetime.now(datetime.timezone.utc).isoformat();tick=time.monotonic()
 print('START',name,flush=True)
 with log.open('x') as stream:
  process=subprocess.Popen(command,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True,env={**os.environ,'LC_ALL':'C.UTF-8','FORGE_RUNTIME_SOURCE':sha})
  monitor=Window();critical=0
  try:
   while True:
    try:process.wait(timeout=15);break
    except subprocess.TimeoutExpired:
     row=monitor.observe('running:'+name);critical=critical+1 if row['critical'] else 0
     if critical>=3:raise RuntimeError('Sustained critical resource window')
  except BaseException:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
   raise
 raw=log.read_text();counts=None
 if name!='typecheck':counts={key:int(re.findall(r'^# '+label+r' (\d+)\s*$',raw,re.M)[-1]) for key,label in {'total':'tests','pass':'pass','fail':'fail','skip':'skipped','cancelled':'cancelled'}.items()}
 record={'implementationSha':sha,'atUtc':started,'name':name,'command':command,'durationSeconds':time.monotonic()-tick,'exitCode':process.returncode,'tests':counts,'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()}
 records.append(record);(evidence/'checks.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(record),flush=True)
 if process.returncode:break
for name in ['resource-window.jsonl','sustained-window.json']:
 if (out/name).exists():(evidence/name).write_bytes((out/name).read_bytes())
