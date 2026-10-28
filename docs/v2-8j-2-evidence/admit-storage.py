"""Fresh J1 namespace; observe existing sustained CPU/memory/storage bounds only."""
import pathlib, time, json, subprocess, hashlib, datetime, re
OUT=pathlib.Path(__file__).resolve().parent
DEVICES=[p.name for p in pathlib.Path('/sys/block').iterdir() if (p/'device').exists()]
assert DEVICES
PF_KTHREAD=0x00200000
HASH=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
def snapshot():
 cpu=list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
 disk={r[2]:list(map(int,r[3:])) for line in pathlib.Path('/proc/diskstats').read_text().splitlines() if (r:=line.split())[2] in DEVICES}
 assert len(disk)==len(DEVICES)
 return time.monotonic(),cpu,disk
previous=snapshot();ready=0;rows=[]
for attempt in range(12):
 time.sleep(15);sample=snapshot();dt=sample[0]-previous[0];cpu=[b-a for a,b in zip(previous[1],sample[1])];total=sum(cpu)
 busy=100*(total-cpu[3]-cpu[4])/total;iowait=100*cpu[4]/total
 disks={}
 for name,current in sample[2].items():
  d=[b-a for a,b in zip(previous[2][name],current)]
  disks[name]={'busyPercent':100*d[9]/(dt*1000),'weightedQueue':d[10]/(dt*1000),'inflight':current[8]}
 pressure={n:pathlib.Path('/proc/pressure/'+n).read_text() for n in ['cpu','memory','io']}
 averages={n:float(re.search(r'^some avg10=([\d.]+)',s)[1]) for n,s in pressure.items()}
 available=int(re.search(r'^MemAvailable:\s+(\d+)',pathlib.Path('/proc/meminfo').read_text(),re.M)[1])
 blocked=[]
 for line in subprocess.check_output(['ps','-eLo','pid,tid,stat,comm'],text=True).splitlines()[1:]:
  parts=line.split()
  if len(parts)<4 or not parts[2].startswith('D'):continue
  pid,tid=int(parts[0]),int(parts[1]);source=pathlib.Path('/proc')/str(pid)/'task'/str(tid)/'stat'
  try:
   raw=source.read_text();head,fields=raw.rsplit(')',1);assert int(head.split('(',1)[0])==tid
   flags=int(fields.split()[6]);assert flags>=0
   classification='kernel-thread' if flags&PF_KTHREAD else 'userspace'
  except (OSError,ValueError,IndexError,AssertionError): flags=None;classification='unknown'
  blocked.append({'pid':pid,'tid':tid,'flags':flags,'classification':classification})
 admitted=dt>=10 and busy<25 and iowait<20 and averages['cpu']<10 and averages['memory']<1 and available>8*1024*1024 and all(d['busyPercent']<5 and d['weightedQueue']<.5 and d['inflight']<=1 for d in disks.values()) and all(b['classification']=='kernel-thread' for b in blocked)
 row={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'intervalSeconds':dt,'cpuBusyPercent':busy,'cpuIoWaitPercent':iowait,'availableKiB':available,'pressure':pressure,'disks':disks,'blockedThreads':blocked,'ready':admitted,'classifierVersion':2,'observerSha256':HASH}
 rows.append(row);previous=sample;ready=ready+1 if admitted else 0
 print(json.dumps({'sample':attempt+1,'ready':admitted,'consecutive':ready,'cpu':busy,'iowait':iowait,'disks':disks,'blocked':blocked}),flush=True)
 if ready>=2:break
record=json.dumps({'admitted':ready>=2,'samples':rows,'scope':'Focused J2 storage checks and owned isolated PostgreSQL setup at nice10/idle I/O; no browser/build/model/GPU/old matrix. Existing CPU<25%, iowait<20%, CPU PSI<10, memory PSI<1, available>8GiB and physical storage busy<5%/queue<.5/inflight<=1 with two fresh15s ready samples. Unknown/userspace D threads block.','limitation':'Global I/O PSI has unresolved provenance and remains reported; admission uses sustained measured CPU/memory/backing-storage headroom, no attribution to a graphics worker.'},indent=2)+'\n'
attempt=max([int(p.stem.rsplit('-',1)[1]) for p in OUT.glob('sqlite-admission-attempt-*.json')]+[0])+1
(OUT/f'sqlite-admission-attempt-{attempt}.json').write_text(record)
(OUT/'sqlite-admission.json').write_text(record)
raise SystemExit(0 if ready>=2 else 2)
