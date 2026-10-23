# Continuation from the repository alone

Start by reading AGENTS.md and HANDOFF.md, then DEVELOPMENT-PROTOCOL.md,
development-state.json, ROADMAP.md §12, BLOCKED.md/TRAPS.md and the active evaluation.
No previous conversation, private scratchpad, external master prompt or particular
agent provider is required. PRODUCT-VISION.md and ACCEPTANCE-CRITERIA.md define
stable direction and gates; role instructions live in docs/agents/.

## Establish current truth

```sh
git status --short --branch
git rev-parse HEAD
npm run dev:protocol
```

`development-state.json` is the current index: accepted baseline, implementation
under evaluation, active task/eval and validation evidence/statuses. The code SHA
may precede later documentation commits. Validate ancestry and inspect the diff;
do not silently replace that pointer with the documentation commit running now.
The validation program began from accepted V2-6C `97a12de` and V2-7A implementation `a298767`.
Narrow corrections through `fe749fb` have complete retained validation and a
separate ACCEPT decision in reviews/V2-7A-fe749fb.json. V2-7B-1 source `662f7d6`
is independently accepted in reviews/V2-7B-1-662f7d6.json. V2-7B-2 source
`03cc89e` is independently accepted in reviews/V2-7B-2-03cc89e.json. The state file
indexes the current full source and decision; never infer acceptance
from a green report. Tested code and subsequent evidence commits are distinct.

Read ARCHITECTURE.md's V2 sections, V2-5A-EDITOR-ARCHITECTURE.md with later editor
evaluations, V2-6-PERSISTENCE-ARCHITECTURE.md, V2-6C-HOSTED-STORAGE.md and
V2-7-FRONTEND-ARCHITECTURE.md. Earlier evals are historical evidence; the roadmap's
later acceptance state and the supplied baseline do not become pending merely
because old eval wording predates review.

## Active task and reproduction

The approved V2-8H contract was explicitly resumed on 2026-10-23. Its headless
implementation is committed at `464c6d7`, **pending complete validation and separate
acceptance**. Read [the evaluation](V2-8H-EVAL.md), state and
[nine-gate inventory](v2-8h-evidence/validation-plan.json). The prior native-ID
correction `45c2c4c` remains the accepted baseline. The current slice adds no
Assistant UI or HTTP route and authorizes no real model API/local inference.
Use only the fresh `v2-8h-evidence` / `out/v2-8h-validation` namespaces. Preserve
historical evidence, including ignored PPTX archives and five canonical out files,
by verified snapshots before any full/browser/build validation. Do not rerun old
finishers. Missing PostgreSQL is unexecuted, never a historical pass.

