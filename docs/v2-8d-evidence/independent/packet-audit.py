import hashlib, json, pathlib, re, subprocess

root = pathlib.Path('docs/v2-8d-evidence')
plan = json.loads((root / 'validation-plan.json').read_text())
sha = plan['implementationSha']
jobs = json.loads((root / 'logs/coordinator.json').read_text())
keys = [('total', 'tests'), ('pass', 'pass'), ('fail', 'fail'), ('skip', 'skipped'), ('cancelled', 'cancelled')]
inventory = plan['bulk'] + plan['serial'] + plan['postgres']
actual = {str(p) for extension in ['*.test.js', '*.test.ts'] for p in pathlib.Path('test').glob(extension)}
assert len(inventory) == len(set(inventory)) == 218 and set(inventory) == actual
assert not subprocess.check_output(['git', 'diff', '--name-only', sha, 'HEAD', '--', 'packages', 'src', 'test', 'app', 'tools', 'schema', 'themes'], text=True).strip()
raw = []
for job in jobs:
    name = {'focused':'provider-run', 'bulk':'non-browser-bulk'}.get(job['name'], job['name'])
    candidates = [root / 'logs' / 'files' / (name + '.tap'), root / 'logs' / (name + '.tap'), root / 'logs' / (name + '.log')]
    log = next((p for p in candidates if p.is_file()), candidates[0])
    assert log.is_file(), log
    if 'tests' not in job:
        assert job['exitCode'] == 0
        continue
    text = log.read_text()
    counts = {key: int(re.findall(r'^# '+label+r' (\d+)\s*$', text, re.M)[-1]) for key, label in keys}
    assert counts == job['tests'], (job['name'], counts, job['tests'])
    markers = re.findall(r'^# forge-test-file "([^"]+)"$', text, re.M)
    assert set(markers) == set(job['files']), (job['name'], markers)
    if job['name'] != 'byok-locale':
        assert job['exitCode'] == 0 and counts['total'] == counts['pass'] and not any(counts[k] for k in ['fail', 'skip', 'cancelled'])
    else:
        assert job['exitCode'] == 1 and counts == {'total':10, 'pass':9, 'fail':1, 'skip':0, 'cancelled':0}
    raw.append({'name':job['name'], 'counts':counts, 'files':job['files']})
primary = [r for r in raw if r['name'] not in ['focused', 'window-qualification', 'byok-locale']]
assert sum(r['counts']['total'] for r in primary) == 2639
assert sorted(f for r in primary for f in r['files']) == sorted(inventory)
native = (root / 'logs/headless.log').read_text()
assert all(int(re.findall(r'^# '+label+r' (\d+)\s*$', native, re.M)[-1]) == value for label,value in [('tests',4),('pass',4),('fail',0),('skipped',0),('cancelled',0)])
images = json.loads((root / 'images.json').read_text())
assert len(images) == 115 and len({r['file'] for r in images}) == 115
for row in images:
    assert row['implementationSha'] == sha
    assert hashlib.sha256(pathlib.Path(row['file']).read_bytes()).hexdigest() == row['sha256'], row['file']
archives = []
for row in json.loads((root / 'native-archives.json').read_text()) + json.loads((root / 'browser-archives.json').read_text()):
    file = row.get('originalArchive', row.get('pptx'))
    assert hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest() == row['sha256'], file
    assert subprocess.check_output(['git','ls-files','--',file], text=True).strip() == file
    archives.append(file)
assert len(archives) == 13
result = {'implementationSha':sha, 'reviewedEvidenceCommit':'93bed024991fbcbe7d4c09b88922e54e46a86ed2', 'sourceDeltaAfterImplementation':[], 'inventoryFiles':218, 'primaryLeavesVerifiedFromRaw':2639, 'nativeSupplementLeaves':4, 'successfulRepeatLeavesExcluded':134, 'standingLocale':{'pass':9,'fail':1,'skip':0,'cancelled':0,'independentlyReexecuted':False}, 'imageHashesVerified':115, 'newOriginalArchivesVerifiedAndTracked':13, 'allRecordedRawCountsAndFileMarkersMatch':True, 'fullMatrixIndependentlyReexecuted':False}
(root / 'independent/packet-audit.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
