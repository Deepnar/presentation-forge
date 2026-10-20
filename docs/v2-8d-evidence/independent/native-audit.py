import hashlib, json, pathlib, xml.etree.ElementTree as ET, zipfile

root = pathlib.Path('docs/v2-8d-evidence/independent')
ns = {'a':'http://schemas.openxmlformats.org/drawingml/2006/main', 'p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
records = []
for folder in sorted((root / 'native').iterdir()):
    if not folder.is_dir():
        continue
    with zipfile.ZipFile(folder / 'before.pptx') as before, zipfile.ZipFile(folder / 'after.pptx') as after:
        assert before.read('ppt/slides/slide2.xml') == after.read('ppt/slides/slide2.xml'), folder
        a = ET.fromstring(before.read('ppt/slides/slide1.xml'))
        b = ET.fromstring(after.read('ppt/slides/slide1.xml'))
        for path in ['.//a:rPr', './/a:pPr', './/a:xfrm', './/p:xfrm', './/a:tcPr']:
            assert [ET.tostring(x) for x in a.findall(path,ns)] == [ET.tostring(x) for x in b.findall(path,ns)], (folder,path)
        chart = next(n for n in after.namelist() if n.startswith('ppt/charts/chart') and n.endswith('.xml'))
        xml = after.read(chart).decode()
        for value in ['Reviewed score', '2.5', '15.75', 'First', 'Second']:
            assert value in xml, (folder,value)
        records.append({'scenario':folder.name, 'untargetedSlideXmlByteIdentical':True, 'nativeRunParagraphCellPropertiesAndGeometryIdentical':True, 'editedChartValuesNative':True})
assert len(records) == 4
images = json.loads((root / 'native-images.json').read_text())
for row in images:
    assert hashlib.sha256(pathlib.Path(row['file']).read_bytes()).hexdigest() == row['sha256']
result = {'implementationSha':'8c1e5c4e193340dd64ef3e68cd27bfe8ac55e23c', 'records':records, 'freshNativeSvgImageHashesVerified':len(images)}
(root / 'native-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
