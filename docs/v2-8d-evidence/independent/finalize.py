import hashlib, json, pathlib, shutil
from PIL import Image, ImageDraw

root = pathlib.Path('docs/v2-8d-evidence/independent')
out = pathlib.Path('out/v2-8d-independent')
sha = '8c1e5c4e193340dd64ef3e68cd27bfe8ac55e23c'
runs = json.loads((root / 'runs.json').read_text())
planned = json.loads((root / 'execution-plan.json').read_text())['jobs'] + json.loads((root / 'supplement-plan.json').read_text())['jobs']
assert [r['name'] for r in runs] == [p['name'] for p in planned]
assert all(r['exitCode'] == 0 and not any(r.get('tests', {}).get(k,0) for k in ['fail','skip','cancelled']) for r in runs)
benchmark = json.loads((out / 'benchmark/results.json').read_text())
shutil.copy2(out / 'benchmark/results.json', root / 'benchmark-results.json')
expected = json.loads(pathlib.Path('docs/v2-8d-evidence/benchmark-results.json').read_text())
assert len(benchmark['cells']) == 50
assert benchmark['cells'] == expected['cells']
assert all(row['agree'] for row in benchmark['invariance'].values())
for cell in benchmark['cells'].values():
    assert not any(cell[k] for k in ['l1','l2','fitDiagnostics','takeawayFindings'])
    assert not cell['representation']['missing'] and not cell['charts']['mismatches']
(root / 'benchmark-audit.json').write_text(json.dumps({'implementationSha':sha, 'cells':50, 'allCellResultsMatchPacket':True, 'allFiveInvarianceComparisonsAgree':True, 'compilerAndZipMs':benchmark['ms'], 'recordedDocumentationHead':benchmark['commit'], 'findings':0},indent=2)+'\n')
images = [r for r in json.loads((root / 'fresh-7a.json').read_text()) if r['file'].endswith('.png')]
images += json.loads((root / 'native-images.json').read_text())
for row in json.loads((root / 'shell-export-inspection.json').read_text())['records']:
    archive = root / 'browser-archives' / pathlib.Path(row['source']).name
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == row['sha256']
    for file in row['rasters']:
        images.append({'file':file, 'implementationSha':sha, 'sha256':hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()})
assert len(images) == 45
identical = []
for row in images:
    row['implementationSha'] = sha
    assert hashlib.sha256(pathlib.Path(row['file']).read_bytes()).hexdigest() == row['sha256']
    packet = pathlib.Path(row['file'].replace('/independent/', '/'))
    if packet.is_file() and hashlib.sha256(packet.read_bytes()).hexdigest() == row['sha256']:
        identical.append(row['file'])
(root / 'fresh-images.json').write_text(json.dumps(images,indent=2)+'\n')
(root / 'identical-native-images.json').write_text(json.dumps({'implementationSha':sha, 'byteIdenticalToInspectedPacket':identical, 'count':len(identical)},indent=2)+'\n')
contact = root / 'contact'; contact.mkdir(exist_ok=True)
for base in range(0,len(images),6):
    sheet = Image.new('RGB',(1800,1230),'#ddd'); draw = ImageDraw.Draw(sheet)
    for i,row in enumerate(images[base:base+6]):
        x=i%3*600; y=i//3*615
        im=Image.open(row['file']).convert('RGB'); im.thumbnail((590,570)); sheet.paste(im,(x+(600-im.width)//2,y+30+(570-im.height)//2))
        label=f'{base+i+1}: '+row['file'].split('/independent/')[-1]
        for j in range(0,min(len(label),132),66): draw.text((x+6,y+6+j//66*12),label[j:j+66],fill='#111')
    sheet.save(contact / f'sheet-{base//6+1:02}.jpg')
canvases=[]
for file in (root / 'fresh-7a').glob('canvas*.json'):
    row=json.loads(file.read_text()); delta=max(abs(a-b) for a,b in zip(row['before'],row['after'])); assert delta < 1
    canvases.append({'file':str(file),'maxDeltaPx':delta})
assert len(canvases)==2
index=json.loads((out / 'backup/index.json').read_text()); changed=[]
for row in index:
    backup=out / 'backup' / row['path']; assert hashlib.sha256(backup.read_bytes()).hexdigest()==row['sha256']
    target=pathlib.Path(row['path'])
    if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest()!=row['sha256']: changed.append(row['path'])
    shutil.copy2(backup,target)
assert all(hashlib.sha256(pathlib.Path(row['path']).read_bytes()).hexdigest()==row['sha256'] for row in index)
archives=json.loads((root / 'native-archives.json').read_text())
for row in archives: assert hashlib.sha256(pathlib.Path(row['pptx']).read_bytes()).hexdigest()==row['sha256']
preservation={'implementationSha':sha,'preExistingFilesVerified':len(index),'evidenceFiles':len(index)-5,'evidenceOriginalPptx':sum(r['path'].startswith('docs/') and r['path'].endswith('.pptx') for r in index),'canonicalOutOriginals':5,'changedPathsRestored':changed,'allHashesMatch':True,'newIndependentOriginalsPreserved':len(archives)+2,'originalByteReconstruction':False}
(root / 'restoration.json').write_text(json.dumps(preservation,indent=2)+'\n')
test_runs=[r for r in runs if 'tests' in r]
total=sum(r['tests']['total'] for r in test_runs)
summary={'implementationSha':sha,'currentSourceExecutions':{'total':total,'pass':total,'fail':0,'skip':0,'cancelled':0},'inventoryFilesReexecuted':18,'primaryInventoryLeavesRepeated':352,'nativeSupplementLeavesRepeated':4,'reviewerAdditionalProbes':2,'inventoryNotIndependentlyExecuted':{'files':200,'leaves':2287},'plannedJobsUnexecuted':0,'freshImages':len(images),'byteIdenticalNativeImagesToInspectedPacket':len(identical),'canvases':canvases,'maximumCanvasDeltaPx':max(r['maxDeltaPx'] for r in canvases),'newIndependentOriginals':len(archives)+2,'preservation':preservation,'visualInspection':'pending'}
assert total==358
(root / 'execution-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
