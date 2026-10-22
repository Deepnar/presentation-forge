import hashlib, json, pathlib, re, shutil, subprocess
ROOT=pathlib.Path('docs/v2-pptx-id-evidence'); OUT=ROOT/'independent'
SHA='45c2c4c84581f41d1b2ef4ca61d15c067b8562a9'
def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
plan=json.loads((ROOT/'validation-plan.json').read_text())
tests=json.loads((ROOT/'native-pptx.json').read_text())
assert plan['implementationSha']==tests['implementationSha']==SHA
assert tests['exitCode']==0 and tests['tests']=={'total':376,'pass':376,'fail':0,'skip':0,'cancelled':0}
log=pathlib.Path(tests['log']).read_text()
assert set(re.findall(r'^# forge-test-file "([^"]+)"$',log,re.M))==set(plan['focused'])
for key,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]:
    assert int(re.findall(r'^# '+label+r' (\d+)\s*$',log,re.M)[-1])==tests['tests'][key]
for name in ['typecheck','benchmark-50','native-raster','native-archive','frontend-visual']:
    record=json.loads((ROOT/(name+'.json')).read_text())
    assert record['implementationSha']==SHA and record['exitCode']==0
    assert pathlib.Path(record['log']).is_file()
new=json.loads((ROOT/'benchmark-results.json').read_text())
old=json.loads(pathlib.Path('docs/v2-8g-evidence/benchmark-results.json').read_text())
assert len(new['cells'])==50 and set(new['cells'])==set(old['cells'])
for key,cell in new['cells'].items():
    assert not cell['l1']
    assert {k:v for k,v in cell.items() if k!='pptxBytes'}=={k:v for k,v in old['cells'][key].items() if k!='pptxBytes'}
assert new['counterfactuals']==old['counterfactuals'] and new['invariance']==old['invariance']
visual=json.loads((ROOT/'frontend-visual.json').read_text())
for image in visual['images']+[visual['detailImage']]: assert digest(image['file'])==image['sha256']
edge_log=(OUT/'renamed-edge.log').read_text()
assert re.search(r'^# tests 5$',edge_log,re.M) and re.search(r'^# pass 5$',edge_log,re.M)
assert all(re.search(r'^# '+label+r' 0$',edge_log,re.M) for label in ['fail','skipped','cancelled'])
subprocess.run(['git','diff','--quiet',SHA,'--','packages','src','app','test','tools','docs/development-state.schema.json'],check=True)
resources=[json.loads(line) for line in pathlib.Path('out/v2-pptx-id-review/resource-window.jsonl').read_text().splitlines()]
assert all(not row['critical'] for row in resources)
shutil.copyfile('out/v2-pptx-id-review/resource-window.jsonl',OUT/'resource-window.jsonl')
own=json.loads((OUT/'execution.json').read_text())
images=json.loads((OUT/'archive.json').read_text())['artifacts']
result={'implementationSha':SHA,'reviewedHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceDeltaAfterCandidate':[],
 'rootPacketInspected':{'tests':tests['tests'],'completeFiles':len(plan['focused']),'typecheck':'passed evidence inspected; not independently rerun','benchmark':{'cells':50,'l1Findings':0,'allQualityFieldsExceptArchiveByteLengthMatchAcceptedV28G':True,'counterfactualsAndInvarianceEqual':True},'nativeArchiveAndRasterRecords':'passed; independently challenged with fresh and same-archive evidence'},
 'independentPrimaryTests':own['records'][0]['tests'],'independentPrimaryEntryFiles':13,'renamedSupplementalScriptRepeat':{'tests':5,'pass':5,'fail':0,'skip':0,'cancelled':0,'overlap':5,'reason':'edge.test.mjs renamed edge-check.mjs to avoid default test discovery; unchanged five-case script rerun; original271log and command retained'},
 'renamedScriptSha256':digest(OUT/'edge-check.mjs'),'allAcknowledgedIndependentLeafExecutions':276,'independentDistinctChecksReported':271,'nativeCommandSeconds':own['records'][1]['seconds'],'archiveCommandSeconds':own['records'][2]['seconds'],
 'visualInspection':{'freshRasters':9,'distinctPixelImagesInspected':3,'pixelComparisons':6,'changedChannels':0,'dimensions':[1467,825],'details':'All three full-size fresh pages inspected; exact pixel equality establishes same views for all nine variants. Existing enlarged left-table detail and PDF text resolve a mistaken initial full-slide interpretation; both tables on slides2/3 are present. No new clipping, overlap or shift observed.'},
 'headroom':{'guardSamples':len(resources),'allSamplesNoncritical':True,'allPreJobSamplesReady':all(row['ready'] for row in resources if row['phase']=='pre-job'),'maxCpuBusyPercent':max(row['cpuBusyPercent'] for row in resources),'minAvailableKiB':min(row['availableKiB'] for row in resources),'globalIoPsiProvenance':'unresolved; raw observations retained'},
 'exclusions':['PostgreSQL, fault, browser and production build not rerun under explicit renderer-only applicability','Interactive Microsoft PowerPoint selection/edit/save/reopen unexecuted','Standing BYOK en_IN locale9pass/1fail historical, not rerun and not waived','Legacy renderer identity risk and mixed-run SVG fidelity remain separate roadmap entries','No real model API call, local inference, content-quality evaluation, service or deployment'],
 'originalUntrackedPathsUntouched':['.agents/','PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md','PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md'],
 'findings':[],'decisionRecommendation':'ACCEPT the bounded canonical-renderer shape-ID correction only',
 'evidenceHashes':[{'path':str(p),'sha256':digest(p)} for p in [ROOT/'native-pptx.json',pathlib.Path(tests['log']),ROOT/'typecheck.json',ROOT/'benchmark-50.json',ROOT/'benchmark-results.json',ROOT/'archive-comparison.json',ROOT/'raster-comparison.json',OUT/'execution.json',OUT/'archive.json',OUT/'raster.json',OUT/'tests.log',OUT/'native.log',OUT/'archive.log',OUT/'renamed-edge.log',OUT/'protocol.log']]}
(OUT/'assessment.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'rootTestsInspected':376,'rootFiles':19,'benchmarkCellsAudited':50,'independentPrimaryTests':271,'overlappingRenamedRepeat':5,'sourceDeltaAfterCandidate':[],'findings':[]}))
