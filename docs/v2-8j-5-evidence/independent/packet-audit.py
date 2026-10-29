import hashlib, json, re, subprocess
from pathlib import Path

base = Path('docs/v2-8j-5-evidence')
frozen = 'f6487737557c20d481cbc3e84216d7144bb116e8'
errors = []; checks = []
def check(value, label):
    (checks if value else errors).append(label)
def read(name): return json.loads((base / (name + '.json')).read_text())
def digest(data): return hashlib.sha256(data).hexdigest()
def summary(path):
    text = Path(path).read_text()
    fields = {'total':'tests', 'pass':'pass', 'fail':'fail', 'skip':'skipped', 'cancelled':'cancelled'}
    return {k: sum(map(int, re.findall(r'^(?:#|ℹ) ' + v + r' (\d+)\s*$', text, re.M))) for k,v in fields.items()}
manifest = read('source-manifest')
check(manifest['implementationSha'] == frozen, 'manifest exact frozen source')
for path, expected in manifest['sourceHashes'].items():
    check(digest(Path(path).read_bytes()) == expected, 'current source hash: ' + path)
    check(digest(subprocess.check_output(['git','show',frozen+':'+path])) == expected, 'committed frozen source hash: ' + path)

selection = ['copy-contract-final','copy-sqlite-final','copy-postgres-final','copy-transport-final','copy-browser-final']
selected = {key:0 for key in ['total','pass','fail','skip','cancelled']}
for name in selection:
    record = read(name)
    check(record['implementationSha'] == frozen and record['exitCode'] == 0 and not record['timedOut'], 'complete final gate: ' + name)
    check(summary(record['log']) == record['tests'], 'raw summary totals: ' + name)
    for key,value in record['tests'].items(): selected[key] += value
    markers = re.findall(r'^# forge-test-file (".*")$', Path(record['log']).read_text(), re.M)
    check(sorted(map(json.loads, markers)) == sorted(record['files']), 'canonical complete file markers: ' + name)
check(selected == {'total':39,'pass':39,'fail':0,'skip':0,'cancelled':0}, 'selected39/39 independent recomputation')
check(selected == manifest['selectedCompleted'], 'manifest selected counts')

applicability = read('source-applicability')
differences = {}
for name in ['copy-contract-final','copy-sqlite-final','copy-postgres-final','copy-http-cli-final','copy-router-final','copy-browser-final']:
    record = read(name)
    changed = sorted(path for path,h in record['sourceHashes'].items() if digest(Path(path).read_bytes()) != h)
    differences[name] = changed
    check(changed == sorted(applicability['runs'][name]['capturedHashDifferences']), 'precise captured final differences: ' + name)
    for path,h in record['sourceHashes'].items():
        if path not in record['trackedDelta']:
            check(digest(subprocess.check_output(['git','show',record['invocationHead']+':'+path])) == h, 'clean invocation bytes: '+name+':'+path)
check(not subprocess.check_output(['git','diff','--name-only','26a1e86fb2be505b4dd382515e15ff9bd38e19b0',frozen,'--','src','app','packages'],text=True).strip(), 'runtime unchanged after adoption corrections')
typed = read('typecheck')
check(typed['testedImplementationSha'] == typed['invocationHead'] == 'd4556948a8febda09bb2c1ddab9912cfeb772bc3' and typed['exitCode'] == 0, 'typecheck actual invocation and exit')
check(not subprocess.check_output(['git','diff','--name-only',typed['invocationHead'],frozen,'--','packages','tsconfig.json','test/v2-generated-usage.test.ts'],text=True).strip(), 'typecheck unchanged typed inputs only')
check(read('copy-postgres-final')['testedImplementationSha'] == read('copy-postgres-final')['invocationHead'], 'PostgreSQL actual invocation attribution')
attempts = read('attempts'); totals = dict.fromkeys(selected,0)
for attempt in attempts['attempts']:
    check(summary(attempt['log']) == attempt['tests'], 'retained raw attempt totals: '+attempt['id'])
    for key,value in attempt['tests'].items(): totals[key] += value
check(totals == {'total':114,'pass':102,'fail':12,'skip':0,'cancelled':0}, 'all-root114=102pass12fail independent recomputation')
check(totals == attempts['allRootLeafAttempts'] == manifest['allRootLeafAttempts'], 'all-root counts agree')

visual = read('visual-review')
for image in visual['screenshots']: check(digest(Path(image['path']).read_bytes()) == image['sha256'], 'inspected screenshot hash: '+image['path'])
desktop = json.loads((base/'browser/copy-desktop.json').read_text())
delta = [b-a for a,b in zip(desktop['before']['canvas'],desktop['after']['canvas'])]
check(delta == [0,-59.375,0,0], 'truthful measured canvas displacement')
check(desktop['before']['scroll'] == desktop['after']['scroll'] == [0,0] and desktop['selected'] == ['text'], 'retained scroll and selection metadata')
own = read('independent/challenges'); cleanup = read('independent/database-cleanup')
check(own['implementationSha'] == frozen and own['exitCode'] == 0 and not own['timedOut'], 'independent bounded invocation exact-source applicability')
check(summary(base/'independent/challenges.tap') == {'total':2,'pass':2,'fail':0,'skip':0,'cancelled':0}, 'independent2/2 raw totals')
check(cleanup['created'] and cleanup['dropped'] and cleanup['poolsClosed'] and cleanup['maintenanceClosed'] and cleanup['initialUserCatalog'] == cleanup['finalUserCatalog'] == [], 'reviewer DB and pool cleanup')
check(read('cleanup-catalog')['actualCatalog'] == {'userDatabases':[],'otherClients':0}, 'root actual empty user catalog and clients')
absence = read('independent/cleanup-verification')
check(absence['exactIdAbsent'] and not absence['matchingIds'] and all(not v['exists'] for v in absence['privateFiles'].values()), 'independent live-daemon absence and private credential deletion')
result = {'implementationSha':frozen,'packetHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
          'checksPassed':len(checks),'errors':errors,'selected':selected,'allRootAttempts':totals,
          'capturedFinalDifferences':differences,'sourceHashPaths':len(manifest['sourceHashes']),
          'canvasDeltaXYWH':delta,'method':'Read-only evidence/source/hash/count consistency; no product suites or services executed by this audit.'}
(base/'independent/packet-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
raise SystemExit(bool(errors))
