import pathlib,subprocess,json,hashlib,time,datetime,signal,re,os
root=pathlib.Path(__file__).resolve().parents[3];out=pathlib.Path(__file__).resolve().parent
paths=['src/projects/citation-references.js','src/projects/snippet-locator.js','src/projects/source-read.js','src/projects/sources.js','src/projects/store.js','src/projects/store-postgres.js','test/v2-source-registry-fixture.js','test/v2-tool-fixture.js','docs/v2-8j-3-evidence/independent/challenges.test.mjs']
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}
command=['nice','-n','10','ionice','-c','3','node','--test','--test-concurrency=1','--test-reporter=tap','docs/v2-8j-3-evidence/independent/challenges.test.mjs']
env=dict(os.environ)
for key in ['FORGE_PROJECTS_DATABASE_URL','FORGE_J3_TEST_PG_URL','FORGE_DB_PATH','TEST_PG_URL']:env.pop(key,None)
start=time.monotonic();timed=False
with (out/'challenge-final.tap').open('w') as stream:
 p=subprocess.Popen(command,cwd=root,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True,env=env)
 try:p.wait(timeout=40)
 except subprocess.TimeoutExpired:timed=True;os.killpg(p.pid,signal.SIGKILL);p.wait()
log=(out/'challenge-final.tap').read_text();counts={}
for key,pattern in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]:
 m=re.search(r'^# '+pattern+r' (\d+)\s*$',log,re.M);counts[key]=int(m[1]) if m else None
result={'implementationSha':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':command,'backend':'Verified owned isolated PostgreSQL; unique review database','durationMs':round((time.monotonic()-start)*1000),'exitCode':p.returncode,'timedOut':timed,'tests':counts,'sourceHashes':hashes,'log':'docs/v2-8j-3-evidence/independent/challenge-final.tap'}
(out/'challenge-final.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['implementationSha','durationMs','exitCode','timedOut','tests']}));print(log)
raise SystemExit(p.returncode)
