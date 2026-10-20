# Independent V2-8D execution packet

Implementation `8c1e5c4e193340dd64ef3e68cd27bfe8ac55e23c`; implementer packet
`93bed024991fbcbe7d4c09b88922e54e46a86ed2`; reviewer context
`/root/v28d_boundary_review`, separate from `/root` implementation.

execution-plan.json and supplement-plan.json retain exact ordered commands;
runs.json records UTC starts, watchdog commands, exits, durations and leaf totals.
Both coordinators require exact source equality and the exact owned PostgreSQL
service. run-review.py used an initial180-second measured qualification and both
coordinators required two fresh acceptable15-second samples before every job.
All jobs were sequential, including full7A and the production build.

Before generators, every file under every docs/v2-*-evidence directory was copied
with metadata to out/v2-8d-independent/backup/<original path>, hashed and checked.
The five canonical out/ PPTXs were copied and checked separately in that same
backup namespace. backup-manifest.json records all3898 source paths and hashes;
snapshot-summary.json records the pre-execution counts. Existing snapshot/output
namespaces must never be overwritten for another review.

Executed coordinator commands were:

```sh
PYTHONDONTWRITEBYTECODE=1 nice -n 10 ionice -c 2 -n 7 python3 -u docs/v2-8d-evidence/independent/run-review.py
PYTHONDONTWRITEBYTECODE=1 nice -n 10 ionice -c 2 -n 7 python3 -u docs/v2-8d-evidence/independent/run-supplements.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/v2-8d-evidence/independent/packet-audit.py
PYTHONDONTWRITEBYTECODE=1 nice -n 10 ionice -c 2 -n 7 timeout --signal=TERM --kill-after=10s 3m python3 docs/v2-8d-evidence/independent/finalize.py
```

Coordinators' stdout/stderr was retained in coordinator.log and
supplement-coordinator.log. headless-check.mjs adapts the reviewed native harness
to this fresh namespace; native-audit.py independently checks unchanged OOXML
properties/geometry and untouched-slide bytes. The two additional negative probes
are separate from the required inventory. Harness-only setup/precondition refusals
are retained in harness-notes.json and supplement-precondition.log; no product
assertion or timeout was weakened.

finalize.py ran once after capture: it assembled fresh image/archive witnesses,
then restored and hash-verified all3898 previous files. Do not rerun it against
restored canonical originals or overwrite the restoration witness. Fresh archives
are native/*/*.pptx and browser-archives/*.pptx. Their bytes were copied, never
reconstructed. VISUAL-REVIEW.md records completed inspection; execution-summary.json
distinguishes repeated inventory/supplement cases from the two additional probes.

The full218-file matrix was audited from retained raw counts and markers rather
than independently repeated in full. The separate en_IN BYOK9pass/1failure probe
was inspected, not rerun. Fixture/native execution does not qualify live Auto
content, hosted cross-request approval, or interactive Microsoft PowerPoint.
The owned PostgreSQL service remains running for exact implementer cleanup.
