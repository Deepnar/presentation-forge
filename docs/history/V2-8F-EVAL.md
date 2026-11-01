# V2-8F shared Forge Search boundary evaluation

Previous accepted baseline: `c71d65e189387684aac89ca9994acf8a9ff865c1`.
Entry checkout: `661eedc70f3c3f8a4290449303438d391fe97755`; branch `v2`, push
`origin/v2`. The [approved contract](ROADMAP.md#v2-8f-shared-search-boundary) is the
sole work entry. Exact implementation `0cab854bce04b862060829812a9ab6ff0b765fd9`
is independently [accepted](reviews/V2-8F-0cab854.json). Implementation, final
validation, review, protected-file restoration and owned-service cleanup are
complete. Later documentation/evidence commits have no product/test/tooling delta.
This decision does not complete parent V2-8 or authorize another feature.

Correctness, authorization isolation, regression, backward compatibility, native /
browser preservation and documentation gates apply. Existing editor, storage,
undo/history, ownership and accessibility behavior remain regression surfaces.
No new UI, persistent source/transcript schema, data policy or deployment is in scope.

The complete inventory retains all 221 accepted files and adds 2 search files
(189 bulk, 26 serial browser/build owners, 8 PostgreSQL). Final build, typecheck,
50 benchmark cells, inspected browser/native output and independent review passed.
Exact source/backend, commands and pass/fail/skip/cancelled/unexecuted totals are
recorded below. BYOK locale and inherited Fit/narrow/SVG/native-ID/provenance
limitations remain separate. Both executions used measured quiet-window
qualification before expensive validation; prior-source results supply no new pass.

The existing stack is retained. The current
[SearXNG Search API](https://docs.searxng.org/dev/search_api.html) documents GET/POST
/search, form-encoded POST fields, JSON format, language and day/month/year filters.
Local HTTP fixtures qualify this protocol; they do not qualify upstream search
relevance or live provider/Auto output. Search result snippets remain untrusted data.

## Complete final-source results

Exact source `0cab854bce04b862060829812a9ab6ff0b765fd9` passed the complete
223-file inventory and four distinct persisted/native regression scenarios:
**2,786 primary distinct checks, 0 failures, 0 skips, 0 cancellations and 0 required
implementer cases unexecuted**. The 48 focused search checks repeat inventory
leaves and are excluded from that distinct total. Development runs remain separate.

| Executed group | Files/scenarios | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Non-browser bulk | 189 | 2408 | 0 | 0 | 0 |
| Serial browser/build owners | 26 | 208 | 0 | 0 | 0 |
| Complete PostgreSQL inventory | 8 | 166 | 0 | 0 | 0 |
| Distinct persisted/native supplements | 4 | 4 | 0 | 0 | 0 |
| Separate focused repeats | 2 | 48 | 0 | 0 | 0 |
| Separate standing locale probe | 1 | 9 | 1 | 0 | 0 |

[Full matrix](v2-8f-evidence/full-matrix.json) and raw
[coordinator records](v2-8f-evidence/logs/coordinator.json) retain actual commands,
UTC exits, source/backend and complete file markers. PostgreSQL's designated
23-case contract and 19-case concurrency/fault gates overlap its complete 166 cases.
The separate en_IN locale failure is exactly the established 5,000,000 versus
50,00,000 assertion; it is not relabeled passing. All nine required gates passed.

Production build and final typecheck passed in 0.514591 s / 1.365154 s command wall
time. Actual 50 cells completed in 495 ms compiler/ZIP time (0.665763 s wall).
The benchmark records documentation HEAD 7b6b140; product/test/tooling source matches
frozen 0cab854. [Performance](v2-8f-evidence/performance.json) records 120-slide opening
in 1,541 ms with 120 thumbnails and maximum measured canvas displacement
0.06939697265625 px across six cases, below 1 px.

The new [search timing run](v2-8f-evidence/search-performance.json) made 30 actual
loopback HTTP requests, ten each with 1 / 20 / 1,000 candidates. Observed ranges were
1.275–21.713 ms, 1.946–3.094 ms and 34.473–81.220 ms respectively. Complete serialized
outputs were 372 / 6,320 / 6,339 characters, with result-limit warnings for 1,000
candidates. Citation IDs stayed identical across repeated retrievals. These local
fixtures qualify protocol and bounds, not live SearXNG relevance, Auto/provider
quality or production percentiles.

All 115 final hashed images were inspected: 76 browser, 23 native and 16 SVG.
[Visual report](v2-8f-evidence/VISUAL-REVIEW.md) and
[hash reconciliation](v2-8f-evidence/visual-hash-reconciliation.json) distinguish
21 grouped inspection sheets plus full-size risk cases from the 20 generated final
combined sheets, which were not separately all opened. No new foreground dialog
regression was observed. Inherited narrow canvas/toolbar overflow, inspector
occlusion, C1 transition and C2 pending-search capture limits remain explicit.
Native output keeps the edited text/chart/table values and italic final run;
SVG retains its known first-run-style limitation. The repeated native shape IDs
remain in all eight fresh headless archives, with a
[separate observation](v2-8f-evidence/native-identity-observation.json) and
[roadmap correction](ROADMAP.md#native-pptx-shape-id-uniqueness).

Before generators, all 4,653 current evidence files, including 106 original PPTXs,
and five canonical browser originals were copied/hash-verified. All were restored
and rechecked after execution. Eight fresh headless plus five actual fresh browser
original PPTXs were preserved before restoration; no archive bytes were reconstructed.
[Restoration recheck](v2-8f-evidence/restoration-recheck.json) retains exact counts.
No validation job remains running. After independent review, a fresh actual
[zero-project-database observation](v2-8f-evidence/pre-removal-observation.json)
was saved and fsynced, including its parent directory, before removing only the
exact owned PostgreSQL15.18 container. Exact-ID absence and port5544 closure are
[verified](v2-8f-evidence/owned-postgres-cleanup.json). Historical service identity
and executed PostgreSQL166/166 results remain evidence; future service absence
must be reported as unexecuted, never reused as a pass.

Sustained qualification lasted 180.410 s: mean CPU 5.232%, iowait 8.783%, backing
NVMe busy 1.267%, weighted queue 0.11526 and 11 fresh ready samples. Across 213
resource observations, 82 pre-job samples withheld work; none was critical during
execution. CPU peaks and storage bursts happened between files and were held.
[Resource assessment](v2-8f-evidence/resource-assessment.json) preserves the unchanged
thresholds and unresolved global PSI/iowait provenance; no unrelated work was stopped.

No final-source product regression was found. The development and source-review
corrections below were completed before this frozen run without weakening
assertions, dependency rules or timeouts. Historical archive/service provenance
limits remain historical. Interactive PowerPoint, live search/provider/Auto quality,
new search tools, hosted approval lifetime and Assistant qualification are outside
this bounded contract and unexecuted. The independent reviewer accepted the exact
source with these residuals; parent V2-8 remains incomplete. The
[older model-stream audit](ROADMAP.md#model-provider-stream-resource-bounds) is a
separate source-inspected risk, not a reported executed failure or this slice's scope.

## Independent exact-source acceptance

The separate reviewer/context `/root/v28e_independent_review` issued
[ACCEPT](reviews/V2-8F-0cab854.md), committed at `70d5fea`, after evidence commit
`f3115e2`. The decision names exact source `0cab854`, previous accepted `c71d65e`
and complete implementer packet `34b4b00`. There is no later product/test/tooling delta.

Its acknowledged execution passed **595/595**, with 0 failures, skips or cancellations:
83 search/boundary/governance/drift checks, 477 accepted source/research/provider/
runtime/backend cases, 3 additional adversarial probes, the complete 28-case 7A
Chrome suite and 4 persisted/native scenarios. The 29 inventory files cover 588
leaves; 592 cases repeat packet primary cases and 3 are additional probes. They
are not added to the implementer's 2,786 distinct total. The remaining 194 inventory
files / 2,194 leaves were inspected, not independently rerun. The locale probe
independently remains 9 pass / 1 standing failure. No required final job is
unexecuted, skipped or cancelled.

An initial outer runner ended with exit 143 without a saved accepted-domain
completion record. The raw 477-pass report is retained and excluded; all 477 were
rerun with acknowledged exit 0. The termination cause remains unresolved, without
resource-pressure attribution. This interruption is distinct from a cancelled
Node test leaf.

Independent build/typecheck passed in 0.515422 s / 1.316119 s command wall time.
Actual 50 cells completed in 409 ms compiler/ZIP time (0.565319 s wall); all cell
results, invariance and counterfactuals match the packet. Timing/documentation-HEAD
metadata differs between runs. The 30 new local HTTP measurements are not extra
test leaves. Independent 120-slide / 120-thumbnail opening was 1,542 ms; maximum
fresh canvas delta was 0.029327392578125 px. These local measurements make no
production-percentile claim.

The reviewer reconciled all 223 packet files, 44 durable job logs, 115 image hashes
and 13 original archive hashes. It inspected all 115 packet images through 20
contact sheets plus full-size risks, and 54 fresh images through 10 sheets plus
full-size risks. The 16 root/independent headless ZIPs passed style, geometry,
chart-cache, embedded-workbook and byte-identical untargeted-slide XML checks.
Three retained B1/B2 archives were independently rerasterized, not freshly
browser-generated.

Before generators it protected all 4,918 then-current evidence files, including
119 original PPTXs, plus 5 canonical exports. All 4,923 hashes were restored and
reverified after preserving 10 actual fresh original PPTXs, 11 captures and 3
measurements. No original bytes were reconstructed. Its 180-second resource
qualification and fresh per-job gates retained thresholds; 60 samples included
7 pre-job holds and 0 critical running samples. Global PSI/iowait provenance
remains unresolved. [Independent assessment](v2-8f-evidence/independent/assessment.json)
links commands, raw interruption, overlap, archive/image manifests, restoration
and exclusions. The reviewer released the exclusive slot after its committed
decision; root then performed the exact saved-count cleanup described above.
No next feature began.

## Development execution and corrections

Accepted prerequisites passed 25/25 in a lightweight source/schema and conversation
spot check. First new search execution passed31/32: the numeric backend ID3 was
coerced by a regex. A string-type guard corrected the actual configuration defect
with its assertion unchanged. The first shell command ended with tail and masked
the test child exit; its failing raw summary remains retained and is never counted
as passing. The corrected32-case file set passed32/32.

Expanded execution passed70/71 initially. One privacy assertion matched the
legitimate canonical binding value `private-project-id`; it now checks each exact
upstream private marker and verifies the canonical bound projectId is preserved.
This was an incorrect expectation, not a backend data leak. The expanded rerun
passed71/71,0fail/skip/cancel across search, governance and type checks. Initial
TS2698 narrowing was corrected with the AJV-validated generated request type;
its original diagnostic is in the tool transcript, not a retained raw log.
[Development assessment](v2-8f-evidence/development/assessment.json) preserves these
classifications and raw paths. These are development runs, not final-source totals.

At this historical development checkpoint, full regression, visual inspection,
resource qualification and independent acceptance had not yet executed. Those
obligations are now complete in the final-source results and decision above.
No assertion/timeout was relaxed. The preliminary read-only source audit below
was not acceptance; global I/O-pressure provenance remains unresolved.

## Source-audit corrections before full validation

The separate reviewer identified two blockers in initial source9d2a659, running
0tests and making0edits. Root reproduced both before expensive validation:

- An infinite stream of immediately resolved empty chunks starved the timer. The
  isolated child exceeded its1500ms watchdog and was killed; this is a failed
  development probe, not a cancelled/passing test leaf. Monotonic deadline checks,
  periodic event-loop yielding and a post-normalization check now bound it. Two
  child/watchdog regressions exercise timeout and timer-driven caller cancellation.
- New Node/HTML/model imports crossed the unchanged package dependency matrix.
  The accepted6-case core-boundary suite failed5pass/1fail. The agent contract now
  stays pure through the allowed tools type facade; Node/schema/HTML/hash work
  lives in the src host adapter. No dependency rule or boundary assertion changed.

The reviewer also identified block-text concatenation. A fail-first normalizer run
passed14/15; adjacent paragraphs/BR/list/table boundaries now preserve spaces,
while inline words remain joined. Final expanded checks passed80/80,0fail/skip/cancel
across both search files, unchanged package boundary, governance and type drift;
typecheck passed. The intermediate corrected source was3e38f24. Earlier source pointers
remain in failed-attempt evidence; they do not stand in for final validation.

## Final buffering and reader-cleanup correction

Read-only follow-up found empty chunks still retained individually outside the
byte budget and cancellation occurring after reader-lock release on a self-detected
deadline. The source now uses one fixed-size response buffer and requests reader
cancellation before releasing its lock. A mocked monotonic-clock regression first
passed32/33 in the HTTP file (source cancellation count0 versus expected1); the
unchanged assertion passes after correction. A valid response after5000empty chunks
also passes the256-byte allowance. Final expanded checks passed82/82,0fail/skip/cancel;
typecheck passed. Corrected frozen implementation is0cab854.

The initial preparation process was stopped during resource qualification after
four samples, before any snapshot, service creation or test job. Its exit143 and
raw samples are [retained](v2-8f-evidence/development/pre-matrix-interruption.json).
No test leaf was cancelled and no test is credited from that wait. The final run
uses a fresh scratch namespace, preserving the preliminary resource observations.

## Earlier full-run checkpoint (superseded by complete results)

Exact0cab854 focused search48/48 (separate overlapping repeat), non-browser bulk
2408/2408 and all26serial browser/build files208/208 passed with0fail/skip/cancel.
PostgreSQL designated contracts23/23 and concurrency/fault19/19 passed; these are
subsets of the still-incomplete8-file inventory. The durable runtime adds34passed
cases, for76acknowledged PostgreSQL leaves across5files at this checkpoint. The
remaining provider/preparation/conversation PG files, final build/type/50cells,
native supplements/inspection, search timing, separate locale and independent
execution remain pending, not passes. Per-job headroom holds remain active.

All76current browser captures were inspected through13contact sheets and two
full-size narrow risk cases. Final captured-image hash reconciliation is pending.
Known C1narrow transition, C2pending-search capture, narrow canvas/toolbar overflow
and inspector occlusion remain explicit; no new foreground dialog regression was
found. Native exports are not yet inspected for this run.
