"""Bind retained serial executions to frozen source without rerunning product checks."""
import pathlib,json,hashlib,subprocess,re,sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=pathlib.Path(__file__).resolve().parent
FINAL=sys.argv[1]
assert re.fullmatch('[0-9a-f]{40}',FINAL)
BASE='6d51cd409945e94266e23596b57f925553e62e31'
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def digest(data):return hashlib.sha256(data).hexdigest()
def read(name):return json.loads((OUT/name).read_text())
def write(name,value):(OUT/name).write_text(json.dumps(value,indent=2)+'\n')
assert not git('diff',FINAL,'--','packages','src','app','test','tools')
plan=read('validation-plan.json')
attempts={'citation-pure':1,'citation-sqlite':1,'citation-postgres':2,'source-registry-regression':1,'citation-boundaries':1,'typecheck':1,'governance':1}
runtime=['src/projects/'+p for p in ['citation-references.js','snippet-locator.js','source-read.js','sources.js','store.js','store-postgres.js']]
boundaries=['packages/model/source-identity.ts','packages/model/source.schema.json','packages/model/scene.schema.json','packages/model/intent.schema.json','packages/projects/project-document.schema.json','packages/projects/document.js','packages/tools/web-source.ts','packages/tools/result.schema.json','packages/agent/turns.ts','src/projects/history.js','src/projects/runtime-document.js','src/projects/source-schema.js']
for p in boundaries:assert git('show',BASE+':'+p)==git('show',FINAL+':'+p)
manifest={'implementationSha':FINAL,'acceptedBaseline':BASE,'runtimeHashes':{p:digest(git('show',FINAL+':'+p)) for p in runtime},'unchangedAcceptedBoundaries':boundaries,'executions':{}}
totals={'total':0,'pass':0,'fail':0,'skip':0,'cancelled':0}
for gate,attempt in attempts.items():
 raw=read(f'{gate}-attempt-{attempt}.json');assert raw['exitCode']==0 and not raw['timedOut']
 invocation=raw['implementationSha'];files=plan['gates'].get(gate,['test/dev-protocol.test.js'])
 for p in runtime+files:
  assert raw['sourceHashes'][p]==digest((ROOT/p).read_bytes())==digest(git('show',FINAL+':'+p)),(gate,p)
 if raw['kind']=='tests':
  c=raw['tests'];assert c['total']==c['pass'] and not any(c[k] for k in ['fail','skip','cancelled'])
  log=(ROOT/raw['log']).read_text();observed={json.loads(s) for s in re.findall(r'^# forge-test-file (.+)$',log,re.M)}
  assert set(files)<=observed,(gate,observed)
  for k in totals:totals[k]+=c[k]
 # Some unchanged package inputs were outside the runner's captured path prefixes.
 # Their committed invocation bytes and current bytes are compared explicitly.
 uncaptured=[]
 if gate in ['typecheck','citation-boundaries']:
  for p in git('ls-tree','-r','--name-only',FINAL,'packages').decode().splitlines():
   if not p.endswith(('.ts','.js','.mjs','.json')):continue
   final=git('show',FINAL+':'+p)
   assert final==git('show',invocation+':'+p)==(ROOT/p).read_bytes(),(gate,p)
   if p not in raw['sourceHashes']:uncaptured.append(p)
 record=dict(raw);record['invocationHead']=invocation;record['implementationSha']=FINAL
 record['applicability']='Captured new runtime/test bytes exactly match frozen source; unchanged committed package inputs are additionally compared where the original hash capture did not include them. Original attempt metadata/logs remain unchanged.'
 record['committedUncapturedPackagePathsVerified']=uncaptured
 write(gate+'.json',record)
 manifest['executions'][gate]={'invocationHead':invocation,'raw':f'docs/v2-8j-3-evidence/{gate}-attempt-{attempt}.json','runtimeAndTestHashesMatch':True,'uncapturedCommittedPackagePathsCompared':len(uncaptured)}
write('source-manifest.json',manifest)
write('execution-summary.json',{'implementationSha':FINAL,'acceptedBaseline':BASE,'requiredTests':50,'selectedIncludingGovernance':totals,'allRootTestAttempts':totals,'typecheckExitCode':0,'preflightAttemptsNotTestExecutions':['docs/v2-8j-3-evidence/initial-observations.json','docs/v2-8j-3-evidence/citation-postgres-attempt-1.json'],'exclusions':plan['excluded'],'countNote':'No product test failure, skip, cancellation or repeated successful product execution. Initial metadata/admission/launcher failures are retained separately, not counted as passed tests.'})
independent=OUT/'independent/challenge-final.json'
if independent.exists():
 review=json.loads(independent.read_text());assert review['exitCode']==0 and not review['timedOut']
 assert review['tests']=={'total':2,'pass':2,'fail':0,'skip':0,'cancelled':0}
 for p in runtime:assert review['sourceHashes'][p]==manifest['runtimeHashes'][p]
 summary=read('execution-summary.json')
 summary['independentChallenges']={'tests':review['tests'],'invocationHead':review['implementationSha'],'durationMs':review['durationMs'],'evidence':'docs/v2-8j-3-evidence/independent/challenge-final.json','applicability':'Actual invocation is a documentation-only descendant; six captured runtime hashes match frozen source. These two checks are separate from root52, not repeats of the root suite.'}
 write('execution-summary.json',summary)
print(json.dumps({'implementationSha':FINAL,'selected':totals,'requiredTests':50,'typecheckExitCode':0}))
