import datetime, hashlib, json, os, re, resource, signal, subprocess, sys, threading, time
from pathlib import Path

base = Path('docs/v2-8j-6-1-evidence/independent')
name = sys.argv[1]
def machine():
    cpu = list(map(int, Path('/proc/stat').read_text().splitlines()[0].split()[1:]))
    disks = {r[2]:int(r[12]) for line in Path('/proc/diskstats').read_text().splitlines()
             if len(r:=line.split())>12 and re.fullmatch(r'nvme\d+n\d+|sd[a-z]+', r[2])}
    memory = next(int(line.split()[1])*1024 for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
    return time.monotonic(),cpu,disks,memory
a=machine();time.sleep(2);b=machine();dt=b[0]-a[0];cpu=[y-x for x,y in zip(a[1],b[1])]
admission={'at':datetime.datetime.now(datetime.UTC).isoformat(),'cpuBusyPercent':100*(1-(cpu[3]+cpu[4])/sum(cpu)),
           'memoryAvailableBytes':b[3],'diskBusyPercent':{k:100*(v-a[2][k])/(1000*dt) for k,v in b[2].items()},
           'globalIoPsi':Path('/proc/pressure/io').read_text().strip(),'policy':'Global PSI is not attributed to this project. One bounded offline two-CPU native challenge, low priority, no unrelated process action.'}
assert admission['cpuBusyPercent']<90 and admission['memoryAvailableBytes']>2*1024**3
paths=['packages/renderer-pptx/render.ts','packages/renderer-pptx/source-notes.ts','packages/renderer-pptx/shape-ids.ts',
       'src/projects/citation-export.js','src/projects/source-read.js','packages/model/citation-content.ts','packages/model/citation-targets.ts',
       'test/v2-tool-fixture.js','test/v2-citations-fixture.js','test/v2-source-registry-fixture.js','test/v2-citation-export-fixture.js',
       str(base/'empty-slide-challenge.mjs'),str(base/'run-empty-slide.py')]
record={'invocationHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'admission':admission,
        'trackedDelta':subprocess.check_output(['git','diff','--name-only'],text=True).splitlines(),
        'sourceHashes':{p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths},
        'startedAt':datetime.datetime.now(datetime.UTC).isoformat(),'timeoutSeconds':30}
argv=['nice','-n','15','ionice','-c','3','taskset','-c','20,21','node','--test','--test-reporter=./tools/validated-tap.mjs',str(base/'empty-slide-challenge.mjs')]
record['argv']=argv;start=time.monotonic();samples=[];stop=threading.Event();usage=resource.getrusage(resource.RUSAGE_CHILDREN)
def monitor(group):
    while not stop.is_set():
        members=[]
        for p in Path('/proc').iterdir():
            if not p.name.isdigit():continue
            try:
                r=(p/'stat').read_text().rsplit(')',1)[1].split()
                if int(r[2])==group:members.append({'pid':int(p.name),'rssBytes':int(r[21])*os.sysconf('SC_PAGE_SIZE')})
            except (OSError,ValueError,IndexError):pass
        samples.append({'elapsedSeconds':time.monotonic()-start,'members':members});stop.wait(.1)
with (base/(name+'.tap')).open('wb') as stream:
    child=subprocess.Popen(argv,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True);record['ownedProcessGroup']=child.pid
    worker=threading.Thread(target=monitor,args=(child.pid,),daemon=True);worker.start();timed=False
    try:code=child.wait(timeout=30)
    except subprocess.TimeoutExpired:
        timed=True;os.killpg(child.pid,signal.SIGTERM)
        try:code=child.wait(timeout=3)
        except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
stop.set();worker.join(timeout=2);end=resource.getrusage(resource.RUSAGE_CHILDREN)
record.update(exitCode=code,timedOut=timed,durationMs=round(1000*(time.monotonic()-start)),
              ownedResources={'cpuSeconds':end.ru_utime+end.ru_stime-usage.ru_utime-usage.ru_stime,
                              'peakSummedRssBytes':max((sum(x['rssBytes'] for x in s['members']) for s in samples),default=0),'samples':samples})
(base/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:record[k] for k in ['invocationHead','exitCode','timedOut','durationMs']}))
print('\n'.join((base/(name+'.tap')).read_text().splitlines()[-17:]))
raise SystemExit(124 if timed else code)
