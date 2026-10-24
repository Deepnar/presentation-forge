# Current handoff — V2-8I-1 in progress

Branch/push: `v2` / `origin/v2`. Accepted baseline is H `22e7c97`, with
[separate acceptance](reviews/V2-8H-22e7c97.json). I1 frozen source is
`5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`. Later documentation commits do not retag tested source.

The immediate authorized slice is the [I1 bounded contract](V2-8I-1-EVAL.md).
Five authenticated lifecycle routes reuse H; no public submit/prepare/worker or
Assistant UI is included. The human delegated dependency ordering; future scope
remains only in [the roadmap](ROADMAP.md#assistant-surface-integration).

Development execution: initial SQLite 14 pass / 2 incorrect-fixture failures,
corrected pre-URI SQLite/protocol 49/49, then final candidate `5170adc` SQLite/protocol
**50/50** (18 HTTP + 32 governance), zero fail/skip/cancel. Malformed-URI and case
privacy regressions were reproduced and narrowly corrected; unsupported private
paths now return fixed JSON404. Raw failures and probe-oracle correction remain in
`v2-8i-1-evidence/development`. The old typecheck wait was stopped with no child or
leaf active; typecheck remains unexecuted. Candidate-check process finished.

Follow [the I1 runbook](v2-8i-1-evidence/RUNBOOK.md). Validation helpers passed syntax and complete-inventory checks; they have not yet
executed the final matrix. No I1 backend or fresh
snapshot has been created yet. Sustained resource qualification is running (session 65233;
`out/v2-8i-1-validation/qualification.log`). Shared contention continues. Do not
stop unrelated jobs. The exact-source reviewer `/root/turn_contract_review` has
been assigned read-only source review only; root retains the validation slot until
explicitly released. Full matrix, actual PostgreSQL, production build, typecheck,
50 cells, final raster inspection and independent execution/decision remain pending.

Preserve original untracked `.agents/`, `PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`
and `PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`. Do not deploy, migrate, call a
real model or run inference. Stop after I1 ACCEPT/HOLD. Do not run historical H
coordinators/finishers or reuse its removed container.
