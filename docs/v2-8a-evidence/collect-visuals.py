import pathlib,json,shutil,hashlib
from PIL import Image,ImageDraw
root=pathlib.Path('docs/v2-8a-evidence');out=pathlib.Path('out/v2-8a-validation');sha=json.loads((root/'validation-plan.json').read_text())['implementationSha'];images=[]
def add(source,destination,backend,origin=None):
 destination.parent.mkdir(parents=True,exist_ok=True)
 if source!=destination:shutil.copy2(source,destination)
 im=Image.open(destination);images.append(dict(path=str(destination),sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),width=im.width,height=im.height,backend=backend,source=origin or str(source),implementationSha=sha))
for row in json.loads((out/'regression-images/index.json').read_text()):
 source=pathlib.Path(row['file']);assert hashlib.sha256(source.read_bytes()).hexdigest()==row['sha256']
 if 'v2-6c-evidence' in row['source']:backend='PostgreSQL hosted project browser'
 elif 'v2-7c-3-evidence/standalone-' in row['source']:backend='Standalone scene viewer; local Live and SQLite project API'
 elif any(k in row['source'] for k in ['v2-6a-evidence','v2-6b-evidence','v2-7a-evidence','v2-7b-1-evidence','v2-7b-2-evidence','v2-7c-1-evidence','v2-7c-2-evidence','v2-7c-3-evidence']):backend='SQLite saved-project browser'
 else:backend='Standalone canonical scene fixtures; no ProjectStore exercised'
 add(source,root/'regression'/source.name,backend,row['source'])
for source in sorted((root/'native').glob('*.png')):
 backend='Canonical bound in-memory engine; no storage/provider' if source.name.startswith(('before-','after-')) else 'SQLite authenticated browser export'
 add(source,source,backend)
(root/'images.json').write_text(json.dumps({'implementationSha':sha,'images':images,'note':'Fresh source hashes retained before historical suite evidence restoration. All final images require inspection.'},indent=2)+'\n')
contact=out/'visual';contact.mkdir(exist_ok=True)
for start in range(0,len(images),9):
 sheet=Image.new('RGB',(1440,990),'#e5e7eb');draw=ImageDraw.Draw(sheet)
 for n,row in enumerate(images[start:start+9]):
  im=Image.open(row['path']).convert('RGB');im.thumbnail((470,295));x=n%3*480+(480-im.width)//2;y=n//3*330+27;sheet.paste(im,(x,y));draw.text((n%3*480+6,n//3*330+5),str(start+n+1)+' '+pathlib.Path(row['path']).name[:63],fill='#111827')
 sheet.save(contact/f'contact-{start//9+1:02}.jpg',quality=92)
print('Final images',len(images),'contact sheets',len(list(contact.glob('contact-*.jpg'))))
