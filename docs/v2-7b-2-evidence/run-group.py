import datetime,json,pathlib,subprocess,sys
plan=json.loads(pathlib.Path('docs/v2-7b-2-evidence/validation-plan.json').read_text());group=sys.argv[1]
out=pathlib.Path('out/v2-7b-2-validation')/(group+'-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));out.mkdir(parents=True);print(out,flush=True)
head=json.loads(pathlib.Path('docs/v2-7b-2-evidence/validation-plan.json').read_text())['implementationSha'];subprocess.run(['git','merge-base','--is-ancestor',head,'HEAD'],check=True);files=plan[group]
jobs=[('bulk',files)] if group=='bulk' else [(pathlib.Path(f).stem,[f]) for f in files]
records=[]
for name,selected in jobs:
 cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','30m' if group=='bulk' else '15m','node','--test','--test-concurrency=4' if group=='bulk' else '--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs',*selected]
 with (out/(name+'.tap')).open('w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
 records.append({'name':name,'implementationSha':head,'command':cmd,'files':selected,'exitCode':r.returncode});(out/'runs.json').write_text(json.dumps(records,indent=2)+'\n')
 print(name,'exit',r.returncode,flush=True)
 if r.returncode: print((out/(name+'.tap')).read_text()[-5000:]);sys.exit(r.returncode)
