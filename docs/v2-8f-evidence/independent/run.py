import datetime, hashlib, json, os, pathlib, re, signal, subprocess, sys

ROOT = pathlib.Path('docs/v2-8f-evidence/independent')
OUT = pathlib.Path('out/v2-8f-independent-2026-10-21')
os.environ['FORGE_VALIDATION_OUT'] = str(OUT)
sys.path.insert(0, 'docs/v2-8f-evidence')
from quiet_window import Window

SHA = '0cab854bce04b862060829812a9ab6ff0b765fd9'
env = {**os.environ, 'LC_ALL':'C.UTF-8', 'TEST_PG_URL':'postgres://postgres:probe@127.0.0.1:5544/postgres',
       'FORGE_RUNTIME_SOURCE':SHA, 'FORGE_RUNTIME_METRICS_PATH':str((ROOT/'recovery-metrics.jsonl').resolve())}
records = json.loads((ROOT/'execution.json').read_text()) if '--resume' in sys.argv else []
def run(name, args, files=None, changes=None, expected=0):
    if any(r['name']==name for r in records):
        print(name,'RETAINED ACKNOWLEDGED',flush=True);return
    Window().wait(30)
    subprocess.run(['git','diff','--quiet',SHA,'--','packages','src','app','test','tools','schema','config','themes','package.json','package-lock.json'], check=True)
    cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args]
    start=datetime.datetime.now(datetime.timezone.utc)
    log=ROOT/(name+'.log')
    print(name,'START',flush=True)
    with log.open('w') as stream:
        p=subprocess.Popen(cmd,env={**env,**(changes or {})},stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
        monitor=Window(); critical=0
        try:
            while True:
                try: p.wait(timeout=15); break
                except subprocess.TimeoutExpired:
                    row=monitor.observe('running:'+name);critical=critical+1 if row['critical'] else 0
                    print(name,'RUNNING',flush=True)
                    if critical>=3:raise RuntimeError('Sustained critical contention')
        except BaseException:
            os.killpg(p.pid,signal.SIGTERM)
            try:p.wait(timeout=10)
            except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
            raise
    text=log.read_text()
    row={'name':name,'implementationSha':SHA,'atUtc':start.isoformat(),'command':cmd,'files':files or [],'exitCode':p.returncode,
         'durationSeconds':(datetime.datetime.now(datetime.timezone.utc)-start).total_seconds(),'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest()}
    if files is not None:
        row['tests']={key:int(re.findall(r'^# '+label+r' (\d+)\s*$',text,re.M)[-1]) for key,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
    records.append(row);(ROOT/'execution.json').write_text(json.dumps(records,indent=2)+'\n')
    print(name,'EXIT',p.returncode,row.get('tests',''),flush=True)
    assert p.returncode==expected,(name,p.returncode,text[-5000:])
    if files is not None and expected==0: assert all(row['tests'][k]==0 for k in ['fail','skip','cancelled'])

def tests(name,files,**kwargs):
    run(name,['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',*files],files,**kwargs)

if __name__ == '__main__':
    assert '--resume' in sys.argv or not (ROOT/'execution.json').exists()
    tests('search-boundaries',['test/v2-search-8f.test.js','test/v2-search-http-8f.test.js','test/v2-core-boundary.test.js','test/dev-protocol.test.js','test/v2-types-drift.test.js'])
    tests('accepted-domain',['test/v2-sourceref.test.js','test/research.test.js','test/research-pages.test.js','test/research-relevance.test.js','test/research-diversity.test.js','test/v2-provider-8c.test.js','test/v2-provider-durable-8c.test.js','test/v2-provider-postgres-8c.test.js','test/v2-provider-run-8d.test.js','test/v2-provider-run-sqlite-8d.test.js','test/v2-provider-run-postgres-8d.test.js','test/v2-conversation-8e.test.js','test/v2-conversation-sqlite-8e.test.js','test/v2-conversation-postgres-8e.test.js','test/v2-tools-8a.test.js','test/v2-preservation.test.js','test/v2-runtime-8b.test.js','test/v2-runtime-process-8b.test.js','test/v2-runtime-postgres-8b.test.js','test/v2-projects-6c-sqlite.test.js','test/v2-projects-6c-postgres.test.js','test/v2-projects-6c-concurrency.test.js','test/v2-projects-6c-faults.test.js'])
    tests('adversarial',[str(ROOT/'adversarial.mjs')])
    tests('full-7a',['test/v2-edit-chrome-7a.test.js'])
    run('production-build',['node_modules/.bin/vite','build','--config','app/web/vite.config.js'])
    run('typecheck',['npm','run','typecheck'])
    run('benchmark-50',['node','tools/v2-benchmark.mjs','--out',str(OUT/'benchmark'),'--raster','none'])
    tests('headless-native',[str(ROOT/'headless-check.mjs')])
    run('browser-native',['node',str(ROOT/'browser-native.mjs')])
    run('search-timing',['node',str(ROOT/'search-performance.mjs')])
    tests('locale',['test/byok-budget.test.js'],changes={'LC_ALL':'en_IN.UTF-8'},expected=1)
    (ROOT/'runner-completion.json').write_text(json.dumps({'exitCode':0,'jobs':len(records),'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
    print('Independent execution complete; inspection/preservation/restoration remain.',flush=True)
