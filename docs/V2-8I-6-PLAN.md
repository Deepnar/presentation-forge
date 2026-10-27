# V2-8I-6 — authenticated finite host wake

## Authority and current state

The 2026-10-27 continuation authorizes recovering accepted state and preparing the
immediate dependency. Entry HEAD is be0e1afe0ce4b28daced56e3f465027234cea86c;
accepted source is 5cf5b5cff53c781291ba094163c68eb189bfbc66, independently accepted
in [the I5 decision](reviews/V2-8I-5-5cf5b5c.json). Branch/push: v2/origin/v2.
Runtime/test/governance bytes match that accepted source. The three unrelated
untracked paths remain untouched. There is no pending I5 validation or review.

The human explicitly chose “Explicit wake endpoint (Recommended)” on 2026-10-27,
authorizing this bounded contract. I5's Auto-only policy remains binding; no
activation, real model use or Assistant UI is authorized. Independent plan review
[814b89c](reviews/V2-8I-6-plan-814b89c.json) found two clarifications, pinned here
before runtime code: exact private bearer session/account identity and rejection
of pending admission after close/abort/deadline. It is not source acceptance.

## Recommended direction

Add an **explicit authenticated wake endpoint** and an instance-local finite
coordinator over accepted I5 pickup. A future Assistant can submit/approve using
existing routes, then request host work. Explicit describes the API boundary,
not an extra human Start button: the future Assistant can issue the wake from the
same Send/Approve interaction. No UI is implemented in this slice. Submission and
decisions remain durable operations with their existing behavior; neither silently starts a provider.
Use the same Auto-only account policy and H/I2 authority. No new runtime framework,
provider SDK, service, queue table, durable job receipt or editing engine is needed.

The alternative is automatically waking after successful submission/approval.
That changes existing endpoints' execution/spend effects and is outside this
recommended contract. It needs a revised contract if chosen. The explicit option
keeps that behavior visible and can later support a separately agreed automatic
trigger without changing canonical turns or the document.

## Concrete proposed contract

### Authenticated transport

- New POST /api/v2/agent/wake; require a valid explicit Bearer session and current
  eligible account, hosted mode, project storage enabled, existing I5 host enablement
  and a separate FORGE_AGENT_WAKE_ENABLED=1 flag. Both host paths remain default-off.
  Cookie-only/local-ownerless/API-key/admin-override authority is refused. Admins
  may wake only their own owner scope. Resolve the exact owner email and current
  numeric account ID from one private sessions.user_id→current users row snapshot,
  never a body/header override or publicUser-email→later-getUserId remap. Existing
  public user DTOs and other authentication behavior stay unchanged; no JSON-owner
  fallback. Retain the captured numeric ID through account deletion/recreation.
- Exact body {}, no query fields; application/json with UTF-8 only, identity
  Content-Encoding, fatal UTF-8 validation and a 1024-byte raw limit. Install the
  private prefix parser before the shared 8mb parser; unknown methods/suffixes and
  parsing failures stay private and sanitized too. All responses use private,
  no-store; no raw error/body/URL/credential/account/provider data is echoed.
- Return 202 with fixed {ok:true,status:'accepted'|'coalesced'} after actual host
  admission. It acknowledges a bounded wake hint, not completed work, guaranteed
  dispatch or a durable job. No owner list, cursor, private result, status token,
  request body or bearer token is returned. Bearer/request bodies are never
  retained; a continuation cursor lives only within the finite job. Use existing
  conversation reads for
  durable turn/proposal/run status. Explicit busy/cooldown/unavailable refusals
  return 503/429/503 with fixed codes and bounded Retry-After where appropriate.
- The wake authorizes scanning the authenticated owner's existing pending turns
  across that owner's projects under current I5 policy. It cannot approve a
  proposal. Existing generation/revision/expiry/lease and decision checks remain
  canonical. The user must explicitly approve before an edit can execute.

### Finite host coordinator

- Shared headless src/agent coordinator, thin Express transport. Constructor
  captures trusted services; public headless wake input is exact owner/account
  identity, not a provider/URL/key/cursor/budget override. Export close for host
  lifetime control. Existing operator pickup CLI remains the headless work entry;
  do not duplicate provider, discovery, reconciliation or scene logic.
