import copy, hashlib, io, json, pathlib, re, xml.etree.ElementTree as E, zipfile

ROOT=pathlib.Path('docs/v2-8f-evidence/independent')
SHA='0cab854bce04b862060829812a9ab6ff0b765fd9'
NS={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
records=[];duplicates=[]
for namespace in [pathlib.Path('docs/v2-8f-evidence'),ROOT]:
    archives=json.loads((namespace/'native-archives.json').read_text())
    assert len(archives)==8
    for family in ['openai-compatible','anthropic']:
        for backend in ['sqlite','postgres']:
            folder=namespace/'native'/f'{backend}-{family}'
            before=json.loads((folder/'before-scenes.json').read_text());after=json.loads((folder/'after-scenes.json').read_text())
            expected=copy.deepcopy(before)
            expected[0]['elements'][0]['paragraphs'][0]['runs'][0]['text']='Reviewed '
            expected[0]['elements'][1]['chart']['categories']=['First','Second']
            expected[0]['elements'][1]['chart']['series']=[{'name':'Reviewed score','values':[2.5,15.75]}]
            expected[0]['elements'][2]['table']['rows']=[['Cell','Score'],['First','2.5'],['Second','15.75']]
            for element in expected[0]['elements']:
                element['provenance']='human'
                element[{'text':'contentCustomized','chart':'dataCustomized','table':'tableCustomized'}[element['kind']]]=True
            assert after==expected
            roots=[]
            for label in ['before','after']:
                p=folder/f'{label}.pptx';meta=next(r for r in archives if r['pptx']==str(p))
                assert hashlib.sha256(p.read_bytes()).hexdigest()==meta['sha256']
                with zipfile.ZipFile(p) as z:
                    tree=E.fromstring(z.read('ppt/slides/slide1.xml'));roots.append(tree)
                    ids=[n.attrib['id'] for n in tree.findall('.//p:cNvPr',NS)]
                    if len(set(ids))!=len(ids):duplicates.append({'archive':str(p),'ids':ids,'inherited':True})
                    runs=tree.findall('.//p:sp/p:txBody/a:p/a:r',NS)
                    assert [r.find('a:t',NS).text for r in runs]==[('Measured ' if label=='before' else 'Reviewed '),'results']
                    for run,size,color,flag in [(runs[0],'2400','112233','b'),(runs[1],'2000','445566','i')]:
                        props=run.find('a:rPr',NS);assert props.attrib['sz']==size and props.attrib[flag]=='1'
                        assert props.find('a:solidFill/a:srgbClr',NS).attrib['val']==color
                        assert props.find('a:latin',NS).attrib['typeface']=='Inter'
                    tbl=tree.find('.//a:tbl',NS);assert tbl is not None
                    assert [x.attrib['h'] for x in tbl.findall('a:tr',NS)]==['457200']*3
                    assert [x.attrib['w'] for x in tbl.findall('a:tblGrid/a:gridCol',NS)]==['2286000']*2
                    cells=tbl.findall('a:tr/a:tc',NS)
                    assert len(cells)==6
                    assert cells[0].find('a:tcPr/a:solidFill/a:srgbClr',NS).attrib['val']=='EEEEEE'
                    assert cells[0].find('.//a:rPr',NS).attrib['b']=='1'
                    assert cells[2].find('.//a:rPr',NS).attrib['sz']=='1200'
                    chartfiles=[n for n in z.namelist() if re.fullmatch(r'ppt/charts/chart\d+\.xml',n)];assert len(chartfiles)==1
                    chart=E.fromstring(z.read(chartfiles[0]));values=[n.text for n in chart.findall('.//c:numCache/c:pt/c:v',NS)]
                    assert values==(['1.25','12.5'] if label=='before' else ['2.5','15.75'])
                    embedded=next(n for n in z.namelist() if n.endswith('.xlsx') and n.startswith('ppt/embeddings/'))
                    with zipfile.ZipFile(io.BytesIO(z.read(embedded))) as book:
                        cells=E.fromstring(book.read('xl/worksheets/sheet1.xml'))
                        numeric=[c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v').text for c in cells.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c') if c.attrib.get('t','n')=='n']
                        assert all(value in numeric for value in values)
                    assert 'Unrelated private slide' in z.read('ppt/slides/slide2.xml').decode()
                    records.append({'archive':str(p),'sha256':meta['sha256'],'nativeTextChartTableAndEmbeddedWorkbook':True,'humanStylesAndTableGeometry':True,'sceneDeltaExact':True})
            def geometry(t):
                return [(n.tag,tuple(n.attrib.items()),[(c.tag,tuple(c.attrib.items())) for c in n]) for n in t.findall('.//a:xfrm',NS)+t.findall('.//p:xfrm',NS)]
            assert geometry(roots[0])==geometry(roots[1])
            with zipfile.ZipFile(folder/'before.pptx') as a,zipfile.ZipFile(folder/'after.pptx') as b:
                assert a.read('ppt/slides/slide2.xml')==b.read('ppt/slides/slide2.xml')

older=pathlib.Path('docs/v2-8d-evidence/native/sqlite-openai-compatible/before.pptx')
with zipfile.ZipFile(older) as z:
    oldids=[n.attrib['id'] for n in E.fromstring(z.read('ppt/slides/slide1.xml')).findall('.//p:cNvPr',NS)]
assert oldids==['1','2','3','2']
summary={'implementationSha':SHA,'archiveChecks':len(records),'records':records,'inheritedDuplicateNonVisualIds':duplicates,
         'accepted8dWitness':{'archive':str(older),'sha256':hashlib.sha256(older.read_bytes()).hexdigest(),'ids':oldids},
         'limitation':'Repeated cNvPr ID2 exists in accepted8D and before/after8F exports. No8F renderer delta; rasterization succeeds, but interactive consumer identity behavior is unverified. Native rasters do not qualify interactive Microsoft PowerPoint.'}
(ROOT/'native-audit.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'nativeArchivesChecked':len(records),'inheritedDuplicateIdObservations':len(duplicates),'geometryAndStylesPreserved':True}))
