import json, pathlib, re, shlex, shutil, sys

root = pathlib.Path('docs/v2-7c-2-evidence')
scratch = pathlib.Path('out/v2-7c-2-validation')
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

bulk_dir, serial_dir, pg_dir = map(pathlib.Path, sys.argv[1:4])
for group, directory in [('bulk', bulk_dir), ('serial', serial_dir), ('postgres', pg_dir)]:
    runs = json.loads((directory / 'runs.json').read_text())
    assert len(runs) == (1 if group == 'bulk' else len(plan[group]))
    assert all(run['exitCode'] == 0 and run['implementationSha'] == sha for run in runs)
    target = root / 'logs' / group
    target.mkdir(parents=True, exist_ok=True)
    for file in directory.glob('*'):
        shutil.copy2(file, target / file.name)

bulk = test_record('non-browser-bulk', [bulk_dir / 'bulk.tap'], 'LC_ALL=C.UTF-8 python3 docs/v2-7c-2-evidence/run-group.py bulk (exact bounded command in logs/bulk/runs.json)', plan['bulk'])
recovery = json.loads((scratch / 'serial-recovery.json').read_text())
assert recovery['status'] == 'completed' and recovery['implementationSha'] == sha and pathlib.Path(recovery['finalDirectory']) == serial_dir
initial_dir = pathlib.Path(recovery['initialDirectory'])
shutil.copytree(initial_dir, root / 'logs' / 'serial-initial', dirs_exist_ok=True)
shutil.copy2(scratch / 'serial-recovery.json', root / 'serial-recovery.json')
shutil.copy2(scratch / 'coordinator.json', root / 'coordinator.json')
serial = test_record('serial-browser', [serial_dir / (pathlib.Path(file).stem + '.tap') for file in plan['serial']], 'Same-source per-file selection: original 22 successful bounded owners plus one unchanged handoff rerun and remaining two files; exact commands/provenance in logs/serial/runs.json, initial 10-pass/1-timeout handoff in logs/serial-initial; see serial-recovery.json', plan['serial'])
pg_files = [plan['postgres'][0], plan['postgres'][3]]
pg = test_record('postgres-contract', [pg_dir / (pathlib.Path(file).stem + '.tap') for file in pg_files], 'LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> python3 docs/v2-7c-2-evidence/run-group.py postgres (contract/import files; exact commands in logs/postgres/runs.json)', pg_files)
fault_files = plan['postgres'][1:3]
faults = test_record('cross-process-faults', [pg_dir / (pathlib.Path(file).stem + '.tap') for file in fault_files], 'LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> python3 docs/v2-7c-2-evidence/run-group.py postgres (concurrency/fault files; exact commands in logs/postgres/runs.json)', fault_files)
focused_files = ['test/v2-project-catalog-7c.test.js', 'test/v2-project-catalog-http-7c.test.js', 'test/v2-project-catalog-chrome-7c.test.js']
focused = test_record('project-catalog', [scratch / 'focused-final.tap'], 'LC_ALL=C.UTF-8 timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs ' + ' '.join(focused_files), focused_files)

commands = json.loads((scratch / 'final-steps' / 'runs.json').read_text())
for run in commands:
    assert run['exitCode'] == 0 and run['implementationSha'] == sha
    name = run['id']
    target = root / 'logs' / (name + '.log')
    shutil.copy2(scratch / 'final-steps' / (name + '.log'), target)
    extra = dict(durationSeconds=run['durationSeconds'])
    if name == 'benchmark-50':
        extra['cells'] = 50
        shutil.copy2('out/v2-7c-2-benchmark/results.json', root / 'benchmark-results.json')
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
write('hosted-import.json', dict(implementationSha=sha, command='LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs docs/v2-7c-2-evidence/hosted-import-check.mjs', log=str(root / 'logs' / 'hosted-import.tap'), tests=hosted, exitCode=0))
pg_handoff_source = scratch / 'postgres-catalog-final.tap'
pg_handoff_log = root / 'logs' / pg_handoff_source.name
shutil.copy2(pg_handoff_source, pg_handoff_log)
pg_handoff = totals(pg_handoff_source.read_text())
assert pg_handoff['total'] == pg_handoff['pass'] == 16
write('postgres-catalog.json', dict(implementationSha=sha, backend='PostgreSQL 15', command='LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> FORGE_CATALOG_TEST_BACKEND=postgres timeout --signal=TERM --kill-after=10s 15m node --test --test-reporter=./tools/validated-tap.mjs test/v2-project-catalog-chrome-7c.test.js', log=str(pg_handoff_log), tests=pg_handoff, exitCode=0, note='Repeated browser cases against PostgreSQL; not added to distinct inventory cases.'))
pg_http_source = scratch / 'postgres-http-final.tap'
pg_http_log = root / 'logs' / pg_http_source.name
shutil.copy2(pg_http_source, pg_http_log)
pg_http = totals(pg_http_source.read_text())
assert pg_http['total'] == pg_http['pass'] == 8
write('postgres-catalog-http.json', dict(implementationSha=sha, backend='PostgreSQL', command='LC_ALL=C.UTF-8 TEST_PG_URL=<owned localhost:5544> FORGE_CATALOG_TEST_BACKEND=postgres timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs test/v2-project-catalog-http-7c.test.js', log=str(pg_http_log), tests=pg_http, exitCode=0, note='Repeated actual catalog HTTP cases on isolated PostgreSQL; excluded from distinct totals.'))
write('summary.json', dict(implementationSha=sha, inventoryFiles=sum(len(plan[g]) for g in ['bulk', 'serial', 'postgres']), uniqueTests={k: sum(r['tests'][k] for r in [bulk, serial, pg, faults]) for k in bulk['tests']}, supplementalHosted=hosted, focusedRepeated=focused['tests'], postgresCatalogRepeated=pg_handoff, postgresCatalogHttpRepeated=pg_http, unexecuted=0, note='The supplemental hosted double-click/CLI/export case is distinct. Focused checks, repeated PostgreSQL browser cases, earlier attempts, locale probe and independent reruns are not added again to unique matrix totals.'))

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
