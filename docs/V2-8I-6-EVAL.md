# V2-8I-6 — authenticated finite wake evaluation

Entry HEAD be0e1afe0ce4b28daced56e3f465027234cea86c; accepted baseline
5cf5b5cff53c781291ba094163c68eb189bfbc66 ([independent I5 decision](reviews/V2-8I-5-5cf5b5c.json)).
The human chose “Explicit wake endpoint (Recommended)” on 2026-10-27, approving
[the bounded contract](V2-8I-6-PLAN.md). Source dce562834f2d4641280d8df6f61dd4872d566b87
is implemented and validated, pending separate exact-source acceptance. Branch/push
v2/origin/v2. This evaluation does not self-accept implementation.

## Implemented behavior

The new packages/agent/host-wake.ts coordinator admits at most two owners, one
job per owner, and 128 admission/cooldown records. A five-second owner cooldown,
single dirty bit, two sequential cycles and 110-second total elapsed budget bound
each explicit wake. I5 supplies completed-position continuation, canonical H/I2
work and Auto admission/settlement. Unfinished/error/ambiguous outcomes stop; hints
beyond the finite bounds require a later explicit wake. No guaranteed full drain.

src/agent/host-wake.js pins the exact trusted numeric account/email before and
after opening a private I5 policy session. It creates all job resources under
empty account/meter AsyncLocalStorage contexts. src/auth.js adds a private joined
sessions.user_id/current-user snapshot; public DTOs and existing auth functions
remain unchanged. No email remap through a later account lookup is accepted.

POST /api/v2/agent/wake is Bearer-only, current-account-only and default-disabled
behind hosted mode, existing I5 enablement and separate FORGE_AGENT_WAKE_ENABLED=1.
Its strict private prefix parser admits only bounded UTF-8 JSON, identity encoding
and exact {} without query/authority overrides. A bounded202 acknowledgement says
accepted/coalesced, not completed or guaranteed dispatch. Existing submit and
approval endpoints keep their effects. No cookie-only/ownerless/admin bypass.
No tokens, private bodies, provider data, cursors or job results enter responses.

Close stops admission and dirty follow-ups, aborts preparation and reports bounded
drain honestly. Pending admission cannot acknowledge or launch after close/expiry;
unabortable opening keeps its bounded slot until it settles. HTTP server close
notification triggers owned coordinator close; process-wide signal handling and
other jobs remain unchanged. Browser response/disconnect does not own work lifetime.
Restart requires an explicit wake and re-enters canonical ambiguity/replay fences.

## Executed focused validation

Node24.16.0, temporary SQLite/account databases and injected/loopback HTTP providers
only. Tests ran serially at nice10/ionice2:7 with60-second watchdogs. Production API
children used isolated config/DB paths, inert Auto credentials and loopback endpoints;
hosted startup source was inspected to exclude local/model probes. All owned children,
listeners and stores closed; no persistent service/container/database slot exists.

| Check | Total | Pass | Fail | Skip | Cancelled | Duration |
|---|---:|---:|---:|---:|---:|---:|
| New coordinator/context |14|14|0|0|0|371ms|
| Actual SQLite/auth integration |6|6|0|0|0|636ms|
| HTTP/production-process |6|6|0|0|0|3567ms|
| Required tests |26|26|0|0|0|4574ms|
| Directly affected governance |37|37|0|0|0|19189ms|

Typecheck exited0 in1534ms; required fixture tests plus typecheck took6108ms.
Governance is a separate37-case set (63 distinct final/affected leaves total).
[Four gate records and raw commands](v2-8i-6-evidence/summary.json) retain actual
results. No full-suite duplicate was run just to attach a commit SHA: final tests
ran on the identical working bytes committed in the frozen source, bound by
[the manifest](v2-8i-6-evidence/source-manifest.json). Only gate/schema mapping
followed the product runs; governance/typecheck followed all source changes.

An earlier13-case coordinator run passed before the new post-open enablement
recheck and its14th assertion. Those13 overlap and transfer no additional pass
credit. No failing I6 execution is hidden; all executed cases passed. The independent
plan review caught numeric-ID remapping risk before implementation and pinned the
late-admission guard. Its clarifications were committed before runtime code.

Coverage includes actual submit→wake→proposal→explicit approval→wake→reopen/history;
two-owner budgets, session/account recreation, in-flight close/cancel and human
save/clear, private parser/media/authority refusals and default-off behavior. The
production fixture proves response completion does not abort work, submit/decide
alone do not dispatch, and killing/restarting a dispatched attempt does not retry.

## Applicability, uncertainty and stop

No browser interface, renderer, schema/store/query contract or native output changed.
Old bulk/browser/build/PG/benchmark/native/raster/model/GPU sweeps are unexecuted,
not passing I6 results. PostgreSQL relies on accepted unchanged backend evidence;
no removed I4 service was recreated. Standing BYOK locale, inherited visual/native
limitations and I4 service-absence provenance stay separate. Fixture durations are
local observations, not production percentiles; shared resource pressure remains.

Limits: one shared account database, instance-local concurrency/cooldown, conservative
unknown reservations, no hard SQL deadline/atomic in-flight revocation, no immediate
abort at server.close initiation and no graceful process-wide drain claim. Logout
alone does not cancel admitted work. The wake acknowledges only a finite hint, with
no durable job status/complete owner drain promise. Explicit owner-wide scope was
agreed; a future UI must report persisted status and bounded refusals truthfully.

Separate independent exact-source review remains required. After ACCEPT/HOLD,
update accepted state/roadmap/continuity, push scoped origin/v2 changes and stop
after I6. No real model spend, production activation, always-on scheduler, automatic
submit/approval trigger, Assistant UI, migration or deployment is authorized.
