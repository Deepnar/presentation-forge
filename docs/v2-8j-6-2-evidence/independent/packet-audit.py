import datetime,hashlib,json,re,subprocess,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path('.')
B=Path('docs/v2-8j-6-2-evidence')
I=B/'independent'
SHA='6068a2a7c5643a1958a140bcc60d0df6b891ccec'
PACKET='488fba2e1324429489326f482a86a9caef519911'
BASE='ecf82d3fa74bb7fcfc111e5cbeaf36bcb49fa47d'
checks=0;errors=[];notes=[]
def check(label,condition):
 global checks
 checks+=1
 if not condition:errors.append(label)
def read(p):return json.loads(Path(p).read_text())
def sha(data):return hashlib.sha256(data).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
check('pushed packet refs',git('rev-parse','HEAD')==git('rev-parse','origin/v2')==PACKET)
check('source ancestor of packet',subprocess.run(['git','merge-base','--is-ancestor',SHA,PACKET]).returncode==0)
check('source fixed UI-only delta',not git('diff','--name-only','65430f9b',SHA,'--','src','packages'))
check('accepted domain/renderer unchanged',not git('diff','--name-only',BASE,SHA,'--','src','packages','schema','package.json','package-lock.json','tsconfig.json'))
M=read(B/'manifest.json')
check('manifest source',M['implementationSha']==SHA and M['acceptedBaseline']==BASE)
check('selected22/22',M['selectedTotals']=={'total':22,'pass':22,'fail':0,'skip':0,'cancelled':0})
check('all root attempts35=25/10',M['allAttemptTotals']=={'total':35,'pass':25,'fail':10,'skip':0,'cancelled':0})
sourceFiles=git('diff','--name-only',BASE,SHA,'--','app','src','packages','test','tools/chrome-shot.mjs').splitlines()
check('complete final runtime/test path inventory',set(sourceFiles)==set(M['finalSourceHashes']))
for p,h in M['finalSourceHashes'].items():
 data=Path(p).read_bytes();check('final hash '+p,sha(data)==h)
 check('final frozen blob '+p,data==subprocess.check_output(['git','show',SHA+':'+p]))
for p in (B/'sources').glob('*.txt'):check('captured snapshot '+p.name,sha(p.read_bytes())==p.stem)
def totals(text):return {k:sum(map(int,re.findall(r'^(?:#|ℹ) '+label+r' (\d+)\s*$',text,re.M))) for k,label in [('total','tests'),('pass','pass'),('fail','fail'),('skip','skipped'),('cancelled','cancelled')]}
def passed(text):return re.findall(r'^ok \d+ - (.+)$',text,re.M)+re.findall(r'^✔ (.+) \([\d.]+ms\)$',text,re.M)
for name,counts in M['attempts'].items():
 record=read(B/(name+'.json'));text=(B/(name+'.tap')).read_text()
 check('actual counts '+name,totals(text)==counts)
 check('no timeout '+name,not record['timedOut'])
 check('recorded process exit '+name,record['exitCode']==(0 if not counts['fail'] else 1))
for name,row in M['selected'].items():
 check('selected gate '+name,read(B/(name+'.json'))==row)
 check('gate selected count '+name,len(row['selection'])==row['tests']['pass']==row['tests']['total'])
 check('union log '+name,totals(Path(row['log']).read_text())==row['tests'])
 for label,selection in row['selection'].items():
  invocation=read(selection['invocation']);check('leaf really passed '+label,label in passed(Path(invocation['log']).read_text()))
def bodies(text):
 starts=list(re.finditer(r"^(test|check)\('([^']+)'",text,re.M));return {m[2]:text[m.start():starts[n+1].start() if n+1<len(starts) else len(text)].strip() for n,m in enumerate(starts)}
lineage=read(B/'leaf-lineage.json');check('22 lineage entries',len(lineage)==22)
for row in lineage:
 old=Path(row['originalSnapshot']).read_bytes();invocation=read(row['invocation']);key=row['name'].removeprefix('Native export Chrome: ')
 check('original invocation snapshot '+row['name'],sha(old)==invocation['sourceHashes'][row['file']])
 ob=bodies(old.decode());nb=bodies(Path(row['file']).read_text())
 check('selected exact body '+row['name'],key in ob and key in nb and ob[key]==nb[key])
for n in range(1,7):
 record=read(B/f'build-{n:02}.json');check('build exit0 '+str(n),record['exitCode']==0 and not record['timedOut'])
finalBuild=read(B/'build-06.json')
for p,h in M['finalSourceHashes'].items():
 if p.startswith('app/web/'):
  check('final web build captured '+p,finalBuild['sourceHashes'].get(p)==h)
