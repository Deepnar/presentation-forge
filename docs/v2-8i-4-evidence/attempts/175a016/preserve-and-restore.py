import datetime,hashlib,json,pathlib,shutil,subprocess,sys
root=pathlib.Path('docs/v2-8i-4-evidence');out=pathlib.Path('out/v2-8i-4-validation');target=root/'attempts/175a016'
sys.path.insert(0,str(root.resolve()))
from validation_guards import validate_snapshots
sha=json.loads((root/'validation-plan.json').read_text())['implementationSha']
assert sha=='175a0163618e4a8ffcd68c51224b8eaef4e01440'
assert not (target/'retirement.json').exists()
validate_snapshots(root,out,sha,True)
runs=json.loads((out/'coordinator.json').read_text());assert len(runs)==35 and all(r['exitCode']==0 for r in runs)
start=datetime.datetime.fromisoformat(runs[0]['atUtc']).timestamp();captured=[]
def preserve(source,category):
 destination=target/category/source;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
 digest=hashlib.sha256(source.read_bytes()).hexdigest();assert hashlib.sha256(destination.read_bytes()).hexdigest()==digest
 captured.append({'source':str(source),'file':str(destination),'sha256':digest,'bytes':source.stat().st_size})
for folder in sorted(pathlib.Path('docs').glob('v2-*-evidence')):
 if folder==root:continue
 for source in sorted(folder.rglob('*')):
  if source.is_file() and source.stat().st_mtime>=start:preserve(source,'generated')
canonical=json.loads((out/'prior-generated-backup/index.json').read_text())
for row in canonical:preserve(pathlib.Path(row['path']),'canonical')
for source in sorted((out/'http').glob('*')):
 if source.is_file():preserve(source,'http')
for source in sorted(out.iterdir()):
 if source.is_file():preserve(source,'execution')
for name in ['owned-postgres.json','validation-plan.json','source-manifest.json','helper-source-manifest.json']:
 preserve(root/name,'frozen-records')
probe=pathlib.Path('out/v2-8i-4-development/sqlite-malformed-identifier-probe.tap');preserve(probe,'failure')
indexes=[('backup',json.loads((out/'backup/index.json').read_text())),('prior-generated-backup',canonical)]
for folder,rows in indexes:
 for row in rows:
  source=out/folder/row['path'];assert hashlib.sha256(source.read_bytes()).hexdigest()==row['sha256'];shutil.copy2(source,row['path'])
assert all(hashlib.sha256(pathlib.Path(row['path']).read_bytes()).hexdigest()==row['sha256'] for _,rows in indexes for row in rows)
primary=[r for r in runs if r['name']!='turn-discovery-gate']
record={'implementationSha':sha,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'completeJobs':len(runs),'primaryFiles':sum(len(r['files']) for r in primary),'primaryTests':{k:sum(r['tests'][k] for r in primary) for k in ['total','pass','fail','skip','cancelled']},'focusedOverlap':runs[0]['tests'],'remainingPrimaryFiles':238-sum(len(r['files']) for r in primary),'failedDevelopmentProbe':{'total':1,'pass':0,'fail':1,'skip':0,'cancelled':0,'shellOverallExit':0,'shellExitReason':'cat followed the failing Node command; raw TAP failure is preserved and not counted as a pass'},'reason':'Malformed SQLite UTF-8 replacement can change a raw identifier before validation; source175 is not acceptable. New exact-source full qualification required.','historicalFilesRestored':len(indexes[0][1]),'historicalPptxRestored':sum(r['path'].endswith('.pptx') for r in indexes[0][1]),'canonicalFilesRestored':len(canonical),'allOriginalHashesMatch':True,'captured':captured,'noPartialPassesTransfer':True,'ownedBackendNotStoppedOrReplaced':True,'implementationAccepted':False}
(target/'retirement.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({k:v for k,v in record.items() if k!='captured'},indent=2))
