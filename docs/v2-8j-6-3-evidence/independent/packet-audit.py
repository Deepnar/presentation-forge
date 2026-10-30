import json,hashlib,re,subprocess,datetime
from pathlib import Path
root=Path.cwd();base=root/'docs/v2-8j-6-3-evidence';out=base/'independent';sha='8d34c95faf7a5c4d9e04dec590b362895d4fd283';accepted='6068a2a7c5643a1958a140bcc60d0df6b891ccec'
checks=[]
def check(name,value,detail=None):checks.append({'check':name,'passed':bool(value),**({'detail':detail} if detail is not None else {})})
def git(*args):return subprocess.check_output(['git',*args],text=True,cwd=root).strip()
def read(p):return json.loads((root/p).read_text())
def digest(b):return hashlib.sha256(b).hexdigest()
def leaves(text):return [(m.group(1),m.group(2)) for line in text.split('\nℹ tests',1)[0].splitlines() if (m:=re.match(r'^([✔✖]) ((?:Sources |Citation |Independent ).*?) \([\d.]+ms\)$',line))]
m=read('docs/v2-8j-6-3-evidence/manifest.json')
packet=git('rev-parse','HEAD');check('implementation-pushed-ancestry',subprocess.run(['git','merge-base','--is-ancestor',sha,'origin/v2'],cwd=root).returncode==0,{'implementation':sha,'localOrigin':git('rev-parse','origin/v2'),'packet':packet})
check('manifest-implementation',m['implementationSha']==sha);check('manifest-baseline',m['acceptedBaseline']==accepted)
check('approved-direction-precedes-runtime',subprocess.run(['git','merge-base','--is-ancestor','ec2bb48967fcef10816b23c4f8e5c18f48338ab8','719498cd4983392ec4ef6423eb38f85d6caaf557'],cwd=root).returncode==0)
for path,h in m['finalSourceHashes'].items():
 b=subprocess.check_output(['git','show',sha+':'+path],cwd=root);check('frozen-source:'+path,digest(b)==h)
 check('working-source:'+path,digest((root/path).read_bytes())==h)
all_counts={'total':0,'pass':0,'fail':0,'skip':0,'cancelled':0};invocations={}
for name,expected in m['attempts'].items():
 p=base/(name+'.json');d=json.loads(p.read_text());invocations[name]=d;text=(root/d['log']).read_text();entries=leaves(text)
 check('invocation-has-finite-outcome:'+name,not d['timedOut'] and d['exitCode'] in [0,1])
 if name!='browser-keyboard-02':
  actual={'total':len(entries),'pass':sum(s=='✔' for s,_ in entries),'fail':sum(s=='✖' for s,_ in entries),'skip':0,'cancelled':0};check('attempt-leaves:'+name,actual==expected,actual)
  for k,v in actual.items():all_counts[k]+=v
 else:check('prebody-harness-distinct',not entries and 'SyntaxError' in text)
 for path,h in d['sourceHashes'].items():check('original-snapshot:'+name+':'+path,digest((root/d['sourceSnapshotDirectory']/(h+'.txt')).read_bytes())==h)
check('all-product-attempts',all_counts==m['productAttempts'],all_counts)
selected=0
for gate,v in m['selected'].items():
 check('gate-artifact:'+gate,read('docs/v2-8j-6-3-evidence/'+gate+'.json')==v)
 check('gate-count:'+gate,len(v['selection'])==v['tests']['total']==v['tests']['pass'] and v['exitCode']==0)
 for name,pick in v['selection'].items():
  d=read(pick['invocation']);text=(root/d['log']).read_text();check('selected-leaf:'+name,leaves(text).count(('✔',name))==1)
  check('selected-file-in-argv:'+name,pick['file'] in d['argv'])
 selected+=len(v['selection'])
check('selected-total',selected==36 and m['selectedTests']=={'total':36,'pass':36,'fail':0,'skip':0,'cancelled':0},selected)
# Verify source lineage without reconstructing missing contemporaneous bytes.
old=invocations['domain-01'];oldpath=base/'sources'/(old['sourceHashes']['test/v2-citation-view-8j.test.js']+'.txt');oldtext=oldpath.read_text();current=(root/'test/v2-citation-view-8j.test.js').read_text();check('new-domain-seven-unchanged',current.startswith(oldtext.rstrip()),'First seven original cases precede only appended eighth case.')
legacy='test/v2-citations-8j.test.js';check('existing-thirteen-no-git-delta',git('diff','--name-only',accepted,sha,'--',legacy)=='','No original pre-execution hash exists for this unchanged accepted file; no capture claim inferred.')
oldbrowser=invocations['browser-01'];oldsource=(base/'sources'/(oldbrowser['sourceHashes']['test/v2-citation-view-chrome-8j.test.js']+'.txt')).read_text();now=(root/'test/v2-citation-view-chrome-8j.test.js').read_text()
def browser_case(text,name):
 start=text.index("check('"+name);end=text.find("\ncheck('",start+1);return text[start:end if end>=0 else len(text)].rstrip()
