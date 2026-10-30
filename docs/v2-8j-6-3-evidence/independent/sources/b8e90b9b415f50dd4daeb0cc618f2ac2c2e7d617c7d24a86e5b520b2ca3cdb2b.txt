import sys,subprocess,json,time,datetime,hashlib,os,signal,resource,threading
from pathlib import Path
name=sys.argv[1];limit=int(sys.argv[2]);argv=sys.argv[3:]
base=Path('docs/v2-8j-6-3-evidence/independent');base.mkdir(exist_ok=True)
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
paths=subprocess.check_output(['git','diff','--name-only','6068a2a7c5643a1958a140bcc60d0df6b891ccec','HEAD','--','src','app','packages','test','tools/dev-protocol-check.mjs','package.json'],text=True).splitlines()
paths+=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()
paths+=['tools/chrome-shot.mjs','docs/v2-8j-6-3-evidence/independent/browser-long-selection.mjs','docs/v2-8j-6-3-evidence/independent/run-browser-long-selection.py']
paths+=subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','src','app','packages','test'],text=True).splitlines()
paths+=['packages/projects/document.js','packages/model/engine.ts','packages/model/citations.ts','packages/model/source-identity.ts','packages/model/scene.schema.json','packages/renderer-pptx/render.ts','src/projects/source-read.js','src/projects/source-schema.js','src/projects/sources.js','src/projects/history.js','src/auth.js','src/db.js','src/cloud.js','tsconfig.json']
hashes={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in sorted(set(paths)) if Path(p).is_file()}
snapshots=base/'sources';snapshots.mkdir(exist_ok=True)
for p,h in hashes.items():
 target=snapshots/(h+'.txt')
 if not target.exists():target.write_bytes(Path(p).read_bytes())
record={'sourceSnapshotDirectory':str(snapshots),'invocationHead':head,'command':subprocess.list2cmdline(argv),'argv':argv,'startedAt':datetime.datetime.now(datetime.UTC).isoformat(),'sourceHashes':hashes,'trackedDelta':subprocess.check_output(['git','diff','--name-only'],text=True).splitlines(),'timeoutSeconds':limit}
meta=base/(name+'.json');log=base/(name+'.tap')
meta.write_text(json.dumps(record,indent=2)+'\n');start=time.monotonic();timed=False
samples=[];stop=threading.Event()
usage0=resource.getrusage(resource.RUSAGE_CHILDREN)
def snapshot(group):
 members=[]
 for path in Path('/proc').iterdir():
  if not path.name.isdigit():continue
  try:
   fields=(path/'stat').read_text().rsplit(')',1)[1].split()
   if int(fields[2])!=group:continue
   io={}
   try:io={k:int(v) for k,v in (line.split(':') for line in (path/'io').read_text().splitlines()) if k in ['read_bytes','write_bytes']}
   except OSError:pass
   members.append({'io':io,'pid':int(path.name),'cpuSeconds':round((int(fields[11])+int(fields[12]))/os.sysconf('SC_CLK_TCK'),3),'rssBytes':int(fields[21])*os.sysconf('SC_PAGE_SIZE')})
  except (OSError,ValueError,IndexError):pass
 return {'elapsedSeconds':round(time.monotonic()-start,2),'members':members,'liveRssBytes':sum(x['rssBytes'] for x in members)}
def monitor(group):
 while not stop.is_set():
  samples.append(snapshot(group));stop.wait(1)
with log.open('wb') as stream:
 process=subprocess.Popen(argv,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
 record['ownedProcessGroup']=process.pid
 watcher=threading.Thread(target=monitor,args=(process.pid,),daemon=True);watcher.start()
 try:code=process.wait(timeout=limit)
 except subprocess.TimeoutExpired:
  timed=True;os.killpg(process.pid,signal.SIGTERM)
  try:code=process.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);code=process.wait()
stop.set();watcher.join(timeout=2)
usage1=resource.getrusage(resource.RUSAGE_CHILDREN)
record['ownedResources']={'cpuUserSeconds':round(usage1.ru_utime-usage0.ru_utime,3),'cpuSystemSeconds':round(usage1.ru_stime-usage0.ru_stime,3),'peakLiveGroupRssBytes':max((s['liveRssBytes'] for s in samples),default=0),'samples':samples,'note':'One-second process-group samples; summed RSS includes shared mappings. Waited-child CPU accounting; no attribution of global PSI.'}
record.update(exitCode=code if code>=0 else 128-code,durationMs=round((time.monotonic()-start)*1000),timedOut=timed,log=str(log))
meta.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['invocationHead','exitCode','durationMs','timedOut','log']}))
print('\n'.join(log.read_text(errors='replace').splitlines()[-12:]))
sys.exit(124 if timed else record['exitCode'])
