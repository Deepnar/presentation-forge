# Handoff — V2-8H implemented, validation and review pending

2026-10-23 · branch `v2`; authorized push `origin/v2`.
Accepted product remains `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
The explicit continuation resumes the approved contract and lifts the overnight
stop. Scope and policy authority remain in [the roadmap](ROADMAP.md#assistant-turn-approval-contract).

Implementation/test source `464c6d787d77444b7110226d2fc14649acd8e5f1` adds the
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
