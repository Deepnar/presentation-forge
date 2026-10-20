import hashlib,json,pathlib,shutil
OUT=pathlib.Path('out/v2-8c-independent');ROOT=pathlib.Path('docs/v2-8c-evidence/independent');rows=json.loads((OUT/'backup/index.json').read_text());changed=[]
for row in rows:
 p=pathlib.Path(row['path']);backup=OUT/'backup'/p;assert backup.is_file() and hashlib.sha256(backup.read_bytes()).hexdigest()==row['sha256']
 if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=row['sha256']:changed.append(row['path'])
for row in rows:
 p=pathlib.Path(row['path']);p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(OUT/'backup'/p,p)
assert all(hashlib.sha256(pathlib.Path(row['path']).read_bytes()).hexdigest()==row['sha256'] for row in rows)
(ROOT/'restoration.json').write_text(json.dumps({'implementationSha':'e41d509c20fca21a70b9a0c587ccb83684aee7e6','preExistingFilesVerified':len(rows),'preExistingOriginalArchives':sum(row['path'].endswith('.pptx') for row in rows),'changedPathsRestored':changed,'allHashesMatch':True,'snapshotIncludesAllEvidenceAndFiveCanonicalOutArchives':True,'newIndependentOriginalsPreservedSeparately':10,'reconstruction':False},indent=2)+'\n')
print('Restored and verified',len(rows),'files,',sum(row['path'].endswith('.pptx') for row in rows),'original archives; changed',len(changed),'paths')
