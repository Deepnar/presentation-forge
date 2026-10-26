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

The coordinator is active at this checkpoint with --resume --max-new-jobs3,
continuing bulk and then two serial browser/build entries. DO NOT start another
coordinator/build/test while it is active. Actual completion is recorded in
out/v2-8i-3-validation/coordinator.json and coordinator.log; inspect both and
current processes before resuming. Use bounded batches only after the process
has exited successfully; retain any failed/unacknowledged log before recovery:

PYTHONDONTWRITEBYTECODE=1 python3 -u docs/v2-8i-3-evidence/run-validation.py --resume --max-new-jobs 3

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
