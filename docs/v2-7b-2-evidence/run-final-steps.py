import json,pathlib,subprocess,time
out=pathlib.Path('out/v2-7b-2-validation/final-steps');out.mkdir(parents=True,exist_ok=True)
head=json.loads(pathlib.Path('docs/v2-7b-2-evidence/validation-plan.json').read_text())['implementationSha'];subprocess.run(['git','merge-base','--is-ancestor',head,'HEAD'],check=True);runs=[]
for name,args in [('production-build',['node_modules/.bin/vite','build','--config','app/web/vite.config.js']),('typecheck',['npm','run','typecheck']),('benchmark-50',['node','tools/v2-benchmark.mjs','--out','out/v2-7b-2-benchmark','--raster','none'])]:
 cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args];start=time.monotonic()
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
 runs.append({'id':name,'implementationSha':head,'command':cmd,'exitCode':r.returncode,'durationSeconds':round(time.monotonic()-start,6)});(out/'runs.json').write_text(json.dumps(runs,indent=2)+'\n');print(name,'exit',r.returncode,flush=True)
 if r.returncode:print((out/(name+'.log')).read_text()[-4000:]);raise SystemExit(r.returncode)
