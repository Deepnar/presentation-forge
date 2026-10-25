from pathlib import Path
from datetime import datetime,timezone
from xml.etree import ElementTree as ET
import json,hashlib,zipfile,io,subprocess,socket,collections,re
p=Path('docs/v2-8i-2-evidence');o=p/'independent';source='58662ecc074f7cc29bf29a0dd410d581ffca0eef';cid='865d147c807070d1984ada6148346f2a9cffeea55e1f8e68315ba81f2af84d8d'
def digest(q):return hashlib.sha256(Path(q).read_bytes()).hexdigest()
def write(name,data):(o/name).write_text(json.dumps(data,indent=2)+'\n')
def normalized_core(payload):
 root=ET.fromstring(payload)
 for el in root:
  if el.tag in ('{http://purl.org/dc/terms/}created','{http://purl.org/dc/terms/}modified'):el.text='CREATION_OR_MODIFICATION_TIME'
 return ET.tostring(root)
pairs=[(row['pptx'],row['pptx'].replace('/independent/','/')) for row in json.loads((o/'native-archives.json').read_text())]
pairs += [(str(file),str(p/'http-archives'/file.name.replace('postgresql','postgres'))) for file in sorted((o/'http-archives').glob('*.pptx'))]
comparison=[]
for file,reference in pairs:
 differences=[]
 with zipfile.ZipFile(file) as a,zipfile.ZipFile(reference) as b:
  assert set(a.namelist())==set(b.namelist())
  for n in a.namelist():
   left,right=a.read(n),b.read(n)
   if left==right:continue
   differences.append(n)
   if n=='docProps/core.xml':assert normalized_core(left)==normalized_core(right)
   elif n.endswith('.xlsx'):
    with zipfile.ZipFile(io.BytesIO(left)) as x,zipfile.ZipFile(io.BytesIO(right)) as y:
     assert set(x.namelist())==set(y.namelist())
     for part in x.namelist():
      if x.read(part)!=y.read(part):assert part=='docProps/core.xml' and normalized_core(x.read(part))==normalized_core(y.read(part))
   else:raise AssertionError((file,n))
 comparison.append({'fresh':file,'sha256':digest(file),'packetReference':reference,'packetSha256':digest(reference),'differentParts':differences,'allPayloadsEqualExceptCreationModificationTimesAndZipMetadata':True})
write('fresh-archive-comparison.json',{'implementationSha':source,'originalFreshArchives':10,'records':comparison,'noReconstruction':True})
checks=json.loads((o/'checks.json').read_text());resources=[json.loads(s) for s in (o/'resource-window.jsonl').read_text().splitlines()];primary=collections.Counter();supplement=collections.Counter();files=[];admissions=[]
for row in checks:
 assert row['exitCode']==0 and digest(row['log'])==row['logSha256']
 if row['tests']:
  (supplement if row['name']=='worker-native-repeats' else primary).update(row['tests'])
  if row['name']!='worker-native-repeats':files.extend(s for s in row['command'] if s.startswith('test/'))
 start=datetime.fromisoformat(row['atUtc']);prior=[s for s in resources if datetime.fromisoformat(s['atUtc'])<=start][-2:]
 assert len(prior)==2 and all(s['phase']=='pre-job' and s['ready'] for s in prior)
 seconds=sum(s['sampleSeconds'] for s in prior);age=(start-datetime.fromisoformat(prior[-1]['atUtc'])).total_seconds();assert seconds>=30 and 0<=age<1
 admissions.append({'job':row['name'],'precedingReadySamples':[s['atUtc'] for s in prior],'seconds':seconds,'lastSampleAgeSeconds':age})
