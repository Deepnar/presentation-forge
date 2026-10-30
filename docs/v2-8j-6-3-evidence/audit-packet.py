from pathlib import Path
import hashlib,json,re,subprocess
base=Path('docs/v2-8j-6-3-evidence');manifest=json.loads((base/'manifest.json').read_text());checks=0

def check(value,detail):
 global checks
 if not value:raise AssertionError(detail)
 checks+=1

def digest(data):return hashlib.sha256(data).hexdigest()
for file in base.glob('*.json'):
 record=json.loads(file.read_text())
 if 'sourceHashes' not in record:continue
 check(record['timedOut'] is False,str(file)+' watchdog')
 for name,h in record['sourceHashes'].items():
  snap=Path(record['sourceSnapshotDirectory'])/(h+'.txt');check(snap.is_file() and digest(snap.read_bytes())==h,str(file)+' '+name+' original snapshot')
for name,h in manifest['finalSourceHashes'].items():
 check(digest(subprocess.check_output(['git','show',manifest['implementationSha']+':'+name]))==h,name+' frozen source')
for gate,record in manifest['selected'].items():
 check(record['tests']['total']==len(record['selection']),gate+' totals')
 for leaf,selected in record['selection'].items():
  original=json.loads(Path(selected['invocation']).read_text());log=Path(original['log']).read_text()
  check(any(line.startswith('✔ '+leaf+' (') for line in log.splitlines()),leaf+' executed success')
  check(Path(selected['file']).is_file(),leaf+' file')
check(subprocess.check_output(['git','diff','--name-only','6068a2a7',manifest['implementationSha'],'--','test/v2-citations-8j.test.js'],text=True).strip()=='','accepted existing13 unchanged (not contemporaneously captured)')
for original,kind in [('domain-01','domain'),('transport-01','transport')]:
 record=json.loads((base/(original+'.json')).read_text())
 for name,h in record['sourceHashes'].items():
  if name.startswith(('src/projects/','packages/projects/')) or kind=='transport' and name in ['app/server/index.js','app/server/v2-citation-view-routes.js']:
   check(Path(name).is_file() and digest(Path(name).read_bytes())==h,original+' unchanged runtime '+name)
build=json.loads((base/'build-final-02.json').read_text())
for name,h in manifest['finalSourceHashes'].items():
 if name.startswith(('app/web/','packages/projects/')):check(build['sourceHashes'].get(name)==h,'final build '+name)
result={'kind':'lightweight-evidence-audit','implementationSha':manifest['implementationSha'],'checks':checks,'errors':0,'command':'python docs/v2-8j-6-3-evidence/audit-packet.py','scope':'Original captured bytes, frozen runtime/test hashes, successful selected leaves, unchanged accepted existing13 source and final build applicability. Does not rerun product tests or prove acceptance.'}
(base/'packet-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
