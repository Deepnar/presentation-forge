# V2-7A final evidence

Corrected source: `fe749fb41e744961df156e8b9dcf80f0155b4e0b`.
[Evaluation](../V2-7A-EVAL.md), [summary](summary.json),
[visual inspection](VISUAL-REVIEW.md), [image hashes](image-manifest.json).

The disjoint [192-file manifest](validation-plan.json) executed **2127/2127**:
1936 bulk, 155 serial build/browser (includes 28-case7A and 3 PG browser), 36 backend
contract/concurrency/fault cases. No skip, cancellation or unexecuted required
case. Supplemental hosted login/save/export/reopen: 1/1. Build/typecheck pass;
canonical benchmark 50 cells has 0 L1/L2 findings. The separate Indian-locale BYOK
probe remains 9 pass / 1 known failure; it is not folded into unique coverage.

Per-gate JSON files link exact commands, raw TAP/logs and source SHA.
`logs/attempts/` preserves superseded failures and the interrupted attempt;
[attempt-history.json](attempt-history.json) distinguishes them from final totals.
`logs/byok-en-IN.tap` retains the standing locale issue.
[RUNBOOK.md](RUNBOOK.md), `run-group.py` and `run-final-steps.py` reproduce the
bounded isolated strategy. Run `hosted-auth-check.mjs` after all build owners
finish; it starts only disposable local hosted/API/database fixtures and serves
existing dist. Generated exports stay ignored under out/; inspected rasters are
`export-chart.png` and `export-table.png`.

All15 images were regenerated and inspected. The known pre-existing Fit padding
limitation and actual viewport sizes are explicit in the visual report.
[Historical continuity audit](CONTINUITY-VALIDATION.md) concerns the earlier
15-case governance/cold-start pass; current governance is 18 cases within bulk.
Independent [ACCEPT](../reviews/V2-7A-fe749fb.json) is recorded separately from
this evidence. The reviewer independently ran 81 primary cases, command gates
and a separate known locale failure, and inspected the retained images/logs.

Independent raw Chrome/benchmark results and the assertion-preserving OUT-only
copy diff are retained in `logs/independent/`.
