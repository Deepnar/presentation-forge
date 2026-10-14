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
The accepted baseline for this validation task is V2-6C `97a12de`; V2-7A code at
`a298767` awaits final validation and independent acceptance. Any subsequent narrow
corrections and their tested SHAs must be recorded in the active evaluation.

Read ARCHITECTURE.md's V2 sections, V2-5A-EDITOR-ARCHITECTURE.md with later editor
evaluations, V2-6-PERSISTENCE-ARCHITECTURE.md, V2-6C-HOSTED-STORAGE.md and
V2-7-FRONTEND-ARCHITECTURE.md. Earlier evals are historical evidence; the roadmap's
later acceptance state and the supplied baseline do not become pending merely
because old eval wording predates review.

## Active task and reproduction

[V2-7A-EVAL.md](V2-7A-EVAL.md) is the active validation contract and exact result
ledger. Finish V2-7A tests and frontend evidence, fixing only narrow regressions;
complete the continuity documents/validator in the linked roadmap entry. V2-7B,
AI runtime, imports and other features are forbidden until separately authorized.

On a shared machine inspect load, free memory and `/proc/pressure/io` and wait for
an appropriate quiet window. Do not interrupt unrelated work. Forge PostgreSQL
uses TEST_PG_URL or the isolated default on port 5544; other projects' databases
are not substitutes. When absent, PG contract/concurrency/fault/browser checks
remain unexecuted.

The canonical test entrypoints are:

```sh
node --test test/dev-protocol.test.js
node --test test/v2-edit-chrome-7a.test.js
node --test test/v2-projects-6c-sqlite.test.js
node --test test/v2-projects-6c-postgres.test.js
node --test test/v2-projects-6c-concurrency.test.js
node --test test/v2-projects-6c-faults.test.js
node_modules/.bin/vite build --config app/web/vite.config.js
npm run typecheck
node tools/v2-benchmark.mjs --out out/v2-7a-benchmark --raster none
```

Use a process-group watchdog for each browser file and run browser files strictly
serially; each may rebuild shared dist. Bulk inventory and exact bounded runner
commands are in [the validation runbook](v2-7a-evidence/RUNBOOK.md) and its linked
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
