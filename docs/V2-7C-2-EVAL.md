# V2-7C-2 — unified project discovery

Independently accepted 2026-10-18; validation executed 2026-10-17, branch `v2`. Implementation:
**bf1bd8f7dbce827be04ed530b2e7330b385e8baa**. Task baseline was C1
`f79ae07d6ad1696da3106a2a1148ae0ce7f58f51`; task-entry checkout `5190887`.
Later commits contain evidence/documentation only. The separate
[ACCEPT decision](reviews/V2-7C-2-bf1bd8f.json) establishes acceptance; this
implementer report supplies its supporting evidence.

The approved [contract](ROADMAP.md#v2-7c-2-plan) delivers one Projects grid for
saved editable presentations and generated decks/reports, search/type filters,
source-qualified identities and one sidebar destination. Originals and editable
copies remain distinct. Reads never import, merge or mutate documents; deletion
names and removes only the selected copy. Existing saved covers, owner/admin/local
policy, report-only/report/research/script access, explicit editor handoff and
receipt-based reopening remain canonical.

## Execution and provenance

The [runbook](v2-7c-2-evidence/RUNBOOK.md) and
[205-file inventory](v2-7c-2-evidence/validation-plan.json) partition all test entry
files into 176 bulk, 25 serial browser/build owners and four PostgreSQL files.
Node 24.16.0 and Chrome 151.0.7922.173 ran at low priority in a measured quiet
window; browser/build/LibreOffice owners ran serially. SQLite and a dedicated
PostgreSQL 15.18 service on localhost 5544 were exercised. No other project's
process or database was interrupted. [Environment](v2-7c-2-evidence/environment.json).

The initial final-source serial attempt passed 22 files, then the unchanged B2
handoff file reported 10 pass/1 restore timeout. One unchanged bounded retry passed
all 11; C1/C2 remaining files then continued. The selected final inventory combines
the first 22 successful logs with that complete retry and the remaining two files.
All original outputs and replacement provenance are retained. This is not a claim
that every attempt was green, or that a retry resolved the timeout's cause.

The [summary](v2-7c-2-evidence/summary.json), exact per-file logs and
[coordinator](v2-7c-2-evidence/coordinator.json) retain commands, source and outcomes:

| Selected final inventory | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|
| Non-browser bulk,176 files |2079|0|0|0|
| Serial browser/build owners,25 files |199|0|0|0|
| PostgreSQL contract/import,2 files |23|0|0|0|
| PostgreSQL concurrency/faults,2 files |19|0|0|0|
| **205-file matrix** |**2320**|**0**|**0**|**0**|
| Distinct supplemental hosted browser/CLI/native case |1|0|0|0|

**2321 distinct final cases pass; required unexecuted cases:0.** The selected
serial result is assembled as disclosed above, with the failed attempt retained
in [serial-initial logs](v2-7c-2-evidence/logs/serial-initial/runs.json) and
[selection provenance](v2-7c-2-evidence/serial-recovery.json). Initial serial totals
were 170 pass/1 fail across 23 files; two remaining files were then unexecuted.
The unchanged B2 retry passed 11, followed by C1 twelve and C2 sixteen.

Repeated checks, excluded from the distinct total: focused catalog41/41 (17 unit,
8 HTTP,16 Chrome), PostgreSQL catalog16/16 and catalog HTTP8/8 (seven hosted PostgreSQL cases
plus one deliberate local SQLite anonymous-policy case), PostgreSQL C1 covers12/12
and HTTP9/9. Each has zero skips/cancellations. Additional settled-search evidence
passes1/1 with 15 other cases unexecuted by its diagnostic filter. Its first capture
probe also passed1/1 but did not establish settled query completion. Neither
substitutes for the full catalog file. The explicit en_IN locale probe is **9 pass,
1 standing BYOK assertion failure**, zero skip/cancelled; it is not green.

Production build and strict typecheck pass. The canonical benchmark completes
all 50 cells with zero L1/L2, fit, takeaway, missing-representation or chart-value
findings, and all five invariance checks agree. Raster-none benchmark findings
are compiler/OOXML evidence; visual evidence comes from actual native exports.

## Frontend and performance

All 106 selected final images were inspected and hashed; seven actual authenticated
native export pages were rasterized and inspected. The [visual review](v2-7c-2-evidence/VISUAL-REVIEW.md)
distinguishes automated interaction coverage from inspection, settled alternatives
from inherited transitional frames, and native OOXML assertions from client limits.
New discovery views/dialogs show no observed overlap or clipping. C2 narrow search
and type controls have unobscured hit targets; the dialog fits 480×900. Creation,
reopening, save transitions, editing, undo/redo, slide/layer/history operations,
read-only behavior, guards, authentication and cleanup remain covered by actual
Chrome regressions. The recurring B2 timeout remains unresolved despite its retry.

Current-source measurements, single fixture observations rather than an SLA:

| Measurement | SQLite | PostgreSQL |
|---|---:|---:|
| Mixed catalog ready after discovery root |388ms|389ms|
| First saved cover after grid |109ms|158ms|
| Max concurrent saved-cover work,30-project exercise |2|2|
| Cover requests in that exercised viewport path |12|12|

The 120-slide deck opens in 1539ms with120 thumbnails. Chart selection drift is
0.030434px and table selection drift0.030449px, with no meaningful canvas resize.
Imported 60-slide opening is 1499ms; explicit60-slide handoff 468ms. Hosted two trusted
clicks send one import POST; human rename/CLI receipt replay retains revision 1 and
native values 1.25/12.5. That hosted sample records 206.931ms import total and 60.483ms
receipt replay, while 2897.833ms browser boot-and-handoff includes unrelated UI work.
[Backend/source-qualified measurements](v2-7c-2-evidence/measurements) retain raw data.

## Corrections and retained attempts

- Malformed undefined list responses are reported as source errors rather than
  empty ready results. Source deadlines, stale-query/account fences and cancellable
  lifetimes preserve truthful partial results and bounded cover work.
- Independent review found modal navigation shortcuts could escape focus and
  deletion errors appeared behind the modal. Shortcuts now defer to the dialog;
  busy focus remains contained and recovery errors are visible/focused inside it.
- Development StrictMode reproduced failed invoker restoration. Listener removal
  and restoration now share one cleanup lifetime, verified in actual development
  mode. These are scoped product fixes, not assertion relaxations.
- The canonical 7A fixture inherited the real legacy deck root and measured pointer
  coordinates before both catalog sources settled. Each server now isolates its
  deck root; read/animation readiness preserves the original 28 assertions.
- A PostgreSQL catalog repeat on prior source `9fd8b92` reported 15/16. Controlled
  animation completion moved Delete 28px after measurement; trusted pointer events
  hit the dialog background and no DELETE was sent. Waiting for actual animation
  completion corrected the test helper; runtime and assertions were unchanged.
  The original spontaneous failure did not capture events, so its classification
  is supported by the diagnostic rather than directly traced.

[Attempts and exact counts](v2-7c-2-evidence/attempts.json) retain earlier unit,
HTTP, build, Chrome and filtered diagnostics separately. The earlier canonical 7A
failure contains real deck titles, so its raw log stays in ignored local scratch;
its counts/classification are published without those names. Earlier-source
results do not substitute for final-source evidence.

## Limits and stop point

The recurring [B2 restore timeout](ROADMAP.md#v2-7b-2-restore-timeout),
[BYOK locale failure](ROADMAP.md#byok-locale-standing-failure),
[Fit content-box defect](ROADMAP.md#viewer-fit-content-box) and
[C1 narrow capture timing](ROADMAP.md#v2-7c-1-narrow-capture) remain separate.
No Auto writing-quality, deployment or interactive Microsoft PowerPoint claim is
made. Native output is checked through OOXML and actual LibreOffice/Poppler rasters.
No deployment, migration, toolbar, agent runtime or other feature scope is included.
Stop after this slice's independent review and handoff.


## Recommendation and review

The [independent review](reviews/V2-7C-2-bf1bd8f.md) accepts exact source `bf1bd8f`
after 109/109 fresh passing test executions, independent typecheck/protocol/50-cell
checks and a fresh PostgreSQL cover/edit/restore/delete-original/native proof.
The reviewer audited the complete matrix, 106 finalized images, 44 fresh browser
captures and three fresh native pages; it did not independently duplicate the
whole matrix. No required validation waiver was used. [State](development-state.json)
now points to the separately accepted source. No next feature is authorized.

Historical suite outputs were restored only after current-source copies/hashes
were retained. All finalized bytes/hashes survived the review interruption.
After a host restart the owned auto-remove PostgreSQL container was already
absent and all 29 checked validation ports were closed; closeout did not stop
unrelated services. Its pre-removal database count could not be re-queried and is
recorded as unknown. Actual completed PostgreSQL results remain retained, rather
than being replaced by an assertion that a currently unavailable service passed.
[Cleanup observation](v2-7c-2-evidence/environment.json).
