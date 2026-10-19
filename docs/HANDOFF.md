# Handoff — V2-8B independently accepted

2026-10-19, branch `v2`, push destination `origin/v2`. The authorized durable run
core is complete and independently accepted at
`1fb39ff75cd473ecaf2884232d5d7465d50a9af2`; task-entry accepted baseline was V2-8A
`d4f446c7b2fcae851c37d1a46288cf91317c38b4`. Later commits contain docs/evidence only.
[Decision/report](reviews/V2-8B-1fb39ff.md), [evaluation](V2-8B-EVAL.md),
[scope/completion](ROADMAP.md#v2-8b-scope-proposal) and development-state.json agree.

The core provides persisted scoped semantic plans, database-clock leases/fencing,
durable attempt budgets, cancellation, atomic project/history/receipt checkpoints,
real crash recovery and trusted headless control/worker CLI on both existing store
backends. Canonical edits and exact human preservation remain authoritative.
Checkpoint consistency and pooled-listener defects were fixed. Test-only remount
readiness resolved the later HOLD; inherited catalog loading geometry remains
separate roadmap work. No provider, Assistant UI or public transport was added.

The complete 212-file matrix passed 2,462/2,462 plus 2 distinct persisted export
cases, with zero required fail/skip/cancel/unexecuted. Focus 69 repeats and the
separate en_IN locale probe (9 pass/1 standing fail) are not added to distinct
counts. Build/typecheck/50 cells passed; all 99 fresh images inspected. Independent
current-source execution passed 65/65 plus build/type/protocol/50 cells. Prior 204
independent checks on unchanged runtime source501f2f8 remain explicitly historical,
with 34 overlap. See the evaluation for full attempt chronology and limitations.

Final implementer evidence is in v2-8b-evidence/final; independent-final has the
fresh reviewer traces/exports. Historical HOLD evidence remains intact. Reviewer
restored 16 paths and verified all 3,193 backed-up hashes, including 28 archives.
Root historical/final packets each retain all 99 image hashes and four original
PPTX hashes. No missing original bytes were reconstructed.

The exact owned PostgreSQL container was stopped after saving/fsyncing a zero
project-database observation; auto-removal and closed localhost5544 were verified
in v2-8b-evidence/final/cleanup.json. No owned service remains. Unrelated services
were untouched. Future PostgreSQL checks need a new isolated owned service and
are unexecuted while absent; historical passes are not future execution.

The approved slice stops here. [Remaining V2-8 work](ROADMAP.md#v2-8-remaining) and
all later scope live only in the roadmap; acceptance grants planning, not another
feature, deployment, paid infrastructure or production schema migration.
Preserve original untracked `.agents/`,
`PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md` and
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`.
