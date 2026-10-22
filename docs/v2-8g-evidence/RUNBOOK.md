# V2-8G bounded offline reproduction

Read the active evaluation, state, handoff and roadmap contract first. The audit
report is historical inspection only; the follow-up permits code and deterministic
fixtures, never API-backed models or local inference.

The focused run used these eight files at concurrency1 with low CPU/I/O priority,
a process-group60s watchdog and retained TAP/file markers:

```
node --test --test-concurrency=1 --test-reporter=./tools/validated-tap.mjs \
  test/v2-provider-stream-8g.test.js test/v2-provider-8c.test.js \
  test/v2-provider-run-8d.test.js test/v2-conversation-8e.test.js \
  test/v2-context-8a.test.js test/v2-tools-8a.test.js \
  test/v2-core-boundary.test.js test/dev-protocol.test.js
```

The stream file requires an explicitly injected synthetic fetch and never contacts
its fixture.invalid URL. Other listed provider/conversation tests use loopback
fixture HTTP, not a model server. Do not use the configured model CLI or generation
pipeline to reproduce this correction. All four synthetic empty-stream child probes
have1500ms watchdogs; a killed probe is a failed leaf, not a passing timeout or a
cancelled Node leaf. Preserve assertions and failures.

expanded-focused-offline.json records current source, actual command and200/200;
18stream cases are included, not added again. Earlier14/14and196/196 are overlapping
runs. Initial failures remain in separate raw logs. Source inspection does not
measure peak retained memory and supplies no milestone acceptance.

The complete224-file inventory and all nine acceptance gates remain unexecuted as
complete gates. unexecuted-scope.json names216remaining files and other missing
checks. Reproduction of intensive acceptance uses the existing governance/isolation
contract, an appropriate sustained quiet window, fresh ALL-current evidence/original
snapshots before generators, serial browser/build owners, exact owned PostgreSQL
identity and saved-count cleanup, and a separate reviewer. Do not run old8F finish
scripts against restored canonical originals. Never infer unavailable checks green
or bypass the no-live-model/no-local-inference constraint. Future work is only in
the roadmap; do not start the other audit proposals.

## Complete offline validation continuation

The continuation retains the established resource thresholds and 224-file plan.
First qualify 180 seconds of sustained headroom. The preparation script requires
that fresh qualification, checks two further 15-second samples, then creates only
its explicitly owned cached PostgreSQL container and snapshots all current
evidence, ignored native originals and five canonical browser archives. An
occupied port 5544 is a refusal to reuse or stop another service.

```sh
FORGE_VALIDATION_OUT=out/v2-8g-validation-20261022 PYTHONDONTWRITEBYTECODE=1 nice -n 10 ionice -c 2 -n 7 python3 -u docs/v2-8g-evidence/quiet_window.py
FORGE_VALIDATION_OUT=out/v2-8g-validation-20261022 PYTHONDONTWRITEBYTECODE=1 nice -n 10 ionice -c 2 -n 7 python3 -u docs/v2-8g-evidence/prepare-full-validation.py
FORGE_VALIDATION_OUT=out/v2-8g-validation-20261022 PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8g-evidence/assemble-results.py
FORGE_VALIDATION_OUT=out/v2-8g-validation-20261022 PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8g-evidence/finish-evidence.py
```

Every job requires fresh headroom, low CPU/I/O priority and a process-group
watchdog; long jobs monitor contention. Browser files and builds stay serial.
All provider exchanges are injected or actual loopback fixture HTTP, with no
real model API or local inference. The stream resource supplement uses four
fresh Node processes, the accepted 256 KiB allowance, full-GC observations and 5,000/200,000 empty reads per
protocol; sampled retained memory must not be described as process peak RSS.

Finish once while the fresh canonical browser archives still exist, preserve
their bytes, then restore/hash-check the historical originals. Never rerun the
finisher against restored archives. Inspect current screenshots/native rasters
separately; green tests do not establish visual quality or independent acceptance.
Record actual execution and remaining checks before updating any gate.
