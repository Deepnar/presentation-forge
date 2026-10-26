# Current handoff — I3 validation underway

Branch `v2`; accepted I2 baseline `58662ecc074f7cc29bf29a0dd410d581ffca0eef`.
Unaccepted I3 source `2ba82cb5c321c21d5648f577469f69e82cdcfb24` has no product/test
working delta. Plan/source/helper readiness and the setup-failure cleanup delta
are independently reviewed. Read AGENTS/protocol, [contract/evaluation](V2-8I-3-EVAL.md),
[runbook](v2-8i-3-evidence/RUNBOOK.md), state, source manifest and roadmap before work.
Stop after I3 acceptance/cleanup; no dependent feature is authorized.

On 2026-10-26 fresh sustained qualification passed180.42s (meanCPU4.72%, storage
busy2.34%) with unchanged thresholds. Preparation saved/fsynced the exact owned
PostgreSQL15.18 identity and snapshotted/hash-verified6965historical files/221original
PPTXs plus5canonical outputs. The earlier45sample/677.38s admission-only attempt
remains unchanged. The focused actual SQLite/PostgreSQL HTTP gate passed66/66,
0fail/skip/cancelled; it overlaps primary files, not extra distinct coverage.

The first resume batch passed2545/2545 bulk leaves, then critical disk contention
watchdog-cancelled7A. Its partial TAP has20passing and8uncompleted/unreported leaves,
no complete summary; the file is not passed. Raw logs/resources/captures are retained
in resource-interrupted-7a-attempt-1. That cancelled process group has exited.

A read-only helper audit found exe.exists could hide permission-denied userspace
blocked tasks. Correction6504064 uses per-thread stat PF_KTHREAD; unknown metadata
blocks admission. Ten metadata-oracle checks pass, outside product totals. Numeric
thresholds and product/tests2ba82cb are unchanged. The existing reviewer separately
confirmed readiness of6504064, without acceptance. Fresh corrected qualification
passed180.41s/12samples, with meanCPU6.73% and NVMe1.16%. The full7A retry passed
28/28. Serial progress is147/147 across19of26files, preserved in
serial-progress-19-files; the serial gate is still incomplete. One coordinator
(exec session43127 at this checkpoint) is running the final seven browser files
and then the first PostgreSQL file, in a bounded eight-job batch. Inspect processes/coordinator logs; only after it
yields, resume one coordinator with:

PYTHONDONTWRITEBYTECODE=1 python3 -u docs/v2-8i-3-evidence/run-validation.py --resume --max-new-jobs 3

All26serial files are complete208/208,0fail/skip/cancelled; raw files and serial-browser.json
are preserved. The coordinator now moves to PostgreSQL. Bulk2545 and focused66 remain
complete; remaining PostgreSQL/native/build/type/benchmark and visual gates are pending.
Never overlap coordinators/builds; inspect actual processes and coordinator log first.

Owned instance: dc1f24756ec8094a5cd356ce1626f3db18a25d74fe72561d9f938129d2105cd0,
forge-v28i3-validation, loopback5544, pinned image/1CPU/512MiB/tmpfs192MiB in the
ownership record. Never recreate/replace it or reuse another project's database.
Do not rerun preparation: snapshots and coordinator already exist. After all
root/independent checks, save/fsync actual0projectDBs before stopping only this
exact ID and verify bounded absence/port refusal.

Complete234-file primary inventory, build/typecheck/50cells and four actual
HTTP-submission/native both-store/both-protocol cases remain to finish. Preserve
all original bytes, inspect the final image inventory and risk cases, retain
fresh original archives, restore/hash-verify every historical/canonical output,
then obtain separate exact-source ACCEPT/HOLD. Never rerun a finisher against
restored canonical originals. Locale remains a separate standing probe. No real
model API/local inference, deployment, migration or paid infrastructure is allowed.
Original untracked .agents/ and both master/architecture prompt files are intact.
