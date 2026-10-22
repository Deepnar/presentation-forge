import collections, hashlib, json, pathlib, re, subprocess
R=pathlib.Path('docs/v2-8g-evidence'); E=R/'independent'; SHA='f3e784ac6227f46628dc99a54762f6a861eeed64'
def h(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def totals(text):return {k:int(re.findall(r'^# '+label+r' (\d+)\s*$',text,re.M)[-1]) for k,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
def markers(text):return re.findall(r'^# forge-test-file "([^"]+)"$',text,re.M)
plan=json.loads((R/'validation-plan.json').read_text());inventory=plan['bulk']+plan['serial']+plan['postgres'];actual=[str(p) for p in pathlib.Path('test').glob('*.test.js')]+[str(p) for p in pathlib.Path('test').glob('*.test.ts')]
assert len(inventory)==224 and len(set(inventory))==224 and set(inventory)==set(actual)
packet=[]
for group,filename,expected in [('bulk','non-browser-bulk.json',2427),('serial','serial-browser.json',208),('postgres','postgres-complete.json',166)]:
 meta=json.loads((R/filename).read_text());log=pathlib.Path(meta['log']);text=log.read_text();found=totals(text)
 assert found==meta['tests']=={'total':expected,'pass':expected,'fail':0,'skip':0,'cancelled':0}
 assert meta['implementationSha']==SHA and meta['exitCode']==0 and meta['files']==plan[group]
 assert collections.Counter(markers(text))==collections.Counter(meta['files'])
 packet.append({'group':group,'files':len(meta['files']),'tests':found,'log':str(log),'sha256':h(log)})
coordinator=json.loads((R/'logs/coordinator.json').read_text());runs=[]
mapname={'bulk':'non-browser-bulk.tap','focused':'model-provider-focused.tap','model-provider-gate':'model-provider.tap','byok-locale':'byok-locale.tap'}
for row in coordinator:
 assert row['implementationSha']==SHA
 src=pathlib.Path(row['log']);assert src.is_file()
 if row['name'] in mapname:dest=R/'logs'/mapname[row['name']]
 elif row['files']:dest=R/'logs/files'/(row['name']+'.tap')
 else:dest=R/'logs'/(row['name']+'.log')
 assert dest.is_file(),dest
 assert h(src)==h(dest),(src,dest)
 if row['files']:
  text=dest.read_text();assert totals(text)==row['tests'];assert collections.Counter(markers(text))==collections.Counter(row['files'])
  assert row['command'][-len(row['files']):]==row['files']
 assert row['exitCode']==(1 if row['name']=='byok-locale' else 0)
 runs.append({'name':row['name'],'log':str(dest),'sha256':h(dest),'exitCode':row['exitCode'],'tests':row.get('tests')})
images=json.loads((R/'images.json').read_text());assert len(images)==115
for row in images:assert row['implementationSha']==SHA and h(row['file'])==row['sha256'],row['file']
archives=[]
for name in ['native-archives.json','export-inspection.json','shell-export-inspection.json']:
 data=json.loads((R/name).read_text());records=data if isinstance(data,list) else data['records']
 for row in records:
  p=row.get('pptx',row.get('source'));assert h(p)==row['sha256'];archives.append({'file':p,'sha256':row['sha256']})
fail=json.loads((R/'fail-first-stream.json').read_text());assert fail['totals']=={'total':14,'pass':2,'fail':12,'skip':0,'cancelled':0}
assert fail['testSha256']==h(R/'attempts/fail-first-stream.test.js') if (R/'attempts/fail-first-stream.test.js').exists() else True
# Assertions introduced in the final freeze extend the original test file verbatim.
original=subprocess.check_output(['git','show','ec67315:test/v2-provider-stream-8g.test.js'])
current=pathlib.Path('test/v2-provider-stream-8g.test.js').read_bytes();assert current.startswith(original)
assert hashlib.sha256(original).hexdigest()==fail['testSha256']
result={'implementationSha':SHA,'acceptedBaseline':'0cab854bce04b862060829812a9ab6ff0b765fd9','reviewedPacket':'66a98665fba0213ec12e9fba1a1782b11297afc6','inventoryFiles':224,'primaryGroups':packet,'primaryTests':2801,'nativeSupplement':4,'allInventoryMarkersMatch':True,'rawCoordinatorJobs':runs,'allDurableLogsEqualRawBytes':True,'imagesVerified':115,'archivesVerified':archives,'failFirst':fail['totals'],'original14AssertionsUnchanged':True,'current18CaseFileExtendsOriginalVerbatim':True,'fullMatrixIndependentlyDuplicated':False,'liveModelCalls':0,'localInferenceCalls':0}
(E/'packet-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'files':224,'primaryTests':2801,'rawJobs':len(runs),'images':len(images),'archives':len(archives),'allChecksPassed':True}))
