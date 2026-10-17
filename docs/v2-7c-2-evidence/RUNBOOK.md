# V2-7C-2 validation

Read the approved contract at ../ROADMAP.md#v2-7c-2-plan and the implementation
SHA in validation-plan.json. The complete 205-file inventory partitions into
176 non-browser files, 25 serial browser/build/plate owners and four PostgreSQL
files. The focused gate repeats the catalog unit, HTTP and Chrome files; do not add
those repeated cases to the distinct regression total.

Inspect load, available memory, CPU/memory/I/O pressure and competing work first.
Run one group at a time. Never stop another project's work or use its database.
The existing cached postgres:15-alpine image can supply a disposable localhost
5544 service with one CPU, 512MB memory and a 192MB tmpfs, removed on stop.

```sh
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7c-2-evidence/run-group.py bulk
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7c-2-evidence/run-group.py serial
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7c-2-evidence/run-group.py postgres
LC_ALL=C.UTF-8 python3 docs/v2-7c-2-evidence/run-final-steps.py
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres FORGE_CATALOG_TEST_BACKEND=postgres timeout --signal=TERM --kill-after=10s 15m node --test --test-reporter=./tools/validated-tap.mjs test/v2-project-catalog-chrome-7c.test.js
```

Drivers use niceness10/ionice2:7, four bulk workers, 30-minute bulk and 15-minute
per-file bounds, TERM then KILL after10s. Browser/build/plate owners never overlap.
Every attempt retains command, source, output and exit status. Unavailable PG
checks are unexecuted, never passing skips. The additional PostgreSQL catalog
run repeats the same 16 browser cases against a different backend and is recorded
separately. Preserve its measurements/screenshots before any SQLite rerun.

Retain raw leaf totals plus exact file markers; compare the full inventory.
Run BYOK under en_IN.UTF-8 separately from C.UTF-8 regression, preserving its
known assertion. Inspect all50 benchmark cells and real native OOXML/rasterized
PPTX output. Inspect final desktop/narrow screenshots for clipping/overlap and
stage shifts; a successful build alone cannot establish frontend behaviour.

Older suites rewrite historical tracked evidence. Preserve fresh captures under
ignored out/ and copy the selected final captures into this evidence directory,
then restore only historical paths. Keep attempts and limitations distinct from
final exact-source evidence. A recommendation is not independent acceptance.

The full ordered execution also includes these bounded commands (the focused
three-file run precedes the disjoint matrix; every browser/build owner is serial):

```sh
LC_ALL=C.UTF-8 timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs test/v2-project-catalog-7c.test.js test/v2-project-catalog-http-7c.test.js test/v2-project-catalog-chrome-7c.test.js
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres FORGE_CATALOG_TEST_BACKEND=postgres timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs test/v2-project-catalog-http-7c.test.js
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs docs/v2-7c-2-evidence/hosted-import-check.mjs
LC_ALL=en_IN.UTF-8 timeout --signal=TERM --kill-after=10s 15m node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs test/byok-budget.test.js
LC_ALL=C.UTF-8 timeout --signal=TERM --kill-after=10s 15m node docs/v2-7c-2-evidence/native-review.mjs
```

The locale command deliberately retains its expected nonzero standing failure.
The native driver consumes the actual chart/table exports written by the current
serial B1 suite and the handoff export copied from the current B2 suite into
`out/v2-7c-2-validation/browser/handoff.pptx`. It verifies OOXML and rasterizes
five selected native pages. The supplemental hosted driver uses its own unique
PostgreSQL database and records browser/CLI/native behavior without calling a
model. Copy current captures/measurements into this namespace before restoring
historical tracked suite outputs. `coordinator.json` records execution order,
exit codes and source; group/final-command records retain exact child commands.
Use `finalize-evidence.py <bulk-dir> <serial-dir> <postgres-dir>` only after every
required command completes, then separately record actual image inspection.

The final serial inventory preserves a stopped initial attempt plus a same-source
selection: first22 successful files, one complete unchanged B2 retry, then the
remaining C1/C2 files. `serial-recovery.json` and `logs/serial/runs.json` identify
each selected log; `logs/serial-initial` retains the original10-pass/1-timeout
B2 result. A successful retry does not diagnose or resolve that registered timeout.
No original assertion or source was changed between these attempts.
