import datetime, hashlib, json, pathlib, shutil

ROOT=pathlib.Path('docs/v2-8e-evidence/independent')
OUT=pathlib.Path('out/v2-8e-independent-2026-10-21')
SHA='c71d65e189387684aac89ca9994acf8a9ff865c1'
records=json.loads((ROOT/'execution.json').read_text())
browser=next(r for r in records if r['name']=='full-7a')
assert browser['exitCode']==0 and browser['tests']['pass']==28
assert len(json.loads((ROOT/'native-archives.json').read_text()))==8
native=json.loads((ROOT/'browser-native.json').read_text())
assert sum(row['fresh'] for row in native['records'])==2
captures=[]
start=datetime.datetime.fromisoformat(browser['atUtc']).timestamp()
for source in sorted(pathlib.Path('docs/v2-7a-evidence').glob('*')):
    if not source.is_file() or source.suffix not in ['.png','.json'] or source.stat().st_mtime<start:continue
    destination=ROOT/'fresh-7a'/source.name;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
    h=hashlib.sha256(source.read_bytes()).hexdigest();assert hashlib.sha256(destination.read_bytes()).hexdigest()==h
    captures.append({'source':str(source),'file':str(destination),'sha256':h,'implementationSha':SHA})
assert sum(r['file'].endswith('.png') for r in captures)==11
(ROOT/'fresh-7a.json').write_text(json.dumps(captures,indent=2)+'\n')
counts={}
for name,folder in [('snapshot-manifest.json','backup'),('canonical-manifest.json','canonical')]:
    manifest=json.loads((OUT/name).read_text());changed=0
    for row in manifest:
        saved=OUT/folder/row['path'];assert hashlib.sha256(saved.read_bytes()).hexdigest()==row['sha256']
        original=pathlib.Path(row['path']);changed+=not original.exists() or hashlib.sha256(original.read_bytes()).hexdigest()!=row['sha256']
        shutil.copy2(saved,original)
    assert all(hashlib.sha256(pathlib.Path(row['path']).read_bytes()).hexdigest()==row['sha256'] for row in manifest)
    counts[folder]={'restored':len(manifest),'pptx':sum(row['path'].endswith('.pptx') for row in manifest),'changedBeforeRestoration':changed,'allHashesMatch':True}
result={'implementationSha':SHA,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'snapshots':counts,'preservedFreshBrowserCaptures':sum(r['file'].endswith('.png') for r in captures),'preservedFreshMeasurements':sum(r['file'].endswith('.json') for r in captures),'freshHeadlessOriginalArchives':8,'freshShellOriginalArchives':2,'archiveBytesReconstructed':False,'serviceStopped':False}
(ROOT/'restoration.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
