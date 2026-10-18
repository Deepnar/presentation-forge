import datetime,json,pathlib,shutil,subprocess,sys,os,hashlib
root=pathlib.Path('docs/v2-8a-evidence');out=pathlib.Path('out/v2-8a-validation');sha=json.loads((root/'validation-plan.json').read_text())['implementationSha'];records=[]
env={**os.environ,'LC_ALL':'C.UTF-8','TEST_PG_URL':'postgres://postgres:probe@127.0.0.1:5544/postgres'}
def run(name,args,changes=None,expected=0):
 start=datetime.datetime.now(datetime.timezone.utc);cmd=['nice','-n','10','ionice','-c','2','-n','7',*args]
 print(name,'START',start.isoformat(),flush=True)
 with (out/(name+'.log')).open('w') as log:r=subprocess.run(cmd,env={**env,**(changes or {})},stdout=log,stderr=subprocess.STDOUT)
 records.append(dict(name=name,implementationSha=sha,command=cmd,exitCode=r.returncode,atUtc=start.isoformat(),durationSeconds=round((datetime.datetime.now(datetime.timezone.utc)-start).total_seconds(),6)))
 (out/'coordinator.json').write_text(json.dumps(records,indent=2)+'\n');print(name,'EXIT',r.returncode,flush=True)
 if r.returncode!=expected:print((out/(name+'.log')).read_text()[-4500:],flush=True);sys.exit(r.returncode or 1)
 return start.timestamp()
def tap(name,files,changes=None,expected=0):
 run(name,['timeout','--signal=TERM','--kill-after=10s','15m','node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',*files],changes,expected)
 shutil.copy2(out/(name+'.log'),out/(name+'.tap'))
tap('focused-final',['test/v2-tools-8a.test.js','test/v2-context-8a.test.js'])
run('bulk-driver',['python3',str(root/'run-group.py'),'bulk'])
serial_start=run('serial-driver',['python3',str(root/'run-group.py'),'serial'])
target=out/'regression-images';target.mkdir(exist_ok=True);index=[]
for folder in pathlib.Path('docs').glob('v2-*-evidence'):
 if folder==root:continue
 for source in folder.glob('*.png'):
  if source.stat().st_mtime>=serial_start:
   destination=target/(folder.name+'--'+source.name);shutil.copy2(source,destination);index.append({'source':str(source),'file':str(destination),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
(target/'index.json').write_text(json.dumps(index,indent=2)+'\n')
measure= root/'measurements';measure.mkdir(exist_ok=True);provenance=[]
sources=[*pathlib.Path('docs/v2-7a-evidence').glob('canvas-*.json'),pathlib.Path('docs/v2-7a-evidence/large-deck.json')]
for directory in ['out/v2-7b-1-validation/browser','out/v2-7b-2-validation/browser','out/v2-7c-1-validation/browser','out/v2-7c-2-validation/browser','out/v2-7c-3-validation/browser']:
 sources.extend(pathlib.Path(directory).glob('*.json'))
for source in sources:
 if source.stat().st_mtime>=serial_start:
  destination=measure/(source.parts[1]+'--'+source.name);shutil.copy2(source,destination);provenance.append({'source':str(source),'path':str(destination),'implementationSha':sha,'backend':'SQLite production projects or standalone fixture','sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
(measure/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
run('postgres-driver',['python3',str(root/'run-group.py'),'postgres'])
run('command-driver',['python3',str(root/'run-final-steps.py')])
tap('headless-final',[str(root/'headless-check.mjs')])
tap('byok-locale-final',['test/byok-budget.test.js'],{'LC_ALL':'en_IN.UTF-8'},1)
run('native-review',['timeout','--signal=TERM','--kill-after=10s','15m','node',str(root/'native-review.mjs')])
run('shell-native',['timeout','--signal=TERM','--kill-after=10s','15m','node',str(root/'shell-native.mjs')])
print('Ordered validation completed. Visual inspection and independent review remain.',flush=True)
