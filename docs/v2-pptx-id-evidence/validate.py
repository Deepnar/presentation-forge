import datetime,json,os,pathlib,re,subprocess,time
from quiet_window import Window
root=pathlib.Path('docs/v2-pptx-id-evidence');out=pathlib.Path('out/v2-pptx-id-validation');plan=json.loads((root/'validation-plan.json').read_text());sha=plan['implementationSha']
assert sha and len(sha)==40
subprocess.run(['git','diff','--quiet',sha,'--','packages','src','app','test','tools'],check=True)
(root/'logs').mkdir(exist_ok=True)
def run(name,args,files=None):
 Window().wait()
 cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','5m',*args]
 log=root/'logs'/f'{name}.log';start=time.monotonic(); print(name,'START',flush=True)
 with log.open('x') as f:
  process=subprocess.Popen(cmd,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  monitor=Window()
  while True:
   try:process.wait(timeout=15);break
   except subprocess.TimeoutExpired:
    row=monitor.observe('running:'+name)
    if row['critical']:
     os.killpg(process.pid,15);process.wait(timeout=10);raise RuntimeError('Owned validation stopped for contention')
 record={'id':name,'implementationSha':sha,'command':subprocess.list2cmdline(cmd),'log':str(log),'exitCode':process.returncode,'durationSeconds':time.monotonic()-start,'kind':'tests' if files else 'benchmark' if name=='benchmark-50' else 'command'}
 if files:
  text=log.read_text();record['tests']={k:int(re.findall(r'^# '+label+r' (\d+)\s*$',text,re.M)[-1]) for k,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
 if name=='benchmark-50':
  cells=json.loads(pathlib.Path('out/v2-pptx-id-benchmark/results.json').read_text());record['cells']=len(cells['cells']);assert record['cells']==50
 (root/f'{name}.json').write_text(json.dumps(record,indent=2)+'\n');print(name,'END',record,flush=True)
 assert process.returncode==0,(name,log.read_text()[-3000:])
 if files:assert not any(record['tests'][key] for key in ['fail','skip','cancelled'])
 return record
run('native-pptx',['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',*plan['focused']],plan['focused'])
run('typecheck',['npm','run','typecheck'])
run('benchmark-50',['node','tools/v2-benchmark.mjs','--out','out/v2-pptx-id-benchmark','--raster','none'])
run('native-raster',['node',str(root/'export-check.mjs')])
run('native-archive',['python',str(root/'archive-check.py')])
print('Required executions complete; visual inspection and independent review pending.',flush=True)
