import hashlib,io,json,pathlib,posixpath,re,zipfile,xml.etree.ElementTree as ET
root=pathlib.Path('docs/v2-pptx-id-evidence'); plan=json.loads((root/'validation-plan.json').read_text())
h=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
def without_ids(raw):return re.sub(rb'(<p:cNvPr\b[^>]*\bid=")[0-9]+(")',rb'\1ID\2',raw)
def without_times(raw):return re.sub(rb'(<dcterms:(?:created|modified)\b[^>]*>)[^<]+',rb'\1TIME',raw)
records=[]
with zipfile.ZipFile('out/v2-pptx-id-validation/native/before.pptx') as b,zipfile.ZipFile('out/v2-pptx-id-validation/native/after.pptx') as a:
 assert set(b.namelist())==set(a.namelist())
 for name in b.namelist():
  old,new=b.read(name),a.read(name)
  if re.fullmatch(r'ppt/(slides|slideLayouts|slideMasters|notesSlides|notesMasters)/[^/]+\.xml',name):
   before=[int(n.attrib['id']) for n in ET.fromstring(old).findall('.//p:cNvPr',ns)]
   after=[int(n.attrib['id']) for n in ET.fromstring(new).findall('.//p:cNvPr',ns)]
   assert len(after)==len(set(after)) and all(0<=i<=4294967295 for i in after),(name,after)
   assert without_ids(old)==without_ids(new),name
   records.append({'part':name,'beforeIds':before,'afterIds':after,'changes':[{'from':x,'to':y} for x,y in zip(before,after) if x!=y]})
  elif name=='docProps/core.xml':assert without_times(old)==without_times(new),name
  elif name.endswith('.xlsx'):
   with zipfile.ZipFile(io.BytesIO(old)) as ob,zipfile.ZipFile(io.BytesIO(new)) as nb:
    assert ob.namelist()==nb.namelist() and all(ob.read(n)==nb.read(n) for n in ob.namelist()),name
  else:assert old==new,name
  if name.endswith('.rels'):
   owner=posixpath.dirname(posixpath.dirname(name))
   for rel in ET.fromstring(new):
    if rel.attrib.get('TargetMode')=='External':continue
    target=rel.attrib['Target']; resolved=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(owner,target))
    assert resolved in a.namelist(),(name,resolved)
 charts=[n for n in a.namelist() if re.fullmatch(r'ppt/charts/chart\d+\.xml',n)]
 books=[n for n in a.namelist() if n.endswith('.xlsx')];assert len(charts)==len(books)==2
 for name in charts:
  raw=a.read(name)
  for v in [b'Conductivity',b'Oxide',b'Sulfide',b'12.5',b'3.75']:assert v in raw,(name,v)
witness='docs/v2-8d-evidence/native/sqlite-openai-compatible/before.pptx'
assert h(witness)=='17148c07acfc2996588a6e8cc351423d2127f81849cc0cb980528084a55bbf2b'
rows=json.loads(pathlib.Path('out/v2-pptx-id-validation/historical-hashes.json').read_text())
assert all(h(r['path'])==r['sha256'] for r in rows)
result={'implementationSha':plan['implementationSha'],'backend':'in-memory canonical renderer; SQLite saved-export consumers exercised in required tests; no PostgreSQL rerun','beforeSource':'7f4c1e8b97a2e1b7987d9c089910f7323610a41d renderer plus new fixture only','beforeSha256':h('out/v2-pptx-id-validation/native/before.pptx'),'afterSha256':h('out/v2-pptx-id-validation/native/after.pptx'),'partsAudited':len(b.namelist()),'identityParts':records,'allNonIdXmlPreserved':True,'allRelationshipsAndMediaPreserved':True,'nativeChartsAndWorkbooks':2,'historicalOriginalsUnchanged':len(rows),'historicalOriginals':rows,'interactivePowerPointExecuted':False}
(root/'archive-comparison.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'partsAudited':result['partsAudited'],'historicalOriginalsUnchanged':len(rows),'changedIdentityParts':sum(bool(r['changes']) for r in records)}))
