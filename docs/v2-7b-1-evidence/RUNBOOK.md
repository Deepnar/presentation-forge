# V2-7B-1 exact-source validation

Source: `f52d193c0de56c95c9b191a53c10d4e0ea4bebaf`, accepted baseline
`fe749fb41e744961df156e8b9dcf80f0155b4e0b`. Run from repository root with Node 24.
The frozen manifest partitions **197 files** without overlap: **171 bulk**, **22
serial browser/build/plate owners**, **4 PostgreSQL**. The observed file markers
in TAP must match this inventory. Focused conversion coverage repeats three bulk
files and is not added again to unique totals.

First inspect load, available memory, CPU and I/O pressure, competing work and
owned-service availability. Wait for a suitable quiet window. Never stop
unrelated work or use another project's database. The disposable test service
uses cached `postgres:15-alpine` (actual 15.18), localhost 5544, one CPU, 512MB and
a 192MB tmpfs, automatically removed on stop. Each suite owns/drops its databases.

Run one group at a time, with no other Vite build/browser owner running:

```sh
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7b-1-evidence/run-group.py bulk
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7b-1-evidence/run-group.py serial
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7b-1-evidence/run-group.py postgres
LC_ALL=C.UTF-8 python3 docs/v2-7b-1-evidence/run-final-steps.py
```

Drivers use niceness 10, ionice class2/priority7 and GNU timeout's separate process
group. Bulk uses four workers and a 30-minute bound; every other file/command has
one owner and a 15-minute bound, with TERM then KILL after 10 seconds. They record
exact commands, source SHA and exit status, stop on a nonzero run and retain each
attempt. A timeout, cancellation or availability skip is never passing execution.
PostgreSQL absence leaves the four PG files plus PG browser checks unexecuted.

Final commands are production Vite build, typecheck and canonical 50-cell
benchmark with `--raster none`; inspect its findings and invariance/data checks.
Preserve the standing BYOK grouping mismatch separately by running unchanged
`test/byok-budget.test.js` under `LC_ALL=en_IN.UTF-8`. Do not loosen its assertion.

`audit-coverage.mjs` runs each untouched canonical specimen through the actual
source reader/converter/compiler/store in a private SQLite fixture and records
both semantic and persisted coverage/refusals. It is an audit, not another Node
test suite. Invoke after browser/build owners finish:

```sh
node docs/v2-7b-1-evidence/audit-coverage.mjs out/v2-7b-1-validation/coverage-final.json
```

The new Chrome suite uses the actual authenticated production server, captures
CSP violations, saves/edits/undoes/reopens native charts and tables, measures stage
stability, navigates pending text and opens all 60 boundary-deck thumbnails. It
emulates an exact 480×900 viewport and measures inspector bounds. Rasterize its
actual exported PPTX with `src/preview.js`, then inspect final images for clipping,
overlap and unexpected shifts. LibreOffice renders are not interactive Microsoft
PowerPoint evidence.

Older suites rewrite historical 6A/B/C/7A screenshots. Preserve fresh captures in
ignored `out/`, inspect them, then restore only those historical tracked evidence
paths. Retain scoped new evidence here; never stage original unrelated untracked
files. Record source SHA, image hashes, measurements, all attempts and limitations.
An implementer recommendation is not independent acceptance.