The approved [V2-8A foundation](ROADMAP.md#v2-8a-scope-proposal) is independently
accepted atd4f446c in [the decision](reviews/V2-8A-d4f446c.json).
State/[evaluation](V2-8A-EVAL.md) index exact source,209-file2393/2393 plus1distinct
headless case, independent148/148 and all command/visual evidence. The owned service
was removed after a saved zero-database observation;5544closed. Its absence does not
invalidate historical execution or supply a pass for a future run.

The human selected the recommended [V2-8B durable run core](ROADMAP.md#v2-8b-scope-proposal)
on 2026-10-19. Its [evaluation](V2-8B-EVAL.md) freezes the implementation/check
contract. Exact source `1fb39ff` is [independently accepted](reviews/V2-8B-1fb39ff.md).
The 212-file 2462/2462 matrix plus 2 distinct persisted native cases passed, as did
build/type/50 cells and independent 65 current-source checks. Earlier 204 independent
checks on `501f2f8` remain historical, with source-delta proof and 34 overlap. The owned
service was removed after a saved zero-database observation; port 5544 is closed. Missing
PostgreSQL on a future run means its checks are unexecuted, not automatically green.
Preserve known Fit/timeout/capture/locale/mixed-runSVG limits and the explicit
2ignored-original-PPTX provenance limitation. All original3untracked paths stay
untouched. No new feature, infrastructure, migration or deployment is authorized
by acceptance. Use the [active runbook](v2-8b-evidence/RUNBOOK.md) when reproducing; earlier
reports are historical evidence, not execution of a later source.

[V2-8C provider exchanges](ROADMAP.md#v2-8c-provider-boundary) are independently
accepted at `e41d509` in [the exact-source decision](reviews/V2-8C-e41d509.json).
State/[evaluation](V2-8C-EVAL.md) index 2533/2533 distinct primary checks, 137 separate
repeats and 320/320 independent executions with explicit overlap. Build/type/50 cells
and browser/native inspection passed. The separate locale probe remains 9 pass/1
standing failure. Current owned PostgreSQL was removed after a fresh saved/fsynced
zero-database observation; port 5544 is closed. The earlier reboot-lost service
has no saved pre-removal count; that count remains unavailable. All 3473 files in
the independent snapshot were restored/hash-verified and 10 new independent
originals preserved, in addition to 13 new implementer originals.

For reproduction use [the current runbook](v2-8c-evidence/RUNBOOK.md) and its full
215-file inventory, snapshotting all current evidence and ignored originals before
any generators and creating an owned isolated PostgreSQL service. Do not rerun
finish-evidence.py against restored canonical out/ originals: its fresh-source hash
checks deliberately refuse. Provider fixtures prove protocol/command plumbing, not
live model quality or the parent two-provider/common-search gate. No Assistant/new
UI is part of this slice. Acceptance permits planning only; the next candidate
remains unauthorized in state and future work lives in the roadmap.

[V2-8D provider-backed run preparation](ROADMAP.md#v2-8d-provider-run-preparation)
is independently accepted at8c1e5c4 in [the decision](reviews/V2-8D-8c1e5c4.json).
State/[evaluation](V2-8D-EVAL.md) index2643distinct primary checks,134separate repeats,
358independent executions with explicit overlap, build/type/50cells and inspected
browser/native evidence. Standing locale remains9pass/1fail separately. The reviewer
finished and staged its explicit decision before a usage-limit interruption; root
committed that unchanged record. Accepted V2-8C evidence is historical prerequisite
execution, not a new8D run.

The owned service was removed after a saved/fsynced zero-project-database observation;
5544is closed. Use [the8D runbook](v2-8d-evidence/RUNBOOK.md) and218-file inventory for
fresh reproduction, preserving all evidence and ignored originals first. The root
snapshot3631files and reviewer snapshot3898files were restored/hash-verified;23new
original PPTXs are retained across both namespaces. Existing visual/live-quality/
provenance limits remain. Do not rerun finish-evidence.py against restored canonical
out/ originals. Next-candidate status remains unauthorized; stop after this closeout,
and keep all future work in the roadmap.

[V2-8E bounded tool-conversation preparation](ROADMAP.md#v2-8e-bounded-tool-conversation)
is independently accepted at c71d65e in the
[exact-source decision](reviews/V2-8E-c71d65e.json).
State/[evaluation](V2-8E-EVAL.md) index complete final-source validation and acceptance. After the human resumed, the
221-file matrix passed2733/2733 plus4distinct persisted/native scenarios,110separate
repeats, build/type/50cells and115inspected images. Locale remains9pass/1fail separately.
The paused4067-file and resumed4183-file evidence snapshots and5canonical originals
were restored/hash-verified. Actual retained browser exports are distinguished
from newly produced headless originals. Historical paused results are retained in
the [assessment](v2-8e-evidence/paused-2026-10-21/assessment.json); their old unexecuted
status is resolved by the later complete packet, not erased.

The independent reviewer executed504/504successful checks plus the separate
9pass/1standing locale failure, inspected115packet/54fresh images and verified
16native archives. Its498packet repeats and6new probes are not added to2737.
All4443evidence files/96PPTXs plus5canonical originals were restored/hash-verified;
10fresh original PPTXs were preserved. The inherited
[native shape-ID issue](ROADMAP.md#native-pptx-shape-id-uniqueness) remains explicit.
The resumed owned service was removed after its fresh saved/fsynced actual0-project-
database observation; exact absence/5544closure are proved in
[cleanup evidence](v2-8e-evidence/owned-postgres-cleanup.json).
[The runbook](v2-8e-evidence/RUNBOOK.md) defines fresh reproduction; never rerun
finish-evidence.py against restored canonical originals. Acceptance and cleanup
are complete. No further feature is authorized; future scope is only in the roadmap.

The [V2-8F shared search boundary](ROADMAP.md#v2-8f-shared-search-boundary) is
independently accepted at `0cab854` in the
[exact-source decision](reviews/V2-8F-0cab854.json). [Evaluation](V2-8F-EVAL.md) and
state index 2,786 primary distinct passes, 48 separate focused repeats, all nine
gates, 115 inspected packet images and 595 independent passes. The latter repeat
592 packet cases and add three probes; they are not added to the primary total.
The reviewer inspected 54 fresh images and 16 native archives, restored all 4,918
evidence files plus five canonical originals, and retained ten fresh original PPTXs.
The interrupted unacknowledged 477-case report remains excluded; all 477 were rerun
with recorded exit 0. Locale remains 9 pass/1 standing failure separately.
The owned service was removed after a fresh saved/fsynced actual zero-project-DB
observation; exact-ID absence and port 5544 closure are
[verified](v2-8f-evidence/owned-postgres-cleanup.json). Use the
[8F runbook](v2-8f-evidence/RUNBOOK.md) with a new namespace and all-current snapshots
for reproduction; do not run generators against restored canonical originals.
Read current HANDOFF before any job. Acceptance and cleanup are complete; no next
feature or parent V2-8 completion is authorized by this decision.

The 2026-10-22 [architecture audit](V2-8-ARCHITECTURE-GAP-AUDIT.md) is a separate
inspection-only report; it executed no tests/models/services and changed no accepted
state. Proposed priorities live in [the roadmap](ROADMAP.md#v2-8-audit-followups).
The later clarification permits only the separate [V2-8G transport correction](ROADMAP.md#model-provider-stream-resource-bounds)
using code and deterministic fixtures, with no API-backed model or local inference.
The correction at `f3e784a` now has complete 224-file validation: 2,801/2,801,
plus four distinct persisted native cases, build/typecheck/all 50 cells and current
visual/resource observations. The separate locale run remains 9 pass / 1 standing
failure. Exact source is [independently accepted](reviews/V2-8G-f3e784a.json), with
668 successful independent executions, current visual/native inspection and no
blocking finding. [Its evaluation](V2-8G-EVAL.md) and state record exact evidence.
The owned service was removed after a fresh saved/fsynced zero-project-database
count and verified 5544 closure; [cleanup](v2-8g-evidence/owned-postgres-cleanup.json)
is complete. Read current handoff/state before work; audit proposals retain their
roadmap gates and acceptance authorizes planning only.

On a shared machine inspect load, free memory and `/proc/pressure/io` and wait for
an appropriate quiet window. Do not interrupt unrelated work. Forge PostgreSQL
uses TEST_PG_URL or the isolated default on port 5544; other projects' databases
are not substitutes. When absent, PG contract/concurrency/fault/browser checks
remain unexecuted.

The canonical test entrypoints are:

```sh
node --test test/dev-protocol.test.js
node --test --test-concurrency=1 test/v2-project-catalog-7c.test.js test/v2-project-catalog-http-7c.test.js test/v2-project-catalog-chrome-7c.test.js
node --test --test-concurrency=1 test/v2-runtime-8b.test.js test/v2-runtime-process-8b.test.js test/v2-runtime-postgres-8b.test.js
node --test test/v2-edit-chrome-7a.test.js
node --test test/v2-projects-6c-sqlite.test.js
node --test test/v2-projects-6c-postgres.test.js
node --test test/v2-projects-6c-concurrency.test.js
node --test test/v2-projects-6c-faults.test.js
node_modules/.bin/vite build --config app/web/vite.config.js
npm run typecheck
node tools/v2-benchmark.mjs --out out/v2-8g-benchmark --raster none
```

Use a process-group watchdog for each browser file and run browser files strictly
serially; each may rebuild shared dist. Bulk inventory and exact bounded runner
commands are in [the current validation runbook](v2-8g-evidence/RUNBOOK.md) and its linked
`validation-plan.json`. Do not run plain npm test
concurrently with browser/build validation. The benchmark must report all 50
cells, not merely the 12 benchmark assertion tests. Render/preview and inspect
PPTX rasters when claiming render quality; raster-none benchmark results alone
measure compiler/OOXML properties, not visual quality.

## If the original planner/reviewer is unavailable

Recover the authorized scope from the active task/evaluation and linked roadmap.
Complete already approved validation, document unavailable checks accurately,
commit/push scoped work and prepare a review request: baseline → pushed SHA,
original scope/non-goals, changed files, exact tests and visual evidence, defects,
corrections, known failures and recommendation. Leave review pending without an
independent reviewer. A reviewer follows agents/REVIEWER.md and issues ACCEPT or
HOLD. The planner follows agents/PLANNER.md only after that decision; next-candidate
status never grants coding authorization.
