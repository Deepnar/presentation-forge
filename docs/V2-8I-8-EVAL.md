# V2-8I-8 — existing-deck browser Assistant evaluation

Frozen source **b9c2d2075da21608a92a458c1395ede0bbe67297**, branch v2; accepted
baseline **3da0801f64e88f7911f655cee288bb9b750c7c3d**, entry3b35c39. Human selected
**Existing Assistant tab (Recommended)** on2026-10-27. The [approved contract](V2-8I-8-PLAN.md)
and [separate plan review](reviews/V2-8I-8-plan-d5f789a.json) were pinned at4ef8491
before runtime code. Separate [independent ACCEPT](reviews/V2-8I-8-b9c2d20.json) reviewed exact source
and packet841176d. The reviewer found no remaining blocker; the implementer records
that decision, with no self-acceptance. Later commits are documentation/evidence only.

## Result and boundaries

The existing project-editor Assistant tab supports freeform requests scoped to
current saved slide or selected objects, stored visible chat and semantic text/
chart/table proposals with explicit Approve/Reject. It uses accepted H submission,
approval/cancellation/history and I7 exact-target wake. Selected objects limit
edits; disclosed semantic reads may include the current saved slide. Saved chat
is reference material, not automatic provider memory. No model-authored layout,
second scene, client edit replay, schema/query or canonical worker change.

Owner-bound availability is a private Bearer GET and shared headless helper/CLI;
it performs no provider/configuration/secret lookup or work. Execution remains
disabled by default. Send/Approve settle inline edits and current saves under a
captured credential/document/project, then capture saved revisions. Grid/title
drafts block; mounted Inspector panels preserve Apply-only drafts across tabs.
Old proposals cannot approve against a newer human save. A final synchronous guard
after async preparation prevents authoritative loading over later local changes.
Blocked/failed loading retains explicit recovery. Loading clears session undo,
with Version history restoration disclosed before approval and after loading.
Composer navigation, auth expiry, finite polling/backoff, pending-wake Cancel and
narrow modal focus reuse the approved boundaries. Architecture describes as built.

## Executed checks

Node24.16.0; actual temporary SQLite project/account stores and isolated production
Express processes, injected/loopback provider only. Chrome uses the production Vite
bundle and --disable-gpu. No real API/local-model/GPU evaluation, activation,
deployment, migration or persistent validation service. The unrelated local API
PID1723 and other projects' processes/databases were left untouched.

| Selected gate | Pass | Fail | Skip | Cancelled | Timing |
|---|---:|---:|---:|---:|---|
| Framework-free client |14|0|0|0|620ms process|
| Availability / SQLite / HTTP / CLI |5|0|0|0|2369ms process|
| Seven distinct Chrome scenarios |7|0|0|0|38451ms selected leaf durations|
| Typecheck |exit0|—|—|—|1467ms process|
| Four new/adjacent governance contracts |4|0|0|0|667ms process|

**26 distinct selected product leaves pass**, with **4 governance leaves separately**.
Chrome coverage is an explicit **selected-case composite**, not an all-green
whole-file invocation: first5 successes from full attempt2, corrected narrow dark
from targeted attempt1, corrected save/stale case from targeted attempt2.
[Collector](v2-8i-8-evidence/collect-evidence.py), [selection digest](v2-8i-8-evidence/assistant-browser-selected.tap)
and [constituent records](v2-8i-8-evidence/assistant-browser.json) expose each actual
process exit and selected leaf. Failed full/targeted attempts remain retained.
No successful scenario was replayed solely to obtain a green whole-file report.

[Source manifest](v2-8i-8-evidence/source-manifest.json) verifies relevant invocation
bytes against frozen source. First5 Chrome case bodies and other web paths match;
subsequent controller changes only retain recovery on failed loading and clear its
resolved error, with independent focused coverage. Shared capture adds metadata;
corrected dark/save cases have later actual execution. Client/integration/governance
relevant hashes match exactly; no TypeScript/package/config changed after retained
typecheck. Package typecheck does not check JSX; production builds/browser cover it.
All4 serial production builds exited0 (745/686/626/467ms); final467ms build used
c6abdb2. The subsequent source delta only wires availability/export read aborts,
covered by focused controller checks; success rendering is unchanged. Timings measure fixtures/builds, not live model latency or
large-deck performance. Raw commands, watchdog status, hashes and backend are in
[v2-8i-8-evidence](v2-8i-8-evidence/validation-plan.json).

Browser cases exercise natural message → real H proposal → approval → canonical
text/chart/table scene/history → guarded loading → History restore → reopen;
selection/rejection; export; confirmed clear and a second-client clear/submit
race; actual in-flight cancellation; default-off/read-only, account replacement
private clearing and unsent navigation Cancel; title/grid barriers and retained
grid values; Enter/IME, topmost Escape/focus return and narrow rail; actual pending
inline-text save held before submission, then human save refusing stale approval.
A rich-run fixture is intentionally not flattened by inline editing. Canonical
stored scenes/history, one submitted turn, unchanged stale proposal and scoped
provider reads are checked. Source review covers async attachment/save guards;
this is not an exhaustive race/transition sweep of unchanged editor behavior.

## Failures and scoped corrections

Every retained root attempt has0skip/0cancelled and a recorded process exit:

