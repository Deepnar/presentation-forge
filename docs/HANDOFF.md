# Handoff — V2-7C-1 validation in progress

2026-10-17, branch `v2`. Frozen product/test/governance source:
**f79ae07d6ad1696da3106a2a1148ae0ce7f58f51**. Accepted baseline remains
**03cc89ef233db5469066599391cbaac68c2fc646**, with the separate
[B2 decision](reviews/V2-7B-2-03cc89e.json). Task-entry checkout b8dc425.
Read AGENTS.md, DEVELOPMENT-PROTOCOL.md, CONTINUATION.md, development-state.json,
the [approved contract](ROADMAP.md#v2-7c-1-plan) and [evaluation](V2-7C-1-EVAL.md).
Human direction selected first-slide previews above existing card title/actions.

Covers use the canonical first saved scene/SVG renderer through an owner-checked,
revision-scoped read. The workspace owns bounded near-viewport work and a
memory-only cache. Editing/reorder/restore refresh revisions; preview failure
keeps Open usable. Account changes invalidate the old view into focused recovery.
Early independent read-only review led to narrow corrections for StrictMode,
settled account changes, cancelled preparation and real font-download recovery.
The corrected dynamic/static font outage cases both pass; no feature expansion.

The final 202-file matrix is running in bounded serial isolation. Focused 44 and
bulk 2053 pass with zero fail/skip/cancelled; remaining groups are pending.
The actual run owner is `/root`; do not overlap browser/build/plate commands.
Exact source, inventory and commands are in [the runbook](v2-7c-1-evidence/RUNBOOK.md).
Its coordinator is `out/v2-7c-1-validation/run-final.py`; outputs are under that
scratch directory. Do not reuse earlier milestone results as current validation.
Superseded attempts are retained and classified under `v2-7c-1-evidence/attempts/`.

Only the owned disposable PostgreSQL service `forge_v27c1_validation_pg`, exact
container 17f1955c89b993ffe636cafee07cca8ea1913739155ddb43d374ba7c0ae9e668 on
localhost:5544, is authorized for these checks. Per-suite databases are unique.
Keep it until independent validation finishes, then verify no owned databases
remain and remove only this container/tmpfs. Never use or stop other projects'
5432/5433 databases, the existing :8090 app or unrelated processes. Environment
samples and pending cleanup are in `v2-7c-1-evidence/environment.json`.

Independent reviewer `/root/v27b_review` has read the implementation and both
font corrections. Final acceptance remains pending complete evidence and its own
bounded checks after the exclusive heavy slot is released. Do not self-accept.
The direct repository workflow applies; no provider allowlist or relay is required.

Preserve original unrelated untracked `.agents/`,
`PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md` and
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`. Authorized push is `origin/v2`.
Historical suite output rewrites must be copied into ignored scratch / selected
current evidence before restoring only those historical paths. No deployment,
production migration or live model content-quality run is authorized here.

Known BYOK locale, Fit and isolated B2 restore-timeout limits remain separate;
see the evaluation and linked roadmap entries. Stop after C1 review/handoff.
List consolidation and all other feature work remain roadmap-gated.
