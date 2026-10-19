import pathlib,subprocess,os,time,json,datetime,re,sys
root=pathlib.Path('docs/v2-8b-evidence/independent-final');env={**os.environ,'LC_ALL':'C.UTF-8','TEST_PG_URL':'postgres://postgres:probe@127.0.0.1:5544/postgres'};runs=[]
commands=[('shell-chrome',['node','--test','test/v2-edit-chrome-7a.test.js']),('controlled',['node','--test','--test-name-pattern=remounts cleanly',str(root/'remount-controlled.mjs')]),('governance-boundary',['node','--test','--test-concurrency=1','test/dev-protocol.test.js','test/v2-core-boundary.test.js','test/v2-types-drift.test.js','test/v2-generated-usage.test.ts']),('production-build',['node_modules/.bin/vite','build','--config','app/web/vite.config.js']),('typecheck',['npm','run','typecheck']),('protocol',['npm','run','dev:protocol']),('benchmark-50',['node','tools/v2-benchmark.mjs','--out','out/v2-8b-independent-final-benchmark','--raster','none']),('persisted-native',['node','--test',str(root/'headless-check.mjs')])]
for name,args in commands:
 cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args];start=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat();print(name,'START',flush=True)
 with (root/(name+'.log')).open('w') as f:r=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT)
 text=(root/(name+'.log')).read_text();counts={}
 for key in ['tests','pass','fail','cancelled','skipped','todo']:
  m=re.search(r'^[#ℹ] '+key+r' (\d+)$',text,re.M)
  if m:counts[key]=int(m[1])
 runs.append({'name':name,'implementationSha':'1fb39ff75cd473ecaf2884232d5d7465d50a9af2','command':cmd,'exitCode':r.returncode,'atUtc':at,'seconds':round(time.monotonic()-start,4),'counts':counts});(root/'runs.json').write_text(json.dumps(runs,indent=2)+'\n');print(name,'EXIT',r.returncode,counts,flush=True)
 if r.returncode:print(text[-5000:],flush=True);sys.exit(r.returncode)
print('Final independent ordered commands complete.',flush=True)
