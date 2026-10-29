# V2-8J-5 evaluation — validation complete, independent review pending

Accepted baseline: `665cd0459b0f267b32e808a59046e3d0b914e74f` (J4).
Frozen implementation: `f6487737557c20d481cbc3e84216d7144bb116e8`.
Human approved reviewed contract `1b37cdd674fa680ac15bb266e2e16bf4eff25f05`
on2026-10-29 (“ok continue” directly after the concrete approval question),
pinned7df22d94 before runtime. [Contract](V2-8J-5-PLAN.md),
[inventory](v2-8j-5-evidence/validation-plan.json) and
[roadmap](ROADMAP.md#assistant-citation-project-copy) define scope.
The implementer does not accept this candidate. Final independent review is pending.

## Result and implementation

Source-aware copying qualifies the source's current exact owner and catalog under
one parent lock, copies only referenced snippets and atomically creates the new
project/catalog/create-history. It rebinds project/source IDs without altering other
scene/citation data or original retrieval provenance. Each copy's retained sources
survive the original's clear/delete. Stale/missing/foreign/corrupt references refuse
as a whole. A newer saved source revision alone does not reject live unsaved scenes.
Private HTTP/CLI delegate to the same domain operation; invalid supplied credentials
cannot downgrade to anonymous access. No source bodies enter the copy response.

Existing Save-as-new controls pause future saves, await only an already-dispatched
save, pin captured credentials and guard drafts, document, revision, route and
viewport. A clean success installs returned authoritative scenes in a fresh engine
with empty session undo, using guarded router adoption or the standalone query.
Later edits/drafts/selection/navigation/account changes defer or suppress adoption;
the source's engine, undo and truthful dirty/conflict state remain. Copy failures
have no automatic retry; a lost response can leave a committed copy unknown.
Generic cited create/import and native PPTX export still refuse centrally.

The original J4 awaited-response hazard was reproduced by executing the original
handler with a delayed response:1expected failure, not a DOM/browser reproduction.
Separate source review found four candidate risks: source release before a failed
history write, same-project navigation drift, viewport drift and asynchronous
history restoration overlap. Narrow corrections through8e181735 resolve all four.
Root reproduced the router-write failure before correction; corrected small router
file11/11 passes. No runtime changed after26a1e86f; final commits only correct new
browser fixtures. No product defect was found in the final browser run.

## Executed gates

All files ran unfiltered with canonical file markers, child exits and watchdogs.

| Gate | Actual backend / evidence | Pass | Fail | Skip | Cancelled |
|---|---|---:|---:|---:|---:|
| Copy domain | [pure contract](v2-8j-5-evidence/copy-contract-final.json) |6|0|0|0|
| Copy SQLite | [actual isolated SQLite](v2-8j-5-evidence/copy-sqlite-final.json) |6|0|0|0|
| Copy PostgreSQL | [actual isolated PostgreSQL15](v2-8j-5-evidence/copy-postgres-final.json) |6|0|0|0|
| HTTP/CLI + router | [thin transport5 + affected router11](v2-8j-5-evidence/copy-transport-final.json) |16|0|0|0|
| Browser | [Chrome151, production UI/API, SQLite](v2-8j-5-evidence/copy-browser-final.json) |5|0|0|0|
| **Selected leaf total** | **No required unexecuted case** |**39**|**0**|**0**|**0**|

[Typecheck](v2-8j-5-evidence/typecheck.json) exited0 once. Typed packages, tsconfig
and typed usage fixture are byte-identical through the frozen source; legacy/app
JavaScript is outside that check. Exact original elapsed time was not captured.
[Production build](v2-8j-5-evidence/build.json) exited0 in the browser before hook;
final invocation576.69ms, Vite reports406ms. Each browser invocation built once,
serially; no separate duplicate build or overlapping Vite owner ran. The final
build stdout is retained; earlier invocation timings remain in their TAP logs.

[Manifest](v2-8j-5-evidence/source-manifest.json) and
[applicability](v2-8j-5-evidence/source-applicability.json) distinguish invocation
HEAD, captured working bytes and final source. Final browser bytes match the
frozen commit. Other final runtime/selected test inputs are unchanged; the shared
fixture gained an optional scenes argument with the same seed() default used by
HTTP/CLI. Applicability is not a claim that checks reran at a later documentation SHA.

## Attempts and corrections

[All root attempts](v2-8j-5-evidence/attempts.json), including overlap:
**114leaves =102pass/12fail/0skip/0cancelled**. Final selected totals above are separate.
Earlier83=80pass/3fail includes the two expected fail-first regressions and one
transport fixture that bound citations to the wrong project when testing404.
The fixture now binds to the absent project; the404 assertion was preserved.

Actual PostgreSQL then passed6/6. Five serial browser invocations contributed
25leaves=16pass/9fail:0/5,3/5,3/5,5/5 and final5/5. The nine failures were new-fixture
errors, not suppressed product assertions: editable-text tests initially used
accepted read-only multi-run rich text; standalone setup omitted the existing
Reopen action; table/chart group centers could hit unpainted SVG or miss a thin
fractional stroke after CDP coordinate rounding. Fixtures now use plain text,
Reopen, painted child rectangles and a selection precondition before response
release. Captures wait for finite transitions/stable bounds. All original logs
remain; no product assertion was weakened. No old browser file was repeated.

Initial exploratory pure5/5 lacked a separately captured child exit and is not
final evidence. One esbuild import setup error produced0tests; installed Vite Oxc
parsed the changed JSX without installing a dependency. These limits remain explicit.

## Frontend and visual evidence

The final five cases exercise dirty cited Save-as-new, fresh-engine undo, routed
and standalone identity/reopening, held-response later edits and selection drift,
title/table/Assistant drafts, same-project history routes, cancelled ordinary
navigation, account change suppression and pending history restoration. Real copy
responses are held after server completion; success is not mocked. All captured
browser error arrays are empty.

The implementer inspected all three final settled screenshots, indexed with hashes
in [visual review](v2-8j-5-evidence/visual-review.json): desktop copy, narrow copy
status and later-edit deferred adoption. Controls do not overlap. The status is
bounded/ellipsized with full title and live-region text; the420×840 toolbar scrolls
horizontally by existing policy and the narrow capture scrolls only that toolbar
to expose the status. No changed dialog is clipped. Sidebar transition frames from
earlier captures were overwritten; only the settled final images are certified.

Desktop viewport1360×757: canvas x256, width839.9902, height472.4913, scroll[0,0]
and selected text are preserved. Canvas y167.5625→108.1875 (**−59.375px**), consistent
with removal of the existing wrapped save-conflict banner; this is not zero visual
displacement. Topbar height remains44px. Narrow canvas x24/width419.9951 retains
existing padding and horizontal panning at100% zoom; its right gutter can extend
past the viewport. No new responsive redesign or full old-editor qualification
is claimed.

## Performance, resources and ownership

The25-source fixture uses bounded body batches[24,1]. Measured copy time is
**SQLite3.37ms / PostgreSQL8.68ms**; these are fixture observations, not hosted
latency/durability claims. Final complete browser invocation took14.436s.

Earlier global I/O PSI holds are historical, not evidence this project caused
pressure. Human direction on2026-10-29 requires leaving other work alone and
monitoring/reducing owned load. The [15s sample](v2-8j-5-evidence/resource-window.json)
measured CPU0.8%, available memory40GiB and workspace NVMe1.8%busy
(read0.23/write3.609MB/s), despite high PSI; its exact wait source is unknown.
Remaining gates ran serially with nice10/idle I/O, CPU affinity0,1 and watchdogs.
[Owned resource records](v2-8j-5-evidence/resources-summary.json) retain process
samples: final browser peak summed RSS1878MiB (shared mappings included); sampled
CPU10.35s is a lower bound, not total machine usage. No unrelated work was stopped.

A new localhost-only J5 PostgreSQL fixture used the cached15-alpine image with
0.5CPU/512MiB limits and256MiB tmpfs. [Service identity](v2-8j-5-evidence/service.json)
and idle resource observation are retained without credentials. Root test pools,
browser/API processes and SQLite temporary directories closed. PostgreSQL remains
owned only for independent challenges; catalog-before-removal cleanup is pending
reviewer release. No old I4/J2/J3/J4 service was recreated or cleanup repeated.

## Exclusions and limits

No required gate is unexecuted. Accepted J2/J3/J4 evidence is reused for unchanged
operations. No full legacy/browser/database/fault/50-cell matrix, native raster
render, live provider/API/search/local inference/GPU evaluation, production
activation or irreversible migration ran. Standing BYOK locale and earlier J1/I7
timing/I4/native/visual provenance limits remain separate and unrerun.

Retained citations stay unverified; source identity/content equality/ranges do not
establish claim support. A source clear cannot be undone through history. Ambiguous
commit/response has no exactly-once guarantee. Existing adapter lock waits gain no
new deadline, and tmpfs PG tests do not establish power-loss durability. Cited
native export remains refused. Further scope and its separate direction gate live
only in [the roadmap](ROADMAP.md#assistant-citation-native-presentation).
Stop after exact-source independent review, owned cleanup and scoped handoff/push.
