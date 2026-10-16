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
- **Pre-existing actual-server defect exposed:** runtime AJV scene compilation
  was blocked by the existing CSP, a path older static-proxy browser suites
  bypassed. Both the policy and runtime-compilation path predate this slice. A narrow Vite
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

Final unchanged-source execution completed on Node 24.16.0 / Chrome 151.0.7922.173.
The manifest partitions **197** files without overlap. All file watchdogs exited 0.

| Final disjoint inventory | Files | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Non-browser bulk (four workers) | 171 | 2005 | 0 | 0 | 0 |
| Serial browser/build/plate owners | 22 | 160 | 0 | 0 | 0 |
| PostgreSQL contracts + import contracts | 2 | 23 | 0 | 0 | 0 |
| Cross-process persistence + fault injection | 2 | 19 | 0 | 0 | 0 |
| **Unique final matrix** | **197** | **2207** | **0** | **0** | **0** |

The serial total includes the complete 28-case 7A suite, all 3 PG browser cases and
all 5 new actual-server import cases. Supplemental actual hosted PostgreSQL
HTTP creation → owner refusal → human rename → authenticated CLI replay → native
export/history: **1 pass, 0 fail/skip/cancelled**. Total distinct final cases with
it: **2208 passing**. Focused conversion/service/HTTP 68/68 repeats bulk coverage
and is not added again. **No required case is unexecuted.**

Production build, typecheck and all **50 canonical benchmark cells** pass.
Benchmark L1/L2, fit, missing-carrier, takeaway and chart-data findings are all 0;
all five invariance checks agree. Raw benchmark metadata records documentation
HEAD `b59949e`; runtime/test/tool source is identical to frozen `662f7d6`. No source
edits occurred during the final matrix. Build 0.517s, typecheck 0.955s and benchmark
0.611s wall time are recorded command observations, not performance guarantees.

SQLite contracts run in the bulk group. PostgreSQL **15.18** ran on an owned
localhost 5544 service from a cached image, limited to 1 CPU / 512 MB / 192 MB tmpfs.
Suites create/drop their private databases; no other project's database or
process was reused/stopped. Low-priority bounded execution followed measured
CPU/memory/I/O headroom. Exact commands, file markers, raw totals and per-file
exit codes are retained in [the runbook](v2-7b-1-evidence/RUNBOOK.md), gate JSON
and logs. [Summary](v2-7b-1-evidence/summary.json) keeps repeated and unique totals
separate.

The unchanged BYOK assertion was separately run under `en_IN.UTF-8`: **9 pass,
1 known fail,0 skip/cancelled**, exit1. The failing grouping assertion is preserved
in its raw log; the full bulk run uses documented `C.UTF-8` / en-US. This standing
locale issue is not a new regression and is not relabeled green.

## Performance and frontend/native evidence

Five pure semantic-conversion samples give 3-slide median **0.364ms** (first cold
sample 105.790ms) and 60-slide median **1.196ms**. The oversized 61-slide input refuses.
These exclude IO, compile and storage. Actual hosted PostgreSQL 3-slide creation:
compile 63.900ms, persistence 17.570ms, service total 349.957ms / HTTP 363.554ms;
authenticated CLI replay 115.317ms returns revision 1 without compilation. Warm
SQLite 60-slide creation: compile 28.912ms, persistence 7.531ms, total 50.265ms.
Backends/cache conditions differ, so these samples are not a comparative benchmark.
Raw measurements are retained alongside the evidence.

Real imported chart/table editing observes dirty/saving/saved, undo/redo, exact
saved data, replay and refresh. Their measured selection movement is at most
**0.0467px**, with x/width/height unchanged. Opening 3-slide projects takes
1512/1503ms including Chrome/font boot; 60 slides / 60 thumbnails: 1555ms; the
existing 120-slide regression: 1543ms. Exact 480×900 viewport inspector bounds are
[192,44,288,856]. Pending text saves before dashboard departure and reopening;
leaving removes the canvas. The actual-server CSP checks observe no violations.

All **23 final images** (11 shell regression captures, 5 imported captures, 7 native
rasters) were opened and inspected. Native assertions and rasters preserve chart/
table edits, repeated section ordinals, stat qualifiers, two real flow steps and
temporal roles. No new control overlap, clipped dialog action or selection reflow
was observed. The table grid and top bar scroll; the narrow inspector deliberately
overlays the canvas. The pre-existing approximately 24px Fit padding overflow
remains visible. See [visual review](v2-7b-1-evidence/VISUAL-REVIEW.md), image hashes,
measured geometry and native-export inspection records.

## Limits and recommendation

Coverage/refusal limits are intentional and explicit: 24 entire legacy families,
unsupported nested fields, true notes/citations, portable assets/institutional
identity, unsupported encodings and readable-fit failures do not create a partial
project. Even 50 mapped type names are conditional, not a full-parity promise.
The nine dense specimen capacity refusals are recorded in the sole roadmap's
conversion dependencies. Existing model/scene/compiler vocabularies and native
renderer mechanisms are unchanged. No model generated content in these checks;
no gateway budget was spent or writing-quality judgement made.

The standing BYOK locale and Fit issues remain open. LibreOffice output does not
establish interactive Microsoft PowerPoint behavior; accessibility coverage is
bounded to the suites. The browser handoff, agent runtime, full asset/notes/source
storage and production operations remain outside this slice.

**Recommendation: accept the bounded V2-7B-1 implementation**, subject to the
separate review of exact source/evidence. All required execution is complete and
no new failing regression remains. The implementer has not supplied acceptance.
V2-7B-2 is a candidate for planning/direction after review, without automatic coding
authorization. Parent V2-7B stays unchecked.
