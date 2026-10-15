# Independent V2-7A final review — ACCEPT

Decision: **ACCEPT** implementation `fe749fb41e744961df156e8b9dcf80f0155b4e0b`
against accepted baseline `97a12de92e1b691a8ebab26f524ddc0afd9bf111`.
Reviewed pushed evidence commit: `1888c6b6782e29c052a390432fb2822421811d74`.
Reviewer: `V2-7A final acceptance reviewer`; independent context:
`/root/v27a_final_acceptance`, separate from implementing context `/root`.
Date: 2026-10-15. No delegation, application changes, state promotion or commits
were performed by this reviewer.

## Basis and scope

Verified branch `v2`, HEAD and local `origin/v2` both at the evidence SHA above.
Verified subsequent commits from the reviewed implementation change only
documentation/evidence; inspected the baseline-to-implementation source diff.
No changes occur in packages, compiler, engine, command adapter, schema, native
renderer, themes, stores or server transport. The frontend calls the canonical
project API and engine rather than introducing a second scene authority.

Read the contributor agreement, development protocol/reviewer instructions,
continuation/handoff, blockers/traps, product vision, common acceptance criteria,
state, relevant roadmap/architecture records, previous HOLD, final evaluation,
runbook, evidence records and relevant retained logs. Inspected routing, workspace
creation/actions, shared project client/downloads, SceneViewer lifecycle,
dirty/save/discard paths, regression corrections and continuity validation.

The earlier HOLD findings have specific corrections and exercised regressions:
central link/hash/history guarding; authoritative dirty detection including Done;
awaited and drained saves; cancelled target identity; discard suppression and
failed-reload rollback; font-ready binding; bearer downloads; hosted error
metadata; narrow controls; monotonic undo expectations; complete evidence scope.
No new blocking finding was identified.

## Independently executed

All commands used Node `v24.16.0`. The machine had low load and approximately
33GiB available memory; high system I/O PSI was noted. Checks ran with low
priority and bounded processes. No unrelated processes or databases were used.
No browser/build owner overlapped another.

- `timeout --signal=TERM --kill-after=10s 2m nice -n 10 ionice -c 3 node --test --test-concurrency=1 test/dev-protocol.test.js test/v2-route-guard-7a.test.js test/v2-project-client-errors-7a.test.js test/v2-create-7a.test.js test/v2-projects-6c-postgres.test.js`: **53 pass, 0 fail/skip/cancelled**, exit 0. Breakdown: governance18, routing7, client7, creation4, real PostgreSQL17. PostgreSQL used the authorized disposable service on5544. A nonfatal existing MaxListenersExceededWarning was observed in contract execution.
- Full 7A browser suite: **28 pass, 0 fail/skip/cancelled**, exit0,120724.85ms. Executed with `timeout --signal=TERM --kill-after=10s 10m nice -n 10 ionice -c 3 node --test --test-concurrency=1 out/reviewer-v27a.test.mjs`. This ignored copy of `test/v2-edit-chrome-7a.test.js` differs **only** in the `OUT` artifact destination (`out/reviewer-v27a-artifacts`); source imports, setup, browser behavior and every assertion are unchanged. This preserved committed evidence. It includes its own successful Vite production build. Raw independent browser output remains in ignored `out/reviewer-v27a-browser.tap`; it supplements, rather than replaces, the committed final28-case log.
- `npm run typecheck`: exit0.
- `node tools/v2-benchmark.mjs --out out/reviewer-v27a-benchmark --raster none`, low priority with2m watchdog: exit0; **50cells,0L1,0L2,0fit,0missing,0takeaway,0chart-data findings**, all5 theme-invariance records agree;512ms.
- `npm run dev:protocol`: **0errors,0warnings**, exit0.
- `git diff --check`: exit0.
- Independent manifest audit: **192actual test files,192manifest entries,192unique**, no omissions/extras; image hashes matched all15 committed manifest records.
- Separate unchanged `LC_ALL=en_IN.UTF-8 node --test test/byok-budget.test.js`, low priority with2m watchdog: **9pass,1fail,0skip/cancelled**, exit1. The documented grouping assertion expects `5,000,000`, receives `50,00,000`. Neither this test nor `src/byok-budget.js` differs from the accepted baseline.

Independent primary regression execution therefore totals **81pass,0fail,
0skip/cancelled**. Including the separately classified locale probe gives
**90pass,1standing failure** across91cases; these are not added to the
implementer's unique inventory. Build/typecheck/benchmark/validator are command
gates, not extra tests.

Independent browser measurements:120slides and120thumbs opened in1544ms;
chart selection delta `[0,-0.0292435,0,0]`, table delta
`[0,-0.0191116,0,0.0000305]` pixels. Both satisfy the retained1px threshold.

## Inspected evidence, not independently rerun

The retained final inventory contains1936 bulk +155 serial +17PG contract
+19cross-process/fault = **2127pass,0fail/skip/cancelled** across192files.
The28-case7A row is already included in serial155. Reviewed the scope/totals
against the manifest and protocol validator; the supplemental hosted form
login→ownedPGproject→edit/save→bearer export→reopen is an additional1pass.

Opened **all15 committed PNGs**, including actual saved-project chart/table
export rasters, and separately opened fresh independent narrow/chart/table
captures. Inspected export OOXML findings, canvas/large-deck measurements,
hosted-auth evidence and the complete attempt/standing-failure accounting.
The shell, editable native chart/table labels, history confirmation and narrow
projects dialog were readable. No new overlapping controls or export clipping
was found. Table-inspector horizontal scrolling and narrow overlay coverage are
intentional, with reachability exercised in the browser suite.

The bulk1936, remaining20 serial files, cross-process/fault19 and supplemental
real hosted-login case were **inspected, not rerun by this reviewer**. RealPG17
and full7A28 were rerun. Export rasters were inspected rather than rerasterized.
No required retained gate remains unexecuted; this statement is about the
complete evidence package, not a claim that the reviewer reran all2127 cases.

## Residuals and decision limits

- The BYOK en-IN assertion is explicitly retained as an unchanged standing
  failure; it is accepted as nonblocking for this bounded slice. The required
  full inventory passed in its recorded C.UTF-8/en-US environment. No failed
  required check is relabeled passed or waived; this supplemental locale probe
  stays failed and separately recorded.
- Existing Fit content-box accounting initially leaves approximately24px of
  the canvas offscreen (720px scroller,768px scroll width). The same padding and
  refit inputs exist at97a12de. Its roadmap issue remains separate; acceptance
  does not claim the viewer has no clipping at every zoom/viewport.
- Actual narrow capture is500×757, not480×900. The500px inspector and dialog
  interactions passed; no exact480px claim is accepted.
- LibreOffice rasters establish rendered output there; Microsoft PowerPoint
  interactive behavior was not executed. Raster-none benchmark does not establish
  visual quality for every cell. Exhaustive modal Tab containment, all contrast
  combinations and all reduced-motion paths were not independently audited.
- Minor nonblocking documentation cleanup was sent to the implementing context:
  the legacy “The web shell” paragraph in ARCHITECTURE still described a sole
  hashchange consumer and logout route preservation after the new as-built V2
  section. Update it during acceptance closeout to match the guarded router.

The bounded workspace/continuity implementation is accepted at the exact SHA
named above. The implementing context may transcribe this sourced decision into
state, roadmap and handoff and commit the decision records. This decision permits
next-slice planning only; it does not authorize V2-7B implementation, deployment,
infrastructure purchases or migrations.