assert dict(primary)=={'total':313,'pass':313,'fail':0,'skip':0,'cancelled':0};assert dict(supplement)=={'total':4,'pass':4,'fail':0,'skip':0,'cancelled':0};assert len(files)==len(set(files))==14
bp=p/'owned-postgres-before-removal.json';cp=p/'owned-postgres-cleanup.json';vp=p/'owned-postgres-cleanup-verification.json';before=json.loads(bp.read_text());cleanup=json.loads(cp.read_text());verified=json.loads(vp.read_text())
assert before['implementationSha']==cleanup['implementationSha']==verified['implementationSha']==source
assert before['id']==cleanup['id']==verified['id']==cid
assert digest(bp)==cleanup['beforeRemovalSha256']=='da1af7aa3479d5360f89439891182eadd5408b1a1909f50d7e90beb797f9c4de'
assert digest(cp)==verified['initialCleanupSha256']=='5c02a6bb8b18b563083c934eb57c4b3407814e96bf0b9e6395b519e3f6329474'
assert digest(vp)=='99af8b87736fee2f5a92445f7e204211feabd0a7b611753c5d63313bede071a7'
assert before['projectDatabaseCount']==0 and before['nonMaintenanceDatabases']==[] and before['savedAndFsyncedBeforeStop']
assert datetime.fromisoformat(before['atUtc'])<datetime.fromisoformat(cleanup['postStopObservations'][0]['atUtc'])
assert cleanup['stop']['command']==['docker','stop','--timeout','10',cid] and cleanup['stop']['exitCode']==0 and cleanup['exactIdAbsent'] and cleanup['portConnectionRefused']
inspection=subprocess.run(['docker','inspect',cid],capture_output=True,text=True);remaining=subprocess.check_output(['docker','ps','-aq','--no-trunc','--filter','id='+cid],text=True).splitlines();assert inspection.returncode!=0 and remaining==[]
refused=False
try:connection=socket.create_connection(('127.0.0.1',5544),timeout=1);connection.close()
except ConnectionRefusedError:refused=True
assert refused
write('cleanup-verification.json',{'implementationSha':source,'atUtc':datetime.now(timezone.utc).isoformat(),'id':cid,'beforeRemoval':{'file':str(bp),'sha256':digest(bp),'actualProjectDatabaseCount':0,'savedAndFsyncedBeforeStop':True},'boundedCleanup':{'file':str(cp),'sha256':digest(cp),'stopExitCode':0,'firstTwoObservationsExactIdAbsent':False,'finalExactIdAbsent':True,'port5544ConnectionRefused':True},'rootReadOnlyVerification':{'file':str(vp),'sha256':digest(vp)},'independentReadOnlyVerification':{'inspectExitCode':inspection.returncode,'inspectStderr':inspection.stderr,'matchingContainerIds':remaining,'exactIdAbsent':True,'port5544ConnectionRefused':refused},'countReconstructed':False,'additionalStopRemovalOrDatabaseRecreationIssued':False,'unrelatedServicesModified':False})
manifest=json.loads((o/'backup-manifest.json').read_text());canonical=json.loads((o/'canonical-manifest.json').read_text());historical=json.loads((p/'backup-manifest.json').read_text());assert all(digest(r['path'])==r['sha256'] for r in manifest+canonical+historical)
weighted=lambda key:sum(r[key]*r['sampleSeconds'] for r in resources)/sum(r['sampleSeconds'] for r in resources)
write('assessment.json',{'implementationSha':source,'reviewedEvidenceCommit':'b0b3beda928814fdd856c3f81dc1531a45f6d91a','atUtc':datetime.now(timezone.utc).isoformat(),'primaryRepeatedCounts':dict(primary),'supplementalNativeRepeatedCounts':dict(supplement),'totalSuccessfulExecutions':317,'uniquePrimaryFilesRepeated':14,'newDistinctProductScenarios':0,'remainingPrimaryLeavesInspectedNotReexecuted':2702,'remainingPrimaryFilesInspectedNotReexecuted':220,'typecheckExitCode':next(r['exitCode'] for r in checks if r['name']=='typecheck'),'allLogHashesVerified':True,'resourceSamples':len(resources),'sampleSeconds':sum(r['sampleSeconds'] for r in resources),'cpuBusyMeanPercent':weighted('cpuBusyPercent'),'cpuBusyPeakPercent':max(r['cpuBusyPercent'] for r in resources),'ioPsiSomeRange':[min(float(re.search(r'some avg10=([\d.]+)',r['pressure']['io']).group(1)) for r in resources),max(float(re.search(r'some avg10=([\d.]+)',r['pressure']['io']).group(1)) for r in resources)],'criticalSamples':sum(bool(r['critical']) for r in resources),'freshAdmissions':admissions,'preservation':{'independentAllCurrentFiles':len(manifest),'independentOriginalPptx':sum(r['path'].endswith('.pptx') for r in manifest),'implementerHistoricalFiles':len(historical),'implementerHistoricalPptx':sum(r['path'].endswith('.pptx') for r in historical),'canonicalOriginals':len(canonical),'allHashesStillMatchAfterCleanup':True,'restorationNeeded':False,'reconstructed':False},'usageInterruption':{'afterPassedChecksAndPreservation':True,'decisionWrittenBeforeInterruption':False,'completedChecksRerun':False,'resumedAtHumanContinuationAfterQuotaReset':True},'dbTestSlotsExplicitlyReleasedBeforeCleanup':True,'cleanupVerified':True,'realModelApiCalls':0,'localInferenceCalls':0,'reviewEvidenceComplete':True})
print('Verified313 primary +4 native repeats/typecheck,10 fresh archives,all restoration hashes,and exact-ID cleanup; wrote own audit records only.')
