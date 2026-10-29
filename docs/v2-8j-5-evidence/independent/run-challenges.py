import datetime, hashlib, json, os, re, resource, signal, subprocess, threading, time
from pathlib import Path

out = Path('docs/v2-8j-5-evidence/independent')
source_sha = 'f6487737557c20d481cbc3e84216d7144bb116e8'
public = json.loads(Path('docs/v2-8j-5-evidence/service.json').read_text())
# Verify only public Docker fields before opening the private connection file.
fmt = '{{json .Id}}\n{{json .Name}}\n{{json .Image}}\n{{json .State.Status}}\n{{json .NetworkSettings.Ports}}\n{{json .HostConfig.NanoCpus}}\n{{json .HostConfig.Memory}}\n{{json .HostConfig.Tmpfs}}'
values = [json.loads(v) for v in subprocess.check_output(['docker', 'inspect', '--format', fmt, public['containerId']], text=True).splitlines()]
assert values == [public['containerId'], '/' + public['name'], public['image'], 'running',
                  {'5432/tcp': [{'HostIp': public['host'], 'HostPort': str(public['port'])}]},
                  int(public['cpuLimit'] * 1e9), public['memoryLimitBytes'], public['tmpfs']]
identity = {'verifiedAt': datetime.datetime.now(datetime.UTC).isoformat(), 'publicIdentityMatchedBeforeCredentialRead': True,
            'containerId': values[0], 'name': values[1], 'image': values[2], 'state': values[3],
            'ports': values[4], 'nanoCpus': values[5], 'memoryLimitBytes': values[6], 'tmpfs': values[7]}
(out / 'identity-preflight.json').write_text(json.dumps(identity, indent=2) + '\n')

def pressure_snapshot():
    cpu = list(map(int, Path('/proc/stat').read_text().splitlines()[0].split()[1:]))
    disks = {row[2]: int(row[12]) for line in Path('/proc/diskstats').read_text().splitlines()
             if len(row := line.split()) > 12 and re.fullmatch(r'nvme\d+n\d+|sd[a-z]+', row[2])}
    memory = {row.split(':')[0]: int(row.split()[1]) * 1024 for row in Path('/proc/meminfo').read_text().splitlines() if row.startswith('MemAvailable:')}
    return {'time': time.monotonic(), 'cpu': cpu, 'disks': disks, 'memoryAvailableBytes': memory['MemAvailable'],
            'psi': {name: Path('/proc/pressure/' + name).read_text().strip() for name in ['cpu', 'io', 'memory']}}
a = pressure_snapshot(); time.sleep(2); b = pressure_snapshot()
delta = [y-x for x,y in zip(a['cpu'], b['cpu'])]; duration = b['time'] - a['time']
cpu_busy = 100 * (1 - (delta[3] + delta[4]) / sum(delta))
admission = {'at': datetime.datetime.now(datetime.UTC).isoformat(), 'sampleSeconds': duration,
             'cpuBusyPercent': cpu_busy, 'memoryAvailableBytes': b['memoryAvailableBytes'],
             'diskBusyPercent': {k: 100 * (v-a['disks'][k]) / (1000*duration) for k,v in b['disks'].items()},
             'psi': b['psi'], 'policy': 'Observe actual CPU/memory/storage; global PSI is not attributed to this project. Serial nice10/idle I/O/two-CPU bounded check; owned group monitored.',
             'ready': cpu_busy < 90 and b['memoryAvailableBytes'] > 2*1024**3}
(out / 'resource-admission.json').write_text(json.dumps(admission, indent=2) + '\n')
assert admission['ready'], 'Insufficient CPU/memory headroom for bounded reviewer check'

manifest = json.loads(Path('docs/v2-8j-5-evidence/source-manifest.json').read_text())
assert manifest['implementationSha'] == source_sha
hashes = dict(manifest['sourceHashes'])
for path, expected in hashes.items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == expected, path
    assert hashlib.sha256(subprocess.check_output(['git', 'show', source_sha + ':' + path])).hexdigest() == expected, path
for path in ['test/v2-tool-fixture.js', 'test/v2-source-registry-fixture.js', 'test/v2-citations-fixture.js', 'tools/validated-tap.mjs',
             str(out / 'challenges.mjs'), str(out / 'run-challenges.py')]:
    hashes[path] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if not path.startswith(str(out)):
        assert hashlib.sha256(subprocess.check_output(['git', 'show', source_sha + ':' + path])).hexdigest() == hashes[path], path

# Credentials are used only in the child environment, never argv or metadata.
private = json.loads(Path('.codex/v2-8j-5-session/connection.json').read_text())
env = dict(os.environ, FORGE_J5_REVIEW_PG_URL=private['url'])
argv = ['nice', '-n', '10', 'ionice', '-c', '3', 'taskset', '-c', '0,1', 'node', '--test',
        '--test-reporter=./tools/validated-tap.mjs', str(out / 'challenges.mjs')]
meta = {'invocationHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
        'implementationSha': source_sha, 'backend': 'actual PostgreSQL15 on identity-verified task-owned service',
        'argv': argv, 'sourceHashes': hashes, 'timeoutSeconds': 45, 'startedAt': datetime.datetime.now(datetime.UTC).isoformat()}
samples = []; stop = threading.Event(); started = time.monotonic()
usage0 = resource.getrusage(resource.RUSAGE_CHILDREN)
def monitor(group):
    while not stop.is_set():
        members = []
        for p in Path('/proc').iterdir():
            if not p.name.isdigit(): continue
            try:
                f = (p/'stat').read_text().rsplit(')', 1)[1].split()
                if int(f[2]) == group:
                    members.append({'pid': int(p.name), 'cpuSeconds': (int(f[11])+int(f[12]))/os.sysconf('SC_CLK_TCK'),
                                    'rssBytes': int(f[21])*os.sysconf('SC_PAGE_SIZE')})
            except (OSError, ValueError, IndexError): pass
        samples.append({'elapsedSeconds': time.monotonic()-started, 'members': members})
        stop.wait(.25)
with (out/'challenges.tap').open('wb') as log:
    child = subprocess.Popen(argv, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    meta['ownedProcessGroup'] = child.pid
    watcher = threading.Thread(target=monitor, args=(child.pid,), daemon=True); watcher.start()
    timed_out = False
    try: code = child.wait(timeout=45)
    except subprocess.TimeoutExpired:
        timed_out = True; os.killpg(child.pid, signal.SIGTERM)
        try: code = child.wait(timeout=5)
        except subprocess.TimeoutExpired: os.killpg(child.pid, signal.SIGKILL); code = child.wait()
stop.set(); watcher.join(timeout=2)
usage1 = resource.getrusage(resource.RUSAGE_CHILDREN)
meta.update(exitCode=code, timedOut=timed_out, durationMs=round(1000*(time.monotonic()-started)),
            ownedResources={'cpuUserSeconds': usage1.ru_utime-usage0.ru_utime, 'cpuSystemSeconds': usage1.ru_stime-usage0.ru_stime,
                            'peakSummedRssBytes': max((sum(m['rssBytes'] for m in s['members']) for s in samples), default=0),
                            'samples': samples, 'note': 'Summed RSS may include shared mappings; this is owned process-group accounting, not global pressure attribution.'})
(out/'challenges.json').write_text(json.dumps(meta, indent=2) + '\n')
print(json.dumps({k: meta[k] for k in ['invocationHead', 'implementationSha', 'exitCode', 'timedOut', 'durationMs']}))
print('\n'.join((out/'challenges.tap').read_text().splitlines()[-17:]))
raise SystemExit(124 if timed_out else code)
