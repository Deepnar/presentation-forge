# V2-8I-3 plan review — READY_FOR_IMPLEMENTATION

The bounded submission plan at `a20ebadcdb2b2a6559c009d1d49b2389ed703ab6`
is ready for implementation with the agreed parser clarification below committed
to the contract before product code. Accepted baseline is I2 source
`58662ecc074f7cc29bf29a0dd410d581ffca0eef`; entry is
`aeeb9de5f504c04f7269a1bb6259df005dc5bcff`. Reviewer/context is
`/root/turn_contract_review`, separate from planner/implementer `/root`.
This is plan readiness only, dated 2026-10-25, not implementation acceptance.

The current human continuation authorizes the next immediate dependency in the
existing-deck sequence. This owner-authenticated transport over accepted H submit
fits that direction without another product choice. It preserves the existing
private retention, ownership, scope and context policy; it introduces no provider
dispatch, credentials, spending authority, queue, scene writer or UI. Existing
CLI submission already supplies headless parity. The later host and Assistant
contracts remain separate; readiness authorizes neither their implementation nor
deployment, paid infrastructure, a migration or live-provider qualification.

## Required contract clarification

An ordinary `express.json({limit: 262144})` is not by itself the stated UTF-8 wire
policy. The installed body-parser admits other UTF charsets and counts the
inflated stream for compressed entities. A successful earlier parser also causes
later JSON parsers to skip, so widening the whole conversation prefix would
silently remove the lifecycle routes' 8 KiB admission boundary.

The implementer agreed during review to specify the new endpoint as UTF-8
`application/json`, with an optional UTF-8 charset and absent/identity
Content-Encoding. Other charsets and compressed bodies receive fixed private
415 responses. Use structured Content-Type parsing, the exact Express POST route,
`inflate: false` and the 262,144-byte parser limit before the unchanged prefix
parser, followed by the operation-specific serialized UTF-8 size recheck before
service dispatch. Preserve existing lifecycle parser behavior. This clarification
must be committed before implementation; it resolves the only plan ambiguity
identified, within the already proposed transport boundary.

The matching tests must cover padded exact-limit raw JSON, over-limit whitespace
whose parsed representation is small, valid multibyte requests above 8 KiB,
compressed/non-UTF-8 rejection, and larger-body refusal on lifecycle routes,
unsupported paths and wrong methods. Align route case/trailing-slash behavior
with Express and retain private raw-path handling when parameter decoding fails
before the parser. Sanitization and no-store headers apply to each failure.

## Source and verification constraints

H already copies the binding and submission synchronously, validates the exact
schema, and owns transaction-time project access, generation, request identity,
replay, revisions, active-turn admission and storage reservations. The route must
derive only owner/project from session/path and discard the project administrator
bypass. Client expectations and budgets remain unmodified inputs to H; they do
not authorize a worker or provider invocation. Do not substitute fresh revisions
or generate a new request key on retry. Session revocation remains next-request
policy, with no new atomic in-flight logout fence.

Extend the fixed status allowlist for `conflicting-request`, `busy` and
`storage-limit` as 409 without exposing exception messages, requests, SQL or
provider material. Preserve H's replay precedence: generation is checked first;
a matching existing key returns its current persisted view before conversation
revision/busy/project admission checks, and changed identity conflicts. Tests
must inspect the resulting durable identities and row counts after concurrent
requests and a response lost after the real store commit. A replay may truthfully
return a turn that another host has subsequently prepared or executed; it must
not claim that this HTTP submission dispatched that work.

Fresh submission must create no provider attempt, proposal or run, and must leave
scene/history unchanged. Use the actual H/I2 path for subsequent loopback
preparation, explicit HTTP approval, canonical execution, reopen/history/native
export in both stores and both provider protocols. Preserve unsupported `/submit`
and execution-route assertions. Refusal tests must reject unauthorized mutations;
they must not redefine inherited H expiry/accounting reconciliation as forbidden
maintenance when an authorized domain transaction runs.

Inspection covered the committed EVAL/roadmap/inventory, current contributor and
review protocol/state/handoff/traps, subsystem architecture, production parser/
route/auth wiring, H submission/schema/store/views, the Node adapter and CLI, and
the shared actual-store HTTP fixtures including ownership, private errors and
post-commit response loss. The prepared inventory exactly equals the repository's
234 JavaScript/TypeScript test entrypoints: 196 bulk, 26 serial browser/build and
12 PostgreSQL, with no duplicate, missing or extra file. The two focused HTTP
entries overlap that primary union; leaf totals must come from execution.

All nine common gates, real both-store behavior, original-byte snapshots and
restoration, serial isolation/fresh quiet admission, native/visual inspection,
exact owned-backend cleanup and independent exact-source ACCEPT/HOLD remain
required. The separate locale failure remains acknowledged outside those nine
gates. No tests, services, models, inference, browsers, builds or generators ran
for this review; no current-source result is inferred from accepted I2 evidence.
Only these plan-review records were written. Stop after I3 acceptance/cleanup.
