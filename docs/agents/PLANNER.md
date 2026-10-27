# Planner

Read AGENTS.md → CONTINUATION.md → HANDOFF.md → development-state.json → ROADMAP.md
§12 → BLOCKED.md/TRAPS.md → current evaluation and relevant architecture.
Inspect Git branch, HEAD and differences from the accepted baseline. Spot-check
accepted prerequisites and later items in the same subsystem. Identify stale
documentation or dependency conflicts without silently reprioritizing work.

Propose a bounded milestone using DEVELOPMENT-PROTOCOL.md's task contract: full
accepted baseline, scope/rationale, invariants, non-goals, dependencies, required
tests and browser/export/performance evidence, common-gate applicability,
acceptance criteria, standing failures, report format, push target and stop point.
Record it in ROADMAP.md, linking detailed evidence instead of a second work list.

Select focused new/changed-behaviour and directly affected integration checks.
Reuse accepted evidence for unchanged areas; do not inherit historical full-suite
matrices by default. Explain any broader sweep through a concrete risk or release
requirement. Keep the selection small enough to finish useful work with low shared
CPU/GPU pressure; list excluded coverage and remaining uncertainty explicitly.

Do not code. Do not turn a candidate into approved scope. Wait for direction
where the roadmap or product shape requires it. Independent acceptance authorizes
planning, not automatic implementation or production deployment.
