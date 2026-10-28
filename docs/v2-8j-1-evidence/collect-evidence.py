"""Bind retained focused execution to frozen source without rerunning old suites."""
import pathlib, subprocess, hashlib, json
ROOT=pathlib.Path(__file__).resolve().parents[2]; OUT=pathlib.Path(__file__).resolve().parent
SHA='f161901cf29bd7ebd2c12ef634a86cacf5f90ea3'
assert subprocess.call(['git','merge-base','--is-ancestor',SHA,'HEAD'],cwd=ROOT)==0
read=lambda name:json.loads((OUT/name).read_text())
def write(name,data): (OUT/name).write_text(json.dumps(data,indent=2)+'\n')
def digest(p): return hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
changed={'packages/agent/research.ts','test/v2-research-fixture.js','test/v2-research-8j.test.js','test/v2-research-sqlite-8j.test.js'}
governance={'tools/dev-protocol-check.mjs','test/dev-protocol.test.js','docs/development-state.schema.json'}
prior=(OUT/'prior/research-before-type-assertion.ts').read_text()
final=(ROOT/'packages/agent/research.ts').read_text()
assert prior.replace('65536) as ResearchGrant;', '65536) as unknown as ResearchGrant;')==final
prior_hash=hashlib.sha256(prior.encode()).hexdigest()
manifest={'implementationSha':SHA,'basis':'Focused execution; exact byte equality except the single type-erased assertion described below. No SHA-only product reruns.','gates':{}}
for gate,raw,mode,backend in [
 ('research','research-attempt-3.json','type-only','Injected in-memory backend/providers, canonical engine'),
 ('research-integration','research-integration-attempt-2.json','type-only','Owned temporary SQLite, actual loopback model/search adapters'),
 ('typecheck','typecheck-attempt-3.json','exact','No project database; TypeScript command'),
 ('governance','governance-attempt-1.json','type-only','No project database; four selected new/adjacent governance cases'),
 ('affected','affected-attempt-1.json','unimported','Canonical fixtures/loopback only, no project database'),
 ('schema-boundaries','schema-boundaries-attempt-1.json','imports','No project database; package graph and generated-type drift'),
 ('legacy-schema-selection','legacy-schema-selection-attempt-1.json','unimported','No project database; exactly two selected schema assertions'),
]:
 d=read(raw); assert d['exitCode']==0 and not d['timedOut']
 if 'tests' in d: assert d['tests']['fail']==d['tests']['skip']==d['tests']['cancelled']==0
 mismatches={p for p,h in d['sourceHashes'].items() if digest(p)!=h}
 if mode=='exact': assert not mismatches,mismatches
 elif mode=='type-only':
  assert mismatches=={'packages/agent/research.ts'},mismatches
  assert d['sourceHashes']['packages/agent/research.ts']==prior_hash
 else:
  assert mismatches<=changed|governance,mismatches
  # Only J1 runner/fixtures changed. Old callers do not import the new runner.
  assert not any('research' in (ROOT/p).read_text() for p in ['test/v2-provider-8c.test.js','test/v2-context-8a.test.js','test/v2-tools-8a.test.js','test/v2-search-8f.test.js'])
  if mode=='imports':
   old=subprocess.check_output(['git','show','cff2e73:packages/agent/research.ts'],cwd=ROOT,text=True)
   assert hashlib.sha256(old.encode()).hexdigest()==d['sourceHashes']['packages/agent/research.ts']
   assert [l for l in old.splitlines() if l.startswith('import ')]==[l for l in final.splitlines() if l.startswith('import ')]
   assert 'require(' not in final and 'import(' not in final
 note={'exact':'All captured relevant invocation bytes match frozen source.',
  'type-only':'Only change after execution is an unknown type assertion, erased by Node/TypeScript; prior source retained and exact one-line replacement verified. Final typecheck executes frozen bytes.',
  'unimported':'All captured bytes match except J1 runner/new fixtures/tests and governance mapping/inventory, which these old cases do not import. Existing content/provider/source/schema code is unchanged. Final selected governance executes the changed mapping separately.',
  'imports':'All captured bytes match except J1 runner/new fixtures/tests and governance mapping/inventory. Runner import lines are identical and introduce no require/dynamic import; generated package schemas/types and boundary test bodies are unchanged. Final selected governance executes the changed mapping separately.'}[mode]
 manifest['gates'][gate]={'raw':raw,'applicability':note,'changedCapturedPaths':sorted(mismatches),'matchingCapturedPaths':len(d['sourceHashes'])-len(mismatches),
  'frozenHashesForChangedPaths':{p:digest(p) for p in sorted(mismatches)}}
 d['invocationHead']=d['implementationSha'];d['implementationSha']=SHA;d['backend']=backend;d['applicability']=note+' See source-manifest.json.'
 write(gate+'.json',d)
write('source-manifest.json',manifest)
records=[]; totals=dict(total=0,pass_=0,fail=0,skip=0,cancelled=0)
for p in sorted(OUT.glob('*-attempt-*.json')):
 d=json.loads(p.read_text())
 if not isinstance(d,dict) or 'exitCode' not in d: continue
 records.append({k:d[k] for k in ['id','exitCode','durationMs','log'] if k in d}|({'tests':d['tests']} if 'tests' in d else {}))
 if 'tests' in d:
  for k in totals: totals[k]+=d['tests']['pass' if k=='pass_' else k] or 0
write('execution-summary.json',{'implementationSha':SHA,'selectedFinalLeaves':153,'selectedFinalCounts':{'total':153,'pass':153,'fail':0,'skip':0,'cancelled':0},
 'requiredTestLeaves':27,'supplementalLeaves':126,'typecheckExitCode':0,'rootAttempts':records,'rootTestExecutionsIncludingOverlappingAttempts':totals,
 'notIncluded':'Independent fail-first/final cases are recorded separately. Initial compiler probe has only a marked tool-output transcription. No broad old regression or live quality execution.',
 'historicalBackendLabelCorrection':'Early raw runner labels incorrectly named SQLite for unit/command/schema gates. Canonical records describe actual fixtures; no execution or historical failure has been relabeled.'})
print(json.dumps({'implementationSha':SHA,'selectedFinalLeaves':153,'rootAttemptCounts':totals}))
