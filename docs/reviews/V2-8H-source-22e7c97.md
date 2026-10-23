# V2-8H runtime fixture correction — source readiness

Date: 2026-10-23. Reviewer/context: `/root/turn_contract_review`, separate from
implementer `/root`. Exact frozen source:
`22e7c9749865f3e7c2d62fb8724136e0f19048b0`. Comparison source:
`ac8749613bfbd927dab629f479d3d05f10a99195`. Accepted product baseline remains
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.

**Source readiness: READY_FOR_FULL_VALIDATION.** The two-file fixture delta
preserves the required deadline, lease, rollback, process-kill and recovery
behavioral assertions. No new blocker or broad assertion weakening was found.
This is a source-readiness report, not final implementation ACCEPT. Accepted
product and review state are unchanged by this report.

## Scope and preserved behavior

The scoped Git diff from `ac87496` to `22e7c97` contains only
`test/v2-runtime-contract.js` and `test/v2-runtime-process-contract.js` under
product/source/test/tool paths. Product packages, transport code, schemas and
the canonical runtime implementation are unchanged. Documentation/evidence
changes outside those paths retain their own roles.

The in-process helper captures one actual backend timestamp through the real
store's `withRuntimeTransaction`/`tx.now()`, then overrides only the injected
runtime clock. It freezes time rather than adding an offset to a still-running
wall clock. Real project, history, run and receipt transactions remain in use.

The deadline case now constructs its 150 ms deadline from that same clock,
asserts the reopened run is still running at +149 ms, and asserts expiry at
exactly +150 ms before attempting an effect. This strengthens boundary precision
while preserving restart and no-effect assertions. In the four fault cases,
+140 ms is applied at the same final guard boundary and +1,010 ms expires the
abandoned lease before recovery. Lease lengths, fault positions, rollback row
counts, attempt counts and successful recovery assertions remain intact.

The process helper caches its first readiness promise. `start(overrides)` awaits
that cached readiness before sending the command; it does not consume a second
IPC message. Kill/checkpoint workers and their replacements reach module
readiness before the corresponding 1,500/3,000 ms lease is acquired. The claimed
lease is then supplied to the already booted child. Real wall-clock lease expiry,
SIGKILL, checkpoint positions, stale-worker refusal, attempt budgets, receipt and
project/history checks remain. Recovered results additionally assert `ok` before
asserting success. The existing claim race, cancellation race and other real-time
process behavior are retained.

Readiness is the worker's existing module-readiness event. It precedes the
worker's `projectStore()` call and first backend connection; it does not claim a
warm PostgreSQL connection or exclude every setup delay. The new metric flags
accurately distinguish pre-claim bootstrap from store setup still included in
the measured interval. Capturing elapsed time immediately after the result
arrives removes later assertion/inspection overhead. These timings must not be
presented as product speedups against historical claim-then-spawn measurements.

## Evidence and limits

The earlier bulk result is retained as 2,480/2,481, the first isolated runtime
file as 26/27, and the intermediate controlled both-store run as 60/61. The
observed `running` results are consistent with an expiring short lease and
correct refusal under contention; their exact refusal stage was not logged.
The isolated admission failure also had a short 150 ms deadline. Neither those
observations nor resource averages prove the complete timing cause. No failed
attempt is reclassified as passed.

The reviewer inspected the retained development log
`out/v2-8h-binding-correction/controlled-final-both.log`: 69 leaves, 69 pass,
zero fail/skip/cancel. This is implementer execution inspected by the reviewer,
not independent execution. The final metric qualifier fields were added after
that development run, so it is not claimed here as full execution of the exact
frozen file bytes. The formal exact-source matrix remains authoritative.

Independent execution in this pass: **zero tests, database operations, services,
network/model API calls, local inference, builds, browsers, benchmarks or native
exports**. Inspection used Git diffs, the two fixture sources and retained logs.
No source/test file was changed by this reviewer. Full current-source validation
and final independent evidence review remain pending under the approved
[V2-8H contract](../V2-8H-EVAL.md); the historical failed attempts remain available
in the [prior-attempt packet](../v2-8h-evidence/prior-attempt-ac87496/).