- At most two admitting/running owners per server instance and one job per owner.
  Reserve a slot synchronously before asynchronous policy opening; same-owner
  callers awaiting that opening share its admission result, not premature success.
  No waiting
  owner queue. Reject a third active owner before opening a provider or reading
  pending work. Same-owner/same-account wake calls coalesce into one dirty bit;
  they never create another worker or extend the job's deadline. Different account
  IDs reusing the same email never join an old job.
- At most 128 bounded admission/cooldown records, excluding no identities from
  that accounting; prune expired inactive records on admission. Reject additional
  distinct owners when full. Admit no new job for an owner within five seconds of
  its last admission; active coalescing remains a constant-space operation. These
  are instance-local resource bounds, not distributed account quota guarantees.
- Before acknowledging admission, pin an I5 policy session to the exact current
  account and verify its numeric ID matches trusted authenticated identity before
  and after asynchronous policy opening. Reuse that pinned session for the job;
  its canonical eligibility checks run again before dispatch. Opening admission is
  inside the job deadline: reject it after close/abort/expiry, even if a pending
  open resolves later, before returning202 or launching pickup. Late opening must
  not reacquire a released slot or perform work. Underlying unabortable opening
  retains its bounded slot until it settles, even after admission is refused; this
  prevents accumulating abandoned opens. Do not retain a
  session token or use ambient currentAccount()/meter as worker authority. If
  account identity changes before admission or later dispatch, refuse/stop.
- One job has a monotonic total elapsed budget of 110000ms, at most two sequential
  I5 pickup cycles, 50 scanned rows and five work items per cycle. Pass only the
  remaining elapsed budget to I5; never begin a cycle with less than its 1000ms
  minimum. No per-turn expiry extension and no request-controlled limits.
- Start from null cursor for each admitted job. A scan/work-limit result may make
  one bounded continuation from its completed-position cursor. A coalesced dirty
  hint may instead use the one remaining cycle from null, so newly inserted earlier
  positions can be reconsidered. The two-cycle/elapsed cap always wins; hints left
  beyond those bounds stay durable for a later explicit wake. The acknowledgement
  never promises a complete owner-wide drain or starvation-free processing.
- Stop after an unfinished, cancelled, failed, busy, lost-lease, rate-limited,
  ambiguous or infrastructure outcome. No provider retry or unbounded self-reschedule.
  Approved execution still needs no provider/secret lookup. An already-entered
  canonical commit can finish; returned final state determines cursor completion.
- Own AbortControllers and completion promises independently of request/response
  objects, browser/SSE disconnect and the request's async account/meter context.
  Catch all task rejections, release slots in finally and retain no private bodies
  or worker result histories. Completion clears job/controller/promise references,
  leaving only the bounded cooldown record. No automatic work on import, startup, timers between
  wakes, user enumeration, cron or always-running daemon.

### Lifecycle and recovery

Close stops new admission, clears dirty follow-ups and aborts active preparation.
Offer a bounded five-second drain observation with an honest drained:false result
if entered storage work has not settled; do not claim a hard SQL deadline or force
close unrelated requests/databases. Wire the owned coordinator to the HTTP server's
close notification, which may follow unrelated request draining, without redesigning
global process signal handling or other jobs. Explicit domain close is available
before that notification; server.close initiation is not an immediate-abort promise.
A default process SIGTERM/crash retains existing process behavior and H's durable
attempt/lease/everDispatched fences. There is no claim of graceful process-wide
drain. Restart does not enumerate or automatically resume work: the next explicit
wake re-enters I4/H/I2 from null. A dispatched ambiguous attempt cannot be retried
for free. Logout does not cancel already-admitted durable work; canonical cancel/
clear and account eligibility remain the established fences. This contract claims
neither atomic in-flight account revocation nor a new session-retention policy.

## Source seams and look-ahead

