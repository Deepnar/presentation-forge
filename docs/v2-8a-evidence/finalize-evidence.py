import json, pathlib, re, shlex, shutil, sys

root = pathlib.Path('docs/v2-8a-evidence')
scratch = pathlib.Path('out/v2-8a-validation')
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
actual = {str(file) for suffix in ['*.test.js','*.test.ts'] for file in pathlib.Path('test').glob(suffix)}
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

bulk = test_record('non-browser-bulk', [bulk_dir / 'bulk.tap'], 'LC_ALL=C.UTF-8 python3 docs/v2-8a-evidence/run-group.py bulk (exact bounded command in logs/bulk/runs.json)', plan['bulk'])
shutil.copy2(scratch / 'coordinator.json', root / 'coordinator.json')
serial = test_record('serial-browser', [serial_dir / (pathlib.Path(file).stem + '.tap') for file in plan['serial']], 'LC_ALL=C.UTF-8 python3 docs/v2-8a-evidence/run-group.py serial (exact bounded per-file commands in logs/serial/runs.json)', plan['serial'])
pg_files = [plan['postgres'][0], plan['postgres'][3]]
pg = test_record('postgres-contract', [pg_dir / (pathlib.Path(file).stem + '.tap') for file in pg_files], 'LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> python3 docs/v2-8a-evidence/run-group.py postgres (contract/import files; exact commands in logs/postgres/runs.json)', pg_files)
fault_files = plan['postgres'][1:3]
faults = test_record('cross-process-faults', [pg_dir / (pathlib.Path(file).stem + '.tap') for file in fault_files], 'LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> python3 docs/v2-8a-evidence/run-group.py postgres (concurrency/fault files; exact commands in logs/postgres/runs.json)', fault_files)
focused_files = ['test/v2-tools-8a.test.js', 'test/v2-context-8a.test.js']
focused = test_record('agent-foundation', [scratch / 'focused-final.tap'], 'LC_ALL=C.UTF-8 timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs ' + ' '.join(focused_files), focused_files)

commands = json.loads((scratch / 'final-steps' / 'runs.json').read_text())
for run in commands:
    assert run['exitCode'] == 0 and run['implementationSha'] == sha
    name = run['id']
    target = root / 'logs' / (name + '.log')
    shutil.copy2(scratch / 'final-steps' / (name + '.log'), target)
    extra = dict(durationSeconds=run['durationSeconds'])
    if name == 'benchmark-50':
        extra['cells'] = 50
        shutil.copy2('out/v2-8a-benchmark/results.json', root / 'benchmark-results.json')
        benchmark = json.loads((root / 'benchmark-results.json').read_text())
        assert len(benchmark['cells']) == 50
        assert all(not cell[key] for cell in benchmark['cells'].values() for key in ['l1', 'l2', 'fitDiagnostics', 'takeawayFindings'])
        assert all(not cell['representation']['missing'] and not cell['charts']['mismatches'] for cell in benchmark['cells'].values())
        assert all(item['agree'] for item in benchmark['invariance'].values())
        extra.update(rawCheckoutHead=benchmark['commit'], sourceDelta='No runtime/test/tool delta from frozen implementation; later checkout commits contain documentation/evidence only.')
    record(name, 'benchmark' if name == 'benchmark-50' else 'command', shlex.join(run['command']), target, **extra)
shutil.copy2(scratch / 'final-steps' / 'runs.json', root / 'logs' / 'final-command-runs.json')


for source,name in [(scratch/'headless-final.tap','headless.tap'),(scratch/'byok-locale-final.tap','byok-locale.tap')]:
    shutil.copy2(source,root/'logs'/name)
headless=totals((root/'logs'/'headless.tap').read_text())
assert headless['total']==headless['pass']==1
locale=totals((root/'logs'/'byok-locale.tap').read_text())
assert locale=={'total':10,'pass':9,'fail':1,'skip':0,'cancelled':0},locale
write('headless.json',dict(implementationSha=sha,command='LC_ALL=C.UTF-8 timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs docs/v2-8a-evidence/headless-check.mjs',log=str(root/'logs'/'headless.tap'),tests=headless,exitCode=0))
write('byok-locale.json',dict(implementationSha=sha,command='LC_ALL=en_IN.UTF-8 node --test test/byok-budget.test.js',log=str(root/'logs'/'byok-locale.tap'),tests=locale,exitCode=1,classification='Standing locale expectation failure; separate from required C.UTF-8 inventory.'))
write('summary.json',dict(implementationSha=sha,inventoryFiles=len(inventory),uniqueTests={k:sum(r['tests'][k] for r in [bulk,serial,pg,faults]) for k in bulk['tests']},supplementalHeadless=headless,focusedRepeated=focused['tests'],standingLocale=locale,unexecuted=0,note='Focused/preliminary/review executions are not added again to unique matrix totals. One headless case is distinct; locale standing failure remains separate.'))

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