for p,h in read(I/'dialog-short-zoom-after.json')['distHashes'].items():check('actual tested final dist '+p,sha(Path(p).read_bytes())==h)
for p,h in read(I/'body-boundaries.json')['sourceHashes'].items():check('body challenge unchanged applicability '+p,sha(Path(p).read_bytes())==h)
check('body2/2',read(I/'body-boundaries.json')['totals']=={'passed':2,'failed':0,'skipped':0,'cancelled':0})
check('initial browser failed',read(I/'dialog-short-zoom.json')['exitCode']==1 and read(I/'dialog-short-zoom.json')['totals']['failed']==1)
check('corrected browser1/1 four phases',read(I/'dialog-short-zoom-after.json')['exitCode']==0 and read(I/'dialog-short-zoom-after.json')['totals']=={'cases':1,'assertionPhases':4,'passed':1,'failed':0,'skipped':0,'cancelled':0})
for sub in ['dialog-short-zoom','dialog-short-zoom-after']:
 cleanup=read(I/sub/'cleanup.json');check('owned fixture removed '+sub,cleanup['fixtureDirectoryRemoved'] and cleanup['pageClosed'] and cleanup['fixtureStopped'])
for p in ['normal320-short','zoom200-short','corrected-desktop']:
 row=read(I/'dialog-short-zoom-after'/(p+'.json'));check('readable disclosure '+p,row['disclosure']['clientHeight']>0)
 check('no browser errors '+p,not row['errors'])
 for action in row['reachability']['actions']:
  b,d=action['bounds'],action['dialog'];check('reachable action '+p+' '+action['label'],b['y']>=d['y']-.5 and b['bottom']<=d['bottom']+.5 and b['x']>=d['x']-.5 and b['right']<=d['right']+.5)
canvas=read(B/'browser/attempt-LnAVFW/canvas-attempt.json');check('settled canvas delta0',canvas['before']==canvas['after'])
artifacts=read(B/'downloaded-artifacts.json')['artifacts'];check('ten retained downloaded artifacts',len(artifacts)==10)
zipSummary=[]
for artifact in artifacts:
 p=Path(artifact['path']);data=p.read_bytes();check('download hash '+str(p),len(data)==artifact['bytes'] and sha(data)==artifact['sha256'])
 check('download is tracked '+str(p),subprocess.run(['git','ls-files','--error-unmatch',str(p)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0)
 with zipfile.ZipFile(p) as z:
  check('ZIP integrity '+str(p),z.testzip() is None)
  check('native presentation part '+str(p),'ppt/presentation.xml' in z.namelist())
  texts=[''.join(ET.fromstring(z.read(n)).itertext()) for n in z.namelist() if re.fullmatch(r'ppt/notesSlides/notesSlide\d+\.xml',n)]
  zipSummary.append({'path':str(p),'notesParts':len(texts),'hasRetainedTitle':any('Evidence 0' in t for t in texts),'hasRetainedUrl':any('https://example.org/0' in t for t in texts)})
qualified=next(row for row in zipSummary if row['path'].endswith('attempt-LnAVFW/downloads-1/Saved notes browser.pptx'))
check('actual downloaded qualified title and URL',qualified['hasRetainedTitle'] and qualified['hasRetainedUrl'])
fragments=read(B/'browser-background-fragments.json')['fragments'];check('four CRX fragments disclosed',len(fragments)==4 and all(row['magic']=='Cr24' for row in fragments))
for row in fragments:check('only classified current fragment absent '+row['path'],not Path(row['path']).exists())
state=read('docs/development-state.json');check('baseline and pending review preserved',state['acceptedBaseline']['sha']==BASE and state['implementationHead']['sha']==SHA and not state['activeMilestone']['accepted'] and state['activeMilestone']['reviewStatus']=='pending')
check('five gates passed',len(state['validation'])==5 and all(r['status']=='passed' and Path(r['evidence']).is_file() for r in state['validation']))
check('next candidate unauthorized',state['nextCandidate']['authorized'] is False)
rootGroups=read(B/'cleanup.json')['ownedGroups'];ownGroups=read(I/'runner-absence.json')['ownedGroups'];groups=set(rootGroups)|set(ownGroups.values());live=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  f=(p/'stat').read_text().rsplit(')',1)[1].split()
  if int(f[2]) in groups:live.append({'pid':int(p.name),'group':int(f[2])})
 except (OSError,ValueError,IndexError):pass
check('fresh root/reviewer process-group absence',not live)
result={'atUtc':datetime.datetime.now(datetime.UTC).isoformat(),'packetSha':PACKET,'implementationSha':SHA,'checks':checks,'errors':errors,'downloadedZipInspection':zipSummary,'freshOwnedGroupAbsence':{'groups':sorted(groups),'liveMembers':live},'method':'Read-only source/Git/retained logs/hash/ZIP XML/process identity audit, not product tests or new rendering. Original snapshots and selected bodies verified directly; early dirty tracked capture gap remains explicit.'}
(I/'packet-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'checks':checks,'errors':errors,'implementationSha':SHA,'packetSha':PACKET}));raise SystemExit(bool(errors))
