import datetime, hashlib, json, os, pathlib, re, subprocess, sys, time
sys.dont_write_bytecode = True
ROOT = pathlib.Path('docs/v2-pptx-id-evidence/independent')
OUT = pathlib.Path('out/v2-pptx-id-review')
OUT.mkdir(exist_ok=False)
os.environ['FORGE_VALIDATION_OUT'] = str(OUT)
sys.path.insert(0, 'docs/v2-pptx-id-evidence')
from quiet_window import Window
SHA = '45c2c4c84581f41d1b2ef4ca61d15c067b8562a9'
subprocess.run(['git','diff','--quiet',SHA,'--','packages','src','app','test','tools'], check=True)
files = ['test/dev-protocol.test.js','test/v2-native-ids.test.js','test/v2-renderer-pptx.test.js','test/v2-scene-pptx.test.js','test/v2-export-preflight-5a.test.js','test/v2-projects-6a.test.js','test/v2-projects-6b.test.js','test/v2-tools-8a.test.js','test/v2-layouts-5k.test.js','test/v2-chrome-scene-3e3.test.js','test/v2-plate-3f5.test.js','test/v2-scene-composition.test.js',str(ROOT/'edge-check.mjs')]
records = []
def run(name, args, tests=False):
    Window().wait()
    cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','5m',*args]
    start=time.monotonic(); log=ROOT/(name+'.log')
    with log.open('x') as stream:
        process=subprocess.Popen(cmd,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
        monitor=Window()
        while True:
            try: process.wait(timeout=15); break
            except subprocess.TimeoutExpired:
                if monitor.observe('running:'+name)['critical']:
                    os.killpg(process.pid,15);process.wait(timeout=10);raise RuntimeError('owned check stopped for shared-machine contention')
    row={'name':name,'command':subprocess.list2cmdline(cmd),'exitCode':process.returncode,'seconds':time.monotonic()-start,'log':str(log),'sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
    if tests:
        text=log.read_text();row['tests']={key:int(re.findall(r'^# '+label+r' (\d+)\s*$',text,re.M)[-1]) for key,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
        row['files']=files
    records.append(row)
    (ROOT/'execution.json').write_text(json.dumps({'implementationSha':SHA,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backend':'in-memory renderer; temporary isolated SQLite consumers; PostgreSQL not rerun','records':records},indent=2)+'\n')
    print(json.dumps(row),flush=True)
    assert process.returncode==0, name
run('tests',['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',*files],True)
run('native',['node',str(ROOT/'export.mjs')])
run('archive',['python',str(ROOT/'audit.py')])
