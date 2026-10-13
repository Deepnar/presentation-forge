# Handoff — V2-6C hosted persistence implemented, pending review

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-4 [x];
V2-5 [~]; V2-5A through V2-5K [x] at `fa557c4`; V2-6A [x],
V2-6A-1 [x] and V2-6B [x] accepted at `0ec8aa4`; V2-6C [~]
pending independent review with `docs/V2-6C-EVAL.md`; V2-6
parent stays `[ ]` until hosted readiness is verified).

## Current state

On `v2`, over `0ec8aa4`. This session built the hosted-storage
foundation: one ProjectStore interface, two adapters.

- Selection (`src/projects/backend.js`): SQLite default
  everywhere; `FORGE_PROJECTS_BACKEND=postgres` + explicit
  `FORGE_PROJECTS_DATABASE_URL` for shared state; anything else
  answers 503 `store-misconfigured` (never silent fallback).
  Routes resolve the store inside their try blocks; boot logs the
  selection without secrets.
- Postgres adapter (`src/projects/store-postgres.js`, pure-JS
  `pg`): full surface, same shapes/codes; row-lock + CAS in one
  transaction; TEXT payloads; `ON CONFLICT DO NOTHING` baselines;
  DDL outside transactions (memoized per pool); error handler on
  checked-out clients. Provenance/audit/retention/ownership
  shared by import (`buildAudit`, `computePrunePlan`,
  `canAccessProject`).
- Proof: shared contract 17/17 on both backends (fail-first
  `ERR_MODULE_NOT_FOUND` on isolated `0ec8aa4`); 11/11
  multi-process races (two processes × shared Postgres, plus two
  × one SQLite file); 8/8 fault injection (terminated backends,
  trigger-broken history/prune, unreachable DB, pool exhaustion,
  SIGKILLed writers, aborted PUTs, misconfigured hosts); 3/3
  real-Chrome flows against Postgres incl. restart + two-session
  conflict, evidence in `docs/v2-6c-evidence/`.
- Deploy: profile-gated `db` (Postgres 16) in compose + env
  wiring; decision record `docs/V2-6C-HOSTED-STORAGE.md`.

**Result for the reviewer.** Same-base writes from two processes
resolve to exactly one winner with no partial data, on either
backend; failures never report Saved; misconfiguration refuses
honestly.

## Verification (at push)

- Focused: contract 17/17 × 2, concurrency 11/11, faults 8/8,
  6c Chrome 3/3.
- Full: bulk 1990 → 1989 pass + 1 standing BYOK locale failure;
  Chrome serial 16 files 73/73; grand total 2063 → 2062 + 1 known.
- Typecheck clean; production build green; benchmark 12/12.
- Exact totals in `docs/V2-6C-EVAL.md` §14.

## Continue from here

1. Independent review of V2-6C (incl. hosted readiness), then
   V2-6C acceptance and the V2-6 parent decision.
2. Do NOT begin frontend consolidation or AI integration without
   authorization.

## Environment notes for the next session

- Test Postgres runs in docker (`forge-pg-probe`, pgvector:pg16
  image, port 5544, password `probe`); test suites create/drop
  isolated databases per file via `TEST_PG_URL`. The container
  is infrastructure, not repo state — restart or remove it
  freely; do not commit any credentials (none exist in the repo).
