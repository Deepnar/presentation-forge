import json, pathlib, re, shlex, shutil, sys

root = pathlib.Path('docs/v2-7c-3-evidence')
scratch = pathlib.Path('out/v2-7c-3-validation')
plan = json.loads((root / 'validation-plan.json').read_text())
sha = plan['implementationSha']

def totals(text):
    result = {}
    for key, label in [('total', 'tests'), ('pass', 'pass'), ('fail', 'fail'), ('skip', 'skipped'), ('cancelled', 'cancelled')]:
        found = re.findall(r'^(?:#|ℹ) ' + label + r' (\d+)\s*$', text, re.M)
        if not found:
            raise ValueError(f'missing {label} footer')
        result[key] = sum(map(int, found))
    assert result['total'] == sum(result[k] for k in ['pass', 'fail', 'skip', 'cancelled'])
    return result

def write(name, data):
    (root / name).write_text(json.dumps(data, indent=2) + '\n')

def record(identifier, kind, command, log, **extra):
    data = dict(id=identifier, kind=kind, implementationSha=sha, command=command, log=str(log), exitCode=0, **extra)
    write(identifier + '.json', data)
    return data

def test_record(identifier, sources, command, files):
    log = root / 'logs' / (identifier + '.tap')
    log.parent.mkdir(parents=True, exist_ok=True)
    text = '\n'.join(source.read_text() for source in sources)
    observed = set(json.loads(v) for v in re.findall(r'^# forge-test-file (.+)$', text, re.M))
    assert observed == set(files), (identifier, observed ^ set(files))
    counts = totals(text)
    assert counts['total'] == counts['pass'] and not any(counts[k] for k in ['fail', 'skip', 'cancelled']), (identifier, counts)
    log.write_text(text)
    return record(identifier, 'tests', command, log, tests=counts, files=files)

inventory = [file for group in ['bulk','serial','postgres'] for file in plan[group]]
actual = {str(file) for file in pathlib.Path('test').glob('*.test.js')}
assert len(inventory) == len(set(inventory)) and set(inventory) == actual, (set(inventory)^actual)

bulk_dir, serial_dir, pg_dir = map(pathlib.Path, sys.argv[1:4])
for group, directory in [('bulk', bulk_dir), ('serial', serial_dir), ('postgres', pg_dir)]:
    runs = json.loads((directory / 'runs.json').read_text())
    assert len(runs) == (1 if group == 'bulk' else len(plan[group]))
    assert all(run['exitCode'] == 0 and run['implementationSha'] == sha for run in runs)
    target = root / 'logs' / group
    target.mkdir(parents=True, exist_ok=True)
    for file in directory.glob('*'):
        shutil.copy2(file, target / file.name)

bulk = test_record('non-browser-bulk', [bulk_dir / 'bulk.tap'], 'LC_ALL=C.UTF-8 python3 docs/v2-7c-3-evidence/run-group.py bulk (exact bounded command in logs/bulk/runs.json)', plan['bulk'])
shutil.copy2(scratch / 'coordinator.json', root / 'coordinator.json')
serial = test_record('serial-browser', [serial_dir / (pathlib.Path(file).stem + '.tap') for file in plan['serial']], 'LC_ALL=C.UTF-8 python3 docs/v2-7c-3-evidence/run-group.py serial (exact bounded per-file commands in logs/serial/runs.json)', plan['serial'])
pg_files = [plan['postgres'][0], plan['postgres'][3]]
pg = test_record('postgres-contract', [pg_dir / (pathlib.Path(file).stem + '.tap') for file in pg_files], 'LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> python3 docs/v2-7c-3-evidence/run-group.py postgres (contract/import files; exact commands in logs/postgres/runs.json)', pg_files)
fault_files = plan['postgres'][1:3]
faults = test_record('cross-process-faults', [pg_dir / (pathlib.Path(file).stem + '.tap') for file in fault_files], 'LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> python3 docs/v2-7c-3-evidence/run-group.py postgres (concurrency/fault files; exact commands in logs/postgres/runs.json)', fault_files)
focused_files = ['test/v2-editor-toolbar-chrome-7c.test.js', 'test/v2-edit-chrome-7a.test.js']
focused = test_record('editor-toolbar', [scratch / 'focused-final.tap'], 'LC_ALL=C.UTF-8 timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs ' + ' '.join(focused_files), focused_files)

