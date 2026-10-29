import datetime,hashlib,json,os,resource,signal,subprocess,time
from pathlib import Path
base=Path('docs/v2-8j-6-2-evidence/independent')
source='6068a2a7c5643a1958a140bcc60d0df6b891ccec'
paths=['app/web/src/lib/nativeExport.js','app/web/src/lib/projectSession.js','app/web/src/components/ProjectExports.jsx','app/web/src/components/ProjectExportButton.jsx','app/web/src/components/SceneViewer.jsx','app/web/src/views/Workspace.jsx','app/web/src/App.jsx','app/server/index.js','app/server/v2-native-export-routes.js','app/server/v2-projects-routes.js','test/v2-native-export-fixture.js','test/v2-import-fixture.js','tools/chrome-shot.mjs']
for p in paths:
 assert Path(p).read_bytes()==subprocess.check_output(['git','show',source+':'+p]),p
record={'implementationSha':source,'invocationHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'startedAt':datetime.datetime.now(datetime.UTC).isoformat(),'sourceHashes':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},'challengeHash':hashlib.sha256((base/'dialog-short-zoom-after.mjs').read_bytes()).hexdigest(),'isolation':'One actual final-dist loopback API/SQLite+Chrome fixture; CSS zoom emulation/short layout and held metadata unmount only. No build, PG, models/search/provider/GPU or external network.','admission':{'cpuPressure':Path('/proc/pressure/cpu').read_text(),'memoryPressure':Path('/proc/pressure/memory').read_text(),'ioPressure':Path('/proc/pressure/io').read_text(),'memAvailable':[s for s in Path('/proc/meminfo').read_text().splitlines() if s.startswith('MemAvailable:')][0],'note':'One bounded serial browser dialog challenge; unrelated I/O pressure observed without cause attribution. Own process is nice15/idle I/O/two allowed CPUs/watchdog60sec.'}}
cpus=','.join(map(str,sorted(os.sched_getaffinity(0))[:2]))
argv=['nice','-n','15','ionice','-c','3','taskset','-c',cpus,'node',str(base/'dialog-short-zoom-after.mjs')]
record['argv']=argv
record['distHashes']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('app/web/dist').rglob('*') if p.is_file()}
start=time.monotonic();usage0=resource.getrusage(resource.RUSAGE_CHILDREN)
with (base/'dialog-short-zoom-after.tap').open('xb') as log:
 process=subprocess.Popen(argv,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);record['ownedProcessGroup']=process.pid
 try:code=process.wait(timeout=60);timed=False
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(process.pid,signal.SIGTERM)
  try:code=process.wait(timeout=2)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);code=process.wait()
u=resource.getrusage(resource.RUSAGE_CHILDREN)
record.update(exitCode=code,timedOut=timed,durationMs=round((time.monotonic()-start)*1000),cpuUserSeconds=round(u.ru_utime-usage0.ru_utime,3),cpuSystemSeconds=round(u.ru_stime-usage0.ru_stime,3),peakChildRssBytes=u.ru_maxrss*1024,log=str(base/'dialog-short-zoom-after.tap'))
lines=(base/'dialog-short-zoom-after.tap').read_text().splitlines()
try:record['totals']=json.loads(lines[-1])
except Exception:record['totals']=None
(base/'dialog-short-zoom-after.json').write_text(json.dumps(record,indent=2)+'\n')
print((base/'dialog-short-zoom-after.tap').read_text());print(json.dumps({k:record[k] for k in ['implementationSha','exitCode','timedOut','durationMs','totals']}))

raise SystemExit(124 if timed else code)
