# V2-6C Hosted Storage — backend decision and operating contract

Date: 2026-10-13. Baseline `0ec8aa4`.

## 1. Decision: PostgreSQL 16 for shared state, SQLite stays local

The repository supports exactly one database driver (`node:sqlite`,
built into Node; `package.json` carries no `pg`, `neon`, `libsql`,
`better-sqlite3`, or ORM — verified by grep over dependencies,
lockfile, `node_modules`, and imports). Deployment is one
long-running container on a persistent volume (`docker-compose.app.yml`
`forge_data:/data`); serverless is explicitly out (`docs/DEPLOY.md`).

Against that background the choice is narrow:

- **Keep SQLite as the local and single-instance backend.**
  Zero new dependencies, WAL file on `/data`, accepted V2-6A–6C
  behavior unchanged, no network database for development.
- **Add PostgreSQL 16 (pure-JS `pg` driver, new dependency) as the
  opt-in shared backend for multi-instance deployments.** It is the
  only transactional, multi-writer, networked database that fits the
  "long-running container, no serverless" deployment without
  inventing a second datastore for fashion: row locks plus
  compare-and-swap give the no-lost-update guarantee across
  processes; `SELECT ... FOR UPDATE` + `UPDATE ... WHERE id AND
  revision` is the same discipline the SQLite store already uses,
  moved from a file lock to a row lock.
- **No Neon/serverless driver, no ORM, no second primary store.**
  Neon would add an HTTP driver and a vendor for a deployment that
  runs its own container anyway; an ORM would hide the exact
  statements the contract tests pin down.

Validated here against real PostgreSQL 16 (containerized for the
test run); the compose file gains a profile-gated `db` service so
production runs the same major version.

## 2. Transaction and isolation guarantees

READ COMMITTED throughout (the Postgres default). Every
revision-changing op is one transaction:

1. `SELECT * FROM v2_projects WHERE id=$1 FOR UPDATE` — the row
   lock serializes same-project writers across processes.
2. Ownership check + `baseRevision === stored.revision` check on
   the locked row.
3. Full-document re-validation (AJV, inside the lock — same
   sequencing as SQLite).
4. Compare-and-swap `UPDATE ... WHERE id=$1 AND revision=$2`;
   `rowCount !== 1` re-reads and reports `stale` (belt and braces
   under the row lock).
5. History `INSERT` + retention prune in the same transaction.
6. `COMMIT`; any failure `ROLLBACK`s all of it.

A failed or stale save writes none of the four artifacts —
proven by trigger-injected failures (§9 of the eval). No
per-process mutex participates: two server processes against one
database resolve every same-base race to exactly one winner.

Schema DDL (`CREATE TABLE/INDEX IF NOT EXISTS`) runs outside
write transactions (memoized per pool): concurrent DDL inside
transactions deadlocks in Postgres, a failure the SQLite lane had
masked. Found live, fixed in the adapter, recorded in TRAPS.

## 3. Operational costs

Postgres 16 in the same compose stack: ~50–100 MB RAM idle for a
workload of kilobytes-per-save project JSON. Snapshots measure
~10 KB per 6 slides; 20 retained versions per project plus
100-row audit caps keep even hundreds of projects in the tens of
megabytes. No per-query billing (self-hosted container, like the
app). The `pg` driver is pure JS — no native build in the image.

## 4. Connection pooling

One memoized `pg.Pool` per connection string per process.
`FORGE_PROJECTS_PG_POOL_MAX` bounds it (default 10, hard cap 50);
`connectionTimeoutMillis` 5000 turns exhaustion into a loud
`storage-unavailable` instead of an unbounded queue (tested);
`idleTimeoutMillis` 30000 reaps idle clients. Serverless is out
of scope for this deployment, so no per-invocation pooling story
is needed — but the bound means a scaled-out replica set cannot
open uncontrolled connections either: N instances × 10 max.

## 5. Secret handling

The database URL (`FORGE_PROJECTS_DATABASE_URL`, libpq format)
is server-side env only — never a `VITE_*` frontend variable,
never logged (boot line prints selection + pool max, never the
URL), never returned by any endpoint. Compose reads it from the
operator's `.env` (`FORGE_POSTGRES_PASSWORD` seeds the db
service). TLS: `FORGE_PROJECTS_PG_SSL=1` forces it (with
`FORGE_PROJECTS_PG_SSL_VERIFY=0` only for explicit opt-out),
`=0` forces plain (local trust networks), unset honors the URL's
`sslmode`. The `db` service publishes no ports — Postgres is
reachable only on the compose network.

## 6. Backup and restore

`pg_dump` against the running service (documented in the compose
comment), not a data-directory copy. Project payloads are plain
TEXT JSON with stable key order, so dumps diff cleanly and a
row-level restore (`INSERT` of `v2_projects` + matching
`v2_project_revisions` rows) is a valid recovery unit — the
contract suite's corruption tests are the read-side proof that
partial restores refuse loudly. Deck YAML trees, brand assets,
and config stay on `/data` and keep their existing tar-ball
backup story; a full disaster recovery needs both, stated here so
nobody mistakes a database dump for the whole system.

## 7. Migrations

Repeatable idempotent DDL (`CREATE TABLE/INDEX IF NOT EXISTS`)
executed lazily on first use per pool — the same discipline as
the SQLite `ensureSchema`, so a fresh database self-provisions
and a provisioned one is a no-op. No migration framework is
introduced: the schema has exactly two tables and one documented
version (project `schemaVersion: 1`, exact-match readers). A
future schema change ships as a versioned migration module, not
as another `IF NOT EXISTS` drift — recorded as a roadmap seam.

## 8. Local development requirements

None beyond today: default backend is SQLite, no network
database, no new env vars, existing fixtures and `FORGE_DB_PATH`
isolation unchanged. Postgres paths activate only with
`FORGE_PROJECTS_BACKEND=postgres` + a URL. Tests needing
Postgres read `TEST_PG_URL` (defaulting to the isolated local
instance) and skip honestly when unreachable.

## 9. Hosted limitations (stated, not hidden)

- The default hosted install is still one container + one volume:
  SQLite there is durable against restarts, not against volume
  loss or horizontal scale-out. Multi-instance requires the pg
  profile; the app does not detect this for the operator beyond
  the documented matrix.
- Postgres selection without a URL answers 503 on every project
  route (`store-misconfigured`) — durable-looking UI with no
  store is refused, never faked with an ephemeral file.
- No read replicas (row locks assume a single writer endpoint);
  no automated failover (compose restart policy only); backups
  are operator-run `pg_dump`, not scheduled by the app.
- Pool max is per process; size replicas × max against the
  database's `max_connections`.
- Deck YAML trees, previews, and plate caches remain volume
  state: this slice shares the database, not the filesystem.
