import hashlib,json,pathlib
from PIL import Image,ImageOps,ImageDraw
ROOT=pathlib.Path('docs/v2-8f-evidence/independent')
rows=[]
for p in sorted((ROOT/'fresh-7a').glob('*.png')):rows.append({'file':str(p),'kind':'browser'})
for r in json.loads((ROOT/'native-images.json').read_text()):rows.append({'file':r['file'],'kind':'svg' if r['file'].endswith('-svg.png') else 'native'})
for r in json.loads((ROOT/'browser-native.json').read_text())['records']:
 for image in r['rasters']:rows.append({'file':image['file'],'kind':'native','archiveFresh':r['fresh']})
assert len(rows)==54 and len(set(r['file'] for r in rows))==54
for r in rows:r['sha256']=hashlib.sha256(pathlib.Path(r['file']).read_bytes()).hexdigest()
(ROOT/'fresh-images.json').write_text(json.dumps(rows,indent=2)+'\n')
contacts=[];folder=ROOT/'fresh-contact';folder.mkdir(exist_ok=True)
for groupno,kind in enumerate(['browser','native','svg']):
 group=[r for r in rows if r['kind']==kind]
 for offset in range(0,len(group),6):
  subset=group[offset:offset+6];sheet=Image.new('RGB',(1800,1230),'#dddddd');draw=ImageDraw.Draw(sheet)
  for i,r in enumerate(subset):
   x=(i%3)*600;y=(i//3)*615;im=Image.open(r['file']).convert('RGB');im=ImageOps.contain(im,(590,580));sheet.paste(im,(x+(600-im.width)//2,y+30+(580-im.height)//2));draw.text((x+8,y+8),str(pathlib.Path(r['file']).relative_to(ROOT)),fill='black')
  file=folder/f'{kind}-{offset//6+1:02d}.jpg';sheet.save(file,quality=90);contacts.append({'file':str(file),'images':subset})
assert len(contacts)==10
(ROOT/'fresh-contact.json').write_text(json.dumps(contacts,indent=2)+'\n')
print('54 fresh images hash-reconciled into10 contact sheets')
