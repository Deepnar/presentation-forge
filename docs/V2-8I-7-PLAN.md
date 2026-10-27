# V2-8I-7 — exact-turn wake before the browser Assistant

## Authority and entry

The 2026-10-27 continuation authorizes preparing the immediate dependency after
accepted I6. Entry HEAD33e45b7f252bd33970ad535e371b75602d245b9d; accepted source
dce562834f2d4641280d8df6f61dd4872d566b87 is independently accepted in
[the I6 decision](reviews/V2-8I-6-dce5628.json). Branch/push v2/origin/v2.
At planning entry, runtime/test/governance delta from accepted source was empty; original three
untracked paths remain untouched. I6 has no pending validation/review blocker.
Its roadmap checkbox was stale despite the exact-source decision; this planning
also corrects that documentation inconsistency, without rerunning product tests.

The human selected **Exact project and turn (Recommended)** on2026-10-27.
Implementation and focused offline validation of this contract are authorized;
production activation, live/local model calls and the Assistant UI are excluded.
The separate [plan review](reviews/V2-8I-7-plan-b026dd8.json) found the existing
seams suitable and required the admission/coalescing distinction below, pinned
before runtime code. It is plan readiness, not implementation acceptance.

## Recommended direction and concrete result

Add **exact-turn wake** for a known project/generation/turn, sharing I6's finite
host capacity and I5's pinned Auto policy. The future Assistant can submit/approve
and wake that specific turn from the same interaction, with no extra user button.
It does not need to scan earlier projects or historical approved hints. Retain
I6's owner-wide endpoint and finite-hint semantics unchanged.

The alternative is a resumable owner-wide progress/fairness contract. That adds
cursor lifetime, insertion/wrap/restart and cross-project scheduling policy, while
the editor already knows its exact target. Choose it only with a revised concrete
contract; do not silently widen this targeted proposal into a persistent scheduler.

## Approved bounded implementation

1. **Project-scoped transport.** Add POST
   /api/v2/projects/:id/conversation/wake with exact JSON {generation,turnId},
   a2048-byte raw UTF-8 limit, identity encoding, no query or extra authority fields.
   Project ID comes from the validated path, owner/current numeric ID from the
   accepted private Bearer-session snapshot. Require current eligibility, projects
   enabled and the same existing host/wake flags. Default remains disabled. No
   cookie-only/ownerless/admin bypass, URL/key/provider/budget/worker/run/approval
   override. The body provides lookup identity, never scene or approval authority.
2. **Thin private routing.** Register this exact parser before I1's conversation
   parser and generic8mb parser; register the route before the existing conversation
   fallback. Reuse fixed private no-store responses and strict media/raw-byte policy.
   Unknown suffixes, malformed paths/parser failures stay sanitized through the
   existing private conversation boundary. Preserve all old routes and body limits.
3. **One shared admission boundary.** Extend I6's headless coordinator with an
   optional immutable target {projectId,generation,turnId}. Snapshot exact fields
   before awaits. Owner-wide and targeted jobs share two admitting/running owners,
   one job per owner,128bounded cooldown records, five-second admission cooldown,
  110-second total elapsed bound, close/drain and deliberately empty account/meter
   contexts. There is no second singleton, queue, quota or bypass through the new
   route. New target values are bounded opaque IDs, not serialized capabilities.
4. **Coalescing without dropped targets.** Only same owner/numeric account and
   identical mode/target may coalesce. A distinct target, or owner-wide versus
   targeted request while that owner is active, receives truthful503busy with a
   bounded retry hint; it cannot replace the active target or dirty bit. At most
   one same-target dirty bit and one remaining follow-up are retained. No waiting
   target list or hidden accepted-then-dropped work. Existing owner-wide calls still
   coalesce with identical owner-wide calls as before.
5. **Admission and target authority.** Pin I5's private policy session to the exact
   authenticated numeric/email identity before/after asynchronous opening. Reserve shared capacity and start the deadline before opening. Inspect
   the target through H under exact owner/project/generation/turn before first accepted202, with no
   provider/secret lookup or dispatch. Foreign/missing targets use the same404;
   stale generations use409. Canonical safe pre-dispatch reconciliation is allowed;
   ambiguous dispatched work remains fenced. Identical callers joining pending
   admission share its eventual success/refusal. Once admitted, coalesced202
   acknowledges the prior bounded hint, with no fresh existence/generation/state
   validity promise at delivery. No per-coalesced H read runs outside the slot;
   every actual work/follow-up re-inspects and reauthorizes canonical H/I2.
   Late opening/inspection after abort,
   close/elapsed/disablement never acknowledges or launches new work; unabortable
   opening retains its bounded slot until settlement, as accepted in I6.
6. **Direct canonical work.** After admission, re-inspect the exact target and use
   I2 work. Resolve the pinned I5 provider only when current canonical state is
   submitted; approved execution and terminal observation need no secret/config.
   Reauthorize before work/dispatch. Canonical turn/run identity, lease, stale scene
   revision, explicit approval, cancellation, history and expiry remain unchanged.
   Every provider exchange uses I5 account admission/atomic settlement. No model
   layout, new queue, second document, scene mutation or automatic approval path.
