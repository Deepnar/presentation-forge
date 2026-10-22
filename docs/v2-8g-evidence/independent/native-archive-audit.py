import hashlib,json,pathlib,zipfile,xml.etree.ElementTree as ET,io
R=pathlib.Path('docs/v2-8g-evidence');E=R/'independent'
def h(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def local(tag):return tag.rsplit('}',1)[-1]
def selected(raw,names):return [ET.tostring(n,encoding='unicode') for n in ET.fromstring(raw).iter() if local(n.tag) in names]
records=[]
for source in [R,E]:
 for backend in ['sqlite','postgres']:
  for family in ['openai-compatible','anthropic']:
   folder=source/'native'/f'{backend}-{family}';before=folder/'before.pptx';after=folder/'after.pptx'
   with zipfile.ZipFile(before) as b,zipfile.ZipFile(after) as a:
    bslide=b.read('ppt/slides/slide1.xml');aslide=a.read('ppt/slides/slide1.xml')
    assert b.read('ppt/slides/slide2.xml')==a.read('ppt/slides/slide2.xml'),'unrelated slide content/styling/order'
    for tags in [{'xfrm'},{'rPr','defRPr','pPr'},{'tcPr'},{'srgbClr','schemeClr','hslClr','prstClr'}]:assert selected(bslide,tags)==selected(aslide,tags),(source,backend,family,tags)
    assert b'112233' in aslide and b'445566' in aslide and b'Reviewed ' in aslide and b'results' in aslide and b'<a:tbl>' in aslide
    charts=[n for n in a.namelist() if n.startswith('ppt/charts/chart') and n.endswith('.xml')];assert len(charts)==1
    chart=a.read(charts[0])
    for value in [b'First',b'Second',b'Reviewed score',b'2.5',b'15.75']:assert value in chart,value
    books=[n for n in a.namelist() if n.startswith('ppt/embeddings/') and n.endswith('.xlsx')];assert len(books)==1
    with zipfile.ZipFile(io.BytesIO(a.read(books[0]))) as workbook:
     content=b''.join(workbook.read(n) for n in workbook.namelist() if n.endswith('.xml'))
     for value in [b'First',b'Second',b'Reviewed score',b'2.5',b'15.75']:assert value in content,value
    ids=[n.attrib['id'] for n in ET.fromstring(aslide).iter() if local(n.tag)=='cNvPr'];duplicates=sorted({v for v in ids if ids.count(v)>1})
    records.append({'source':str(source),'backend':backend,'family':family,'before':str(before),'beforeSha256':h(before),'after':str(after),'afterSha256':h(after),'geometryRunAndTableStylesPreserved':True,'unrelatedSlideXmlByteIdentical':True,'nativeChartAndWorkbookValuesVerified':True,'duplicateNonvisualIds':duplicates})
witness=pathlib.Path('docs/v2-8d-evidence/native/sqlite-openai-compatible/before.pptx')
with zipfile.ZipFile(witness) as z:ids=[n.attrib['id'] for n in ET.fromstring(z.read('ppt/slides/slide1.xml')).iter() if local(n.tag)=='cNvPr']
assert '2' in [v for v in ids if ids.count(v)>1]
result={'implementationSha':'f3e784ac6227f46628dc99a54762f6a861eeed64','pairs':records,'archiveCount':len(records)*2,'inheritedIdCollisionWitness':{'file':str(witness),'sha256':h(witness),'ids':ids},'interactivePowerPointExecuted':False,'newNativeDefectConfirmed':False}
(E/'native-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'archiveCount':len(records)*2,'checks':'geometry/styles/unrelated slide/chart/workbook','passed':True}))
