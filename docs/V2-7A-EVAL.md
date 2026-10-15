# V2-7A final validation and acceptance evidence

Updated 2026-10-15 (Asia/Kolkata). Branch `v2`. Accepted baseline:
`97a12de92e1b691a8ebab26f524ddc0afd9bf111`. Original implementation:
`a298767ce32df1a0023ada4a1e8d0bda506a1ca9`. Corrected source under final validation:
`fe749fb41e744961df156e8b9dcf80f0155b4e0b`. Later documentation/evidence commits
do not change those application bytes. **V2-7A is not accepted by this report.**

## Scope and invariants

Finish the deferred workspace/dashboard/routing/editor-shell validation; correct
reproduced regressions narrowly. No V2-7B, generation handoff, AI runtime,
compiler, schema, renderer, theme, store or command feature work. Layer-C scenes
and the revisioned engine remain authoritative for human editing/native PPTX;
model-authored intent gains no geometry/style escape hatch. Existing untracked
`.agents/` and both `PRESENTATION_FORGE_*` documents remain untouched.

## Independent review and corrections

The separate review of `3037faf` issued [HOLD](reviews/V2-7A-3037faf.json), with
[the findings and execution limits](reviews/V2-7A-3037faf.md). Subsequent separate
source/probe review challenged asynchronous correction paths; its final exact-SHA
acceptance decision is pending review of the now-complete evidence.

| Finding | Classification | Narrow correction / evidence |
|---|---|---|
| Sidebar/hash/Back bypassed leave policy | Product regression | Central indexed hash routing restores history before choice; Cancel preserves entry/document |
| Failed/conflicted saves and just-committed drafts appeared clean | Product regression | Dirty policy reads engine/draft/pending-save ownership, including Done/read-only |
| Save & leave returned before an older PUT or newer edits persisted | Product regression | Await real PUT promise and drain newest revision before departure |
| Cancelled Save & switch could navigate when PUT completed | Product regression | Confirmation target identity rechecked after await |
| Discarded edits could be saved by an older PUT follow-up | Product regression | Per-document save suppression, post-await identity checks and autosave cancellation |
| Failed discard/reload left editing permanently unsaveable | Correction regression | Roll suppression back on load failure; preserve old adapter until new document validates |
| Unbound Done/re-enter lost unsaved ownership | Correction regression | Keep authoritative document through interaction detachment; explicit fixture/live swaps reset unbound ownership |
| Fast project load preceded font-gated viewer mount | Product regression | Gate binding on viewer readiness and recheck viewer after asynchronous document creation |
| Project listing lost HTTP status/code | Product regression | Preserve recovery metadata for 401/403/503 states |
| Plain project export URL returned404 for signed-in owner | Product regression | Download via existing bearer identity; legacy `/api/decks` cookie scope is unchanged |
| Narrow top bar hid late controls | Product regression | Horizontal overflow with nonshrinking controls; actual inspector/dialog checks |
| Undo test expected revision decrement | Incorrect test expectation | Monotonic revision plus persisted hidden content and redo assertions |
| New chart/table layer selector targeted a nonexistent span | Test error | Select the real labeled layer button; retain data/content/geometry assertions |
| Headless caret test lost desktop focus after a delay | Environmental test limitation | Trace showed document.hasFocus false, then expected blur commit; CDP focus emulation, stronger focus assertions preserved |
| Guard test assumed confirmation within 5ms | Test timing issue | Wait for confirmation callback and expected history state |
| Passing subsets could satisfy full evidence gates | Governance defect | Retain observed entry files, compare manifest scope, reject filtered runs; negative scope tests |
| Imported contract helper polluted file markers | Test reporter defect | Inventory `.test.js` entries; real imported-helper reporter regression |

Corrections are focused commits from `55c5e95` through `fe749fb`; changes are in
App, SceneViewer, shared project download/client/router helpers, scoped tests and
continuity validation. No assertions were relaxed to obtain a pass.

## Final validation ledger

