# V2-7C-1 — saved-project first-slide covers

Frozen implementation **f79ae07d6ad1696da3106a2a1148ae0ce7f58f51**, branch `v2`,
2026-10-17. Accepted baseline **03cc89ef233db5469066599391cbaac68c2fc646** is
[V2-7B-2](reviews/V2-7B-2-03cc89e.json); task-entry checkout was b8dc425.
Human direction approved first-slide previews above existing project-card titles
and actions. The bounded [task contract](ROADMAP.md#v2-7c-1-plan) defines scope,
invariants, non-goals, gates and stop. Later commits contain documentation and
evidence only. All required implementation validation is complete; separate acceptance is pending.

## Result and source boundaries

Project cards render the first saved Layer-C scene with the canonical SVG
renderer. A thin revision-scoped HTTP read uses the existing store ownership
policy and returns only that scene. It creates no persisted cover, schema,
project truth or renderer layout. The preview remains a labeled Open action
while loading or unavailable; existing metadata/actions stay below it.

The workspace owns a two-worker near-viewport queue, a 15-second deadline
including preparation, and a memory-only 24-entry/8MiB LRU. The server refuses
cover payloads above 2MiB. Saved edits, reorder and restore create new revision
keys. Offscreen/unmounted/account-invalidated work is cancelled, late work is
ignored, and old-account cards are replaced by focused reload guidance. No local
storage image cache, asset lifecycle, AI layout or feature beyond this slice is
introduced. Unsupported font coverage stays an honest unavailable preview.

Changed runtime/test paths are the cover domain/route, workspace/card components,
transport/loader, shared font readiness, three focused suites and governance gate
mapping. The final changed-files manifest is relative to task-entry b8dc425;
original unrelated untracked paths remain untouched.

## Executions

The [202-file plan](v2-7c-1-evidence/validation-plan.json) partitions 174 bulk files,
24 serial browser/build owners and four PostgreSQL files. All browser/build owners
run one bounded process group at a time with niceness 10/ionice 2:7, per-file
watchdogs and retained exit status. Commands are in the [runbook](v2-7c-1-evidence/RUNBOOK.md).
Final exact-source results:

| Execution | Files | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Non-browser bulk | 174 | 2053 | 0 | 0 | 0 |
| Serial browser/build/plate owners | 24 | 183 | 0 | 0 | 0 |
| PostgreSQL contract/import | 2 | 23 | 0 | 0 | 0 |
| Cross-process concurrency/faults | 2 | 19 | 0 | 0 | 0 |
| Disjoint matrix | **202** | **2278** | **0** | **0** | **0** |
| Distinct hosted PostgreSQL double-click/CLI/export supplement | 1 driver | 1 | 0 | 0 | 0 |

There are **2279 distinct final cases**, with **zero required unexecuted cases**.
The repeated focused gate passes **44/44** (23 unit, nine actual HTTP,12 Chrome),
PostgreSQL cover Chrome **12/12**, and PostgreSQL cover HTTP **9/9**. These are
not added again to the distinct matrix count. The full V2-7A Chrome shell suite
passes **28/28** within the serial group. Governance21 is included in bulk.

Production build and typecheck exit0. All **50 canonical benchmark cells** pass
with zero L1/L2/fit/takeaway/representation/chart findings; all five invariance
checks agree. The native driver verifies three actual exported PPTX files and
produces five inspected rasters. These commands are gates, not extra leaf cases.
The separate **en_IN.UTF-8 BYOK probe is9 pass /1 standing failure /0 skip /
0 cancelled**, exit1; the C.UTF-8 version passes within bulk. Its assertion is
unchanged. [Summary](v2-7c-1-evidence/summary.json), per-gate JSON and retained
[ordered command/exit records](v2-7c-1-evidence/logs/coordinator.json) supply exact
provenance. Earlier attempts and independent reruns are reported separately.

The initial busy I/O window was used for lightweight work. CPU, memory and I/O
pressure became low before expensive validation. Node 24.16.0 and Chrome 151 run
against actual Express production server/CSP (plus a separate actual Vite dev
StrictMode case). SQLite is the default fixture backend. PostgreSQL 15.18 uses
only the owned disposable service at localhost:5544 with unique per-suite databases,
one CPU, 512MiB memory and 192MiB tmpfs. No unrelated service/database is used or
stopped. [Environment evidence](v2-7c-1-evidence/environment.json) records samples,
source and service ownership; cleanup is pending completion of independent review.

## Defects and corrections

Read-only review found candidate defects before acceptance:

- StrictMode cleanup disposed a memoized queue that replay reused. The effect
  now constructs and owns a fresh loader for each setup lifetime; actual dev
  navigation is covered.
- A settled same-document token change could leave old cards actionable.
  Periodic/focus/visibility checks and action capture invalidate the stale view;
  real cross-tab storage events and pending/settled changes are covered.
- A failed font promise was cached, and releasing that promise alone still
  reused Chrome's failed FontFace. Failed dynamic injections are released with
  sheet-identity guards; failed static rules are recreated with their original
  source/subset policy. Successful faces are retained. Actual dynamic 503→200 and
  static WOFF2+WOFF503→WOFF2 200 tests prove explicit retry without card movement.
- Cancelled font preparation could resume rendering after its await. Abort
  checks now guard each preparation boundary, with a regression proving no
  abandoned render.

No accepted-baseline regression has been established by these pre-acceptance
candidate defects. No engine, store schema, intent/compiler contract, security
policy, legacy feature removal, deployment or migration changed.

Test corrections preserve meaningful assertions: HTML serialization is compared
to the same canonical SVG parsed as HTML; pointer dispatch waits for settled hit
targets; layout coordinates are relative to the grid after deliberate scrolling;
ready assertions include revision; second-window storage tests use trusted
activation and return scalar CDP values. An invalid-ID fixture now uses an encoded
space because its former word was valid under the accepted ID grammar. A static
WOFF2-only outage correctly fell back to WOFF, so the real outage regression fails
both sources rather than expecting the successful fallback to fail.

[Preliminary attempts](v2-7c-1-evidence/attempts/README.md) retain exact pass/fail/
skip/cancelled totals, failed probes, archived drivers and classification. The
superseded 0f6276a coordinator passed focused 42, bulk 2053 and five serial files / 52
leaf tests, then stopped between files. Its remaining 19 serial files and later
groups were unexecuted; no browser file was cancelled or overlapped. The final
candidate restarts the complete inventory after both font corrections.

## Performance and visual evidence

All **39 final images** were inspected:16 cover, two hosted supplement,11 shell,
five imported and five native. [Visual review](v2-7c-1-evidence/VISUAL-REVIEW.md)
and [hash inventory](v2-7c-1-evidence/images.json) distinguish backends and exact
captures. No new control overlap, clipped dialog or unexpected canvas shift was
found. Narrow inspector overlay and toolbar/table scrolling retain existing
behavior. The completed-chat action/original link remain above the composer.
Native OOXML/raster inspection retains real chart/table values1.25 and12.5.

| Individual observation | SQLite | PostgreSQL |
|---|---:|---:|
| First visible preview after grid readiness |168ms |136ms |
| First-cover response bytes |932 |932 |
| Preview region |312.65625×175.859375px |same |
| Thirty-project maximum active reads |2 |2 |
| Thirty-project requests after top/bottom navigation |12 |12 |
| Card coordinate/size change across loading |0px |0px |

The fixed preview ratio is16:9. Real dynamic font HTTP recovery is503→200;
static font recovery is503 WOFF2 +503 WOFF→200 WOFF2. Both preserve all four
card bounds. The project has120 slides/thumbnails and opens in1559ms; the
fresh60-slide imported opening is1534ms. Shared-shell chart/table selection
coordinate changes are at most0.049691px/0.018990px; imported counterparts at
most0.102784px/0.069329px. Save transitions include dirty→saving→saved.

SQLite three-slide first import/replay takes400/396ms;60-slide handoff478ms.
The cold label means first source import in a warmed process, with legacy page
already ready. The distinct hosted PG supplement records two trusted clicks,
one import POST, human-edit preservation, authenticated CLI receipt replay and
native export. Its raw3113.268ms combines browser boot, handoff, screenshots,
return to chat and teardown; it is not pure handoff latency. Canonical server
import time is269.681ms and receipt replay92.559ms for that observation.
[Measurement provenance](v2-7c-1-evidence/measurements/index.json) identifies files
and excludes one older scratch font measurement. These are individual readings
with different boundaries, not latency percentiles or interchangeable metrics.

## Limits and review

The known [BYOK locale assertion](ROADMAP.md#byok-locale-standing-failure),
[Fit content-box defect](ROADMAP.md#workspace-followups) and
[isolated B2 restore timeout](ROADMAP.md#v2-7b-2-restore-timeout) remain separate.
Passing new restore interactions does not establish the earlier timeout's cause.
The first saved slide is the cover; there is no cover picker or unsaved-draft
preview. Oversize/unsupported content stays unavailable while Open remains usable.
Offscreen work and cache entries are bounded; a server read still uses the
canonical complete-project store primitive. Static recovery repairs same-origin
shipped rules; foreign stylesheet recovery is outside current shipped coverage.
No interactive Microsoft PowerPoint, live Auto content quality, production
hosting or deployment claim follows from this local validation.

The implementer recommends ACCEPT for f79ae07 with the documented limits.
Independent ACCEPT/HOLD must name that exact source and assess the completed packet. The
implementer does not accept this slice. Stop after review/handoff; the next
workspace candidate remains [roadmap-gated](ROADMAP.md#workspace-followups).
