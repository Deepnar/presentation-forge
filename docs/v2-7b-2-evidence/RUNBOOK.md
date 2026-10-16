# V2-7B-2 validation

Read the approved contract at ../ROADMAP.md#v2-7b-2-plan and the implementation
SHA in validation-plan.json. The complete 199-file inventory partitions into
172 non-browser files, 23 serial browser/build/plate owners and four PostgreSQL
files. The focused gate repeats the handoff client and Chrome files; do not add
those repeated cases to the distinct regression total.

Inspect load, available memory, CPU/memory/I/O pressure and competing work first.
Run one group at a time. Never stop another project's work or use its database.
The existing cached postgres:15-alpine image can supply a disposable localhost
5544 service with one CPU, 512MB memory and a 192MB tmpfs, removed on stop.

```sh
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7b-2-evidence/run-group.py bulk
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7b-2-evidence/run-group.py serial
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres python3 docs/v2-7b-2-evidence/run-group.py postgres
LC_ALL=C.UTF-8 python3 docs/v2-7b-2-evidence/run-final-steps.py
LC_ALL=C.UTF-8 TEST_PG_URL=postgres://postgres:probe@127.0.0.1:5544/postgres FORGE_HANDOFF_TEST_BACKEND=postgres timeout --signal=TERM --kill-after=10s 15m node --test --test-reporter=./tools/validated-tap.mjs test/v2-handoff-chrome-7b.test.js
```

Drivers use niceness10/ionice2:7, four bulk workers, 30-minute bulk and 15-minute
per-file bounds, TERM then KILL after10s. Browser/build/plate owners never overlap.
Every attempt retains command, source, output and exit status. Unavailable PG
checks are unexecuted, never passing skips. The additional PostgreSQL handoff
run repeats the same browser cases against a different backend and is recorded
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
