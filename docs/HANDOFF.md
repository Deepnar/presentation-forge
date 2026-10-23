# Handoff — V2-8H implemented, validation and review pending

2026-10-23 · branch `v2`; authorized push `origin/v2`.
Accepted product remains `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
The explicit continuation resumes the approved contract and lifts the overnight
stop. Scope and policy authority remain in [the roadmap](ROADMAP.md#assistant-turn-approval-contract).

Implementation/test source `cc3ed185afda2058afa6f9b177f2d497fe30719c` adds the
headless durable visible-chat/proposal service, bounded schemas, atomic approval
with the existing run queue, cancellation/clear and conservative attempt recovery.
CLI parity is `agent-chat`; no routes or Assistant UI are added. Read
[the evaluation](V2-8H-EVAL.md) and [as-built boundary](V2-8-AGENT-ARCHITECTURE.md#v2-8h-durable-visible-conversations-and-approval).

Preliminary SQLite state/process/compatibility tests pass, including actual process
crashes and competing decisions. These are working-tree development checks, not
complete gates. A separate draft source review led to corrections for UTF-8 body
bounds, pre-dispatch recovery and final lease/cancellation fences. No acceptance
has been issued. All nine exact-source gates remain pending, with 229 test files.

Use the new evidence scripts only after measured quiet-window qualification;
back up all historical evidence and the five canonical output originals first.
No live model calls/local inference are authorized. No dependent feature,
production deployment or production migration is authorized. Any owned validation
service/job must be recorded by its exact identity and cleaned up after use.

Original untracked `.agents/`, `PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`,
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` remain untouched.

Current validation execution: first `b095bba` attempt stopped after focused76/76
and bulk2473/2474; retained logs classify/fix its one boundary failure. Source
`cc3ed18` is frozen for a fresh run in `out/v2-8h-validation-r2`. The owned
PostgreSQL15.18 container is still running, ID
`d89e445e3e9ac94460781fbe5932cc35b7ed8752814e1146ee7fa751e467d4b2`,
name `forge-v28h-validation`, local port5544; authoritative identity is
`v2-8h-evidence/owned-postgres.json`. Never reuse other PostgreSQL instances.
The original5725-file/164-PPTX snapshot and five canonical output originals
remain at `out/v2-8h-validation/{backup,prior-generated-backup}`. The corrected
launcher verifies the exact service and zero leftover databases, then links those
snapshots. It must not resnapshot potentially rewritten originals. Full replacement
execution is awaiting its fresh sustained quiet window; no browser/build is running.
