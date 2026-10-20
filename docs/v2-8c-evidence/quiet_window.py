import datetime, json, pathlib, re, subprocess, time

OUT = pathlib.Path('out/v2-8c-validation')
SHA = json.loads(pathlib.Path('docs/v2-8c-evidence/validation-plan.json').read_text())['implementationSha']
DEVICES = [p.name for p in pathlib.Path('/sys/block').iterdir() if (p / 'device').exists()]
assert 'nvme0n1' in DEVICES

def snapshot():
    cpu = list(map(int, pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]))
    disk = {r[2]: list(map(int, r[3:])) for line in pathlib.Path('/proc/diskstats').read_text().splitlines() if (r := line.split())[2] in DEVICES}
    return time.monotonic(), cpu, disk

class Window:
    def __init__(self):
        self.previous = snapshot()

    def observe(self, phase):
        now = snapshot()
        elapsed = now[0] - self.previous[0]
        cpu = [b-a for a,b in zip(self.previous[1], now[1])]
        total = sum(cpu)
        pressure = {n: pathlib.Path('/proc/pressure/'+n).read_text() for n in ['cpu','memory','io']}
        averages = {n: float(re.search(r'^some avg10=([\d.]+)', value).group(1)) for n,value in pressure.items()}
        available = int(re.search(r'^MemAvailable:\s+(\d+)', pathlib.Path('/proc/meminfo').read_text(), re.M).group(1))
        disks = {}
        for name, counters in now[2].items():
            delta = [b-a for a,b in zip(self.previous[2][name], counters)]
            disks[name] = {'busyPercent': 100*delta[9]/(elapsed*1000), 'weightedQueue': delta[10]/(elapsed*1000), 'inflight': counters[8], 'readKiBps': delta[2]/2/elapsed, 'writeKiBps': delta[6]/2/elapsed}
        blocked = []
        for line in subprocess.check_output(['ps','-eLo','pid,tid,stat,wchan:38,comm'], text=True).splitlines()[1:]:
            fields = line.split()
            if len(fields)>=3 and fields[2].startswith('D'):
                blocked.append({'pid':int(fields[0]),'tid':int(fields[1]),'state':fields[2],'name':fields[-1],'userspace':(pathlib.Path('/proc')/fields[0]/'exe').exists()})
        busy = 100*(total-cpu[3]-cpu[4])/total if total else 100
        iowait = 100*cpu[4]/total if total else 100
        storage_quiet = all(d['busyPercent']<5 and d['weightedQueue']<0.5 and d['inflight']<=1 for d in disks.values())
        ready = elapsed>=10 and busy<25 and iowait<20 and averages['cpu']<10 and averages['memory']<1 and available>8*1024*1024 and storage_quiet and not any(b['userspace'] for b in blocked)
        critical = busy>85 or averages['memory']>5 or available<4*1024*1024 or any(d['busyPercent']>75 or d['weightedQueue']>8 for d in disks.values())
        record = {'implementationSha':SHA,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'phase':phase,'sampleSeconds':elapsed,'cpuBusyPercent':busy,'cpuIoWaitPercent':iowait,'availableKiB':available,'pressure':pressure,'disks':disks,'blockedThreads':blocked,'ready':ready,'critical':critical,'limitation':'Elevated global I/O PSI/iowait has unresolved provenance; readiness uses sustained measured CPU/memory/backing-storage headroom, not an attribution to a graphics worker.'}
        with (OUT/'resource-window.jsonl').open('a') as stream:stream.write(json.dumps(record)+'\n')
        self.previous = now
        return record

    def wait(self, stable_seconds=30):
        stable = 0
        while stable<stable_seconds:
            time.sleep(15)
            row = self.observe('pre-job')
            stable = stable+row['sampleSeconds'] if row['ready'] else 0
            print('RESOURCE WINDOW',round(stable),'of',stable_seconds,'stable seconds; CPU',round(row['cpuBusyPercent'],1),'iowait',round(row['cpuIoWaitPercent'],1),'storage',row['disks'],flush=True)

if __name__=='__main__':
    Window().wait(180)
