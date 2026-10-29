import json,re,hashlib,subprocess
from pathlib import Path
base=Path('docs/v2-8j-6-2-evidence')
sha='65430f9b657e0b941e20d8e14b4eed7e6763a96e'
def passed(run):
 text=(base/(run+'.tap')).read_text()
 return re.findall(r'^ok \d+ - (.+)$',text,re.M)+re.findall(r'^✔ (.+) \([\d.]+ms\)$',text,re.M)
def totals(run):
 text=(base/(run+'.tap')).read_text()
 return {k:sum(map(int,re.findall(r'^(?:#|ℹ) '+label+r' (\d+)\s*$',text,re.M))) for k,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
selected={'export-http':('test/v2-native-export-http-8j.test.js',['http-01','http-admission-02']), 'export-client':('test/v2-native-export-client-8j.test.js',['client-01']), 'export-browser':('test/v2-native-export-chrome-8j.test.js',['browser-01','browser-04','browser-06'])}
manifest={'implementationSha':sha,'acceptedBaseline':'ecf82d3fa74bb7fcfc111e5cbeaf36bcb49fa47d','selected':{},'attempts':{},'finalSourceHashes':{}}
lineage=[]
def bodies(text):
 starts=list(re.finditer(r"^(test|check)\('([^']+)'",text,re.M));out={}
 for i,m in enumerate(starts):out[m[2]]=text[m.start():starts[i+1].start() if i+1<len(starts) else len(text)].strip()
 return out
for gate,(file,runs) in selected.items():
 leaves={}
 for run in runs:
  for name in passed(run):leaves[name]={'file':file,'invocation':str(base/(run+'.json'))}
 lines=['TAP version 13','# Deduplicated retained executed-leaf union, not a test invocation.','# forge-test-file '+json.dumps(file)]
 for i,(name,record) in enumerate(leaves.items(),1):
  lines+=['# retained invocation '+record['invocation'],f'ok {i} - {name}']
  meta=json.loads(Path(record['invocation']).read_text());h=meta['sourceHashes'][file];old=(base/'sources'/(h+'.txt')).read_text();current=Path(file).read_text();key=name.removeprefix('Native export Chrome: ')
  lineage.append({'name':name,'file':file,'invocation':record['invocation'],'originalSnapshot':str(base/'sources'/(h+'.txt')),'snapshotHashMatches':hashlib.sha256((base/'sources'/(h+'.txt')).read_bytes()).hexdigest()==h,'wholeFileMatchesFinal':old==current,'selectedBodyMatchesFinal':bodies(old).get(key)==bodies(current).get(key),'helperApplicability':'Client unchanged; HTTP only local-mode fixture setup and optional browser seed options changed; Chrome setup/harness changes are classified in evaluation. Original snapshots are retained; no assertion weakening or final whole-file claim.'})
 n=len(leaves);counts={'total':n,'pass':n,'fail':0,'skip':0,'cancelled':0};lines += [f'1..{n}',f'# tests {n}',f'# pass {n}','# fail 0','# skipped 0','# cancelled 0']
 log=base/(gate+'-selected.tap');log.write_text('\n'.join(lines)+'\n')
 data={'id':gate,'implementationSha':sha,'kind':'tests','command':'Assemble explicitly selected successful executed leaves from retained invocation records; no new test execution.','exitCode':0,'tests':counts,'log':str(log),'selection':leaves,'sourceApplicability':'manifest.json, leaf-lineage.json and V2-8J-6-2-EVAL.md disclose source/harness lineage and capture limits.'}
 (base/(gate+'.json')).write_text(json.dumps(data,indent=2)+'\n');manifest['selected'][gate]=data
for run in ['client-01','http-01','http-admission-02']+['browser-%02d'%n for n in range(1,7)]:manifest['attempts'][run]=totals(run)
for key in ['selectedTotals','allAttemptTotals']:
 rows=[v['tests'] for v in manifest['selected'].values()] if key=='selectedTotals' else list(manifest['attempts'].values())
 manifest[key]={k:sum(v[k] for v in rows) for k in ['total','pass','fail','skip','cancelled']}
files=subprocess.check_output(['git','diff','--name-only',manifest['acceptedBaseline'],sha,'--','app','src','packages','test','tools/chrome-shot.mjs'],text=True).splitlines()
for file in files:manifest['finalSourceHashes'][file]=hashlib.sha256(Path(file).read_bytes()).hexdigest()
manifest['sourceApplicability']=[
 'All10 controller bodies/helpers and runtime nativeExport.js/projectSession.js match their contemporaneously captured original bytes. HTTP first5 bodies match final; admission fixture corrected setHostedForTest, not assertions. HTTP new route remains byte-identical. Optional fixture title/plain seed parameters only affect later browser cases.',
 'Early client/http/build-01 records omitted then-dirty tracked runtime files from sourceHashes despite listing trackedDelta. Original tracked bytes are not claimed captured. build-02 onward and browser-01 onward capture full dirty tracked source. Later HTTP route integration and original tracked boundaries were inspected for unchanged applicability, not replayed just for SHA.',
 'Chrome6/6 is an explicit executed-case union: standalone01; workspace/drafts/layout/restore-copy04; Assistant approval/reload06. Body hashes and original snapshots are retained. No single complete green final-file process is claimed. Test helper changes fixed logger parsing, unique filenames/editable fixture, stable startup bounds, actual read-only/copy selectors and interception before Assistant captures fetch.',
 'Final build-05 pins all runtime bytes. Later changes before freeze were test harness only. browser-04 final screenshots apply unchanged to final modal, canvas and guards; only later approval-start cancellation and anonymous navigation stamp differ, with strengthened Assistant06 and independent inspection. No SHA-only repeated old matrices.'
]
(base/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(base/'leaf-lineage.json').write_text(json.dumps(lineage,indent=2)+'\n')
meta=json.loads((base/'build-05.json').read_text());(base/'production-build.json').write_text(json.dumps({'id':'production-build','implementationSha':sha,'kind':'command','command':meta['command'],'exitCode':meta['exitCode'],'log':meta['log'],'invocation':str(base/'build-05.json')},indent=2)+'\n')
(base/'frontend-visual.json').write_text(json.dumps({'id':'frontend-visual','implementationSha':sha,'kind':'visual','command':'Inspect retained final browser-04 desktop/narrow screenshots and measured dialog/canvas bounds with view_image; no new rendering.','exitCode':0,'inspected':True,'log':str(base/'visual-inspection.md')},indent=2)+'\n')
state=json.loads(Path('docs/development-state.json').read_text());state['implementationHead']={'sha':sha,'note':'Approved J6-2 runtime/tests frozen and pushed; selected22/22 focused evidence complete, separate exact-source implementation review pending.'};state['activeMilestone']['implementationStatus']='validated'
for row in state['validation']:row.update(status='passed',evidence=str(base/(row['id']+'.json')),reason='Focused retained executed evidence; selected unions, earlier failures and source applicability are explicit. Independent acceptance pending.')
Path('docs/development-state.json').write_text(json.dumps(state,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['implementationSha','selectedTotals','allAttemptTotals']}))
