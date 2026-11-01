# V2-8J-2 — immutable project web-source registry evaluation

Frozen source **6d51cd409945e94266e23596b57f925553e62e31**, branchv2, from accepted
J1 **f161901cf29bd7ebd2c12ef634a86cacf5f90ea3**. Human approved scoped retention
and implementation on2026-10-28, pinned6416e1b before runtime code. The approved
[contract](V2-8J-2-PLAN.md), separate [readiness](reviews/V2-8J-2-plan-84e1582.json)
and [roadmap](ROADMAP.md#assistant-project-source-registry) bound this work.
Independent [ACCEPT](reviews/V2-8J-2-6d51cd4.json) names this exact source after
reviewing the completed packet at9a8d119. Acceptance covers only the approved
headless registry, with no blocking finding or required unexecuted gate.

## Implemented result

The shared headless createSourceRegistry explicitly registers selected normalized
web SourceRefs under the canonical project. URLs/titles/excerpts and first
provider/retrieval metadata remain private until source clear or project deletion.
No query, raw transcript, model summary/reasoning, full page or credential is stored.
There is no automatic J1 registration, provider context, model tool, HTTP/CLI/UI
surface, external call or host activation.

The strict existing WebSource definition supplies shape, with shared hash/project/
URL/retrieval validation in packages/tools/web-source.ts. F identity is unchanged;
absent/empty publication labels share meaning, while changed semantic content mints
a new ID. Exact repeats under current tokens preserve first provenance without
consuming capacity. Global SourceRef and standalone F ceilings remain unchanged.

Source catalog/row child tables live in the configured SQLite/PostgreSQL adapter.
Parent locking enforces owner checks, document/catalog staleness, atomic batches
and clear generations. Private registry methods expose no admin bypass; canonical
project-delete policy remains unchanged and cascades source children. Source
operations do not write scenes, deck revisions/history or H conversation state.
Chat clear and Version history restore preserve the registry; source clear does
not claim deleted sources remain resolvable or restore them through history.

Actual SQL byte caps precede materialization. SQLite reads capped BLOB values with
fatal UTF-8/BOM-preserving decoding; PostgreSQL uses its UTF-8 text boundary.
Integrity checks read at most513 metadata rows, not every body. Selected bodies
require canonical serialized byte count, project/hash/shape equality; bounded
keyset pages read at most24 bodies. Corrupt source bodies/aggregate drift can be
cleared with valid current catalog authority; malformed catalog policy/identity
cannot be silently reset and retains canonical project deletion as final recovery.

Catalog arithmetic is safe-integer bounded. Capacity is512sources/4MiB, per source
16KiB, batch/page/resolve24 and complete DTO384KiB. No partial success, eviction,
truncated snippets or post-timeout background commit is introduced. Bounds cover
data/query cardinality; existing adapter lock-wait semantics remain unchanged.

## Changed paths

Six runtime paths: packages/tools/web-source.ts, packages/agent/research.ts,
src/projects/source-schema.js, sources.js, store.js and store-postgres.js. Six
new/affected test/fixture paths plus tools/dev-protocol-check.mjs and the state
schema supply focused contracts/governance. Architecture, approval/roadmap/state/
handoff and the v2-8j-2-evidence packet record the bounded result. No dependency,
model schema/generated type, renderer/compiler, scene or public route changed.

## Selected final validation

Node24.16.0, serial nice10/idle-I/O files with55sec process-group watchdogs and
15sec new storage cases. Pure tests use injected no-storage callbacks. SQLite
uses owned temporary files, real SQL and fresh child processes. PostgreSQL uses
an exact owned localhost-only postgres:15-alpine fixture, actual connections,
unique temporary databases and a cold adapter child. It never uses another
project's database or the removed I4 service.

| Check | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|
| New strict validation/request capture |4|0|0|0|
| Actual SQLite lifecycle/corruption/reopen |13|0|0|0|
| Actual PostgreSQL shared contracts/locking |10|0|0|0|
| Directly affected J1 unit/loopback |20|0|0|0|
| Package graph/generated drift |7|0|0|0|
| Three selected new/adjacent governance cases |3|0|0|0|
| **Selected total** |**57**|**0**|**0**|**0**|

Required test leaves34; affected20 and governance3 are supplemental. Seven full
files and selected cases in one governance file ran. Other governance bodies and
old product suites are unexecuted. Final applicable typecheck exits0; lightweight
dev:protocol reports0errors/0warnings. No skipped backend stands in for PostgreSQL:
its new ten-case contract actually ran.

[Execution summary](v2-8j-2-evidence/execution-summary.json),
[source manifest](v2-8j-2-evidence/source-manifest.json) and raw logs retain commands,
actual exits, counts and source applicability. Early runner snapshots omitted
src/projects and src/db.js: they are not frozen-byte proof for those new modules.
After fixing capture, the23 storage cases repeated once on exact committed0549daf
bytes, and final pure4 capture all new paths. This concrete evidence defect, not
SHA churn, justified that repeat. Earlier raw files are unchanged.

The last source delta6d51cd4 only makes an explicit null page limit invalid instead
of defaulting it; its fresh pure assertion proves refusal before storage. Positive
storage cases use absent/numeric limits and the SQL/store/schema/shared-contract
bytes match their final retained run. Independent inspection confirms applicability.
No extra storage/challenge run was requested for this list-only hunk. TypeScript
files remain byte-identical to retained successful typecheck; affected J1 package
bytes and committed SQLite dependencies match. All applicability comparisons are
executable in the collector, rather than relabeling an invocation HEAD as proof.

## Failures and corrections

- First SQLite13cases:8pass/5fail,0skip/cancel. Four cases wrongly passed the full
  catalog as a strict clear DTO; tests now select only generation/revision. A byte-
  capacity probe reused existing semantic URLs/IDs, correctly producing a no-op;
  distinct new sources now exercise the unchanged capacity assertion. These were
  fixture errors, not a reason to loosen input validation or identity semantics.
- First PostgreSQL10cases:3pass/7fail,0skip/cancel. Independent source review found
  the adapter wrapping deliberate private registry refusals into generic storage
  errors. Actual execution reproduced stale/corruption/capacity misclassification.
  The source-only bridge captures the original error privately, throws the existing
  canonical runtime-fenced sentinel through rollback, then restores the original
  outside the transaction. H's error policy/interface/defaults are unchanged.
  Corrected complete SQLite13/13 and PostgreSQL10/10 passed; final snapshot-bound
  repeats also pass. SQL failure after an insert rolls back the entire batch.
- Root inspection found explicit limit:null defaulting to24. Default now applies
  only to absence, with a strict no-storage negative check. No assertion weakened.

Across root attempts107executions=95pass/12fail/0skip/0cancel, with overlapping
repeats, distinct from57 selected final cases. Early runner continued after a
failed file and its outer script returned0; each actual child exit1/count is
retained. The runner now preserves an aggregate failing exit while still collecting
selected files. No child failure was counted green. No compiler failure occurred.
Selected affected checks found no regression in accepted J1 behavior.

## Independent challenges and acceptance

Separate /root/i8_source_review inspected the approved contract and source. Two
new actual-PostgreSQL challenges ran once on0549daf:2/2pass,0fail/skip/cancel,
~3070ms process, with exact service verification. A real write followed by an
opaque private refusal rolled back fully and rethrew the same object. Mutating
owner/project/full input/source/catalog/document tokens after an await could not
rewrite the captured registration, and foreign ownership still refused. The
reviewer's unique database/pools were closed/dropped; initial and final user
catalogs were both empty. [Independent evidence](v2-8j-2-evidence/independent/)
records actual invocation SHA; it is not rewritten to the later null-list hunk.
That hunk is source-reviewed and outside both challenge operations. Final exact-
source [ACCEPT](reviews/V2-8J-2-6d51cd4.json) follows the complete packet audit;
the original challenge execution SHA and applicability remain unchanged.

## Resources, cleanup and observations

Three read-only admission attempts ran in a new namespace. Initial copied scope
text named oneSQLite/loopback case and ran observation only. Updated text names
J2; thresholds are unchanged. An intervening observer found disk activity/blocked
userspace and admitted nothing. Fresh attempt3 obtained two ready15sec samples
(CPU13.1%/18.0%, backing disk4.55%/3.85%, adequate memory) before storage/service
setup. Elevated global I/O PSI remains recorded with unresolved provenance; no
unrelated process was stopped. Pure/governance/type checks were short and light.

The fixture had1CPU/512MiB limits and256MiB tmpfs, with no hardware/power-loss
qualification claim. Actual initial user database catalog was empty. After all
root/reviewer tests, cleanup saved/fsynced the actual empty catalog, removed the
single exact owned container ID once, verified its absence and deleted temporary
private credentials. [Cleanup evidence](v2-8j-2-evidence/owned-postgres-cleanup.json)
records actual0; this is separate from historical I4's unavailable count. All
SQLite files/servers/child fixtures closed; no owned persistent service remains.

Final snapshot-bound SQLite process818ms, PostgreSQL1068ms, pure216ms; applicable
typecheck1917ms. These are fixture execution observations, not production latency
or a benchmark. Source-capacity tests use actual retained rows/UTF-8 bytes. No
GPU/local inference/real model/API/search calls or production activation occurred.

## Limits and recommendation

Old bulk/browser/build/native/render/50cell/broad fault and historical PG suites
remain unexecuted; unchanged evidence is reused. No UI/rendering changed, so no
new screenshot/PowerPoint visual claim is made. Existing PostgreSQL lock waits,
backup/media-erasure limits and unverified snippet provenance remain explicit.
Stable IDs prove retained snippet identity, not claim support, full-page integrity,
verified locators or prompt-injection resistance. No query logs were added.

Standing BYOK locale and initial J1/I7 timing remain separate and unrerun; inherited
native/visual/I4 operational provenance is neither reconstructed nor waived.
Independent acceptance covers only this reviewed J2 boundary and its documented
limits. Citation attachment/locators, public research orchestration and creation
remain in the roadmap. Stop after acceptance documentation and push;
no activation, paid infrastructure, production migration or dependent code follows.
