from pathlib import Path
import json,hashlib,os,shutil
from PIL import Image,ImageDraw
root=Path('docs/v2-8e-evidence');out=Path(os.environ.get('FORGE_VALIDATION_OUT','out/v2-8e-validation'));sha=json.loads((root/'validation-plan.json').read_text())['implementationSha']
for name in ['sustained-window.json','snapshot-owned-script-adjustment.json','pre-resume-visual.json']:
 if (out/name).exists():shutil.copy2(out/name,root/name)
records=[]
for meta in ['export-inspection.json','shell-export-inspection.json']:
 for record in json.loads((root/meta).read_text())['records']:
  source=Path(record['source']);assert hashlib.sha256(source.read_bytes()).hexdigest()==record['sha256']
  dest=root/'browser-archives'/str(source).replace('/','--');dest.parent.mkdir(exist_ok=True);shutil.copy2(source,dest)
  records.append({**record,'originalArchive':str(dest),'implementationSha':sha})
(root/'browser-archives.json').write_text(json.dumps(records,indent=2)+'\n')
backup=out/'prior-generated-backup';index=json.loads((backup/'index.json').read_text())
for row in index:
 source=backup/row['path'];assert hashlib.sha256(source.read_bytes()).hexdigest()==row['sha256'];shutil.copy2(source,row['path'])
assert all(hashlib.sha256(Path(row['path']).read_bytes()).hexdigest()==row['sha256'] for row in index)
(root/'generated-original-restoration.json').write_text(json.dumps({'implementationSha':sha,'originalFilesRestored':len(index),'allBaselineHashesMatched':True,'originalByteReconstruction':False,'index':index},indent=2)+'\n')
images=json.loads((root/'regression-images.json').read_text())+json.loads((root/'native-images.json').read_text())
for meta in ['export-inspection.json','shell-export-inspection.json']:
 for row in json.loads((root/meta).read_text())['records']:
  for file in row['rasters']:images.append({'file':file,'implementationSha':sha,'sha256':hashlib.sha256(Path(file).read_bytes()).hexdigest()})
assert len(images)==115,len(images)
assert all(x['implementationSha']==sha and hashlib.sha256(Path(x['file']).read_bytes()).hexdigest()==x['sha256'] for x in images)
(root/'images.json').write_text(json.dumps(images,indent=2)+'\n')
contact=out/'contact';contact.mkdir(exist_ok=True)
for base in range(0,len(images),6):
 sheet=Image.new('RGB',(1800,1230),'#ddd');draw=ImageDraw.Draw(sheet)
 for i,row in enumerate(images[base:base+6]):
  x=i%3*600;y=i//3*615;im=Image.open(row['file']).convert('RGB');im.thumbnail((590,570));sheet.paste(im,(x+(600-im.width)//2,y+30+(570-im.height)//2))
  label=str(base+i+1)+': '+row['file'].split('v2-8e-evidence/')[-1].replace('regression-images/docs--','')
  for j in range(0,min(len(label),132),66):draw.text((x+6,y+6+j//66*12),label[j:j+66],fill='#111')
 sheet.save(contact/f'sheet-{base//6+1:02}.jpg')
local={}
for file in (root/'native').glob('*/execution.json'):
 d=json.loads(file.read_text());local[file.parent.name]={'timingsMs':d['timings'],'providerExchangesMs':d['providerExchangesMs'],'traceBytes':d['traceBytes'],'conversationTraceBytes':d['conversationTraceBytes'],'conversationTrace':d['conversationTrace'],'protocolFixture':True}
canvases=[]
for p in (root/'measurements').glob('*canvas*.json'):
 d=json.loads(p.read_text())
 for row in d.get('measurements',[d]):
  if 'before' in row and 'after' in row:canvases.append({'file':str(p),'kind':row.get('kind'),'maxDeltaPx':max(abs(a-b) for a,b in zip(row['before'],row['after']))})
performance={'implementationSha':sha,'localProtocolAndBackendSamples':local,'actualExistingRuntimeProcessRecovery':[json.loads(x) for x in (root/'recovery-metrics.jsonl').read_text().splitlines()],'largeDeck':json.loads((root/'measurements/docs--v2-7a-evidence--large-deck.json').read_text()),'canvasMeasurements':canvases,'maximumCanvasDeltaPx':max(x['maxDeltaPx'] for x in canvases),'limitation':'Local fixtures, not live provider latency/content quality or production percentiles. Existing runtime recovery excludes lease wait; no conversational network exactly-once claim.'}
benchmark=json.loads((root/'benchmark-results.json').read_text())
performance.update(benchmark={'cells':len(benchmark['cells']),'compilerAndZipMs':benchmark['ms'],'recordedGitHead':benchmark['commit']},resourceAssessment=str(root/'resource-assessment.json'),resourceSamples=str(root/'resource-window.jsonl'),environmentLimitation='Elevated global I/O PSI/iowait has unresolved provenance; all local latency measurements retain that limitation.')
(root/'performance.json').write_text(json.dumps(performance,indent=2)+'\n')
print(json.dumps({'images':len(images),'contactSheets':20,'nativeArchives':len(json.loads((root/'native-archives.json').read_text())),'browserArchives':len(records),'originalGeneratedArchivesRestored':len(index),'visualInspection':'PENDING'},indent=2))
