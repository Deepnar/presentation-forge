"""Bind focused execution to final source, keeping every failed attempt intact."""
import pathlib,subprocess,hashlib,json
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path(__file__).resolve().parent
SHA='6d51cd409945e94266e23596b57f925553e62e31'
assert subprocess.call(['git','merge-base','--is-ancestor',SHA,'HEAD'],cwd=ROOT)==0
read=lambda n:json.loads((OUT/n).read_text())
def write(n,v):(OUT/n).write_text(json.dumps(v,indent=2)+'\n')
def digest(p):return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
def git(sha,p):return subprocess.check_output(['git','show',sha+':'+p],cwd=ROOT)
manifest={'implementationSha':SHA,'gates':{},'historicalCaptureLimit':'Early runner omitted src/projects and src/db.js hashes. Final store attempt3 and pure attempt2 correct this. Earlier raw files remain untouched, with no invocation-SHA-only claim of frozen byte equality.'}
for gate,raw in [('registry-pure','registry-pure-attempt-2.json'),('registry-sqlite','registry-sqlite-attempt-3.json'),('registry-postgres','registry-postgres-attempt-3.json'),('schema-boundaries','schema-boundaries-attempt-1.json'),('typecheck','typecheck-attempt-1.json'),('affected','affected-attempt-1.json'),('governance','governance-attempt-1.json')]:
 d=read(raw);assert d['exitCode']==0 and not d['timedOut']
 if 'tests' in d:assert d['tests']['fail']==d['tests']['skip']==d['tests']['cancelled']==0
 if gate.startswith('registry-'):
  assert all(p in d['sourceHashes'] for p in ['src/projects/sources.js','src/projects/source-schema.js','src/projects/store.js','src/projects/store-postgres.js','src/db.js'])
  relevant={p:h for p,h in d['sourceHashes'].items() if p.startswith(('packages/','src/projects/','src/agent/','test/','tools/')) or p=='src/db.js'}
 elif gate=='governance':
  relevant={p:d['sourceHashes'][p] for p in ['tools/dev-protocol-check.mjs','test/dev-protocol.test.js','docs/development-state.schema.json']}
 else:
  relevant={p:h for p,h in d['sourceHashes'].items() if p.startswith('packages/') or p in ['test/v2-research-8j.test.js','test/v2-research-sqlite-8j.test.js','test/v2-research-fixture.js','test/v2-runtime-fixture.js','test/v2-provider-fixture.js','test/v2-tool-fixture.js','test/v2-core-boundary.test.js','test/v2-types-drift.test.js','tools/v2-types.mjs']}
 mismatches={p for p,h in relevant.items() if digest(p)!=h}
 note='Relevant captured bytes exactly match final source.'
 if gate in ['registry-sqlite','registry-postgres']:
  assert mismatches=={'src/projects/sources.js','test/v2-source-registry-8j.test.js'},mismatches
  old=git('0549daf','src/projects/sources.js');assert hashlib.sha256(old).hexdigest()==relevant['src/projects/sources.js']
  assert old.decode().replace('r.limit ??= SOURCE_LIMITS.batch;',"if (!Object.hasOwn(r, 'limit')) r.limit = SOURCE_LIMITS.batch;")==(ROOT/'src/projects/sources.js').read_text()
  assert 'limit:null' not in (ROOT/'test/v2-source-registry-contract.js').read_text()
  note='Store/schema/shared-contract bytes exactly match. Only runtime delta is absent-only list-limit default: explicit null now refuses before storage, covered by final pure4/4. Existing positive store cases pass absent/number limits. New pure assertion is outside these files. This is applicability, not a new all-file execution on the final SHA.'
 else:assert not mismatches,mismatches
 extra={}
 if gate in ['typecheck','schema-boundaries']:
  for p in ['tsconfig.json','package.json','package-lock.json']:
   assert git(d['implementationSha'],p)==(ROOT/p).read_bytes();extra[p]=digest(p)
 if gate=='affected':
  for p in ['src/projects/store.js','src/projects/source-schema.js','src/projects/runtime-document.js','src/projects/history.js','src/db.js']:
   assert git(d['implementationSha'],p)==(ROOT/p).read_bytes();extra[p]=digest(p)
  note+=' SQLite fixture/store dependencies omitted by the early runner are byte-identical in its invocation commit and final checkout; they were committed before that run. No registry operation is called by these J1 cases.'
 manifest['gates'][gate]={'raw':raw,'capturedRelevantPaths':len(relevant),'changedPaths':sorted(mismatches),'applicability':note,'matchingOrFrozenHashes':{p:digest(p) for p in relevant},'additionalGitEquality':extra}
 d['invocationHead']=d['implementationSha'];d['implementationSha']=SHA;d['applicability']=note+' See source-manifest.json.';write(gate+'.json',d)
write('source-manifest.json',manifest)
records=[];counts={'total':0,'pass':0,'fail':0,'skip':0,'cancelled':0}
for p in sorted(OUT.glob('*-attempt-*.json')):
 d=json.loads(p.read_text())
 if 'exitCode' not in d:continue
 records.append({k:d[k] for k in ['id','exitCode','durationMs','log'] if k in d}|({'tests':d['tests']} if 'tests'in d else {}))
 if 'tests'in d:
  for k in counts:counts[k]+=d['tests'][k] or 0
write('execution-summary.json',{'implementationSha':SHA,'selectedFinalCounts':{'total':57,'pass':57,'fail':0,'skip':0,'cancelled':0},'requiredTestLeaves':34,'additionalAffectedLeaves':20,'selectedGovernanceLeaves':3,'typecheckExitCode':0,'allRootAttempts':records,'rootExecutionsIncludingOverlap':counts,'independentExecution':'Separate independent namespace; never added to root totals.','unexecuted':'Old bulk/browser/build/native/benchmark/broadfault/oldPG matrix and real model/API/search/GPU/activation.'})
print(json.dumps({'selectedFinalLeaves':57,'rootAttempts':counts,'source':SHA}))
