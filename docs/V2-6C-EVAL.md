# V2-6C Evaluation — hosted persistence & multi-instance safety

Date: 2026-10-13. Baseline `0ec8aa4` (V2-6B implemented, pending
acceptance — accepted by this slice, see §16). Parent V2-6 stays in
progress until hosted readiness is independently verified. No
frontend redesign, agent execution, collaboration, sharing,
accounts, imports, editor tools, templates, uploads, or
provisioning.

Drivers: contract `test/v2-projects-6c-sqlite.test.js` (17/17) +
`test/v2-projects-6c-postgres.test.js` (17/17); concurrency
`test/v2-projects-6c-concurrency.test.js` (11/11); faults
`test/v2-projects-6c-faults.test.js` (8/8); browser
`test/v2-edit-chrome-6c.test.js` (3/3, pg-backed API + built dist).
Evidence: `docs/v2-6c-evidence/` + README. Decision record:
`docs/V2-6C-HOSTED-STORAGE.md`. Architecture deltas:
`docs/V2-6-PERSISTENCE-ARCHITECTURE.md` §11.

## Verdict

The same presentation project saves, reopens, and recovers
through a shared PostgreSQL database with two server processes
issuing competing writes — and SQLite behavior is unchanged.
PASS recommended; V2-6C `[~]` pending independent review.

## 1. Backend decision

PostgreSQL 16 for shared state; SQLite stays the local and
single-instance backend. Rationale, costs, pooling, secrets,
backup, migrations, dev requirements, and limitations are in
`docs/V2-6C-HOSTED-STORAGE.md` §§1–9. Nothing was invented:
validated against real PostgreSQL 16; no production deployment
is claimed (no credentials exist here).

## 2. One interface

`src/projects/backend.js` is the single server-side selection
boundary (`FORGE_PROJECTS_BACKEND`, `FORGE_PROJECTS_DATABASE_URL`,
pool/SSL knobs). Routes resolve the store per request; React and
the engine import no database code. Both adapters export the same
nine operations plus `canAccessProject` (asserted by
`assertInterfaceParity`), share provenance/audit/retention logic
by import (`validateProvenance`, `buildAudit`,
`computePrunePlan`), and preserve `saved`/`noop`/`stale` plus all
existing error codes. Misconfiguration throws
`store-misconfigured` → honest 503, never a silent fallback.

## 3. SQLite compatibility

Untouched semantics: WAL file, both tables, lane-serialized
`BEGIN IMMEDIATE`, ownership predicate, 20/100 retention,
fixtures, export path. The contract suite runs unmodified
against it (17/17), and two processes against one SQLite file
resolve same-base races to 200 + 409 — proving the correctness
boundary was always the file lock plus compare-and-swap, never
the per-process lane.

## 4. Hosted schema and migration

Same two tables (TEXT payloads holding identical JSON bytes —
byte-identical round-trips, no JSONB normalization), idempotent
`CREATE TABLE/INDEX IF NOT EXISTS` per pool, enforced outside
write transactions. Baselines, corruption refusal, and future-
version rejection behave identically on both backends (contract).
No local-to-hosted data migration is performed; the seam is the
identical document format plus export, documented — user data is
not pretended migrated.

## 5. Multi-instance transactions

Row lock (`SELECT ... FOR UPDATE`) + compare-and-swap
(`UPDATE ... WHERE id AND revision`, `rowCount` check) + history
INSERT + prune in one READ COMMITTED transaction. Proven: two
processes × shared Postgres across save/save, save/rename,
save/restore, restore/restore, rename/rename, triple-contention
mixed mutations (exactly one winner, two stale, history +1),
delete-during-save (exactly one consistent outcome), baseline
races (one row via `ON CONFLICT DO NOTHING`), retention under
contention, id uniqueness, and cross-instance same-owner access
with cross-owner 404s.

## 6. Ownership and authorization

Exact-match predicate reused verbatim; session gate untouched;
no anonymous CRUD; IDs stay identifiers. Denied cross-instance
writes change no rows (asserted via history counts).

## 7. History fidelity

Snapshots, revision numbers, audit descriptions, restore
provenance (`restoredFrom`), 20/100 retention, baselines,
corruption detection — all pinned identically per backend by the
contract (retention, restore, migration, round-trip, export
describes). Audit rows carry no executable keys on either store.

## 8. Concurrency tests

11/11 multi-instance (10 pg + 1 shared-sqlite-file), plus
contract-level races per backend (save/save, save/rename,
rename/rename, restore/restore). Losers report stale with both
numbers; no partial project or history data in any outcome
(asserted via row counts and bytes).

## 9. Fault injection

