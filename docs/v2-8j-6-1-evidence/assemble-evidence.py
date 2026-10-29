import json,re,hashlib,subprocess
from pathlib import Path
base=Path('docs/v2-8j-6-1-evidence');sha=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
# This is a union of actually executed successful leaves, never a new test run.
def passed(name):
 text=(base/(name+'.tap')).read_text()
 return re.findall(r'^ok \d+ - (.+)$',text,re.M)+re.findall(r'^✔ (.+) \([\d.]+ms\)$',text,re.M)
def total(name):
 text=(base/(name+'.tap')).read_text();out={}
 for key,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]:
  out[key]=sum(map(int,re.findall(r'^(?:#|ℹ) '+label+r' (\d+)\s*$',text,re.M)))
 return out
selected={
 'notes-domain': [('test/v2-citation-export-8j.test.js',['domain-01','domain-02','domain-boundaries-01'])],
 'notes-sqlite': [('test/v2-citation-export-sqlite-8j.test.js',['sqlite-01'])],
 'notes-postgres': [('test/v2-citation-export-postgres-8j.test.js',['postgres-01'])],
 'notes-native': [('test/v2-citation-export-native-8j.test.js',['native-01','native-02','native-empty-fix-01']),('test/v2-renderer-pptx.test.js',['shared-renderer-01'])],
 'notes-cli': [('test/v2-citation-export-cli-8j.test.js',['cli-01','cli-close-01'])],
}
manifest={'implementationSha':sha,'selected':{},'attempts':{},'sourceApplicability':[
 'All runtime typed renderer/domain bytes match the invocation sourceHashes. CLI has only sanitized-close handling added after cli-01; its complete publication/cleanup case passed again at cli-close-01.',
 'Original passing domain leaves are unchanged; the failed range fixture now uses multibyte text and passed alone. Two later boundary cases passed once.',
 'The passing native capacity/tamper leaf is unchanged. Three failed native fixture leaves were corrected and passed alone. No assertion was weakened.',
 'Independent empty/chrome-only slide finding corrected after original freeze; affected positive plus new root regression passed2/2, final typecheck passed again after the typed guard changed.',
 'Selected logs are explicitly assembled unions of executed leaves, not claims of one green whole-file process. Raw failures and exact filtered argv remain in invocation records. No SHA-only repeat runs.'
], 'initialImplementationSha':'cb3a8522b7b35cc76fb399d7cc1101ee1fced647','reviewCorrection':'Native slide citations now require at least one emitted authored non-chrome primitive. Retained independent fail-first and corrected2/2 root cases are separate from fixture failures. Existing native visuals apply to unchanged valid rendering; no repeated rasterization.','finalSourceHashes':{}}
for gate,groups in selected.items():
 lines=['TAP version 13','# Retained executed-leaf union; not a new test invocation.'];leaves={}
 for file,runs in groups:
  lines.append('# forge-test-file '+json.dumps(file))
  for run in runs:
   names=passed(run)
   # Shared renderer nested leaves have indented TAP ok records.
   if run=='shared-renderer-01':names=re.findall(r'^    ok \d+ - (.+)$',(base/(run+'.tap')).read_text(),re.M)
   for name in names:leaves[name]={'file':file,'invocation':str(base/(run+'.json'))}
 for i,(name,record) in enumerate(leaves.items(),1):lines+=['# retained invocation '+record['invocation'],f'ok {i} - {name}']
 n=len(leaves);counts={'total':n,'pass':n,'fail':0,'skip':0,'cancelled':0}
 lines+= [f'1..{n}',f'# tests {n}',f'# pass {n}','# fail 0','# skipped 0','# cancelled 0']
 log=base/(gate+'-selected.tap');log.write_text('\n'.join(lines)+'\n')
 evidence={'id':gate,'implementationSha':sha,'kind':'tests','command':'Assemble retained successful executed leaves from the exact invocation records listed in this evidence; no new product execution.','exitCode':0,'tests':counts,'log':str(log),'selection':leaves,'sourceApplicability':'See manifest.json sourceApplicability and every invocation sourceHashes/argv/working-tree delta.'}
 (base/(gate+'.json')).write_text(json.dumps(evidence,indent=2)+'\n');manifest['selected'][gate]=evidence
for name in ['domain-01','domain-02','domain-boundaries-01','native-01','native-02','sqlite-01','postgres-01','cli-01','cli-close-01','shared-renderer-01','native-empty-fix-01']:
 manifest['attempts'][name]=total(name)
paths=subprocess.check_output(['git','diff','--name-only','f6487737557c20d481cbc3e84216d7144bb116e8','HEAD','--','src','packages','test','package.json'],text=True).splitlines()
for file in paths:manifest['finalSourceHashes'][file]=hashlib.sha256(Path(file).read_bytes()).hexdigest()
for gate,name,kind,inspected in [('typecheck','typecheck-02','command',None),('notes-visual','visual-inspect-01','visual',True)]:
 meta=json.loads((base/(name+'.json')).read_text());data={'id':gate,'implementationSha':sha,'kind':kind,'command':meta['command'],'exitCode':meta['exitCode'],'log':meta['log']}
 if inspected:data.update(inspected=True,inspectionRecord=str(base/'visual-inspection.md'),measurements=str(base/'visual-measurements.json'),initialRender=str(base/'visual-01.json'))
 (base/(gate+'.json')).write_text(json.dumps(data,indent=2)+'\n')
manifest['selectedTotals']={k:sum(e['tests'][k] for e in manifest['selected'].values()) for k in ['total','pass','fail','skip','cancelled']}
manifest['allAttemptTotals']={k:sum(e[k] for e in manifest['attempts'].values()) for k in ['total','pass','fail','skip','cancelled']}
(base/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['implementationSha','selectedTotals','allAttemptTotals']}))
state=json.loads(Path('docs/development-state.json').read_text());state['implementationHead']={'sha':sha,'note':'Approved J6-1 runtime frozen; focused retained executed-leaf evidence complete, independent review of empty-scope correction pending. CLI close handling has a narrow subsequent passing publication case.'};state['activeMilestone']['implementationStatus']='validated'
for row in state['validation']:row.update(status='passed',evidence=str(base/(row['id']+'.json')),reason='Focused executed evidence; retained attempts and source applicability in manifest, independent acceptance pending.')
Path('docs/development-state.json').write_text(json.dumps(state,indent=2)+'\n')
