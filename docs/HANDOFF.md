# Handoff — V2-5B-1 implemented, in review; V2-5B pending; V2-5C NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x] at
`5beba39`; V2-5 [~]; V2-5A [x] at `06a0211`; V2-5B [~] in
review; V2-5B-1 [~] correction in review).

## Current state

On `v2`, over `8e863f5`. This session fixed the two V2-5B
review findings in `packages/model/engine.ts` with no
architecture change: (C1) a per-document FIFO transaction
boundary — apply/batch/undo/redo check revision and
duplicate ids inside their acquired turn, so concurrent
racers serialize and exactly one commits; (C2) snapshot
history — entries carry per-touched-slide or full-array
state images beside the retained semantic inverses, so
undo/redo restore exact ownership metadata and regeneration
counterfactuals behave.

**What lands (expect ~2 scoped commits):** queue +
snapshot-history engine correction; 21 correction tests in
`test/v2-engine-5b1.test.js` (12 fail on `8e863f5`
including the required race and regeneration cases);
report (`docs/V2-5B1-EVAL.md`); V2-5B eval §16 note, arch
record + ARCHITECTURE + roadmap updates, and this handoff.

**Result for the reviewer.** Both defects have
failing-baseline proof and green corrections with zero
base-suite changes (73/73 related green at gate time).
D1–D5, P2-1, BYOK unchanged. Recommend accepting V2-5B
with this correction.

## Verification (re-verify before push)

- `test/v2-engine-5b1.test.js` — 21/21.
- Engine 27/27, ownership 5/5, preservation +
  preflight/readiness/scene suites green.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells
  L1 zero.
- Full `npm test` with exact totals (expect BYOK +
  possible P2-1 flakes, separated honestly).

## Continue from here

1. Independent review of V2-5B + V2-5B-1 (commits,
   `docs/V2-5B-EVAL.md` §16, `docs/V2-5B1-EVAL.md`).
   Then V2-5C interactions per arch §15.
2. Do NOT begin V2-5C, editing UI, persistence, or agent
   integration without authorization.
