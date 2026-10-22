import hashlib, io, json, pathlib, posixpath, re, shutil, subprocess, zipfile, xml.etree.ElementTree as ET
ROOT = pathlib.Path('docs/v2-pptx-id-evidence/independent')
OUT = pathlib.Path('out/v2-pptx-id-review')
SHA = '45c2c4c84581f41d1b2ef4ca61d15c067b8562a9'
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
def digest(path): return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
def tags(raw): return list(re.finditer(rb'<p:cNvPr\b[^>]*>', raw))
def values(raw): return [re.search(rb'\bid="([0-9]+)"', m[0])[1] for m in tags(raw)]
def without_ids(raw): return re.sub(rb'(<p:cNvPr\b[^>]*\bid=")[0-9]+(")', rb'\1ID\2', raw)
def without_times(raw): return re.sub(rb'(<dcterms:(?:created|modified)\b[^>]*>)[^<]+', rb'\1TIME', raw)
subprocess.run(['git','diff','--quiet',SHA,'--','packages','src','app','test','tools'],check=True)
records=[]; unchanged=[]; workbook_time_fields=[]
with zipfile.ZipFile(OUT/'before.pptx') as before, zipfile.ZipFile(OUT/'repaired.pptx') as repaired, zipfile.ZipFile(OUT/'fresh.pptx') as fresh:
    assert before.namelist()==repaired.namelist()==fresh.namelist()
    for name in before.namelist():
        old, new, current = before.read(name), repaired.read(name), fresh.read(name)
        if re.fullmatch(r'ppt/(slides|slideLayouts|slideMasters|notesSlides|notesMasters)/[^/]+\.xml',name):
            old_values,new_values=values(old),values(new)
            assert len(old_values)==len(new_values)
            ids=[int(n.attrib['id']) for n in ET.fromstring(new).iter('{'+P+'}cNvPr')]
            assert len(ids)==len(set(ids)) and all(0<=n<=0xffffffff for n in ids)
            seen=set();changes=[]
            for index,(original, corrected) in enumerate(zip(old_values,new_values)):
                if int(original) in seen:
                    assert int(corrected) not in set(map(int,old_values))
                    changes.append({'index':index,'from':original.decode(),'to':corrected.decode()})
                else: assert original==corrected, (name,index,'first identity changed')
                seen.add(int(original))
            assert without_ids(old)==without_ids(new), name
            assert new==current, name
            records.append({'part':name,'beforeIds':[v.decode() for v in old_values],'afterIds':[v.decode() for v in new_values],'laterDuplicateChangesOnly':changes})
        else:
            assert old==new,(name,'same-archive repair changed a non-identity part')
            unchanged.append(name)
            if name=='docProps/core.xml': assert without_times(new)==without_times(current)
            elif name.endswith('.xlsx'):
                with zipfile.ZipFile(io.BytesIO(new)) as a,zipfile.ZipFile(io.BytesIO(current)) as b:
                    assert a.namelist()==b.namelist()
                    for member in a.namelist():
                        if member=='docProps/core.xml':
                            assert without_times(a.read(member))==without_times(b.read(member))
                            workbook_time_fields.append({'archive':name,'member':member,'normalizedFields':['dcterms:created','dcterms:modified']})
                        else: assert a.read(member)==b.read(member),(name,member)
            else: assert new==current,name
        if name.endswith('.rels'):
            owner=posixpath.dirname(posixpath.dirname(name))
            for relationship in ET.fromstring(new):
                if relationship.attrib.get('TargetMode')=='External': continue
                target=relationship.attrib['Target']
                resolved=target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(owner,target))
                assert resolved in repaired.namelist(),(name,resolved)
    charts=[n for n in repaired.namelist() if re.fullmatch(r'ppt/charts/chart[0-9]+\.xml',n)]
    books=[n for n in repaired.namelist() if n.endswith('.xlsx')]
    assert len(charts)==len(books)==2
    for chart in charts:
        for text in [b'Conductivity',b'Oxide',b'Sulfide',b'12.5',b'3.75']: assert text in repaired.read(chart)
    table_counts=[]
    for i in range(1,4):
        raw=ET.fromstring(repaired.read(f'ppt/slides/slide{i}.xml'))
        table_counts.append(len(list(raw.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}tbl'))))
    assert table_counts==[1,2,2]
historical=json.loads(pathlib.Path('out/v2-pptx-id-validation/historical-hashes.json').read_text())
assert len(historical)==161
for item in historical: assert digest(item['path'])==item['sha256'],item['path']
images=ROOT/'images';images.mkdir(exist_ok=False)
archives=ROOT/'archives';archives.mkdir(exist_ok=False)
artifacts=[]
for phase in ['before','repaired','fresh']:
    source=OUT/(phase+'.pptx');target=archives/source.name;shutil.copyfile(source,target)
    artifacts.append({'path':str(target),'sha256':digest(target),'sizeBytes':target.stat().st_size})
    for image in sorted((OUT/(phase+'-preview')).glob('slide-*.png')):
        target=images/(phase+'-'+image.name);shutil.copyfile(image,target)
        artifacts.append({'path':str(target),'sha256':digest(target),'sizeBytes':target.stat().st_size})
source_paths=['packages/renderer-pptx/render.ts','packages/renderer-pptx/shape-ids.ts','test/v2-native-ids.test.js','test/helpers/native-id-fixture.js','test/dev-protocol.test.js','tools/dev-protocol-check.mjs','docs/development-state.schema.json']
result={'implementationSha':SHA,'reviewedHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceDeltaAfterCandidate':[],'sourceHashes':[{'path':p,'sha256':digest(p)} for p in source_paths],'parts':len(before.namelist()),'identityParts':records,'exactSameArchiveNonIdentityParts':unchanged,'nativeChartCount':2,'embeddedWorkbookCount':2,'tablesPerSlide':table_counts,'freshExportNormalization':{'outerProperties':['dcterms:created','dcterms:modified'],'embeddedProperties':workbook_time_fields,'everyOtherPayloadByteExact':True},'historicalOriginalHashesVerified':historical,'artifacts':artifacts,'interactivePowerPointExecuted':False}
(ROOT/'archive.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'parts':result['parts'],'sameArchiveNonIdentityPartsExact':len(unchanged),'identityParts':len(records),'changedParts':sum(bool(r['laterDuplicateChangesOnly']) for r in records),'historicalOriginalsUnchanged':len(historical),'tablesPerSlide':table_counts}))
