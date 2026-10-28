# V2-8J-1 — bounded canonical web research evaluation

Frozen source **f161901cf29bd7ebd2c12ef634a86cacf5f90ea3**, branch v2; accepted
baseline **b9c2d2075da21608a92a458c1395ede0bbe67297** (I8). Human approved scoped
implementation/query disclosure on2026-10-27, pinned a9edeba before runtime code.
The [approved contract](V2-8J-1-PLAN.md), [plan-readiness record](reviews/V2-8J-1-plan-11696f9.json)
and [roadmap](ROADMAP.md#assistant-web-research-preparation) bound this task.
Independent exact-source review is pending. Implementation evidence is not acceptance.

## Result and implemented boundary

A separate createResearchRunner composes trusted, request-bound inspection and
canonical web_search. Owner/project identity, complete canonical request, query
disclosure, authorization callback and finite limits are captured before awaits.
A private WeakMap shares consumption across runner factories. A mismatched text,
scope, read, budget or deadline cannot dispatch or consume the original grant;
JSON property order does not change identity. A fresh trusted object is an explicit
new grant; model JSON has no callback/capability authority.

Canonical schemas/provider normalization/correlated history support search. Base
content sessions, durable plans/receipts and initial reads retain their exact
four-content/three-read subsets. Existing H/worker/converse/host/Assistant paths
receive no capability. No public HTTP/CLI, source registry, storage query/schema,
document, queue, renderer, compiler or export change is introduced.

Before/after-await guards recheck authorization, saved revision, deadline and
abort. Network calls occur outside backend transactions. Sequential searches
fail-stop; attempts consume allowance, output reservations are conservative and
unknown usage is nullable. Frozen callback copies cannot rewrite captured evidence.
Final ephemeral DTO retains normalized project-bound sources plus unverified model
text/refusal and bounded trace. F source identity is extracted unchanged into the
shared model helper; first retrieval provenance is retained. Sources establish
retrieval identity, not verified claim support. No page fetching, H accounting
hooks, saved query/transcript/source storage or automatic saved-chat context.

## Selected execution and source applicability

Node24.16.0; serial nice10/idle-I/O process groups with55sec watchdogs. New unit
cases use an injected in-memory backend/provider. Integration uses owned temporary
SQLite plus actual loopback model HTTP and SearXNG adapters, never external APIs.
[Raw attempts and summary](v2-8j-1-evidence/execution-summary.json),
[source manifest](v2-8j-1-evidence/source-manifest.json) and the collector preserve
invocation HEADs, working-source hashes, process exits and applicability.

| Selected final check | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|
| New research authority/budgets/source/late callbacks |16|0|0|0|
| Actual SQLite + loopback integration |4|0|0|0|
| Package dependency graph and generated types |7|0|0|0|
| Directly affected provider/context/tools/standalone F |120|0|0|0|
| Two exact legacy schema-subset assertions |2|0|0|0|
| Four selected new/adjacent governance cases |4|0|0|0|
| **Selected total** |**153**|**0**|**0**|**0**|

Required product/boundary leaves are27; directly affected/selected supplemental
leaves are126. Eight full files and selected cases in three other files were
executed. Unselected bodies in old runtime/provider/governance files are unexecuted.
Final typecheck exits0. Lightweight dev:protocol reports0errors/0warnings.

New unit/integration/governance execution differs from frozen source only by
`as unknown` in a TypeScript assertion, which is erased at runtime. The prior
source is retained and the collector verifies the exact one-line replacement;
final typecheck uses frozen bytes. Earlier affected120 and selected schema2 reuse
unchanged dependencies; later J1 runner/fixtures and governance mappings are outside
those imports. Package graph7 reuse unchanged import lines, generated package
schemas/types and test bodies. The manifest lists every captured changed path
and matching hash count. No SHA-only test repetition or full old matrix is claimed.

## Earlier failures and corrections

- Unit attempt1:13total=10pass/3fail/0skip/0cancel. Two tests incorrectly mutated
  frozen normalized sources; copies now exercise the same refusal assertions.
  Completed search child signals were not aborted after detaching their parent;
  a narrow cleanup correction aborts every owned child. Attempt2:15/15pass.
- SQLite attempt1:4total=3pass/0fail/0skip/1cancel, exit1. First OpenAI case exceeded
  its unchanged15sec bound (19842ms reported), with no retained initial stage;
  cause remains unresolved. Stage diagnostics and test cancellation are now
  forwarded without widening the bound. After the later grant correction all
  four directly affected integration cases ran once again and passed; the earlier
  cancellation remains in the packet and is never counted as a pass.
- Independent fail-first review atcff2e73:2total=1pass/1fail/0skip/0cancel.
  One trusted capability allowed concurrent use through separate factories.
  Correctionddd74ee shares private consumption state and binds the entire request;
  test correctionf161901 verifies mismatch/mutation/property-order behavior.
  This fixes a new-boundary authority defect; no accepted subsystem regression
  was found in the selected affected checks.
- Preliminary type generation succeeded. An initial typecheck exited2 on TS2339
  (PreparedExchange has no ok); only a marked tool-output transcription/source
  snapshot exists. A proper discriminant fixed it. Retained typecheck attempt1
  passed before later source changes; attempt2 exited2 on TS2352 for the nested
  grant assertion; explicit unknown assertion fixed the static conversion.
  Retained final attempt3 exits0. Command failures have no product leaf counts.

Across root test attempts:185executions=181pass/3fail/0skip/1cancel, with overlapping
repeats. This is distinct from153 selected final cases. Independent execution is
reported separately, not added to root totals. Early raw runner backend labels
incorrectly said SQLite for unit/command/schema gates; canonical records and runner
now identify the actual fixtures. No raw execution/failure has been relabeled.

## Resource and performance observations

Resource attempt1 found CPU95–100% and admitted no integration retry. Documentation
and source inspection proceeded. Fresh attempt2 obtained two consecutive15sec
ready samples (CPU11.1%/12.2%, low measured backing-storage activity, adequate
memory) before the corrected serial execution. Global I/O PSI remains reported
with unresolved provenance; no unrelated process or pre-existing API was stopped.
The read-only observer finished, and no owned persistent service/database was
created. Temporary SQLite/server fixtures close with their tests.

Final unit process667ms; integration process667ms (OpenAI case125.9ms, Anthropic
33.2ms); final typecheck5276ms. These measure offline fixtures on this machine,
not live search/provider latency or a product benchmark. No GPU/model work ran.

## Limits, exclusions and recommendation

No live model/API/search/local inference, browser/build/native rendering, broad
legacy/PG/concurrency/fault sweep or50cell benchmark was executed. Accepted evidence
covers unchanged areas; PostgreSQL is unexecuted here, not green. UI/export visual
inspection is inapplicable because no UI/rendering changed. Live quality, real
account spending, backend log retention/usefulness and full research-backed
creation remain unqualified. Existing host execution stays default-off.

Standing BYOK locale failure remains separate and unrerun. I7 timing and inherited
I4 operational/native/visual provenance limits remain as documented; no removed
backend was recreated or historical count reconstructed. Source registry/locator/
retention, source-to-claim validation, research-enabled orchestration and semantic
creation remain in the [roadmap](ROADMAP.md#assistant-search-source-integrity).

Implementation recommends acceptance of only the approved J1 headless boundary,
subject to separate exact-source review. Stop after review/documentation/push;
acceptance does not activate research or authorize dependent implementation.
