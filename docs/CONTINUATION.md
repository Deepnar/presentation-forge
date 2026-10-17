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

[V2-7C-1-EVAL.md](V2-7C-1-EVAL.md) indexes the approved first-slide project
cover slice. Human direction selected previews above existing project-card
metadata/actions; the bounded contract is in [the roadmap](ROADMAP.md#v2-7c-1-plan).
The accepted baseline is now V2-7C-1 source `f79ae07`, with its separate
[decision/report](reviews/V2-7C-1-f79ae07.md). Task entry used B2 `03cc89e`.
Do not infer acceptance from passing tests or advance beyond the stopped slice.
The frozen implementation is recorded in state and the evidence plan; later
commits may contain documentation/evidence only. The current inventory has
202 files: 174 bulk, 24 serial browser/build owners and four PostgreSQL files.
The focused cover gate repeats 23 unit, nine HTTP and 12 Chrome cases. Repeated
backend runs are not added to the distinct matrix total.

Read the active evaluation and [runbook](v2-7c-1-evidence/RUNBOOK.md) for execution
status, commands, attempts and limitations. The current slice is complete and
stops at its review/handoff. List consolidation, toolbar polish, agent runtime
and deployment require their own task contracts; next-candidate status is not
authorization. Preserve the separate BYOK locale and B2 restore-timeout records.

On a shared machine inspect load, free memory and `/proc/pressure/io` and wait for
an appropriate quiet window. Do not interrupt unrelated work. Forge PostgreSQL
uses TEST_PG_URL or the isolated default on port 5544; other projects' databases
are not substitutes. When absent, PG contract/concurrency/fault/browser checks
remain unexecuted.

The canonical test entrypoints are:

```sh
node --test test/dev-protocol.test.js
node --test --test-concurrency=1 test/v2-project-covers-7c.test.js test/v2-project-covers-http-7c.test.js test/v2-project-covers-chrome-7c.test.js
node --test test/v2-edit-chrome-7a.test.js
node --test test/v2-projects-6c-sqlite.test.js
node --test test/v2-projects-6c-postgres.test.js
node --test test/v2-projects-6c-concurrency.test.js
node --test test/v2-projects-6c-faults.test.js
node_modules/.bin/vite build --config app/web/vite.config.js
npm run typecheck
node tools/v2-benchmark.mjs --out out/v2-7c-1-benchmark --raster none
```

Use a process-group watchdog for each browser file and run browser files strictly
serially; each may rebuild shared dist. Bulk inventory and exact bounded runner
commands are in [the active validation runbook](v2-7c-1-evidence/RUNBOOK.md) and its linked
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
