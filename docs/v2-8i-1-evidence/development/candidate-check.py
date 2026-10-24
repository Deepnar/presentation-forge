import sys
sys.dont_write_bytecode=True
sys.path.insert(0,'docs/v2-8i-1-evidence')
import datetime,hashlib,json,pathlib,subprocess,os
os.environ['FORGE_VALIDATION_OUT']='out/v2-8i-1-development'
from quiet_window import Window
out=pathlib.Path(os.environ['FORGE_VALIDATION_OUT'])
sha=json.loads(pathlib.Path('docs/v2-8i-1-evidence/validation-plan.json').read_text())['implementationSha']
subprocess.run(['git','diff','--quiet',sha,'--','app','test','src','packages','tools'],check=True)
Window().wait(30)
cmd=['nice','-n','10','ionice','-c','2','-n','7','timeout','--signal=TERM','--kill-after=10s','5m','node','--test','--test-concurrency=1','--test-reporter=./tools/validated-tap.mjs','test/v2-conversation-http-8i.test.js','test/dev-protocol.test.js']
record={'implementationSha':sha,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':cmd,'classification':'Development affected-suite check, distinct from the full acceptance matrix.'}
with (out/'candidate.log').open('w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
record['exitCode']=r.returncode
(out/'candidate-execution.json').write_text(json.dumps(record,indent=2)+'\n')
print('CANDIDATE EXIT',r.returncode,flush=True)
raise SystemExit(r.returncode)
