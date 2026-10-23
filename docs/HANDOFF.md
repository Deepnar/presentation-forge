# Handoff — V2-8H final-source validation running

2026-10-23 · branch `v2`; authorized push `origin/v2`.
Accepted product: `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
Implementation/test source: `22e7c9749865f3e7c2d62fb8724136e0f19048b0`.
The explicit continuation resumes the approved headless contract in
[the roadmap](ROADMAP.md#assistant-turn-approval-contract) and
[evaluation](V2-8H-EVAL.md). No model API/local inference, Assistant UI/routes,
dependent feature, deployment or production migration is authorized.

The durable visible-chat/proposal service, bounded records, atomic decisions over
the existing run queue and CLI are implemented. Separate source reviews found and
corrected cancellation rollback, schema I/O placement and mutable binding reuse.
Inherited short-deadline and process-bootstrap timing assumptions received narrow
fixture corrections; assertions, actual storage and real process/lease races remain.
The [final fixture review](reviews/V2-8H-source-22e7c97.md) is readiness only.
Full independent acceptance is pending; never infer it from passing tests.

Current exact-source gates: focused **90/90**, nonbrowser bulk **2481/2481**, and
all26 serial browser/build files **208/208**, zero fail/skip/cancel. Dedicated
PostgreSQL files are running; build/type/50-cell/native/complete visual gates remain
pending. Current execution is `out/v2-8h-validation-r4`, with229 files and nine gates.
All76 fresh browser captures are preserved/hash-indexed in `browser-captures.json`;
root inspected13 contact sheets and15 selected full-size captures without a new
regression. Native inspection and independent final acceptance remain pending.
The run qualified180.61 seconds; bulk uses concurrency1 and browser/build files are
strictly serial with fresh admission windows. Do not start a second coordinator or any overlapping build/browser job.

After a complete between-job yield, continue with:

```sh
FORGE_VALIDATION_OUT=out/v2-8h-validation-r4 python3 -u docs/v2-8h-evidence/run-validation.py --resume --max-new-jobs 3
```

Inspect coordinator/source/resource records before resuming. Do not resume after a
failed job without retaining/classifying it. Prior partial/failed attempts are in
`v2-8h-evidence/prior-attempt-{b095bba,cc3ed18,ac87496}`; they are not final-source
passes. The runbook defines final assembly, image inspection and restoration.

Original5725 evidence files/164 PPTXs and five canonical output archives remain
protected in `out/v2-8h-validation/{backup,prior-generated-backup}`. Current run uses
links to those original snapshots. Capture fresh browser/export evidence in the H
namespace before restoring and hash-verifying every original; never rerun old
finishers or resnapshot rewritten outputs.

Owned PostgreSQL15.18 is running, exact ID
`d89e445e3e9ac94460781fbe5932cc35b7ed8752814e1146ee7fa751e467d4b2`, name
`forge-v28h-validation`, local5544. The current-source backend recheck records exact
metadata and zero leftover DBs before use. Save/fsync a fresh zero-project-DB count
before exact-ID cleanup and prove removal/closed port. Other services are unrelated.
Original untracked `.agents/`, `PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md` and
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` stay untouched. Stop after H.
