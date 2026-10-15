# Handoff — V2-7A accepted; V2-7B-1 in progress

Read AGENTS.md, CONTINUATION.md and development-state.json, then the protocol,
active roadmap entry and V2-7A-EVAL.md. Development now works directly from the
repository; no relay, provider restriction or prior chat is required.

2026-10-15 continuation: the human approved the bounded V2-7B-1 contract and
separate high-effort review. Implementation is in progress; V2-7B-2 remains
unauthorized. The active scope is [the roadmap contract](ROADMAP.md#v2-7b-candidate)
and `V2-7B-1-EVAL.md`; the state file now indexes new pending checks without
relabeling the accepted V2-7A evidence. A retained accepted-state snapshot keeps
the earlier gate inventory independently reproducible.

Branch: `v2`. Accepted implementation/baseline:
`fe749fb41e744961df156e8b9dcf80f0155b4e0b`, accepted against task-entry baseline
`97a12de92e1b691a8ebab26f524ddc0afd9bf111`. Subsequent commits contain documentation
and evidence only. Use git log for final HEAD. The separate decision is
[reviews/V2-7A-fe749fb.json](reviews/V2-7A-fe749fb.json), with its report alongside.
It reviewed pushed evidence `1888c6b`; acceptance was not supplied by the implementer.

Final disjoint 192-file inventory: **2127 pass, 0 fail, 0 skip, 0 cancelled**.
Bulk 1936; serial 155 (includes full 28-case 7A and 3 PG browser); PostgreSQL
contract 17; cross-process/fault 19. Supplemental actual hosted login → owned
PostgreSQL project → edit/save → bearer export → reopen: **1/1**. Total distinct
final cases including it: **2128 passing**. Build, typecheck and all 50 benchmark
cells pass, with zero L1/L2, fit/representation/takeaway/chart-data findings.
All 15 images and two actual native-export rasters were inspected. A 120-slide /
120-thumb opening took 1542ms; selection left x/width unchanged and y within 0.1px.

The final independent reviewer ran **81 primary cases**, typecheck, browser-setup
production build, protocol validator and 50-cell benchmark; all passed. It opened
all 15 retained images and fresh independent captures. Its unchanged en-IN locale
probe reproduced **9 pass / 1 known BYOK failure**. Independent checks repeat
coverage and are not added to unique totals. Independent Chrome/benchmark raw
results and output-redirection proof are retained under evidence/logs/independent.

Known limits remain explicit: the BYOK grouping assertion differs by locale;
pre-existing Fit padding initially leaves about 24px offscreen; actual narrow
viewport was 500×757 rather than 480×900; LibreOffice rasters do not establish
interactive Microsoft PowerPoint behavior, and accessibility was not exhaustive.
These limits were accepted as nonblocking for this bounded slice and remain in
the roadmap/evaluation. No new failing regression remains in executed scope.

Narrow fixes address route/save/discard races, authoritative dirty ownership
through Done/unbound mode, failed-load recovery, font-ready binding, hosted
metadata/downloads, narrow controls and scoped test/evidence correctness.
Engine, compiler, schema, renderer, themes and stores remain unchanged. Architecture,
roadmap, traps and continuity records reflect the shipped behavior. The validator
checks retained evidence consistency and separate decision metadata; it never
accepts implementation by itself. The earlier cold-start documentation audit
and historical HOLD are preserved separately.

The owned disposable PostgreSQL service `forge_v27a_validation_pg` was stopped
and automatically removed after review. Test databases were dropped; historical
6A/B/C test-output rewrites were preserved under ignored out/ and restored to
avoid replacing accepted evidence. No unrelated process/database was touched.
Pre-existing untracked `.agents/` and both `PRESENTATION_FORGE_*` documents remain
untouched; do not stage/remove them. Push destination remains origin/v2.

The planning audit corrected the claim that no translator exists: the partial
legacy-to-intent converter covers six original families plus aliases, not all
74 schema type names or all fields. No conversion-to-project service or UI
handoff exists. Architecture wording and the protocol's historical-baseline
wording now reflect that source-backed state. No application, tests or state
schema changed. Lightweight recovery checks: 7 tests passed, 0 failed, skipped
or cancelled (`node --test test/v2-legacy.test.js test/v2-create-7a.test.js`);
`npm run dev:protocol` reported 0 errors/warnings. These checks do not establish
the proposed feature. The accepted full validation matrix was not rerun because
its source is unchanged.

V2-7B-1 is approved and in progress; its validation and independent acceptance
remain pending. No browser handoff or other feature is authorized. Continue the
approved roadmap contract, preserve current implementation changes, and obtain
an independent exact-SHA review after validation. The preflight reviewer found
no reason to change the approved scope; it identified lossless field auditing,
source readiness, immutable retry identity and exact owner checks as key seams.
User preference: avoid routine subagents; required separate review uses high
effort, never xhigh. The separate reviewer is read-only during implementation.