Final execution is complete. Count leaf tests, not suite containers. The disjoint
[192-file inventory](v2-7a-evidence/validation-plan.json) contains 168 bulk,
21 serial build/browser and 3 PostgreSQL files. 7A is a subset of serial; SQLite
contracts are in bulk; PostgreSQL browser is in serial. Do not add overlapping
rows as separate tests.

| Gate | Pass | Fail | Skip | Cancelled | Status |
|---|---:|---:|---:|---:|---|
| Non-browser bulk, 168 files |1936|0|0|0|Complete at frozen source; 18.238s |
| Full 7A Chrome, 28 cases |28|0|0|0|Complete; subset of serial |
| Serial 21 files including PG browser |155|0|0|0|Complete, bounded one file at a time |
| PostgreSQL contract |17|0|0|0|Real PostgreSQL 16 |
| Cross-process persistence 11 + faults 8 |19|0|0|0|10 PG + 1 SQLite persistence; 8 real PG fault cases |
| Production build |—|—|—|—|Passed, exit 0; 0.402s |
| Typecheck |—|—|—|—|Passed, exit 0; 1.145s |
| Canonical benchmark, 50 cells |—|—|—|—|Passed; 0 L1/L2; 491ms compiler runner |
| Final frontend/export visual inspection |1|0|0|0|Supplemental hosted flow passed; 15 PNGs inspected, 2 native-export rasters |

Disjoint final inventory: **2127 tests, 2127 pass, 0 fail, 0 skip, 0 cancelled**
across all 192 files. The supplemental hosted browser check adds **1 pass**
(2128 distinct final cases including it). **Required unexecuted cases: none.**
The 28-case 7A row is already included in the 155 serial count. Build/typecheck
and benchmark are command/cell gates, not extra tests. Later 18-case governance
reverification passed after evidence population; it repeats bulk coverage.