app/server/v2-conversation-routes.js already separates authenticated durable turns
from provider work and installs private parsers before the generic parser in
app/server/index.js. The new private prefix must do the same without changing
accepted submit/decision behavior. resolveProjectOwner permits local ownerless and
admin project behavior, so it must not silently supply stronger wake authority.
Use the existing explicit Bearer auth/verification primitives and current account
row. src/account.js and src/usage.js use private AsyncLocalStorage instances:
add narrowly scoped context-exit helpers if needed, and exercise those helpers in
the new coordinator tests. runAsAccount(null) currently does not clear an inherited
context. Detached work must use deliberately empty account/meter contexts rather
than inheriting request authority or metering; do not replace global context behavior.

src/agent/auto-host-policy.js supplies private account-pinned sessions and atomic
reservation/settlement; src/agent/host-pickup.js composes I4/H/I2. Keep those seams
as authority. Inspecting a hint or receiving a wake grants no scene authority.
The server currently has no general graceful-shutdown coordinator; keep its other
jobs/signals unchanged. Existing storage/run durability handles abrupt stop.

The later visible Assistant needs draft/save settlement, explicit submit/wake/
decision/cancel UX, polling/reopen, focus/navigation and truthful partial status.
It must tolerate refused wakes, process restart and another tab/host doing work.
This finite wake is not an always-on scheduler or complete owner-wide draining
promise. Multi-instance limits, search tools, semantic creation and real-model
qualification retain their separate roadmap contracts. No accepted layer needs a
second queue, document, serialized approval capability or model layout vocabulary.

## Approved focused implementation gates

Four proposed required gates:

| Gate | Smallest relevant execution |
|---|---|
| New coordinator unit file | Exact immutable owner/account binding; global/owner/record/cooldown caps; coalescing, finite continuation, deadline, partial outcomes, private errors, no dangling task/handler and close behavior |
| New actual SQLite integration file | Real I5/H/I2 submit/wake/propose/approve/wake/reopen; two-owner/account isolation, recreation/revocation before dispatch, account reservation/replay, clear/cancel/save races and restart ambiguity |
| New HTTP/process file | Actual production registration plus isolated authenticated loopback flow; private strict parser/media/raw-byte/authority refusals, default-off, capacity/cooldown, disconnect independence, existing submit/decide no dispatch, process interruption/reopen and bounded sanitized acknowledgement |
| Typecheck | Changed TypeScript/package boundaries |

Use temporary SQLite/account stores and loopback/injected providers only. Pin all
provider/configuration endpoints and secrets to inert fixtures; inspect startup
calls before executing the production API fixture. No live API, local inference,
GPU, deployment/config activation, existing database or removed I4 service. Tiny
headless runs use fresh resource observations, serial nice/ionice and watchdogs.
No new store/query/schema contract is proposed: PostgreSQL is unexecuted and relies
on accepted unchanged backend evidence, never relabeled green.

New gate mapping/schema changes also need their directly affected lightweight
governance checks. No full legacy matrix, browser/Vite/build, 50-cell benchmark,
native generation/rasterization or old artifact hash sweep. No visible interface
or renderer changes, so accessibility/responsive/export gates are inapplicable;
actual durable edit/history preservation is checked at the new integration entry.
Record exact final leaf pass/fail/skip/cancel totals, attempted failures, source SHA,
backend, durations, inspected versus executed evidence and exclusions. Do not
invent planned test counts. Independent review chooses small new challenge checks
and inspects the retained evidence rather than repeating successful suites.

## Acceptance and stop

Acceptance requires the agreed explicit wake semantics, owner/account-only authority,
no dispatch without I5 admission, no approval bypass, finite lifecycle/resource
bounds, browser-independent completion, truthful private acknowledgements and
canonical durable cancellation/recovery/history. Preserve standing BYOK locale,
I4 operational provenance and accepted visual/native/live-provider limits.

After implementation and focused validation, require separate exact-source
ACCEPT/HOLD, update architecture/state/evaluation/roadmap/continuity, commit focused
changes to origin/v2 and stop after I6. No Assistant UI, automatic submit/approval
trigger, always-on scheduler, production activation, real model spend, migration or
paid infrastructure follows. Plan review performed zero tests. Runtime validation follows only this approved
new-behavior inventory, not a historical sweep.
