"""Read-only quiet-window admission; no process/service control or model calls."""
import pathlib,json,time,hashlib,sys,re,datetime
P=pathlib.Path
observer_hash=hashlib.sha256(P(__file__).read_bytes()).hexdigest()
PF_KTHREAD=0x00200000

def capture():
 cpu=list(map(int,P('/proc/stat').read_text().splitlines()[0].split()[1:]))
 disks={}
 for line in P('/proc/diskstats').read_text().splitlines():
  fields=line.split()
  if fields[2] in ['nvme0n1']:disks[fields[2]]=list(map(int,fields[3:]))
 return time.monotonic(),cpu,disks

def pressure(name):return P('/proc/pressure/'+name).read_text()
def avg10(value):return float(re.search(r'^some avg10=([0-9.]+)',value).group(1))
def blocked():
 result=[]
 for process in P('/proc').glob('[0-9]*'):
  for task in (process/'task').glob('[0-9]*'):
   try:
    raw=(task/'stat').read_text();fields=raw[raw.rindex(')')+2:].split()
    if fields[0]!='D':continue
    flags=int(fields[6]);kind='kernel-thread' if flags&PF_KTHREAD else 'userspace'
    result.append({'pid':int(process.name),'tid':int(task.name),'flags':flags,'classification':kind})
   except (OSError,ValueError,IndexError):result.append({'pid':int(process.name),'tid':int(task.name),'classification':'unknown'})
 return result

samples=[];ready_count=0;old=capture()
for attempt in range(4):
 time.sleep(15);new=capture();seconds=new[0]-old[0];delta=[b-a for a,b in zip(old[1],new[1])];total=sum(delta[:8]);busy=(total-delta[3]-delta[4])/total*100;iowait=delta[4]/total*100
 mem=int(re.search(r'^MemAvailable:\s*(\d+)',P('/proc/meminfo').read_text(),re.M).group(1));press={k:pressure(k) for k in ['cpu','memory','io']}
 disks={name:{'busyPercent':(values[9]-old[2][name][9])/(seconds*10),'weightedQueue':(values[10]-old[2][name][10])/(seconds*1000),'inflight':values[8]} for name,values in new[2].items() if name in old[2]}
 tasks=blocked();ready=busy<25 and iowait<20 and avg10(press['cpu'])<10 and avg10(press['memory'])<1 and mem>8*1024*1024 and len(disks)==1 and all(d['busyPercent']<5 and d['weightedQueue']<.5 and d['inflight']<=1 for d in disks.values()) and all(t['classification']=='kernel-thread' for t in tasks)
 item={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'intervalSeconds':seconds,'cpuBusyPercent':busy,'cpuIoWaitPercent':iowait,'availableKiB':mem,'pressure':press,'disks':disks,'blockedThreads':tasks,'ready':ready,'classifierVersion':2,'observerSha256':observer_hash};samples.append(item)
 print(json.dumps({'sample':attempt+1,'ready':ready,'cpuBusyPercent':round(busy,2),'disks':disks,'blockedThreads':tasks}),flush=True)
 ready_count=ready_count+1 if ready else 0;old=new
 if ready_count==2:break
result={'admitted':ready_count==2,'samples':samples,'scope':'Focused J4 actual storage checks and owned isolated PostgreSQL only. Existing CPU<25%, iowait<20%, CPU PSI<10, memory PSI<1, available>8GiB and physical storage busy<5%/queue<.5/inflight<=1; two consecutive15sec samples, startup within60sec. Unknown/userspace D threads block.','limitation':'Global I/O PSI retained with unresolved provenance; no inference/process control. Physical backing device nvme0n1 verified from findmnt for repository/Docker root.'}
P(sys.argv[1]).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'admitted':result['admitted']}),flush=True)