| Earlier attempt | Pass | Fail | Classification / correction |
|---|---:|---:|---|
| Client1 |11|1|Fake timer failed to remove fired callback; harness corrected.|
| Integration1 |3|2|New availability helper treated getProject's doc:null as success; product owner-bound refusal fixed.|
| Chrome full1 |4|2|Empty SVG group hit point and missing CDP char event; harness now selects via Layers and sends text for Enter.|
| Governance1 |3|1|New gate names omitted from schema enum; inventory wiring corrected.|
| Chrome full2 |6|1|Added inline test used protected two-run fixture; plain editable text created through real UI instead.|
| Chrome targeted1 |1|1|Counter replaced global fetch after client captured it; canonical zero/one turn assertions now observe actual submission.|

Successful client2/3/4/5/6 are12/14/14/14/14; integration2 is5; governance2 is4;
last targeted Chrome2 is1. Across **all root leaf executions**, including repeats
and failed attempts: **114 total =106pass/8fail/0skip/0cancelled**. The selected30
(product26 plus governance4) are a coverage set, not114 new scenarios. Earlier
successes repeated for concrete changed controller branches remain explicit.

Independent fail-first2cases had1pass/1fail: a completed run observed during grid/
title blocking was marked observed without exposing Load saved changes. The narrow
product correction retains pendingSaved through loading failures; successful
explicit loading also clears the stale error. Final cleanup review also wired
availability/export reads to owned AbortControllers for dispose/auth expiry,
without changing successful browser flows. Auth/foreign expiry still clears
private recovery state. Independent final3/3 (254ms) passes with exact frozen
hashes; the intermediate2/2 (85ms), loading-error2/2 (103ms), and original failing source/log remain distinct
in [independent evidence](v2-8i-8-evidence/independent/review.md). The separate reviewer accepted the exact source with these retained limits; its
decision supplies acceptance rather than the implementer's recommendation.

No accepted H/I2/I5/I7 engine, persistence, compiler or renderer was weakened.
Proposal formatting was refined from raw JSON/opaque identities to labeled text
and data tables after visual inspection. The old7A placeholder assertion now
expects the real default-off composer; the old full file was not rerun, and the
new focused browser case checks the same current behavior. An unavailable optional
Babel parser was replaced by installed TypeScript JSX transpilation for syntax
inspection; no dependency installed and no product test pass claimed for that probe.
The collector's initial parsing error was fixed before successful collection;
it did not execute product tests or change their raw results.

## Visual and resource evidence

Inspected final desktop proposal/applied light, grid draft, clear confirmation,
disabled/read-only, narrow dark and stale-proposal desktop dark screenshots.
[Visual index](v2-8i-8-evidence/visual-inspection.json) records actual dimensions,
hashes and observations. Controls/dialog fit without UI overlaps. Timeline
content scrolls inside its fixed area; bottom portions outside its viewport are
intentional scroll content. Stale fixture text inserted by the human intentionally
overlays underlying chart/table; this is not a shifted canvas. Desktop message/
proposal rectangle delta **0.003815px**, narrow typing delta **0px**. Tab/grid views
were visually inspected; no exhaustive new geometry matrix was run.

Browser/build ran only after two fresh consecutive15s CPU/memory/backing-storage
headroom samples, at nice10/idle I/O with finite process-group watchdogs. Busy
observations held Chrome while lightweight docs/checks proceeded. Sustained bounds
and all retained samples are in browser-admission-attempt-*.json. Global I/O PSI
remains elevated with unresolved provenance; it is reported, not called quiet or
attributed to graphics. Admission uses measured CPU/memory/backing-storage limits.
[Provenance notes](v2-8i-8-evidence/provenance.json) preserve two limits: first
admission raw data was overwritten before unique names were introduced; only its
reported headroom summary survives. A later fresh admission initially occupied
attempt1 filename and is now correctly named chronological attempt3. The initial
narrow image labeled dark was actually light and was overwritten by corrected
capture; no dark credit for it. Current truthful dark has data-theme=dark and
computed panel rgb(20,21,25). Initial attempt1 images and all current images before
last rerun are preserved; unavailable originals are not reconstructed.

## Exclusions, review and stop

Old bulk/browser/database/fault/native/render/50-cell benchmark suites and large-
deck performance are **unexecuted this slice**. PostgreSQL suites are unexecuted,
not green; no PG schema/query changed.34 unchanged governance bodies and the full
old7A file are unexecuted. Accepted unchanged evidence is reused, never relabeled
current execution. No live Auto quality/budget/latency, provider routing/search-
tool integration, full creation/research or interactive PowerPoint qualification.
Standing BYOK locale remains separate; inherited I7 initial SQLite timing and I4
unavailable pre-removal count/cause remain unresolved. No old helper/service was
recreated. Source permits default-off existing-deck chat editing; enabling hosted
execution remains a separate operational decision in the roadmap.

Independent acceptance is complete in the linked exact-source decision, with no
waivers or blocking findings. All3 new independent challenges pass; the audit
verified11 gate hash claims,16 changed source/test/governance paths,7 selected
pass lines/unchanged first5 bodies and7 image hashes. Old/PG/live exclusions,
all failures and unavailable-original limits are explicitly accepted as bounded
scope, not converted into current passes. Cleanup evidence records the preserved
pre-existing API and no persistent validation service acquired. Stop after the
scoped origin/v2 documentation/evidence closeout; no dependent feature is authorized.

Runtime changed files: availability helper/CLI and thin server registration/routes;
client/controller/AssistantPanel and SceneViewer; focused tests, old placeholder
expectation, CDP key helper and governance mapping/schema. Documentation/evidence
records independent acceptance separately. Original three untracked paths remain.
