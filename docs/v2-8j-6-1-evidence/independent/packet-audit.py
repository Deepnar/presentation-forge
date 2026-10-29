import hashlib, json, re, subprocess
from pathlib import Path

base=Path('docs/v2-8j-6-1-evidence');own=base/'independent';frozen='ecf82d3fa74bb7fcfc111e5cbeaf36bcb49fa47d'
errors=[];checks=[]
def check(value,label):(checks if value else errors).append(label)
def load(path):return json.loads(Path(path).read_text())
def sha(data):return hashlib.sha256(data).hexdigest()
def counts(path):
    text=Path(path).read_text()
    return {key:sum(map(int,re.findall(r'^(?:#|ℹ) '+label+r' (\d+)\s*$',text,re.M))) for key,label in
            [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
def passing(path):
    text=Path(path).read_text()
    return set(re.findall(r'^\s*ok \d+ - (.+)$',text,re.M)+re.findall(r'^✔ (.+) \([\d.]+ms\)$',text,re.M))
def body(text,title):
    matches=list(re.finditer(r"^test\('([^']+)'",text,re.M))
    for i,m in enumerate(matches):
        if m[1]==title:return text[m.start():matches[i+1].start() if i+1<len(matches) else len(text)].rstrip()
    return text
m=load(base/'manifest.json');check(m['implementationSha']==frozen,'exact final source')
for path,h in m['finalSourceHashes'].items():
    check(sha(Path(path).read_bytes())==h,'current source hash:'+path)
    check(sha(subprocess.check_output(['git','show',frozen+':'+path]))==h,'frozen committed hash:'+path)
selected=dict.fromkeys(['total','pass','fail','skip','cancelled'],0);seen=set()
for gate,evidence in m['selected'].items():
    check(evidence['implementationSha']==frozen,'selected source:'+gate)
    check(counts(evidence['log'])==evidence['tests'],'selected union summary:'+gate)
    check(len(evidence['selection'])==evidence['tests']['total'],'selected union cardinality:'+gate)
    for title,row in evidence['selection'].items():
        meta=load(row['invocation']);raw=Path(meta['log']);key=(row['file'],title)
        check(key not in seen,'distinct selected leaf:'+title);seen.add(key)
        check(title in passing(raw),'actually executed successful leaf:'+title)
        check(row['file'] in meta['argv'],'invoked selected file:'+title)
        check(not meta['timedOut'],'selected invocation not timed out:'+title)
    for key,value in evidence['tests'].items():selected[key]+=value
check(selected==m['selectedTotals']=={'total':33,'pass':33,'fail':0,'skip':0,'cancelled':0},'recomputed selected33/33')
attempts=dict.fromkeys(selected,0)
for name,expected in m['attempts'].items():
    meta=load(base/(name+'.json'));actual=counts(meta['log'])
    check(actual==expected,'raw retained totals:'+name)
    for k,v in actual.items():attempts[k]+=v
check(attempts==m['allAttemptTotals']=={'total':39,'pass':35,'fail':4,'skip':0,'cancelled':0},'recomputed all-root39=35pass4fail')

lineage=load(base/'leaf-lineage.json');reconstructed={}
for row in lineage['reconstructedFiles']:
    old=Path(row['reconstructedPath']).read_bytes();meta=load(row['invocation'])
    check(sha(old)==meta['sourceHashes'][row['file']]==row['capturedSha256']==row['reconstructedSha256'],'exact reconstructed whole-file original hash:'+row['invocation'])
    reconstructed[(row['invocation'],row['file'])]=old.decode()
for row in lineage['selectedLeaves']:
    current=Path(row['file']).read_text();meta=load(row['invocation']);old=reconstructed.get((row['invocation'],row['file']),current)
    captured=meta['sourceHashes'].get(row['file'])
    if captured is None:
        check(row['file'] not in meta['trackedDelta'],'uncaptured tracked file clean at invocation:'+row['file'])
        old=subprocess.check_output(['git','show',meta['invocationHead']+':'+row['file']],text=True)
        check(old==current,'uncaptured tracked invocation blob equals final:'+row['file'])
    else:check(sha(old.encode())==captured,'selected whole-file source lineage:'+row['title'])
    check(sha(body(old,row['title']).encode())==sha(body(current,row['title']).encode())==row['selectedBodySha256']==row['finalBodySha256'],'selected body equality:'+row['title'])
check(len(lineage['selectedLeaves'])==33,'lineage covers all selected leaves')
for name in m['attempts']:
    meta=load(base/(name+'.json'))
    for path in ['test/v2-citation-export-contract.js','test/v2-citation-export-fixture.js']:
        if path in meta['sourceHashes']:check(meta['sourceHashes'][path]==sha(Path(path).read_bytes()),'unchanged shared helper:'+name+':'+path)
for path in ['packages/renderer-pptx/render.ts','src/projects/citation-export.js','src/projects/export-file.js']:
    check(load(base/'domain-01.json')['sourceHashes'][path]==sha(Path(path).read_bytes()),'unchanged core runtime:'+path)
for name,path in [('native-empty-fix-01','packages/renderer-pptx/source-notes.ts'),('typecheck-02','packages/renderer-pptx/source-notes.ts'),('cli-close-01','src/projects/export-cli.js')]:
    check(load(base/(name+'.json'))['sourceHashes'][path]==sha(Path(path).read_bytes()),'final changed runtime captured:'+name)
check(load(base/'typecheck-02.json')['exitCode']==0,'final typecheck exit0')
check(load(base/'visual-01.json')['exitCode']==1 and load(base/'visual-inspect-01.json')['exitCode']==0,'visual initial artifact-check failure and later inspection pass separate')
visual=load(own/'visual-verification.json');check(all(x['pngBytesIdentical'] for x in visual['slideControls']),'three exact retained PNG/control comparisons')
for x in visual['pdfArtifacts']:check(sha(Path(x['path']).read_bytes())==x['sha256'],'retained PDF:'+x['path'])
for name,expected in [('empty-slide-fixture-error',{'total':2,'pass':0,'fail':2,'skip':0,'cancelled':0}),('empty-slide-before',{'total':2,'pass':0,'fail':2,'skip':0,'cancelled':0}),('empty-slide-after',{'total':2,'pass':2,'fail':0,'skip':0,'cancelled':0})]:
    check(counts(own/(name+'.tap'))==expected,'independent attempt classified:'+name)
check(load(own/'empty-slide-after.json')['sourceHashes']['packages/renderer-pptx/source-notes.ts']==sha(Path('packages/renderer-pptx/source-notes.ts').read_bytes()),'independent corrected challenge final source binding')
cleanup=load(base/'cleanup-catalog.json');check(cleanup['userDatabases']==[] and cleanup['otherClients']==0,'root actual empty DB/client catalog')
absence=load(own/'cleanup-verification.json');check(absence['positiveDaemonVersion'] and not absence['matchingIds'] and not any(absence['privateFilesExist'].values()),'independent positive daemon/credential absence')
result={'implementationSha':frozen,'packetHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'checksPassed':len(checks),'errors':errors,
        'selected':selected,'allRootAttempts':attempts,'reconstructedWholeFiles':len(reconstructed),'selectedLeavesWithLineage':len(lineage['selectedLeaves']),
        'method':'Independent read-only source/hash/executed-leaf-union/reconstructed-lineage/artifact/cleanup consistency. No product test, DB, raster or service execution.'}
(own/'packet-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));raise SystemExit(bool(errors))
