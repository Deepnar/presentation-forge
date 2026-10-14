# Continuity validation — 2026-10-14

This evidence covers the repository-development subsystem, not product acceptance.
Application under validation remains `a298767`; these governance additions were
tested in the working tree and then committed as scoped changes. Final Git HEAD
is reported separately. No application behaviour changed.

## Executed checks

| Check | Result |
|---|---|
| `node --test --test-reporter=tap test/dev-protocol.test.js` | **15 tests, 15 pass, 0 fail, 0 skip, 0 cancelled** |
| `npm run dev:protocol` | **0 errors, 0 warnings** |
| Test inventory comparison | 190 files = 166 bulk + 21 serial + 3 PG; no omissions/duplicates/extras |
| `git diff --check` | Clean |
| Existing PNG inspection | 6 images opened, dimensions read, hashes recorded; final interaction evidence still pending |

Raw output: [governance-tests.tap](governance-tests.tap),
[protocol-check.log](protocol-check.log). Repeat test runs and the audit's earlier
14-test runs are not added together as extra regression coverage. The final
15-case suite includes a subsequently added retained-log consistency guard.

Negative cases cover malformed JSON/schema/SHA/review status, missing documents,
missing or duplicate required checks, baseline replacement, absent/stale/mismatched
evidence, output totals, skip/cancellation/nonzero rejection, visual/benchmark
kind/completeness, self-review, legitimate acceptance/standing-failure waiver
consistency, unsafe paths/symlinks and nonexistent Git commits. The checker itself
does not authenticate reviewer identity or prove genuine independence.

## Independent cold-start documentation audit

A separate agent context received only repository access, AGENTS.md and
CONTINUATION.md as its starting instructions. It independently recovered:
accepted baseline/full SHA, application SHA, approved validation/continuity scope,
non-goals, standing failure, full-suite/serial/PG/benchmark requirements, separate
review and ACCEPT/HOLD procedure. It ran the then-current lightweight validator
(0/0) and 14-test governance suite (14/14), never product tests.

Findings and corrections:

- Missing bulk/serial inventory and bounded commands → RUNBOOK plus exact manifest.
- Dangling evaluation section references → rewritten claims/execution ledger.
- Blanket stale blocker claims → historical framing and current resource links.
- Missing gate applicability → task-specific matrix in eval §14.
- External master-prompt procedure → repository-native entry and role documents.
- Future findings outside roadmap → concrete workspace followups recorded there.
- Historical architecture facts stated as current → qualified snapshots/driver state.
- Fixed run-log names overwrote attempts → unique UTC attempt directories.
- Handoff still requested four cases → full 18-case run plus missing interactions.
- Narrow capture mislabeled 480px → actual 500×757 and honest evidence limits.

The follow-up audit confirmed 190-file coverage and recoverability of the
full command/gate/review chain. A subsequent import audit moved three indirect
plate-render Chrome owners out of bulk; the final partition is 166/21/3.
The final separate-context confirmation found all prior gaps closed, confirmed
this final partition and reran the 15-case governance suite (15/15) and protocol
checker (0 errors/warnings). A deterministic local link/inventory/driver-syntax
check also passed. No repeated run is added to the unique-case totals.
This is an independent continuity test, not independent implementation review or
V2-7A acceptance. Implementation review remains pending.

## Product validation outstanding

The required quiet shared-machine window did not occur. Forge PostgreSQL on
port 5544 was unavailable. No expensive Chrome, bulk, PG contract/fault,
production-build, typecheck or 50-cell benchmark execution is claimed.
See [the product ledger](../V2-7A-EVAL.md#10-current-final-validation-ledger),
[environment](environment.json) and [runbook](RUNBOOK.md). Narrow-control clipping
and missing interaction/performance evidence remain unresolved. HOLD recommended.
