import json,hashlib,re,collections
from pathlib import Path
from datetime import datetime,timezone
p=Path('docs/v2-8i-2-evidence'); out=p/'independent'; source='58662ecc074f7cc29bf29a0dd410d581ffca0eef'
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def footer(log):
 raw=log.read_text();counts={}
 for k,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]:
  values=re.findall(r'^# '+label+r' (\d+)\s*$',raw,re.M);assert values,(log,label);counts[k]=int(values[-1])
 return counts
co=json.loads((p/'logs/coordinator.json').read_text());full=json.loads((p/'full-matrix.json').read_text());records=[];covered=[];sumcounts=collections.Counter()
for r in co:
 if r['name']=='turn-worker-gate':log=p/'logs/turn-worker.tap'
 elif r['name']=='bulk':log=p/'logs/non-browser-bulk.tap'
 elif r['files']:log=p/'logs/files'/(r['name']+'.tap')
 else:log=p/'logs'/(r['name']+'.log')
 raw=Path(r['log']).read_bytes(); saved=log.read_bytes()
 # Group assembly appends one newline while retaining every original raw byte.
 assert saved in (raw,raw+b'\n'),r['name']
 assert r['implementationSha']==source
 counts=footer(log) if 'tests' in r else None
 if counts is not None:assert counts==r['tests'],(r['name'],counts,r['tests'])
 if r['name'] in full['fullRuns']:
  assert r['exitCode']==0 and counts and counts['fail']==counts['skip']==counts['cancelled']==0
  sumcounts.update(counts);covered+=r['files']
  markers=re.findall(r'^# forge-test-file (".*")\s*$',log.read_text(),re.M)
  assert set(map(json.loads,markers))==set(r['files']),r['name']
 records.append({'job':r['name'],'exitCode':r['exitCode'],'log':str(log),'sha256':digest(log),'counts':counts,'originalBytesPreserved':True,'groupAssemblyAddedNewline':saved!=raw})
assert dict(sumcounts)==full['tests']
assert len(covered)==len(set(covered))==234
allfiles=sorted(str(q) for q in Path('test').glob('*.test.*'));assert sorted(covered)==allfiles
for r in co:
 if r['name']!='byok-locale':assert r['exitCode']==0,r['name']
locale=next(r for r in co if r['name']=='byok-locale');assert locale['tests']==full['standingByokLocale']
headless=footer(p/'logs/headless.log');assert headless=={'total':4,'pass':4,'fail':0,'skip':0,'cancelled':0}
fields=['turn-worker','non-browser-bulk','serial-browser','postgres-contract','cross-process-faults','production-build','typecheck','benchmark-50','frontend-visual'];gates=[]
for name in fields:
 file=p/(name+'.json');r=json.loads(file.read_text());assert r['implementationSha']==source and r['exitCode']==0;gates.append({'file':str(file),'sha256':digest(file),'exitCode':r['exitCode']})
result={'implementationSha':source,'reviewedEvidenceCommit':'b0b3beda928814fdd856c3f81dc1531a45f6d91a','atUtc':datetime.now(timezone.utc).isoformat(),'orderedJobs':len(co),'primaryDisjointJobs':len(full['fullRuns']),'primaryUniqueFiles':len(covered),'primaryRawFooters':dict(sumcounts),'all234FilesCoveredOnce':True,'focusedRepeat':full['repeatedFocused'],'nativeDistinctInspectedNotReexecuted':headless,'primaryAndNativeDistinct':3019,'standingLocale':locale['tests'],'allOriginalRawLogBytesPreserved':True,'gates':gates,'rawLogs':records}
(out/'packet-reconciliation.json').write_text(json.dumps(result,indent=2)+'\n')
print('Reconciled',len(co),'ordered jobs,234disjointfiles,3015rawleafpasses,79focusedrepeats,ninegates,4headlesscases andstandinglocale9/1.')