8/8: terminated backend mid-transaction (deterministic row-lock
stall + `pg_terminate_backend`) rolls back with `storage
unavailable`; trigger-injected history-INSERT and prune-UPDATE
failures roll back project + history together; unreachable
database never reports saved; pool exhaustion (max 1) refuses
loudly after the 5s connection timeout while the blocked winner
still commits on lock release; SIGKILLed writer loop leaves
`history count == revision + 1` with every payload validating;
aborted HTTP PUT commits-or-rolls-back atomically (invariant
holds either way); postgres-without-URL answers 503
`store-misconfigured` on every project route.

Two product defects found by the faults, fixed in the slice:
a dead checked-out pg client crashed the process via an
unhandled `error` event (now swallowed at checkout; the pending
query still rejects and maps), and store resolution sat outside
the routes' try blocks so misconfiguration answered generic 500
(now inside; honest 503).

## 10. Connection and deployment

Bounded memoized pool (default 10, cap 50); TLS modes explicit;
no credentials in logs (boot prints selection + pool max only);
no per-request database switching (one URL per process);
repeatable DDL with explicit 503 when unreachable. Compose gains
a profile-gated `db` (Postgres 16, internal-only, `pg_data`,
healthcheck) plus documented env wiring; default installs are
unchanged. Validated `compose config` with and without the pg
profile.

## 11. Browser compatibility

Unchanged protocol: the same save/autosave/reopen/conflict/
history/restore/export flows pass against the pg backend (3/3),
including reopen across an API kill + restart and a two-session
409 conflict with the loser's edits intact. Restart reproves the
durability claim is the database, not process memory.

## 12. Native PPTX

Hosted-backed restored documents export native and order-exact
(slide count vs stored scenes, unzipped parts), equivalent to
SQLite output by construction — both render from the same
validated document bytes through the same renderer.

## 13. Contract testing

16 contract areas (CRUD, validation, isolation, save/rename/
restore conflicts, atomic history, retention, baseline,
corruption, round-trip, export, no-op, deletion, unauthorized
reads, plus interface parity) run unmodified per backend, 17/17
each. Fail-first: the contract file fails at import on isolated
`0ec8aa4` (`ERR_MODULE_NOT_FOUND` for the postgres adapter).
No mocked adapters anywhere: every hosted assertion hits real
PostgreSQL over real connections and processes.

## 14. Full-suite totals

Method: 168 non-browser files in one parallel run (new 6c
headless suites included, `TEST_PG_URL` set, each on an isolated
database), then each Chrome file serially with a 15-minute
watchdog (no watchdog fired). Recorded at close:

- Non-browser bulk: **1990 tests — 1989 pass, 1 fail**, 0 skipped,
  0 cancelled. The single failure is `test/byok-budget.test.js`
  ("between 10,000 and 50,00,000" vs "5,000,000") — the standing
  BYOK locale failure, out of scope, in code this slice does not
  touch.
- Chrome serial (16 files): **73 tests — 73 pass, 0 fail**,
  0 skipped (5c 7, 5d 4, 5e 5, 5f 5, 5i 6, 5j 5, 5k 9, 6a 5,
  6b 4, 6c 3, chart 2, table 3, fontgate 2, live-chrome 5,
  selection 5, smoke 3).
- **Grand total: 2063 tests — 2062 pass, 1 known fail**, 0 skipped,
  0 cancelled, 0 unexecuted. No incomplete run is counted as passing.
- Focused: contract 17/17 × 2, concurrency 11/11, faults 8/8,
  6c Chrome 3/3. Typecheck clean, production build green (vite
  build in the Chrome suites), benchmark 12/12.

## 15. Required deployment configuration

Single-instance: nothing (SQLite on the volume, as before).
Multi-instance: `--profile pg` compose service + a
`FORGE_POSTGRES_PASSWORD`, then `FORGE_PROJECTS_BACKEND=postgres`
with `FORGE_PROJECTS_DATABASE_URL=postgres://forge:<pw>@db:5432/forge`
(TLS via `FORGE_PROJECTS_PG_SSL` / URL `sslmode` when the database
is remote). `pg_dump` for backup; size pool max × replicas
against `max_connections`. Filesystem state (decks, previews,
brand) still needs the shared-or-sticky volume story — the
database does not cover it.

## 16. Remaining limitations

- V2-6B accepted at `0ec8aa4`; V2-6C pending review; V2-6 parent
  open until hosted readiness is independently verified.
- No read replicas, no automated failover, operator-run backups.
- SQLite-on-a-volume remains the default hosted install: durable
  against restarts, not volume loss or scale-out (stated in the
  decision record, not detected for the operator).
- No claim workflow for ownerless rows; no visual diff; history
  is not persistent undo (all carried forward).
- `pg` is a new runtime dependency (pure JS, no native build).

## 17. Recommended next slice

Independent hosted-readiness verification of V2-6C (this eval),
then the frontend-consolidation milestone per the roadmap — the
persistence seam now supports it on either backend. No AI-agent
execution over audit records without a separate authorization
design.
