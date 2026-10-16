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
required validation are complete. Recommendation: **ACCEPT the bounded slice**.
A separate reviewer issued [ACCEPT for this exact source](reviews/V2-7B-2-03cc89e.json),
with the isolated restore-test timeout explicitly unresolved below. The state
attachment follows that decision; this evaluation supplies evidence, not approval.

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
that corrected source. No confirmed new product regression remains open. An isolated independent
restore-test timeout remains unexplained and is recorded separately below.

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

Independent review corrected one evidence-only defect: the first completed-chat
capture left the action below view. The supplemental driver now scrolls instantly
and waits for the full action above the composer. Both reviewer and implementer
opened its settled replacement, whose hash is in the final manifest; the original
is retained under independent/superseded-completed-chat.png. This changes only
the evidence driver/capture, with no app, canonical test or tool change.

All **30** final screenshots/native rasters were visually inspected and matched
their recorded hashes: 11 shell, five imported-content, nine handoff and five
native images. [Visual review](v2-7b-2-evidence/VISUAL-REVIEW.md),
[image manifest](v2-7b-2-evidence/images.json) and
[native inspection](v2-7b-2-evidence/export-inspection.json) identify provenance.
Narrow refusals and recovery fit, history dialogs remain usable, and no new
material canvas shift was found. Real native chart/table values are 1.25 and 12.5;
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
was **1568ms**; existing 120-slide/120-thumb shell opening was **1537ms**. Actual
hosted PostgreSQL browser proof took **2855.107ms**, including browser/font boot,
double-click handoff, editor capture, return to chat, chat capture and browser
teardown; the raw field is named browserBootAndHandoffMs but is not a pure handoff
measurement. Its server total was
**163.292ms** (compile 27.439ms, persist 13.099ms); CLI replay 73.547ms. These different
measurement boundaries must not be compared as equivalent handoff latencies.

Chart selection changed a bounding coordinate at most **0.115891px**, table
selection **0.018929px**. At 480×900 the imported inspector was
[192,44.003819,288,856], and the handoff boundary inspector approximately
[192,44,288,856]. Save observations include dirty → saving → saved. Raw bounds
are retained beside the screenshots.

## Environment and limitations

[Environment](v2-7b-2-evidence/environment.json): Node 24.16.0, Chrome 151.0.7922.173,
isolated cached PostgreSQL 15.18 on localhost 5544, owned resource-limited disposable
container. CPU/memory/I/O samples supported the quiet validation window; no
unrelated process/database was used or stopped. After the reviewer released the
service, the owned database list contained zero
forge-owned test databases. The exact owned container was stopped and automatically
removed with its tmpfs. All 29 checked fixed validation ports, including 5544,
are closed. Cleanup is recorded in the environment evidence; unrelated services
were left running.

Conversion coverage remains the accepted B1 contract: 50 field-gated type mappings,
24 wholly refused types, atomic refusal for unsupported fields, notes/citations,
identity/assets and capacity/fit. No claim of full legacy parity. Deleted targets
and changed source deliberately refuse without resurrection or replacement.
Standing Viewer Fit padding overflow is approximately 24px. Narrow inspector
overlay and toolbar/grid horizontal scrolling remain accepted behavior; fixture
controls await [workspace polish](ROADMAP.md#workspace-followups).
LibreOffice/Poppler inspection does not establish interactive Microsoft PowerPoint
behavior. No live model/provider run or hosted writing-quality claim was made.
No deployment, production migration or later feature was started.

## Independent acceptance and remaining uncertainty

The [separate review](reviews/V2-7B-2-03cc89e.md) compares baseline 662f7d6 with
source 03cc89e and audits pushed evidence 7042bec plus documentation correction
bc7305f. Independent primary successful executions are **57/57**: focused 25,
governance 20, exact unmodified PostgreSQL browser 11 and actual hosted supplemental 1.
These repeat behaviors/backend variants and are excluded from the distinct 2234.
Typecheck, protocol, all 50 benchmark cells and three fresh native raster pages
also passed. The reviewer audited all 199 file markers/totals and all 30 image
hashes rather than duplicating the entire matrix.

An earlier independent canonical PostgreSQL attempt was **10 pass / 1 fail**,
exit1: restore confirmation timed out at Saved revision 4. Its trusted target and
HTTP request were not captured, so its cause remains unexplained. It is preserved
and is neither waived nor counted green. Later traced diagnostic 1 and full
instrumented 11 passed; trusted Restore events caused a real revision 0/base 4 POST,
200 response and persisted revision 5. The exact unmodified canonical file then
passed 11/11 with recorded exit0. Subsequent success does not establish the first
timeout's cause. The reviewer explicitly accepts with this residual because the
restore implementation is unchanged, exact SQLite/PostgreSQL flows pass and no
repeatable loss or invalid state was established. The bounded investigation is
registered only in [the roadmap](ROADMAP.md#v2-7b-2-restore-timeout).
An interrupted governance wrapper lacked a recorded child exit despite 20 TAP
passes and was excluded; a fresh recorded 20/20 run replaces it. A reviewer
import-path setup error ran no product cases. Both remain in the independent logs.

The supported parent generation-to-project workflow is earned for conversions
admitted by B1; V2-7 hosted/Vercel readiness and full legacy parity are not implied.
Source remains `03cc89e`. Cleanup is complete; stop after committed/pushed handoff.
No later feature has been started.
