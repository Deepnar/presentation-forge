import datetime,hashlib,json,os,resource,signal,subprocess,time
from pathlib import Path
base=Path('docs/v2-8j-6-2-evidence/independent')
source='65430f9b657e0b941e20d8e14b4eed7e6763a96e'
paths=['app/web/src/lib/nativeExport.js','app/web/src/lib/projectSession.js']
for p in paths:
 assert Path(p).read_bytes()==subprocess.check_output(['git','show',source+':'+p]),p
record={'implementationSha':source,'invocationHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'startedAt':datetime.datetime.now(datetime.UTC).isoformat(),'sourceHashes':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},'challengeHash':hashlib.sha256((base/'body-boundaries.mjs').read_bytes()).hexdigest(),'isolation':'Injected Response/ReadableStream only; no HTTP/network/browser/DB/build/model/provider/service. Fetch deliberately ignores AbortSignal to challenge logical late-body safety.','admission':{'cpuPressure':Path('/proc/pressure/cpu').read_text(),'memoryPressure':Path('/proc/pressure/memory').read_text(),'ioPressure':Path('/proc/pressure/io').read_text(),'memAvailable':[s for s in Path('/proc/meminfo').read_text().splitlines() if s.startswith('MemAvailable:')][0],'note':'Tiny two-case serial check; unrelated I/O pressure is observed without cause attribution. Own process is nice15/idle I/O/two allowed CPUs/watchdog15sec.'}}
cpus=','.join(map(str,sorted(os.sched_getaffinity(0))[:2]))
argv=['nice','-n','15','ionice','-c','3','taskset','-c',cpus,'node',str(base/'body-boundaries.mjs')]
record['argv']=argv
start=time.monotonic();usage0=resource.getrusage(resource.RUSAGE_CHILDREN)
with (base/'body-boundaries.tap').open('xb') as log:
 process=subprocess.Popen(argv,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);record['ownedProcessGroup']=process.pid
 try:code=process.wait(timeout=15);timed=False
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(process.pid,signal.SIGTERM)
  try:code=process.wait(timeout=2)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);code=process.wait()
u=resource.getrusage(resource.RUSAGE_CHILDREN)
record.update(exitCode=code,timedOut=timed,durationMs=round((time.monotonic()-start)*1000),cpuUserSeconds=round(u.ru_utime-usage0.ru_utime,3),cpuSystemSeconds=round(u.ru_stime-usage0.ru_stime,3),peakChildRssBytes=u.ru_maxrss*1024,log=str(base/'body-boundaries.tap'))
lines=(base/'body-boundaries.tap').read_text().splitlines()
try:record['totals']=json.loads(lines[-1])
except Exception:record['totals']=None
(base/'body-boundaries.json').write_text(json.dumps(record,indent=2)+'\n')
print((base/'body-boundaries.tap').read_text());print(json.dumps({k:record[k] for k in ['implementationSha','exitCode','timedOut','durationMs','totals']}))

raise SystemExit(124 if timed else code)
