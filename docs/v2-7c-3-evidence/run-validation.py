import datetime,json,pathlib,shutil,subprocess,time,sys,os,hashlib
root=pathlib.Path('docs/v2-7c-3-evidence');out=pathlib.Path('out/v2-7c-3-validation');sha=json.loads((root/'validation-plan.json').read_text())['implementationSha'];records=[]
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
def copyfresh(label,since):
 target=out/label;target.mkdir(exist_ok=True);index=[]
 for folder in pathlib.Path('docs').glob('v2-*-evidence'):
  if folder==root:continue
  for source in folder.glob('*.png'):
   if source.stat().st_mtime>=since:
    destination=target/(folder.name+'--'+source.name);shutil.copy2(source,destination);index.append({'source':str(source),'file':str(destination),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
 (target/'index.json').write_text(json.dumps(index,indent=2)+'\n')
tap('focused-final',['test/v2-editor-toolbar-chrome-7c.test.js','test/v2-edit-chrome-7a.test.js'])
run('bulk-driver',['python3',str(root/'run-group.py'),'bulk'])
serial_start=run('serial-driver',['python3',str(root/'run-group.py'),'serial'])
copyfresh('sqlite-regression-images',serial_start)
shutil.copy2('out/v2-7b-2-validation/browser/handoff.pptx',out/'browser/handoff.pptx')
for file in root.glob('*.png'):
 target=out/'sqlite-toolbar-images';target.mkdir(exist_ok=True);shutil.copy2(file,target/file.name)
for file in (out/'browser').glob('*.json'):
 target=out/'sqlite-toolbar-measurements';target.mkdir(exist_ok=True);shutil.copy2(file,target/file.name)
run('postgres-driver',['python3',str(root/'run-group.py'),'postgres'])
run('command-driver',['python3',str(root/'run-final-steps.py')])
catalog_root=pathlib.Path('docs/v2-7c-2-evidence')
pg_catalog_start=time.time()
tap('postgres-toolbar-final',['test/v2-editor-toolbar-chrome-7c.test.js'],{'FORGE_TOOLBAR_TEST_BACKEND':'postgres'})
tap('postgres-catalog-final',['test/v2-project-catalog-chrome-7c.test.js'],{'FORGE_CATALOG_TEST_BACKEND':'postgres'})
copyfresh('postgres-catalog-images',pg_catalog_start)
tap('postgres-http-final',['test/v2-project-catalog-http-7c.test.js'],{'FORGE_CATALOG_TEST_BACKEND':'postgres'})
pg_start=time.time();tap('postgres-covers-final',['test/v2-project-covers-chrome-7c.test.js'],{'FORGE_COVERS_TEST_BACKEND':'postgres'});copyfresh('postgres-cover-images',pg_start)
tap('postgres-cover-http-final',['test/v2-project-covers-http-7c.test.js'],{'FORGE_COVERS_TEST_BACKEND':'postgres'})
tap('hosted-import-final',[str(root/'hosted-import-check.mjs')])
tap('byok-locale-final',['test/byok-budget.test.js'],{'LC_ALL':'en_IN.UTF-8'},1)
run('native-review',['timeout','--signal=TERM','--kill-after=10s','15m','node',str(root/'native-review.mjs')])
run('shell-native',['timeout','--signal=TERM','--kill-after=10s','15m','node',str(root/'shell-native.mjs')])
print('All ordered validation completed; visual inspection/evidence finalization/review remain.',flush=True)