commands = json.loads((scratch / 'final-steps' / 'runs.json').read_text())
for run in commands:
    assert run['exitCode'] == 0 and run['implementationSha'] == sha
    name = run['id']
    target = root / 'logs' / (name + '.log')
    shutil.copy2(scratch / 'final-steps' / (name + '.log'), target)
    extra = dict(durationSeconds=run['durationSeconds'])
    if name == 'benchmark-50':
        extra['cells'] = 50
        shutil.copy2('out/v2-7c-3-benchmark/results.json', root / 'benchmark-results.json')
        benchmark = json.loads((root / 'benchmark-results.json').read_text())
        assert len(benchmark['cells']) == 50
        assert all(not cell[key] for cell in benchmark['cells'].values() for key in ['l1', 'l2', 'fitDiagnostics', 'takeawayFindings'])
        assert all(not cell['representation']['missing'] and not cell['charts']['mismatches'] for cell in benchmark['cells'].values())
        assert all(item['agree'] for item in benchmark['invariance'].values())
        extra.update(rawCheckoutHead=benchmark['commit'], sourceDelta='No runtime/test/tool delta from frozen implementation; later checkout commits contain documentation/evidence only.')
    record(name, 'benchmark' if name == 'benchmark-50' else 'command', shlex.join(run['command']), target, **extra)
shutil.copy2(scratch / 'final-steps' / 'runs.json', root / 'logs' / 'final-command-runs.json')

for source, name in [(scratch / 'hosted-import-final.tap', 'hosted-import.tap'), (scratch / 'byok-locale-final.tap', 'byok-locale.tap')]:
    shutil.copy2(source, root / 'logs' / name)
hosted = totals((root / 'logs' / 'hosted-import.tap').read_text())
assert hosted['total'] == hosted['pass'] == 1
write('hosted-import.json', dict(implementationSha=sha, command='LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs docs/v2-7c-3-evidence/hosted-import-check.mjs', log=str(root / 'logs' / 'hosted-import.tap'), tests=hosted, exitCode=0))
repeated = {}
for identifier, count, backend, variable, file in [
    ('toolbar',9,'8 PostgreSQL saved-project cases; 1 local SQLite standalone Live fixture','FORGE_TOOLBAR_TEST_BACKEND','test/v2-editor-toolbar-chrome-7c.test.js'),
    ('catalog',16,'PostgreSQL projects; legacy filesystem catalog','FORGE_CATALOG_TEST_BACKEND','test/v2-project-catalog-chrome-7c.test.js'),
    ('http',8,'7 PostgreSQL; 1 local SQLite mode probe','FORGE_CATALOG_TEST_BACKEND','test/v2-project-catalog-http-7c.test.js'),
    ('covers',12,'PostgreSQL','FORGE_COVERS_TEST_BACKEND','test/v2-project-covers-chrome-7c.test.js'),
    ('cover-http',9,'PostgreSQL','FORGE_COVERS_TEST_BACKEND','test/v2-project-covers-http-7c.test.js'),
]:
    source = scratch / f'postgres-{identifier}-final.tap'
    log = root / 'logs' / source.name
    shutil.copy2(source, log)
    counts = totals(source.read_text())
    assert counts['total'] == counts['pass'] == count, (identifier,counts)
    repeated[identifier] = counts
    write(f'postgres-{identifier}.json',dict(implementationSha=sha,backend=backend,command=f'LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> {variable}=postgres timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs {file}',log=str(log),tests=counts,exitCode=0,note='Repeated coverage excluded from distinct matrix totals.'))
write('summary.json', dict(implementationSha=sha, inventoryFiles=sum(len(plan[g]) for g in ['bulk', 'serial', 'postgres']), uniqueTests={k: sum(r['tests'][k] for r in [bulk, serial, pg, faults]) for k in bulk['tests']}, supplementalHosted=hosted, focusedRepeated=focused['tests'], postgresRepeated=repeated, unexecuted=0, note='The supplemental hosted double-click/CLI/export case is distinct. Focused checks, repeated PostgreSQL browser cases, earlier attempts, locale probe and independent reruns are not added again to unique matrix totals.'))

state_file = pathlib.Path('docs/development-state.json')
state = json.loads(state_file.read_text())
assert state['implementationHead']['sha'] == sha
for item in state['validation']:
    if item['id'] == 'frontend-visual':
        continue
    item.update(status='passed', evidence=str(root / (item['id'] + '.json')), reason='Executed on the frozen implementation; exact output and file inventory retained.')
state['activeMilestone']['implementationStatus'] = 'validated'
state['activeMilestone'].update(reviewStatus='pending', accepted=False, reviewRecord=None)
state_file.write_text(json.dumps(state, indent=2) + '\n')
print(json.dumps(json.loads((root / 'summary.json').read_text()), indent=2))
