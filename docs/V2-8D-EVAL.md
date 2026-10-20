# V2-8D provider-backed run preparation evaluation

Approved continuation on 2026-10-20. Entry checkout
`8e966552149f87686d624a05bfc55feab1dcbd76` is recorded by the roadmap/state;
accepted baseline is `e41d509c20fca21a70b9a0c587ccb83684aee7e6`.
Branch `v2`, push `origin/v2`. Implementation is frozen at `8c1e5c4e193340dd64ef3e68cd27bfe8ac55e23c`. Complete final-source validation and a separate
[ACCEPT decision](reviews/V2-8D-8c1e5c4.json) qualify this bounded slice.

## Bounded contract and gates

[The roadmap contract](ROADMAP.md#v2-8d-provider-run-preparation) defines approved
scope, acceptance criteria, look-ahead, non-goals and stop point. A headless
single-turn preparation/queue boundary reuses accepted scoped context, provider
exchanges, canonical commands and durable runs. Opaque host-owned proposals keep
model content separate from authority; atomic preflight and fresh revision checks
protect human saves. Network work is outside transactions, bounded and single
attempt. No new persistent prompt/transcript, UI, framework, auth policy or migration.

Common correctness/ownership/integrity/preservation/native/regression/documentation
gates apply. The unchanged UI still requires complete serial browser regression,
inspected screenshots, canvas stability and representative native exports. Live
provider/Auto content quality, new UI and production gates are outside this bounded
contract; fixtures cannot qualify them. Required218-file inventory is in
v2-8d-evidence/validation-plan.json (185bulk/26serial/7PostgreSQL). Focused cases
cover both protocols/backends and adversarial prepare/queue lifetimes. Build,
strict typecheck and all50 benchmark cells remain required. Use bounded watchdogs,
no concurrent Vite owners, exact source/backend/leaf counts and all-evidence plus
ignored-original snapshots. Missing PostgreSQL is unexecuted, never passing.

## Validation status

Complete frozen-source execution passed all required gates. A separate reviewer
accepted exact8c1e5c4; state now indexes that accepted baseline. The full218-file inventory passed
2639/2639, and4 distinct persisted/native preparation scenarios passed: **2643
primary distinct checks,0fail/0skip/0cancel,0required cases unexecuted**. Separate
successful repeat executions are109 focused and25 resource-resume qualification
(134total); they overlap inventory cases and are not added to2643. Historical
V2-8C evidence and development attempts are not current-source passes.

| Executed group | Files | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Non-browser bulk |185|2303|0|0|0|
| Serial browser/build owners |26|208|0|0|0|
| All PostgreSQL inventory |7|128|0|0|0|
| Distinct persisted/native supplements |4scenarios|4|0|0|0|
| Separate focused repeat |3|109|0|0|0|
| Separate qualification repeat |1|25|0|0|0|
| Separate standing en_IN BYOK locale probe |1|9|1|0|0|

[Full matrix](v2-8d-evidence/full-matrix.json), validation-plan.json and raw
[coordinator](v2-8d-evidence/logs/coordinator.json) retain exact commands, UTC exits,
backends and leaf counts. The designated project/import PostgreSQL contract gate
is23cases; the cross-process/fault gate is19cases. Both are overlapping subsets
of the complete128PostgreSQL cases in postgres-complete.json. Complete7A28/28,
B211/11, hosted restart/history, locking/visibility/undo, focus/Escape, navigation,
project switching and pending-save interactions passed. No assertions were weakened.
Build/typecheck passed (0.565461s/1.266622s command wall times); canonical50cells
completed in537ms compiler/ZIP time (0.716649s command wall time). The benchmark
records documentation HEAD1ebc5e2; source equality against8c1e5c4 is verified.

All115 final images were inspected; the [visual report](v2-8d-evidence/VISUAL-REVIEW.md)
records overlap/clipping and known limits. All9 required evidence gates are passed;
state records the separate ACCEPT decision and acceptedtrue. The validator initially refused an
expanded PostgreSQL gate file list; the report now preserves its exact23-case
contract and supplies a separate all-seven128-case aggregate. No checker or test
scope changed. Current dev:protocol reports0errors/0warnings.

Stop after independent review, owned cleanup and handoff. Future work lives only
in the roadmap; do not infer parent V2-8 completion or next-slice authorization.


## Development and fail-first chronology

Initial strict typecheck found four typing diagnostics (unknown object narrowing
and nonempty canonical edit tuples); canonical validation now supplies the narrowed
batch and typecheck passed. These were pre-freeze implementation corrections.
An initial development group found null-prototype objects incompatible with AJV's
object uniqueItems comparator. The owned group was terminated while a SQLite case
awaited HTTP that valid scopes never reached; incomplete totals are not a pass.
Sanitize first, then ordinary-JSON conversion fixes the boundary without changing
assertions. Corrected boundary/SQLite/governance execution passed93/93.

On source9bf412f, both real PostgreSQL protocol families exposed14 failures:
refusals rolled back safely but the backend sanitized unknown exceptions into
storage-unavailable. The six-file corrected-inventory run recorded142 total,
128pass/14fail/0skip/0cancel. Deliberate turn refusals now carry established domain
codes and preserve their safe turn code across backend rollback; enqueue handles
that before generic plan conflicts. No backend error policy or assertion changed.
An earlier development command named a nonexistent drift file: Node silently
omitted it while executing the other cases (141total/127pass/14fail). That drift
case was unexecuted in that attempt, then included in the142-case run. Raw attempts
are retained separately; neither failure run supplies a passing final-source gate.

A separate high-effort reviewer initially could not start due an account usage
limit. After its reported reset, the same context completed a
[read-only source audit](v2-8d-evidence/preliminary-source-review.md) of exact8c1e5c4
with no confirmed blocker. It executed0tests and supplied no acceptance. Root
retains the heavy slot until the complete packet is ready.


## Final-source PostgreSQL readiness interruption

All26 serial files passed208/208, including complete7A28/28 and B211/11. The first
four PostgreSQL inventory files passed42/42. The next runtime file emitted one
availability-placeholder skip (0pass/0fail/1skip/0cancel); its actual cases did not
run. The coordinator stopped and did not credit that file as passing. The owned
service remained running, with no OOM,54.5MiB used of192MiB tmpfs, and two subsequent
host TCP SELECT1 probes passed with6total server processes/connections reported.
The original test catch retained no error; its precise cause is unknown rather
than proven timing or product failure. Preserve this environmental/setup limitation.

[The archived attempt](v2-8d-evidence/attempts/pg-readiness/assessment.json) retains
raw TAP, original coordinator and service/probe observations. Only the archived
skipped record was removed from the active continuation index;32 completed zero-
exit jobs stay retained. No source, assertion or timeout changed. Resume requires
fresh sustained headroom and reruns the complete runtime file plus remaining jobs.
The skipped attempt remains separate; later actual totals must not absorb it.

The complete runtime PostgreSQL file then passed34/34 after fresh qualification,
with0fail/skip/cancel and no source/assertion/timeout changes. The original skipped
attempt remains separate; its precise original availability error is still unknown.


## Final visual, native and performance evidence

[Performance](v2-8d-evidence/performance.json) retains four local protocol/backend
samples. Prepare8.949–33.932ms, queue1.133–3.755ms, actual HTTP exchange4.435–20.198ms,
worker commit3.821–11.589ms, reopen0.413–8.877ms; each bounded trace1306bytes.
Existing process-kill/checkpoint recovery was203.297ms SQLite/282.583ms PostgreSQL
from fresh claim through worker commit, excluding lease wait. These are local
samples, not live provider latencies, production percentiles or network exactly-once.
The120-slide deck opened in1539ms with120thumbnails. Maximum canvas movement across
6cases was0.10219573974609375px, below the accepted1px tolerance.

Native OOXML and inspected images preserve real text/chart/table edits, human
rich-run styling/geometry, unrelated scenes and history restoration. No new overlap
or clipped dialog was found.8headless and5browser original PPTXs are preserved with
hashes; the3631-file evidence snapshot (including55original PPTXs) and5separate
canonical out/ originals were restored/hash-verified. Original archive bytes were
copied, never reconstructed. All11 preliminary7A hashes match final owned captures.
Original .agents/ and both PRESENTATION_FORGE_V2_* untracked documents are untouched.

Fresh180-second sustained headroom qualification and two new15-second acceptable
samples preceded each job; browser/build owners stayed serial with watchdogs and
low CPU/I/O priority. Busy samples withheld new jobs; global I/O PSI/iowait retains
unresolved provenance. No unrelated process/service was stopped or reused. Raw
resource streams/environment are retained; zero-pressure and graphics causality
are not asserted. The owned PostgreSQL service was removed after independent review, a saved/fsynced
zero-database observation and fresh actual-removal/port-closure verification below.

## Remaining limitations and recommendation

The pre-freeze JSON uniqueness and PostgreSQL refusal-classification defects were
corrected narrowly with unchanged assertions. No new product regression was found
in complete frozen-source validation. The separately archived readiness attempt
still contains1placeholder skip and unexecuted actual cases; the subsequent full
34-case rerun passed. Its original error was not retained, so cause remains unknown.
The BYOK locale failure remains separate. Fit/narrow canvas, rail/capture/pending-
search and SVG first-run style limits remain linked in the roadmap. Historical
archive/reboot-lost-service provenance limitations are not erased by this run.

Live provider/Auto quality, parent multi-provider/common-search qualification and
interactive Microsoft PowerPoint remain unexecuted/outside this bounded contract.
Opaque proposals are host-instance ephemeral; hosted cross-request approval needs
the explicitly recorded future identity/lifetime contract or one worker turn.
Prepared proposals do not survive restart; queued runs use existing durable recovery.
No prompt/key/raw response/transcript or new journal/store was introduced. Existing
backend runtime schema initialization on explicit invocation is distinct from
preparation's no-run/project-row mutation guarantee.

The independent decision accepts this bounded implementation with the residual
limits above. No blocking finding remains. Stop after owned cleanup and handoff;
no parent V2-8 completion or further feature implementation is implied.


## Independent acceptance and final cleanup

The [separate decision/report](reviews/V2-8D-8c1e5c4.md) compares accepted V2-8C
with exact `8c1e5c4e193340dd64ef3e68cd27bfe8ac55e23c` and packet `93bed02`.
Independent evidence is committed at `02e1c97`; the decision is `ff0be70`.
The reviewer finished and staged its explicit ACCEPT files, then hit a usage limit
before committing/pushing them. Root committed those unchanged authored files;
this is the separate reviewer's acceptance, not implementer self-acceptance. Its
saved decision-time protocol check passed with 0 errors and 0 warnings.

| Independently executed | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|
| Provider preparation, both protocols and backends |109|0|0|0|
| Canonical foundation, preservation, types and governance |104|0|0|0|
| Runtime, processes and both backends |69|0|0|0|
| PostgreSQL contracts, concurrency, faults and import |42|0|0|0|
| Complete Chrome shell |28|0|0|0|
| Persisted/native preparation scenarios |4|0|0|0|
| Additional authority mutation/response alias probes |2|0|0|0|
| Total |358|0|0|0|

These are separate executions: 352 inventory leaves from 18 files and 4 native
supplement cases overlap the primary packet; 2 probes are additional. Do not add
358 to the primary distinct 2643. The other 200 files/2287 inventory leaves were
inspected as complete passing evidence, not independently rerun. No planned
independent job remains unexecuted. The standing locale result was inspected,
not independently repeated. Build/type/protocol passed independently, and all
50 cells completed in 465 ms with all 5 invariance comparisons agreeing and every
cell result matching the packet.

The reviewer inspected all 115 packet images and 45 fresh images: 11 browser,
18 native pages and 16 SVG rasters. All 34 fresh native/SVG/shell images were
byte-identical to packet counterparts. OOXML audit confirmed unchanged human
run/paragraph/cell properties, shape/frame geometry and byte-identical untouched
slide 2 XML in all four protocol/backend scenarios. Fresh 120-slide opening was
1543 ms with 120 thumbnails; maximum shell canvas delta was 0.03064727783203125 px.
All 3898 snapshot files (3893 evidence files, including 68 original PPTXs, plus
5 canonical out/ originals) were restored/hash-verified; 10 new independent
originals were preserved. Independent resources retained 58 observations, 0 critical
samples and 9 pre-job samples withholding work; global PSI provenance stays unknown.

[Pre-removal observation](v2-8d-evidence/pre-removal-observation.json) records the
fresh actual zero-project-database count, saved and fsynced before stopping the
exact owned service. [Cleanup proof](v2-8d-evidence/owned-postgres-cleanup.json)
confirms actual container absence through inspect/ps and closed loopback port 5544.
The initial stop command returned exit 0 but its exact-stdout assertion failed;
that raw reply was not retained. Fresh state checks establish removal, and the
initial assertion failure is retained as a cleanup harness limitation. No service
was recreated, no count was reconstructed and no unrelated service was touched.
The earlier reboot-lost service's count remains unavailable, not zero.
