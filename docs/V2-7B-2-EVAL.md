# V2-7B-2 — explicit browser handoff

2026-10-16, branch `v2`. Frozen implementation/test/tool source:
`03cc89ef233db5469066599391cbaac68c2fc646`. Task-entry accepted baseline:
`662f7d6a08647d431eded1ea17c5d13e7ca1c591`, independently accepted in
[the B1 decision](reviews/V2-7B-1-662f7d6.json). Planning checkout:
`924f157cad244d0c3888627e8f3ee5c97e51058a`. Later documentation-only commits
contain the tested source without changing runtime, tests or tools.

Human direction approved the explicit **Open in editor** action on completed
presentation chats and the legacy deck page. The [approved task](ROADMAP.md#v2-7b-2-plan)
defines scope, invariants, non-goals, gates and stop point. Implementation and all
required validation are complete. Recommendation: **ACCEPT the bounded slice**;
independent exact-source decision is pending. This report does not accept itself.

## Resulting behavior

Both entry points call the accepted authenticated import service with stable
`browser-editor-v1` identity, scoped by the server to owner/source. First use
creates a saved editable project; retry, reload, another tab or entry point
reopens the current human-edited project. An ambiguous response cannot duplicate
it. The original deck remains accessible. Changed source, deleted target,
unsupported content, incomplete generation, storage/network and authentication
failures have visible recovery/refusal states. The existing guarded router waits
for confirmation and protects pending edits. Disposed views and changed identity
ignore late responses; cross-tab sign-in changes show a focused reload notice.
Reports retain their existing action. There is no converter/engine/store expansion,
security-policy change, deployment or production migration.

## Exact final execution

[Summary](v2-7b-2-evidence/summary.json), [inventory](v2-7b-2-evidence/validation-plan.json)
and [runbook](v2-7b-2-evidence/RUNBOOK.md) retain commands, raw outputs, source and
per-file watchdog exit status. All 199 current test files occur exactly once in
the disjoint matrix. Browser/build/plate owners ran strictly serially, with no
shared Vite build overlap. Bulk used four workers; each process group was bounded.

| Final group | Files | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Non-browser bulk, C.UTF-8 | 172 | 2020 | 0 | 0 | 0 |
| Serial browser/build/plate owners | 23 | 171 | 0 | 0 | 0 |
| PostgreSQL contracts/import | 2 | 23 | 0 | 0 | 0 |
| PostgreSQL cross-process/faults | 2 | 19 | 0 | 0 | 0 |
| Matrix total | 199 | **2233** | **0** | **0** | **0** |
| Distinct actual hosted PostgreSQL double-click → human edit → authenticated CLI replay → native export | supplemental | **1** | **0** | **0** | **0** |
| Total distinct final cases | | **2234** | **0** | **0** | **0** |

Required tests unexecuted: **0**. The focused handoff run is **25/25** and the
same 11 Chrome handoff cases repeated on PostgreSQL are **11/11**; these repeat
matrix cases and are not added again. The full 28-case V2-7A Chrome suite and
five B1 actual-server import cases are included in the serial group. Locks,
visibility, undo/redo, keyboard/focus/Escape, signed-out dashboard, project guards,
pending navigation, large decks and cleanup all passed. B1 browser coverage
provides chart/table editing, exact values, save transitions and canvas bounds;
B2 adds the actual completion/deck-page handoff, edit/save/reopen/history/export,
ambiguous committed response, genuine second-window token event and stale context.
The hosted supplemental driver observes two trusted clicks causing one HTTP POST.

Production build and typecheck pass. All **50** canonical benchmark cells pass:
zero L1, L2, fit, missing-representation, takeaway or chart-data findings; all five
invariance checks agree. The raw benchmark checkout is `2802f4d`, a docs-only
descendant of the frozen source; [benchmark evidence](v2-7b-2-evidence/benchmark-50.json)
records that distinction. Benchmark raster-none checks alone make no visual claim.
Actual native exports passed OOXML checks and separate raster inspection.

The unchanged `en_IN.UTF-8` BYOK probe is **9 pass / 1 fail**, exit1, no
skip/cancellation. Its numeric grouping expectation is the [standing locale issue](ROADMAP.md#byok-locale-standing-failure),
kept separately in [raw output](v2-7b-2-evidence/logs/byok-locale.tap). It is not
relabelled green or included in the 2234 distinct passing cases. The complete
regression uses C.UTF-8 as in the accepted isolation strategy.

## Corrections and failure classification

Independent early review identified two real recovery gaps: a changed sign-in
could leave a mounted action opening indefinitely, and a failed prerequisite
chat source read could leave it disabled without retry. The corrections invalidate
stale work with reload guidance and expose explicit source-read retry; the latter
also prevents wrong-mode import before source readiness. Real-window and
same-document identity cases and source-read/dark-mode cases now pass.

Visual review found a duplicated error announcement and a second completion card;
these were consolidated into the existing surface. Final inspection then found
session recovery below the fixed composer. Source `03cc89e` focuses a single alert
and asserts its full bounds above the composer. Every required gate was rerun on
that corrected source. No new product regression remains open.

Earlier fixture failures were not product passes: boolean DOM readiness had to
serialize to a boolean; cold-start route setup had to follow existing chat policy;
trusted clicks needed scrolling; source fixtures had to satisfy minimum content;
metadata and full documents needed distinct assertions; enabled-empty Undo is a
validated no-op; export required closing the history modal. Raw CDP Enter did not
activate even a plain native diagnostic button, while Space did; final keyboard
coverage uses trusted Space. No product assertion was weakened to mask failure.
[Attempt records](v2-7b-2-evidence/logs/attempts/index.json) retain observed outcomes,
including three deliberately cancelled preliminary files. Incomplete TAP leaves
6,10,10 cases without a completed result in those attempts; these are never counted
as passes. Later full attempts and source `22047f7` results are explicitly
[superseded](v2-7b-2-evidence/logs/superseded-22047f7/RESULTS.json), not final evidence.

## Frontend, export and performance evidence

All **30** final screenshots/native rasters were visually inspected and matched
their recorded hashes: 11 shell, five imported-content, nine handoff and five
native images. [Visual review](v2-7b-2-evidence/VISUAL-REVIEW.md),
[image manifest](v2-7b-2-evidence/images.json) and
[native inspection](v2-7b-2-evidence/export-inspection.json) identify provenance.
Narrow refusals and recovery fit, history dialogs remain usable, and no new
material canvas shift was found. Real native chart/table values are 1.25 and12.5;
exports contain actual editable text, chart parts and table XML.

[Measurements](v2-7b-2-evidence/PERFORMANCE.json) are individual observations,
not latency guarantees. Handoff timing starts with the legacy page ready.
The raw `cold` label means a first source import into an already warmed process,
not process-cold startup; `warm` is durable receipt replay from another entry point.

| Observation | SQLite | PostgreSQL 15.18 |
|---|---:|---:|
| Three-slide first handoff | 397ms | 417ms |
| First service total | 11.674ms | 13.743ms |
| Receipt-replay handoff | 398ms | 400ms |
| Replay service total | 2.833ms | 7.077ms |
| 60-slide handoff, page already ready | 415ms | 483ms |
| 60-slide service total | 23.546ms | 33.641ms |

The separate fresh 60-slide imported-editor opening, including browser/font boot,
was **1568ms**; existing120-slide/120-thumb shell opening was **1537ms**. Actual
hosted PostgreSQL boot+double-click+handoff was **2855.107ms**, server total
**163.292ms** (compile27.439ms, persist13.099ms); CLI replay73.547ms. These different
measurement boundaries must not be compared as equivalent handoff latencies.

Chart selection changed a bounding coordinate at most **0.115891px**, table
selection **0.018929px**. At480×900 the imported inspector was
[192,44.003819,288,856], and the handoff boundary inspector approximately
[192,44,288,856]. Save observations include dirty → saving → saved. Raw bounds
are retained beside the screenshots.

## Environment and limitations

[Environment](v2-7b-2-evidence/environment.json): Node24.16.0, Chrome151.0.7922.173,
isolated cached PostgreSQL15.18 on localhost5544, owned resource-limited disposable
container. CPU/memory/I/O samples supported the quiet validation window; no
unrelated process/database was used or stopped. The owned service remains only
for the independent reviewer and will be removed after review.

Conversion coverage remains the accepted B1 contract: 50 field-gated type mappings,
24 wholly refused types, atomic refusal for unsupported fields, notes/citations,
identity/assets and capacity/fit. No claim of full legacy parity. Deleted targets
and changed source deliberately refuse without resurrection or replacement.
Standing Viewer Fit padding overflow is approximately24px. Narrow inspector
overlay and toolbar/grid horizontal scrolling remain accepted behavior; fixture
controls await [workspace polish](ROADMAP.md#workspace-followups).
LibreOffice/Poppler inspection does not establish interactive Microsoft PowerPoint
behavior. No live model/provider run or hosted writing-quality claim was made.
No deployment, production migration or later feature was started.

Independent review/decision and final cleanup must be attached before acceptance
state is advanced. Stop at this slice's review and handoff.
