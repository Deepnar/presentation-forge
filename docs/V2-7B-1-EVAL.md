# V2-7B-1 conversion and durable creation evaluation

Updated 2026-10-16. Branch `v2`. Accepted source baseline:
`fe749fb41e744961df156e8b9dcf80f0155b4e0b`. Final frozen implementation:
`662f7d6a08647d431eded1ea17c5d13e7ca1c591`. Later commits record documentation
and evidence only. Independent acceptance remains pending; this report is an
implementer recommendation, not a decision.

The human approved the bounded contract on 2026-10-15 and authorized a separate
high-effort reviewer. Scope/common-gate applicability:
[approved roadmap contract](ROADMAP.md#v2-7b-candidate). No UI handoff action,
new semantic/compiler mechanism, AI runtime, deployment or production migration
is included. V2-7B and V2-7B-2 remain incomplete. V2-7A retains its separate
accepted decision and historical evidence.

## Implemented behavior

One headless service converts completed, exact-owner source snapshots into
validated semantic intent, compiles through existing theme/style/mode,
plate/chrome and scene primitives, checks exact content/native data/readable fit,
and atomically creates a project with revision-zero history. HTTP
`POST /api/decks/:slug/v2-project` and `npm run import-project -- <slug>
--request-id <stable-id> [--mode light|dark]` share it. Hosted CLI uses an existing
session through `FORGE_IMPORT_TOKEN`; a local operator can import ownerless
sources only. The existing legacy GET metadata endpoint retains its contract.

A durable owner-scoped request receipt prevents duplicate creation on SQLite
and PostgreSQL, across simultaneous calls, separate processes, response loss
and restarts. Retries return the current human-edited document without
recompiling. Changed source conflicts; deleted targets cannot silently resurrect.
Source files remain intact. Actual PostgreSQL transaction faults roll back
project, history and receipt together; misconfiguration never falls back to
SQLite.

The new boundary audits all **74** legacy type names: **50** have conditional
field mappings and **24** refuse entirely. Of 74 untouched canonical specimen
slides, **46** convert semantically, **37** persist and **37** refuse atomically
(24 unsupported families, four field gates, nine readable-fit/capacity limits).
This is not a full legacy-parity claim. Exact fields, per-type results and
structured refusals are in [COVERAGE.md](v2-7b-1-evidence/COVERAGE.md) and its
machine-readable audit. Every refusal audit checks unchanged project/history/
receipt counts. Theme/style/mode, section ordinal/label, contextual text,
locked presenter/footer policy and native data have dedicated checks.

## Corrections and failure classification

- **Content loss:** per-type schema auditing now rejects undeclared nested
  values before a shared converter can stringify them. Inherited base/operator/
  owner identity participates in the policy check; unsupported institutional
  content refuses. Default slide numbers and supported presenter text use locked
  canonical chrome rather than editable body content.
- **Relationship loss found independently:** numbered section identity survives
  repeated labels; stat qualifiers stay in their stat carrier; context is kept
  outside step/peer membership; metric comparisons retain peer metrics; temporal
  Before/After roles remain explicit with identical titles. Valid historical
  fixtures reproduce the latter defects on exact prior source; current semantic,
  real HTTP, scene/native and browser checks cover the corrections.
- **Actual-server regression:** runtime AJV scene compilation was blocked by the
  existing CSP, a path older static-proxy browser suites bypassed. A narrow Vite
  module boundary generates the browser validator from the same canonical schema.
  Node keeps its existing AJV semantics; CSP is unchanged. Static/Node validator
  parity and actual-server CSP-violation assertions protect this path.
- **Concurrency/storage regressions:** cold legacy schema compilation now shares
  one promise; PostgreSQL cold DDL uses a separate advisory-locked transaction;
  SQLite cold contention is bounded. Receipt-read/write failures report storage
  unavailability and preserve retry state. Malformed slide collections return a
  structured 422 before identity inspection.
- **Test setup/timing:** initial fixture isolation, YAML aliases, hosted-token
  assumptions, missing required fixture fields and a two-bullet boundary deck
  were corrected against canonical contracts. Narrow resize waits for the React
  control, not merely the changed viewport. Failed browser opening closes its
  page; CDP requests have their own bound. Assertions/schema were not weakened.
  An early actual-CSP run was incomplete after leaked pages and is never counted
  as passing execution.

The [attempt ledger](v2-7b-1-evidence/attempt-history.json) separates failed,
incomplete, diagnostic and superseded runs from the final unique inventory.
Some earliest console-only observations lack raw logs; that limitation is stated
rather than reconstructing missing output. Retained negative probes and all final
gate logs remain reproducible.

## Final validation status

Final unchanged-source execution is in progress. The frozen manifest partitions
**197** files: **171** non-browser, **22** serial browser/build/plate owners and
**4** PostgreSQL files. [Runbook](v2-7b-1-evidence/RUNBOOK.md) records exact commands,
process-group watchdogs, environment, ownership and cleanup. Final totals,
measurements and visual findings will be inserted after completion. Pending work
is not counted as passing.

Standing BYOK locale failure and pre-existing Fit padding overflow remain separate.
Model-free fixtures evaluate conversion, not hosted writing quality. No gateway
content-quality or interactive Microsoft PowerPoint claim is made.
