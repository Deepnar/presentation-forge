# Current handoff — V2-8I-1 in progress

Branch/push: `v2` / `origin/v2`. Accepted baseline is H `22e7c97`, with
[separate acceptance](reviews/V2-8H-22e7c97.json). I1 frozen source is
`5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`. Later documentation commits do not retag tested source.

The immediate authorized slice is the [I1 bounded contract](V2-8I-1-EVAL.md).
Five authenticated lifecycle routes reuse H; no public submit/prepare/worker or
Assistant UI is included. The human delegated dependency ordering; future scope
remains only in [the roadmap](ROADMAP.md#assistant-surface-integration).

Development execution: first SQLite run 14 pass / 2 fail (incorrect authorization
and admin fixtures, retained); corrected SQLite plus protocol 49/49 passed before
the URI correction. A lightweight single-request negative probe then reproduced
HTML/path disclosure for malformed parameters; the scoped correction passes that
probe and adds the shared backend assertion. All acceptance gates remain pending.
The old development coordinator was stopped with no child/test active while
waiting for admission; its typecheck is unexecuted. A new candidate check uses
`out/v2-8i-1-development/candidate-check.py`; inspect its log/process before any
other validation. Logs are
in `out/v2-8i-1-development`. It is not the final matrix.

Follow [the I1 runbook](v2-8i-1-evidence/RUNBOOK.md). Draft validation helpers are
current-slice files; inspect their checks before execution. No I1 backend or fresh
snapshot has been created yet. Shared CPU/storage contention is ongoing. Do not
stop unrelated jobs. The exact-source reviewer `/root/turn_contract_review` has
been assigned read-only source review only; root retains the validation slot until
explicitly released. Full matrix, actual PostgreSQL, production build, typecheck,
50 cells, final raster inspection and independent execution/decision remain pending.

Preserve original untracked `.agents/`, `PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`
and `PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`. Do not deploy, migrate, call a
real model or run inference. Stop after I1 ACCEPT/HOLD. Do not run historical H
coordinators/finishers or reuse its removed container.