name='pagination clear and late route/session reads never revive private source rows';check('selected-old-browser-case-unchanged',browser_case(oldsource,name)==browser_case(now,name))
for n in ['build-01','build-final-02']:
 d=read('docs/v2-8j-6-3-evidence/'+n+'.json');check('build-exit:'+n,d['exitCode']==0 and not d['timedOut'])
 for path,h in d['sourceHashes'].items():check('build-source-snapshot:'+n+':'+path,digest((root/d['sourceSnapshotDirectory']/(h+'.txt')).read_bytes())==h)
b=read('docs/v2-8j-6-3-evidence/build-final-02.json');frontend=['app/web/src/components/SavedSources.jsx','app/web/src/components/SceneViewer.jsx','app/web/src/lib/citationView.js','packages/projects/citation-view-contract.js'];check('final-build-ui-hashes',all(b['sourceHashes'][p]==m['finalSourceHashes'][p] for p in frontend))
ind=read('docs/v2-8j-6-3-evidence/independent/browser-long-selection-01.json');it=(root/ind['log']).read_text();check('independent-new-browser-pass',ind['invocationHead']==sha and ind['exitCode']==0 and not ind['timedOut'] and len(leaves(it))==1 and leaves(it)[0][0]=='✔')
for path,h in ind['sourceHashes'].items():check('independent-source-snapshot:'+path,digest((root/ind['sourceSnapshotDirectory']/(h+'.txt')).read_bytes())==h)
observed=read('docs/v2-8j-6-3-evidence/independent/long-selection-6aaPk2/observations.json');check('independent-phase-completion',len(observed['phases'])==5 and observed['phases'][-1]['rows']==25)
check('independent-hook-cleanup',observed['cleanup']=={'browserClosed':True,'fixtureStopped':True})
for path in [base/'browser/attempt-GodMZm/sources-desktop.png',base/'browser/attempt-24U0HT/sources-narrow.png',base/'browser/attempt-24U0HT/sources-short-reflow.png',*(base/'independent/long-selection-6aaPk2').glob('*.png')]:check('inspected-png-present:'+str(path.relative_to(root)),path.stat().st_size>0)
# Fresh read-only group absence: no stop/repeated cleanup or old-service reconstruction.
groups=read('docs/v2-8j-6-3-evidence/root-cleanup.json')['rootOwnedGroups']+[{'invocation':'independent/browser-long-selection-01.json','pgid':ind['ownedProcessGroup']}]
for g in groups:
 members=[]
 for p in Path('/proc').iterdir():
  if p.name.isdigit():
   try:
    s=(p/'stat').read_text().rsplit(')',1)[1].split()
    if int(s[2])==g['pgid']:members.append(int(p.name))
   except (OSError,ValueError,IndexError):pass
 check('fresh-owned-group-absence:'+g['invocation'],not members,{'pgid':g['pgid'],'members':members})
result={'reviewedImplementationSha':sha,'acceptedBaseline':accepted,'packetSha':packet,'recordedAt':datetime.datetime.now(datetime.UTC).isoformat(),'kind':'independent-source-evidence-consistency-audit','totals':{'checks':len(checks),'pass':sum(c['passed'] for c in checks),'errors':sum(not c['passed'] for c in checks)},'checks':checks,'productAttempts':all_counts,'selectedProductCases':selected,'independentProductCases':{'total':1,'pass':1,'fail':0,'skip':0,'cancelled':0},'limitations':['This audit executes no product test; it inspects retained original logs/source snapshots and current local Git ancestry/bytes.','Existing13 accepted J4 test bodies were not contemporaneously captured by root; unchanged Git source is inspected rather than retroactively captured.','Selected cases are an executed-leaf union; old browser pagination case is on earlier build with later changed stream storage/pointer guards independently covered.','Cleanup hook completion plus fresh17process-group absences are checked; no pre-removal database state or exact browser-profile deletion is reconstructed.']}
(out/'packet-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['totals']));print(json.dumps([c for c in checks if not c['passed']],indent=2))
raise SystemExit(1 if result['totals']['errors'] else 0)