7. **Finite invocation.** Targeted mode performs one I2 work call, with at most one
   bounded same-target dirty follow-up after a definitive completed/observed result.
   Unfinished/busy/lost-lease/ambiguous/step-limit/error/cancelled outcomes stop rather
   than self retry. Each I2 call retains its eight-advance cap; current visible-turn
   proposals contain one batch. Use fresh internal worker identity and the remaining
   total deadline. No I4 owner-wide discovery is called for targeted work. This
   establishes exact-target reach independent of historical-prefix length, not
   guaranteed completion, provider availability, scheduling fairness or atomic
   response delivery. A202 acknowledgement remains only accepted/coalesced.
8. **Headless/operator parity.** Expose the same pinned Auto-target adapter to the
   operator action agent-chat work-auto --owner OWNER --project ID --input FILE.
   Input is exact {generation,turnId}, strict bounded UTF-8; forbid --provider and
   supplied worker/run/budget fields. Resolve current numeric owner from trusted
   account state and pin it through opening. Run one finite I2 work invocation,
   with110second cancellation and existing signal cleanup, metadata-only output
   and truthful workExitCode. A CLI invocation does not create an HTTP wake receipt
   or claim distributed host concurrency; the existing shared account admission and
   canonical leases remain authority. Existing work/pickup actions stay compatible.
9. **Recovery and compatibility.** Browser disconnection does not own work. Clear,
   cancel, human save, project deletion/ownership changes and account recreation
   retain canonical fences before target work/commit. Restart requires another
   explicit target; no target queue is persisted. Existing admitted acknowledgement
   delivery races, entered-commit behavior, close notification delay and no hard SQL
   deadline/global graceful signal claim remain. No production activation or model
   calls, new paid infrastructure or deployment is authorized by this contract.

The shared Auto-target adapter owns only trusted binding and inspect/provider/work
composition; H/I2 remains authority. Avoid refactoring accepted preparation/run
engines or changing discovery SQL just to remove history prefixes. Reject any
implementation that scans unrelated owner history on the targeted path, admits
unhandled targets, or duplicates host/budget capacity. Source changes to the
existing coordinator require directly affected compatibility checks.

## Look-ahead

The later existing-deck Assistant still needs its concrete draft/save/proposal/
approve/reject/cancel/clear/poll/reopen and navigation/focus contract. It should bind
each client action to project/account/generation and issue explicit target wake
from Send/Approve. Acknowledgement is not model success; show actual saved status,
refusal and bounded retry. Saved visible chat does not automatically become model
context. No UI, creation/research/search tools, streaming or provider expansion is
part of I7. General owner-wide fairness remains a separate future contract; this
specific targeting primitive does not need to be replaced to support it.

## Approved focused gates and acceptance

Four selected gates: (1) new target/coalescing unit contracts plus the directly
affected accepted I6 coordinator file; (2) new actual SQLite/CLI process integration;
(3) new HTTP/production-process target tests; (4) typecheck. The old14-case I6 unit
file is selected because its shared coordinator behavior changes, not as a routine
historical sweep. No whole26 I6 repeat or other old matrix. New gate/schema changes
also need the lightweight affected governance file.

Exercise long approved-terminal prefixes with target work succeeding without an
owner discovery call; exact foreign/stale/invalid target refusal before dispatch;
private bearer/account recreation; same/different-target admission and shared caps;
approved no-provider execution; human-save/cancel/clear races; default-off, malformed
UTF-8/media/authority input; actual operator prepare/approve/execute and production
HTTP registration/restart. Use bounded seeded history oracles, not many live/model
runs. Preserve assertions and actual leaf pass/fail/skip/cancel counts, source SHA/
working delta, backend, durations, exclusions and source hashes. Independent review
uses retained evidence and a few new challenge cases, not successful-suite repeats.

Temporary SQLite/account stores, injected/loopback providers, serial nice/ionice,
watchdogs and fresh short resource observations only. No API/local inference/GPU,
existing databases, removed I4 services, old browser/build/PG/benchmark/native/raster
or historical artifact sweep. No new project store/query/schema contract is proposed;
PostgreSQL is unexecuted, not green. Browser/visual/accessibility/export gates are
inapplicable until a visible surface changes. Existing canonical persistence/edit/
history is checked through the new entry points. Standing BYOK locale and inherited
I4/visual/native/live-provider limits remain separate.

Acceptance needs exact target lookup/work without owner-history scanning, shared
finite admission, no wrong-target coalescing/drop, exact owner/account and stale/
approval fences, canonical durable edits/history, private outputs, operator parity,
focused checks and separate exact-source ACCEPT/HOLD. Update as-built architecture,
state/evaluation/roadmap/continuity, commit focused changes to origin/v2 and stop
after I7. No next feature, production activation, live model spend or UI follows.

Exact source3da0801 is now independently accepted; see [evaluation](V2-8I-7-EVAL.md)
and [decision](reviews/V2-8I-7-3da0801.json). This does not authorize later work.
