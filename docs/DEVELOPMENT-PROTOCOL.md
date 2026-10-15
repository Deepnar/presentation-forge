# Development protocol

This is the repository's development procedure, independent of any chat,
particular agent, model provider or orchestration tool. It does not implement
an autonomous runtime inside Presentation Forge.

## Authority and responsibilities

Explicit current human instructions define the authorized task. Preserve them
as a bounded task in the roadmap/evaluation before ending the session. They
may override older repository workflow instructions; do not silently treat an
old instruction or an evaluation recommendation as human approval.

| Source | Authority |
|---|---|
| `AGENTS.md` | Contributor invariants and working agreement |
| `PRODUCT-VISION.md` + `ROADMAP.md` §12 | Product direction; roadmap is the sole work/dependency registry |
| `ARCHITECTURE.md` + subsystem architecture records | As-built contracts; code/tests resolve factual discrepancies |
| `development-state.json` | Accepted baseline, implementation under review, validation pointers |
| Slice evaluation + committed evidence | What executed, what was inspected, limitations and recommendation |
| `DECISIONS.md` | Source-backed decisions and revisit conditions |
| `ACCEPTANCE-CRITERIA.md` | Common gates, with explicit applicability per task |
| `BLOCKED.md` / `TRAPS.md` | External/decision blockers and reusable failure modes |
| `CONTINUATION.md` / `HANDOFF.md` | Entry procedure / current-session snapshot, not competing roadmaps |

The state file is an index, not an approval authority. A checkmark, green tests,
or an implementer's recommendation cannot override missing independent acceptance.
V2-7A entered from the supplied `97a12de` baseline (V2-6C); its corrected source
`fe749fb` is now independently accepted. Resolve the current full accepted SHA
and its separate decision through `development-state.json`, not a historical
task-entry SHA in an evaluation. Older evals retain their historical
pending-review wording; later acceptance records resolve that chronology. Do not
reopen accepted work merely because its original evaluation predates acceptance.

## PLAN → IMPLEMENT → VERIFY → INDEPENDENT REVIEW → ACCEPT/HOLD → HANDOFF

Every task uses this contract, stored in its roadmap entry and linked evaluation:

- Accepted baseline (full SHA) and implementation branch.
- Bounded scope, rationale, architectural constraints and explicit non-goals.
- Acceptance criteria; applicability of every common gate.
- Required suites, browser interactions, export/visual evidence and performance
  measurements; exact commands, environment and isolation strategy.
- Standing failures with source and expected impact, separate from new failures.
- Final report fields, authorized commit/push destination, and stop conditions.

**PLAN.** Follow [PLANNER.md](agents/PLANNER.md). Inspect dependencies, blockers,
recent evaluations and accepted functionality. Propose a bounded slice and wait
when direction is required. Planning authorization does not authorize coding.

**IMPLEMENT.** Follow [IMPLEMENTER.md](agents/IMPLEMENTER.md). Establish fail-first
regression tests where behaviour changes, reuse canonical primitives, implement
only approved scope, and preserve human edits. Do not create tests for prose-only
changes. Put newly discovered future work in the roadmap instead of absorbing it.

**VERIFY.** Run the task's actual checks, preserving failing assertions. Classify
failures as product regression, test error, timing issue, environment limitation
or standing failure. Fix narrowly and rerun affected checks. Never count setup
skips, timed-out files or unavailable services as passing. Keep raw results and
record the code SHA plus any working-tree delta tested. Inspect final screenshots
and rasterized exports when required; inspect-only is distinct from executed.

**INDEPENDENT REVIEW.** Follow [REVIEWER.md](agents/REVIEWER.md). A separate agent
context or human compares the accepted baseline to the pushed implementation,
challenges claims, checks invariants and evidence, and executes applicable checks.
A second pass by the same agent in the same context is self-review. A separate
cold-start documentation audit alone is not implementation acceptance.

**ACCEPT/HOLD.** The reviewer or human issues an explicit decision naming the exact
reviewed commit and residual limitations. HOLD produces a narrow correction task
in the roadmap. ACCEPT permits planning the next slice; it does not authorize its
implementation, deployment, paid infrastructure or migrations. If no independent
reviewer is available, leave review pending and stop at a complete handoff.

**HANDOFF.** Overwrite `HANDOFF.md`, update state and evidence pointers, run
`npm run dev:protocol`, commit focused changes, and push to the authorized branch.
The final report gives baseline and final HEAD, changed files, executed totals
(pass/fail/skip/cancelled), unexecuted cases, corrections, performance, standing
failures, risks, acceptance recommendation and next authorized action.

## State and evidence updates

`development-state.schema.json` validates `development-state.json` (AJV, draft 7).
`implementationHead.sha` identifies the code being evaluated, not the later
commit that writes its own state. Later documentation-only commits can descend
from it without a circular self-referencing SHA. A code correction must update
that SHA in a subsequent evidence commit and rerun affected validation.

After implementation keep the previous accepted baseline, set review pending,
record required validation with explicit statuses and evidence paths. Never erase
a pending check to make the record look complete. Evidence JSON identifies its
check, implementation SHA, command, result and totals. A passed check requires
exit 0 and no failures/cancellations/skips; standing failures remain failed and
need independent assessment, not relabeling as passes.

The schema fixes this task's required check inventory so deleting a pending
entry fails validation. A later approved task updates that inventory and the
check-kind mapping in the validator together; its plan must justify changed
gates. Do not recycle V2-7A's list without checking the new scope.

After independent acceptance, attach a committed JSON review record containing
`decision: "ACCEPT"`, `implementationSha`, `reviewer`, `context`, `kind`
(`human-approval` or `independent-review`), and `evidence` (repository path).
The context must differ from `implementedBy`. Update review metadata and accepted
baseline to that reviewed SHA together; preserve the previous record in Git.
A HOLD uses the same record shape with `decision: "HOLD"` and keeps the baseline.
If complete execution contains an acknowledged standing failure, the decision
may include `waivers: [{checkId, standingFailureId, reason, evidence}]`. The
check remains failed, its source must be in `standingFailures`, and the review
must explain the exception. Unexecuted, skipped or cancelled checks cannot be
waived into completed validation. Waivers are explicit review decisions, never
inferred from a passing subset.
Run the validator after every update. It checks consistency and evidence existence;
it cannot authenticate a human's identity or prove a claimed context independent.
It never runs tests, mutates state, accepts work or advances a milestone.

## Validation isolation and stop conditions

Use Node 24. Bulk non-browser tests exclude every browser/build-owning file.
Browser files run serially, one bounded process group at a time, with logs and
explicit timeout/exit status. Do not overlap Vite builds in their shared `dist`.
Use the commands in [CONTINUATION.md](CONTINUATION.md) and the active evaluation.
On a shared machine wait for a quiet window before expensive validation. While
busy, documentation and lightweight governance checks may proceed. Never stop
unrelated work or use another project's database. Absent PostgreSQL means its
contract, concurrency, faults and browser checks remain unexecuted.

Stop after the approved scope and push. Stop dependent work on HOLD, absent
review, missing required validation or unresolved product direction; record the
specific blocker and continuation command. Do useful independent work already
in scope while blocked. No dependent features to fill the time.

Use factual focused commits, explicit paths when staging, no attribution trailers,
and regular pushes to the authorized branch. Preserve unrelated tracked/untracked
work. Within approved scope inspection, tests, fixes, reports and review preparation
are autonomous. Human approval is required for major product/architecture changes,
paid infrastructure, data-handling/security policy changes, removing accepted
functionality, destructive repository operations, production deployment and
irreversible migrations. Correctness acceptance does not grant those permissions.
