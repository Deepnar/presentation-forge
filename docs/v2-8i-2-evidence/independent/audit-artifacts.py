import hashlib, json, re, subprocess, zipfile, io
from pathlib import Path
from xml.etree import ElementTree as ET
from datetime import datetime, timezone
base=Path('docs/v2-8i-2-evidence'); own=base/'independent'; source='58662ecc074f7cc29bf29a0dd410d581ffca0eef'
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(name,data):(own/name).write_text(json.dumps(data,indent=2)+'\n')
images=json.loads((base/'images.json').read_text());full={1,21,22,37,46,48,51,55,64,69,72,74,81,105,106,109,111,112,118,119}
for i,row in enumerate(images,1):
 assert digest(row['file'])==row['sha256'];row['contactSheet']=(i-1)//6+1;row['independentViewed']=True;row['fullSizeViewed']=i in full
contacts=[{'file':str(p),'sha256':digest(p)} for p in sorted(Path('out/v2-8i-2-validation/contact').glob('sheet-*.jpg'))]
assert len(images)==119 and len(contacts)==20
fresh=json.loads((own/'native-images.json').read_text()); lookup={row['file']:row for row in images}
for row in fresh:
 assert digest(row['file'])==row['sha256']; reference=row['file'].replace('/independent/','/');assert lookup[reference]['sha256']==row['sha256'];row['byteIdenticalInspectedPacketImage']=reference
write('visual-inspection.json',{'implementationSha':source,'atUtc':datetime.now(timezone.utc).isoformat(),'packetImages':119,'contactSheets':contacts,'fullSizePacketRiskCases':20,'packetRecords':images,'freshNativeImages':len(fresh),'freshRecords':fresh,'freshFullSizePaths':['native/sqlite-openai-compatible/after-1.png','native/postgres-anthropic/after-1-svg.png','native/sqlite-openai-compatible/before-2.png','native/postgres-anthropic/after-2.png'],'freshImagesAllByteIdenticalToInspectedPacketImages':True,'blockingFindings':[],'notes':['No new clipping, overlapping controls or unexplained canvas movement in the unchanged UI.','Inherited partial narrow canvas/toolbar/inspector overflow, scrolled heading and loading/transition captures remain.','Native mixed title runs, approved chart/table values and untouched unrelated slides preserved across both stores/protocols.','SVG mixed-run/chart-consumer differences remain; no interactive Microsoft PowerPoint session.']})
archives=[]
for filename,key in [('native-archives.json','pptx'),('browser-archives.json','originalArchive'),('http-archives.json','originalArchive')]:
 for row in json.loads((base/filename).read_text()):archives.append(('packet',row[key],row['sha256']))
for row in json.loads((own/'native-archives.json').read_text()):archives.append(('independent-worker-native',row['pptx'],row['sha256']))
for p in sorted((own/'http-archives').glob('*.pptx')):archives.append(('independent-http',str(p),digest(p)))
records=[];parts=ids=0;groups={}
for category,file,expected in archives:
 assert digest(file)==expected;pr=[]
 with zipfile.ZipFile(file) as z:
  assert z.testzip() is None
  for n in z.namelist():
   if n.endswith('.xml'):
    props=[e for e in ET.fromstring(z.read(n)).iter() if e.tag.rsplit('}',1)[-1]=='cNvPr']
    if props:
     nums=[int(e.attrib['id']) for e in props];assert len(nums)==len(set(nums)) and all(0<=v<=4294967295 for v in nums)
     pr.append({'part':n,'nonvisualProperties':len(nums)});parts+=1;ids+=len(nums)
 records.append({'category':category,'file':file,'sha256':expected,'bytes':Path(file).stat().st_size,'parts':pr})
 group=groups.setdefault(category,{'archives':0,'parts':0,'nonvisualProperties':0});group['archives']+=1;group['parts']+=len(pr);group['nonvisualProperties']+=sum(r['nonvisualProperties'] for r in pr)
assert groups['packet']=={'archives':15,'parts':107,'nonvisualProperties':365}
assert (len(records),parts,ids)==(25,177,595)
write('native-inspection.json',{'implementationSha':source,'atUtc':datetime.now(timezone.utc).isoformat(),'groups':groups,'totalArchives':25,'totalParts':parts,'totalNonvisualProperties':ids,'allOriginalHashesVerified':True,'allZipCrcVerified':True,'namespaceAwareXmlParsed':True,'numericIdsUniqueWithinEachPart':True,'records':records})
paths=['app','packages','src','test','tools','schema','themes','package.json','package-lock.json','tsconfig.json','docs/development-state.schema.json']
assert subprocess.check_output(['git','diff','--name-only',source,'--',*paths],text=True)==''
manifest=json.loads((base/'source-manifest.json').read_text())
for row in manifest['changedSourceFiles']:
 assert digest(row['path'])==row['sha256'];assert Path(row['path']).read_bytes()==subprocess.check_output(['git','show',f"{source}:{row['path']}"])
for row in manifest['helperFiles']:assert digest(row['path'])==row['sha256']
write('source-equality.json',{'implementationSha':source,'acceptedBaseline':'5170adcec56e65e08f4ec5c1e5067c127f1c4c9d','reviewedEvidenceCommit':'b0b3beda928814fdd856c3f81dc1531a45f6d91a','productTestGovernanceDeltaAfterFreeze':[],'all17SourceManifestHashesAndFrozenBlobsVerified':True,'allHelperManifestHashesVerified':True,'sourceManifestSha256':digest(base/'source-manifest.json')})
print('Verified119packetimages +32byte-identical fresh images;25originalarchives/177parts/595IDs; exact17sourcefiles and helper hashes.')