[Summary JSON](v2-7a-evidence/summary.json), per-gate JSON, exact commands and raw
TAP/logs are retained under `v2-7a-evidence/`. The [attempt history](v2-7a-evidence/attempt-history.json)
preserves superseded runs and the interrupted file separately. Supplemental
hosted check setup initially failed before UI execution (one import-path error,
two fixture-registration expectation errors); corrected setup then passed twice,
with the final run retaining geometry. These are test setup errors, not product
failures. Node reports each setup attempt as 0 pass / 1 fail; no skips/cancellations.
The bulk run's `LC_ALL=C.UTF-8` resolves Intl to en-US. The standing BYOK assertion
passes there, but a separate untouched `LC_ALL=en_IN.UTF-8` run reproduces the
known failure: **10 total, 9 pass, 1 fail, 0 skip/cancelled**, `5,000,000` versus
`50,00,000`. This is separate from the disjoint final inventory and remains
[an existing issue](ROADMAP.md#byok-locale-standing-failure); no fix or implicit
waiver is claimed.

## Attempts before the frozen-source run

These are diagnostic attempts, not extra unique passing tests:

- Original full 18-case 7A: 14 pass, 4 fail, 0 skip/cancelled; project readiness,
  monotonic undo expectation and hosted listing failures triaged above.
- Superseded correction attempt stopped deliberately after diagnosis of the
  viewer-readiness race: incomplete/cancelled, never counted as a pass.
- 23-case correction run: 21 pass, 2 test-selector failures, 0 skip/cancelled.
- 25-case correction run: 25 pass, 0 fail/skip/cancelled.
- 25-case run with actual export action: 24 pass, 1 product failure 404;
  a proxy teardown rejection was also diagnosed and corrected in test code.
- 26-case correction run: 26 pass, 0 fail/skip/cancelled. Its continued serial
  attempt reached freeform, plate and 5C green, then 5D 3/4 due desktop focus loss.
- Focus diagnosis repeated the 4-case 5D suite (3 pass/1 fail) while tracing;
  focus emulation then produced 4/4 with stronger assertions.
- A separate lightweight reviewer observed one route timing failure; 6 isolated
  reruns passed. The fixed 5ms assumption was subsequently removed.

Earlier implementation-session results and the old six images are historical,
not substitutes for the current final pass. Original evidence claims were
corrected during the repository continuity audit; Git preserves those reports.

## Frontend evidence and performance

Final inspection and per-scenario evidence are recorded in
[v2-7a-evidence/VISUAL-REVIEW.md](v2-7a-evidence/VISUAL-REVIEW.md). Required coverage:
dashboard creation/reopen/rename/delete, save states, text/chart/table, undo/redo,
slides/layers/locks/visibility, history restore, read-only, narrow inspector and
dialog reachability, shortcuts/Escape/focus, route/switch guards, pending drafts
and saves, repeated mounts/cleanup, and an actual authenticated export action.

The 120-slide case measured **1542ms** and all **120 thumbs**. It includes Chrome
launch, fixture font gate and project route/open, not isolated render latency.
The original 120000ms threshold was retained. Controlled chart/table selection
left x/width unchanged; y changed less than 0.1px while entrance animation settled.

The canonical 50 cells have 0 L1/L2, fit, representation, takeaway or chart-data
findings; all five theme-invariance records agree. All six current semantic
counterfactuals are sensitive; three older purpose-only/audience controls remain
insensitive, unchanged by this work. Full results are committed; raster-none is
not a visual verdict for all 50 cells.

## Known limitations and next boundary

Legacy chat/deck lists coexist with saved projects; cover thumbnails are absent;
fixture controls remain in the production editor toolbar; Assistant is a labeled
placeholder; generation handoff is missing. Future work is recorded only in
[workspace followups](ROADMAP.md#workspace-followups),
[V2-7B](ROADMAP.md#v2-7b-candidate) and V2-8 in the roadmap. BYOK locale remains
separate. Final inspection also measured the accepted viewer's existing Fit
padding defect: a 720px scroller has 768px scroll width and initially hides about
24px of the canvas. The same padding/refit code exists at 97a12de; no new
selection shift was found. The roadmap's Viewer Fit entry records that separate
pre-existing defect rather than expanding this slice. Rasterization can establish LibreOffice output only; native Microsoft
PowerPoint remains an external viewer check. No generated-content quality
judgment is made; these are deterministic fixtures and local/hosted API plumbing.

Implementation recommendation: submit for independent acceptance with the
standing BYOK locale and pre-existing Fit limitations explicit. No new failing
product regression remains in the executed scope. This is a recommendation only.

No V2-7A self-acceptance, deployment, migrations, main push or V2-7B implementation.
A separate final review must name the exact corrected source and complete
retained evidence. Acceptance permits planning; implementation still needs the
next slice's explicit authorization.

<a id="final-validation-environment"></a>

## Final-validation environment and isolation

Initial attempts waited while unrelated work saturated the shared machine.
Later direct samples showed ample headroom despite high system I/O PSI:
2026-10-15T06:16Z CPU 86.05% idle, available memory~49GiB, disk utilization 0.13%;
13:16Z CPU 74.84% idle, available memory~30.8GiB, disk utilization 9.8%, reads 0MB/s,
writes 5.72MB/s, no in-flight disk operations. Low-priority bounded validation was
then appropriate. No unrelated process was stopped. Historical pressure samples
remain in `v2-7a-evidence/environment.json`; final samples will be retained too.

A dedicated ephemeral PostgreSQL 16 container uses localhost 5544, one CPU,
512MiB memory and RAM-backed 192MiB data. It was created from a locally cached
image for this validation; it does not reuse another project's database. Test
suites create/drop isolated databases. Stop/remove only this owned service after independent review; record cleanup
in the handoff. PostgreSQL checks count only if real cases execute, never setup skips.

The [runbook](v2-7a-evidence/RUNBOOK.md) uses `nice`, `ionice`, process-group GNU
`timeout`, 15-minute per-file bounds (30-minute bulk) and 10-second KILL fallback.
Browser/build-owning files run strictly serially, with no overlapping Vite build.
Logs retain exact exit status and runner-observed file scope.
