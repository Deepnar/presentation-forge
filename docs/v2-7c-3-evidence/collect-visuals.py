import pathlib,json,shutil,hashlib
from PIL import Image,ImageDraw
root=pathlib.Path('docs/v2-7c-3-evidence');out=pathlib.Path('out/v2-7c-3-validation');sha=json.loads((root/'validation-plan.json').read_text())['implementationSha'];images=[]
def add(source,destination,backend,origin=None):
 destination.parent.mkdir(parents=True,exist_ok=True)
 if source!=destination:shutil.copy2(source,destination)
 im=Image.open(destination);images.append(dict(path=str(destination),sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),width=im.width,height=im.height,backend=backend,source=origin or str(source),implementationSha=sha))
for f in sorted(root.glob('*.png')):add(f,f,'Local standalone SQLite' if f.name.startswith('standalone-') else 'PostgreSQL production UI')
for f in sorted((out/'sqlite-toolbar-images').glob('*.png')):add(f,root/'sqlite-toolbar'/f.name,'SQLite production UI or development UI with SQLite project API')
for directory,backend in [('sqlite-regression-images','SQLite'),('postgres-cover-images','PostgreSQL'),('postgres-catalog-images','PostgreSQL')]:
 index=json.loads((out/directory/'index.json').read_text())
 for row in index:
  f=pathlib.Path(row['file']);assert hashlib.sha256(f.read_bytes()).hexdigest()==row['sha256'];add(f,root/'regression'/directory/f.name,('PostgreSQL' if 'v2-6c-evidence' in row['source'] else backend if any(x in row['source'] for x in ['v2-6a-evidence','v2-6b-evidence','v2-7a-evidence','v2-7b-1-evidence','v2-7b-2-evidence','v2-7c-1-evidence','v2-7c-2-evidence']) else 'Standalone canonical scene fixtures; ProjectStore not exercised by this image'),row['source'])
for f in sorted((root/'native').glob('*.png')):add(f,f,'Native authenticated export; exact source/backend in export-inspection.json')
(root/'images.json').write_text(json.dumps({'implementationSha':sha,'images':images,'note':'All retained final images must be inspected. Historical suite outputs are copied from current run with source hashes before restoration; earlier attempts excluded.'},indent=2)+'\n')
contact=out/'visual';contact.mkdir(exist_ok=True)
for start in range(0,len(images),9):
 sheet=Image.new('RGB',(1440,990),'#e5e7eb');draw=ImageDraw.Draw(sheet)
 for n,row in enumerate(images[start:start+9]):
  im=Image.open(row['path']).convert('RGB');im.thumbnail((470,295));x=(n%3)*480+(480-im.width)//2;y=(n//3)*330+27;sheet.paste(im,(x,y));draw.text(((n%3)*480+6,(n//3)*330+5),str(start+n+1)+' '+pathlib.Path(row['path']).name[:63],fill='#111827')
 sheet.save(contact/f'contact-{start//9+1:02}.jpg',quality=92)
print('Final images',len(images),'contact sheets',len(list(contact.glob('contact-*.jpg'))))
