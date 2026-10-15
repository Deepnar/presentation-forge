# V2-7A final-validation runbook

Run from the repository root using Node 24, only after an appropriate quiet
shared-machine window. Record load/memory/I/O pressure and service availability.
Never stop unrelated processes. Do not use another project's database.
`validation-plan.json` partitions 192 files: 168 bulk, 21 serial build/browser,
and 3 PostgreSQL files (includes the new governance suite). Inspect new test files
for browser/build ownership before updating that inventory. This includes
`v2-fonts-4d.test.js` in serial isolation because it builds Vite even though it
is not itself a Chrome suite. `freeform`, `plate` and `v2-plate-3f5` are also
isolated because they launch Chrome indirectly through plate-render helpers. No file belongs to multiple groups.

The following bounded driver runs ONE selected group at a time, writes TAP and
exit codes, stops on a failing/timeout file for classification, and invokes GNU
`timeout` with its default separate process group. Do not add `--foreground`.
After TERM, the 10-second KILL bound covers descendants too. A timeout (124/137)
is unexecuted/incomplete validation, not a passing test. Check for owned leftover
ports/processes before resuming after any interruption.

```sh
FORGE_VALIDATION_GROUP=bulk python - <<'PY'
import datetime, json, os, pathlib, subprocess, sys
plan = json.load(open('docs/v2-7a-evidence/validation-plan.json'))
group = os.environ['FORGE_VALIDATION_GROUP']
if group not in ('bulk', 'serial', 'postgres'):
    raise SystemExit('group must be bulk, serial or postgres')
attempt = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
out = pathlib.Path('out/v2-7a-validation') / (group + '-' + attempt)
out.mkdir(parents=True, exist_ok=False)
files = plan[group]
jobs = [('bulk', files)] if group == 'bulk' else [(pathlib.Path(f).stem, [f]) for f in files]
for name, selected in jobs:
    command = ['timeout', '--signal=TERM', '--kill-after=10s', '30m' if group == 'bulk' else '15m',
               'node', '--test', '--test-concurrency=4' if group == 'bulk' else '--test-concurrency=1',
               '--test-reporter=./tools/validated-tap.mjs', *selected]
    with open(out / (name + '.tap'), 'w') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    (out / (name + '.exit')).write_text(str(result.returncode) + '\n')
    print(name, 'exit', result.returncode, flush=True)
    if result.returncode:
        sys.exit(result.returncode)
PY
```

Repeat the same block with `FORGE_VALIDATION_GROUP=serial`, then `postgres`.
The serial list begins with the FULL V2-7A suite (27 leaf tests, including regression additions); never
replace it with only the four deferred cases. Classify and correct failures,
rerun affected files, then resume remaining files explicitly and preserve every
attempt. Aggregate only the final complete inventory, not repeated attempts.
Do not label the standing BYOK locale failure as a new regression or weaken it.
A nonzero bulk exit requires triage before continuing the serial phase.

PostgreSQL defaults to `postgres://postgres:probe@127.0.0.1:5544/postgres`.
Set `TEST_PG_URL` only for an explicitly authorized isolated test service. Tests
create/drop their own databases and fault tests terminate their own connections;
these must never target production or another project's database. If unavailable,
record the 3 PostgreSQL files and `v2-edit-chrome-6c.test.js` as unexecuted. A
placeholder skip is a probe result, not execution of the real 17/11/8/3 cases.

After all test-owned builds finish, run these commands serially, retaining logs
and exit statuses under `out/v2-7a-validation/`:

```sh
timeout --signal=TERM --kill-after=10s 10m node_modules/.bin/vite build --config app/web/vite.config.js
timeout --signal=TERM --kill-after=10s 10m npm run typecheck
timeout --signal=TERM --kill-after=10s 15m node tools/v2-benchmark.mjs --out out/v2-7a-benchmark --raster none
```

Inspect `out/v2-7a-benchmark/results.json`: 50 cells, L1/L2 findings, invariance,
representation and chart fidelity. The benchmark assertion suite's 12 tests do
not substitute for the 50-cell run. Raster-none is compiler/OOXML measurement,
not a new visual-export verdict. Where export rendering must be verified, use
`src/preview.js` on actual exported PPTX and inspect rasters.

The 7A run overwrites screenshots in this directory. Inspect those final images,
not just the pre-existing set; record dimensions, source SHA, hashes and visual
findings. Add specific evidence for shell chart/table editing, redo, discard and
pending drafts, inspector access at narrow widths, dialog geometry and controlled
before/after canvas coordinates. The original 18 cases did not fully prove every
one of those claims. `large-deck.json` must come from a real successful run;
its existing bound is <120000ms for opening 120 slides (includes Chrome startup,
font-gated fixture boot and route navigation, not an isolated rendering metric).

Update the eval with per-run pass/fail/skip/cancelled totals, file-level watchdogs,
unexecuted real cases, standing failure, exact tested SHA/delta, corrections,
performance and inspected evidence. Commit scoped logs only after inspecting
for secrets/private data. Do not accept the milestone or begin V2-7B.

Test evidence uses `tools/validated-tap.mjs` to retain the files observed by the
Node runner. The protocol validator matches these markers against the required
manifest group and rejects filtered/subset runs; aggregate final logs retain all
markers and exact summed totals. This checks internal consistency, not authorship
or authenticity of evidence.
