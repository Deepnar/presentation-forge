import pathlib,subprocess,os,time,json,datetime,sys
root=pathlib.Path('docs/v2-8a-evidence/independent');runs=[]
env={**os.environ,'LC_ALL':'C.UTF-8','TEST_PG_URL':'postgres://postgres:probe@127.0.0.1:5544/postgres'}
commands=[
 ('focused',['node','--test','--test-concurrency=1','test/v2-tools-8a.test.js','test/v2-context-8a.test.js']),
 ('governance-boundary',['node','--test','--test-concurrency=1','test/dev-protocol.test.js','test/v2-core-boundary.test.js','test/v2-types-drift.test.js','test/v2-generated-usage.test.ts']),
 ('postgres-contracts',['node','--test','--test-concurrency=1','test/v2-projects-6c-postgres.test.js','test/v2-import-postgres-7b.test.js']),
 ('postgres-faults',['node','--test','--test-concurrency=1','test/v2-projects-6c-concurrency.test.js','test/v2-projects-6c-faults.test.js']),
 ('b2-chrome',['node','--test','test/v2-handoff-chrome-7b.test.js']),
 ('trusted-target',['node','--test','docs/v2-8a-evidence/diagnostics/source-retry-nearest.mjs']),
 ('production-build',['node_modules/.bin/vite','build','--config','app/web/vite.config.js']),
 ('typecheck',['npm','run','typecheck']),
 ('protocol',['npm','run','dev:protocol']),
 ('benchmark-50',['node','tools/v2-benchmark.mjs','--out','out/v2-8a-independent-benchmark','--raster','none']),
 ('headless-native',['node','--test','docs/v2-8a-evidence/headless-check.mjs'])]
for name,args in commands:
 cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','15m',*args];start=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat();print(name,'START',flush=True)
 with (root/(name+'.log')).open('w') as f:r=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT)
 log=(root/(name+'.log')).read_text();counts={}
 for line in log.splitlines():
  for key in ['tests','pass','fail','cancelled','skipped','todo']:
   if line.startswith('# '+key+' '):
    try:counts[key]=int(line.split()[-1])
    except ValueError:pass
 runs.append({'name':name,'implementationSha':'d4f446c7b2fcae851c37d1a46288cf91317c38b4','command':cmd,'exitCode':r.returncode,'atUtc':at,'seconds':round(time.monotonic()-start,4),'counts':counts});(root/'runs.json').write_text(json.dumps(runs,indent=2)+'\n');print(name,'EXIT',r.returncode,counts,flush=True)
 if r.returncode:print(log[-4000:],flush=True);sys.exit(r.returncode)
print('Independent ordered commands complete.',flush=True)
