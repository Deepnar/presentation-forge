# Handoff — V2-8H binding correction, validation pending

2026-10-23 · branch `v2`; authorized push `origin/v2`.
Accepted product remains `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
Approved H contract is resumed; [roadmap](ROADMAP.md#assistant-turn-approval-contract)
and [evaluation](V2-8H-EVAL.md) define scope. No models/local inference, Assistant
UI/routes, dependent feature, deployment or production migration are authorized.

Implementation/test source `ac8749613bfbd927dab629f479d3d05f10a99195` corrects the
independently found mutable binding defect by taking a private snapshot at all seven
public entries. Fail-first7/7 fail on old product source; corrected development
unit/SQLite/process47/47 and typecheck pass. Independent correction review and all
nine fresh complete gates remain pending. State/inventory identify the exact source.

Prior cc3 partial76 focused/2474 bulk/73 serial passes are preserved separately in
`v2-8h-evidence/prior-attempt-cc3ed18`; no cancelled test. Do not relabel these as
replacement-source passes. All5725 historical evidence files/164 PPTXs and five
canonical originals were restored/hash-verified after preservation. Original
snapshots remain `out/v2-8h-validation/{backup,prior-generated-backup}`; reuse those,
never resnapshot rewritten outputs or run old finishers.

Fresh validation uses `out/v2-8h-validation-r3` and current H scripts only, after
180-second measured quiet-window qualification. Resume coordinator with `--resume
--max-new-jobs 3` only after a complete between-job yield; never overlap browser/build
jobs. The owned PostgreSQL15.18 instance is still running: ID
`d89e445e3e9ac94460781fbe5932cc35b7ed8752814e1146ee7fa751e467d4b2`, name
`forge-v28h-validation`, local5544. Verify exact recorded metadata and zero leftover
DBs before reuse. Save/fsync fresh zero-project-DB evidence before exact-ID cleanup.
Original untracked `.agents/`, `PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md` and
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md` remain untouched. Independent
acceptance is pending; stop after H.
