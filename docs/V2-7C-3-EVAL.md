# V2-7C-3 — production editor controls

Implemented and validated 2026-10-18; **independent review pending; not accepted**.
Accepted baseline bf1bd8f7dbce827be04ed530b2e7330b385e8baa, task-entry checkout
abadb9ec3177cf265e578505c13dd829c0845a89 on v2. Frozen implementation:
**484875ff5c826a34028889ed2fc6118bfdc407ad**. Later commits only record evidence,
procedure and review: no app/package/src/test/tool delta from this source.
[Approved contract](ROADMAP.md#v2-7c-3-plan), [complete inventory/runbook](v2-7c-3-evidence/RUNBOOK.md).

The human selected **Standalone scene viewer only** for fixture selection, Live,
the duplicate Projects dialog and developer diagnostics. One shared viewer now
presents normal document/edit/view controls on project routes, readable slide/object/
layer/history labels and truthful persisted status. Standalone retains its actual
fixture switching, deterministic local Live compiler and guarded saved-project UI.
No command engine, model/compiler/schema, store, auth policy or renderer was changed.

Runtime changes are confined to SceneViewer.jsx. Tests add the complete9-case toolbar
suite and adapt intentional7A entry points: History supplies the production dialog
bounds/Escape/focus check, while standalone retains both Projects-switch guard cases.
All28 original7A behavioral cases remain. Governance adds the C3 gate kind/inventory.
As-built architecture and continuity records are updated. No Fit fix, AI runtime,
deployment, migration or feature beyond C3.

## Exact executed results

All selected final rows below have **0 failures,0 skips,0 cancellations and0
unexecuted cases**. Logs preserve leaf totals and exact file markers; repeated
coverage is excluded from the distinct total.

| Selected coverage | Files | Passed |
|---|---:|---:|
| Non-browser bulk |176|2080|
| Bounded serial browser/build/plate owners |26|208|
| PostgreSQL contracts + imports |2|23|
| PostgreSQL cross-process concurrency + faults |2|19|
| Complete disjoint matrix |206|2330|
| Distinct hosted trusted-double-click/CLI/native case |1 supplemental|1|
| **Distinct final cases** ||**2331**|
| Focused toolbar9 + complete shell28, repeated |2|37|
| PostgreSQL toolbar, repeated |1|9|
| PostgreSQL catalog Chrome + HTTP, repeated |2|16 +8|
| PostgreSQL covers Chrome + HTTP, repeated |2|12 +9|

The toolbar repeat has8 PostgreSQL saved-project cases and1 actual local SQLite
standalone case. Hosted policy disables Live by design, so the local fixture
exercises it without changing policy. Catalog HTTP has7 PostgreSQL cases and1
local SQLite mode probe. Every listed case executes; neither qualification is a skip.

Production build and strict typecheck pass. Canonical benchmark executes **50/50
cells**, with no L1/L2/fit/takeaway findings, missing representations or chart
mismatches; invariance comparisons agree. Raster-none benchmark metrics are not
visual inspection. [Summary](v2-7c-3-evidence/summary.json), [commands/order](v2-7c-3-evidence/coordinator.json),
[benchmark](v2-7c-3-evidence/benchmark-50.json) and per-gate JSON index raw logs.

Separate standing probe: BYOK under en_IN.UTF-8 is **9 pass/1 fail**,0 skip/cancel.
Its unchanged Indian-vs-Western grouping assertion remains
[separately registered](ROADMAP.md#byok-locale-standing-failure), with raw failed
[output](v2-7c-3-evidence/logs/byok-locale.tap). Under C.UTF-8 it passes in bulk.
It is not relabeled green or added to the distinct selected matrix.

## Corrections and attempts

[All earlier attempts](v2-7c-3-evidence/attempts.json) are retained separately:
expected fail-first control separation; CDP scalar/geometry/hit-target and ambiguous
Slides selector corrections; local-vs-hosted Live fixture and HTTP200 expectation
corrections. No original behavioral or geometry assertion was removed to get green.

Early review found raw IDs in layer tooltips and blank-history fallbacks; both now
use readable labels only in production. A reproduced pre-existing product defect
reported unsaved edits after Done on an untouched saved project. Its fail-first
probe0/1 is retained; read-only text now derives from canonical saveState. Standalone
behavior is unchanged. A cleanup declaration-scope mistake caused a preliminary
readonly failure; only the owned process group was stopped, corrected and fully
rerun. That partial log contains14 passed leaves,1 failed leaf and22 interrupted/
unexecuted selections; it is not a pass. Final complete focus37/37 and serial208/208
contain the correction. No new unresolved product regression was found.

The unchanged B2 file passes11/11 on its first full run here. Its previously recorded
restore timeout remains [unexplained](ROADMAP.md#v2-7b-2-restore-timeout); a pass here
does not diagnose or resolve it. No final serial retry or per-file selection was needed.

## Frontend, native and performance evidence

[Visual review](v2-7c-3-evidence/VISUAL-REVIEW.md) records inspection of **123 final
images**, including **7 enlarged native slide rasters**. Source/backend/hash are
indexed in images.json and measurement provenance. Current historical suite outputs
were copied into the C3 namespace before their tracked originals were restored.
No new control overlap, clipped dialog or unexpected selection shift was observed.
Truthful saved/read-only state, normal insertion/editing, history, guards, narrow
light/dark reachability and standalone controls are exercised through real Chrome.

- 120 slides/120 thumbnails: **1534ms** open time in full7A.
- Dedicated C3 chart/table SVG delta: **0px**, SQLite and PostgreSQL.
- Full7A maximum observed positional drift: **0.030510px**; dimensions remain stable
 to subpixel precision.
- 480×900 toolbar height: **40.1875px**, unchanged while scrolling every retained
 insertion/Fit target into an unobscured pointer hit, light and dark.
- Hosted PostgreSQL import: **160.038ms** total,23.685ms compile,12.110ms persist;
 trusted browser boot/handoff2922.260ms; CLI replay71.652ms. Single local samples,
 not production percentiles.

Authenticated native exports preserve edited chart/table labels and decimal values;
inserted rect/roundRect/ellipse remain native OOXML. SQLite embedded shell2 pages
and B1/B2 exports5 pages were rasterized through src/preview.js and inspected.
PostgreSQL hosted/toolbar exports also pass native OOXML checks. LibreOffice/Poppler
is not interactive Microsoft PowerPoint. No model content-quality run was performed
or claimed; deterministic Live does not spend a hosted generation budget.

## Environment, limitations and recommendation

Node24.16.0, real Chrome, actual Express production server/CSP for C3. Shared-machine
CPU/memory/I/O checks preceded expensive work; competing CPU work was allowed to
finish before the full frozen-source run. Niceness10/ionice2:7,4 bulk workers,
30-minute bulk and15-minute per-file watchdogs; browser/build/LibreOffice owners
never overlap. Forge-only PostgreSQL15.18 uses cached postgres:15-alpine, one CPU,
512MiB,192MiB tmpfs and localhost5544. Ownership and cleanup observations are in
[environment.json](v2-7c-3-evidence/environment.json). Other processes/databases and
three unrelated untracked paths were untouched. Service remains available through
independent review; cleanup must be recorded afterward.

Existing Fit content-box clipping, canonical C1 rail-transition captures, B2 composer
capture and C2 interim-search capture limitations remain explicit in visual review
and the roadmap. No production-deployment, native PowerPoint interaction or hosted
content-quality claim is made.

**Implementer recommendation: ACCEPT the bounded C3 source after separate review.**
All required execution is complete; no implementer acceptance or next-feature
implementation is authorized by this recommendation. The separate decision and
current accepted baseline remain indexed in development-state.json.
