#!/usr/bin/env python3
"""Serial offline checks with retained process-group watchdog and exact working bytes."""
import subprocess, pathlib, json, hashlib, time, datetime, os, signal, re, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/v2-8j-3-evidence'
GATES={'citation-pure': ['test/v2-citation-references-8j.test.js'], 'citation-sqlite': ['test/v2-citation-references-sqlite-8j.test.js'], 'citation-postgres': ['test/v2-citation-references-postgres-8j.test.js'], 'source-registry-regression': ['test/v2-source-registry-8j.test.js', 'test/v2-source-registry-sqlite-8j.test.js', 'test/v2-source-registry-postgres-8j.test.js'], 'citation-boundaries': ['test/v2-core-boundary.test.js'], 'typecheck': [], 'governance': ['test/dev-protocol.test.js']}

overall=0
for gate in sys.argv[1:]:
 files=GATES[gate]
 command=['nice','-n','10','ionice','-c','3']+(['npm','run','typecheck'] if gate=='typecheck' else ['node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',*(['--test-name-pattern=citation reference checks keep|known pending validation cannot disappear'] if gate=='governance' else []),*files])

 attempt=1
 while (OUT/f'{gate}-attempt-{attempt}.json').exists(): attempt+=1
 stem=f'{gate}-attempt-{attempt}'; raw=OUT/(stem+'.tap' if files else stem+'.log')
 tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
 additions=subprocess.check_output(['git','ls-files','--others','--exclude-standard','-z','packages/agent','packages/tools','packages/model','src/agent','src/projects','src/db.js','app/server','app/web/src','app/web/vite.config.js','app/web/scene-validator-plugin.js','test','tools'],cwd=ROOT).decode().split('\0')
 paths=sorted({p for p in tracked+additions if p and (p.startswith(('packages/agent/','packages/tools/','packages/model/','src/agent/','src/projects/','app/server/','app/web/','test/','tools/')) or p in ['docs/development-state.schema.json','src/db.js','package.json','package-lock.json','tsconfig.json'])})
 hashes={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths if (ROOT/p).is_file()}
 start=time.monotonic(); at=datetime.datetime.now(datetime.timezone.utc).isoformat(); timed=False
 with raw.open('w') as stream:
  env=dict(os.environ)
  for key in ['TEST_PG_URL','FORGE_PROJECTS_DATABASE_URL','FORGE_DB_PATH','FORGE_J2_TEST_PG_URL','FORGE_J3_TEST_PG_URL']:env.pop(key,None)
  if gate in ['citation-postgres','source-registry-regression']:
   private=json.loads(pathlib.Path(os.environ['FORGE_J3_PG_PRIVATE']).read_text())
   env['FORGE_J2_TEST_PG_URL']=private['url'];env['FORGE_J3_TEST_PG_URL']=private['url']
  process=subprocess.Popen(command,cwd=ROOT,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True,env=env)
  try: process.wait(timeout=55)
  except subprocess.TimeoutExpired: timed=True;os.killpg(process.pid,signal.SIGKILL);process.wait()
 log=raw.read_text(); counts={}
 for name,key in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]:
  m=list(re.finditer(r'^# '+key+r' (\d+)\s*$',log,re.M));counts[name]=int(m[-1][1]) if m else None
 result={'id':gate,'implementationSha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
  'testedDelta':'Working tree source hashes retained at invocation; final freeze binds identical bytes.','kind':'tests' if files else 'command',
  'command':' '.join(command),'atUtc':at,'durationMs':round((time.monotonic()-start)*1000),'exitCode':process.returncode,'timedOut':timed,
  'log':str(raw.relative_to(ROOT)),'backend':('Owned isolated PostgreSQL temporary database' if gate in ['citation-postgres','source-registry-regression'] else 'Owned temporary SQLite' if gate=='citation-sqlite' else 'No project database; pure/schema/command checks'),'sourceHashes':hashes}
 if files: result['tests']=counts
 (OUT/(stem+'.json')).write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({k:result[k] for k in ['id','exitCode','durationMs']}|({'tests':counts} if files else {})),flush=True)
 if process.returncode!=0: overall=1;print(log[-6500:],flush=True)

sys.exit(overall)
