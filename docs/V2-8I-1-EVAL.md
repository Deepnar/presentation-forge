# V2-8I-1 — authenticated conversation and approval transport

## Authority and entry state

The2026-10-24 continuation requests the next immediate work and delegates its
dependency ordering. The recorded sequence after acceptedH selects authenticated
transport before worker orchestration and the existing-deck Assistant surface.
This contract implements the transport dependency only. It does not claim that the
Assistant or parentV2-8 is complete. Future scope lives only in
[the roadmap](ROADMAP.md#assistant-surface-integration).

Accepted baseline: `22e7c9749865f3e7c2d62fb8724136e0f19048b0`, with separate
[H acceptance](reviews/V2-8H-22e7c97.json). Entry checkout:
`01f8717e7f8be98d777789424bbb72c5d1802ee2`; branch/push `v2`/`origin/v2`.
The original three untracked paths are preserved. Implementation has not started
at contract preparation; no tests, services, model calls or inference have run.

## Bounded contract

Add a thin Express transport over the accepted `createTurnService`; never duplicate
its SQL, decisions, expiry/replay logic, run queue or scene authority. Expose five
operations under `/api/v2/projects/:id/conversation`:

| Method/path suffix | Domain operation | Input |
|---|---|---|
| GET base | read | Optional strict decimal offset0–128 and limit1–20; default0/20 |
| GET `/export` | export | No query/body; bounded owner-authorized visible transcript JSON |
| POST `/decisions` | decide | Exact accepted generation/conversation/proposal/project revision and decision-key fields |
| POST `/cancel` | cancel | Exact generation, conversation revision and turn ID |
| POST `/clear` | clear | Exact generation and conversation revision |

Resolve owner from the existing authenticated project/session policy on every
request; never accept owner/admin from query or body. Hosted anonymous requests
are401. Local ownerless access retains existing project policy. Crucially, an
administrator receives no cross-owner private-chat access: pass only the resolved
owner and project ID toH, never the project-admin bypass. Cross-owner and missing
projects both return404. H's transaction rechecks current project ownership,
including project-access revocation after session resolution. Session/token validity
is resolved on each HTTP request under the existing auth policy; logout or token
revocation is enforced on the next request. No atomic in-flight logout/commit fence
is claimed or introduced by this transport.
Keep project feature-disable gating. No change to session cookies, auth policy,
approved retention/clear/export rules, provider configuration or dependencies.

Private responses, including errors, carry `Cache-Control: private, no-store`.
The export has a safe project-ID-derived JSON attachment filename. Reject unknown,
repeated or malformed pagination and mutation query fields. Reject GET bodies and
non-JSON mutation bodies. A dedicated conversation-prefix parser admits at most
8KiB before the existing global parser; malformed/oversize errors must be fixed
JSON messages without echoing request bytes, credentials, internal errors or SQL.
Domain exact-key validation remains authoritative. Preserve domain refusal codes,
mapping invalid input400/422, absence404, revision/decision conflicts409 and backend
misconfiguration/unavailability503. Unknown errors are sanitized500, never a silent
SQLite fallback. A client disconnect cannot roll back a committed decision.

Decision replay must reopen the same canonical run even after its own project
revision advances; it must never create a second run or approve client-supplied
edits. Rejection, stale project/generation/proposal and cleared/deleted state retain
H semantics. Clear cancels linked nonterminal runs atomically while preserving the
deck, existing history and conservative accounting. Successful HTTP responses
describe persisted state rather than claiming provider/run execution happened.

There is no public submit/prepare/claim/advance endpoint, worker start loop, model
credential input, streaming connection, new UI, automatic cross-turn context,
search/creation tool, migration, deployment or real-provider/local inference run.
Preparation remains available through accepted trusted-host/CLI entry points.
This is a complete lifecycle transport seam, with actual HTTP approval/reopen/clear
behavior, not a placeholder Assistant implementation.

## Required evidence and stop point

Shared behavioral HTTP contracts on real SQLite and owned isolated PostgreSQL:
actual session auth, admin/nonowner/anonymous denial, no authority spoofing, exact
pagination/export, absent/disabled routes, byte/parser bounds and sanitized failures;
stored preparation via offline fixtures, HTTP approval/replay/reject/cancel/clear,
human-save/ownership/delete races, queued-run execution through the canonical
runtime, reopen/history/preservation and CLI/domain parity. Also prove no public
execution endpoints and no raw provider/context data in responses. Exercise the
production Express wiring, not just injected response stubs. Use controlled faults
only where real storage cannot trigger the specific transport error safely.

All nine common gates apply: focused HTTP contracts, full nonbrowser inventory,
all26 browser/build files in bounded serial isolation, PostgreSQL contracts,
cross-process faults, production build, typecheck,50cells and final inspected
browser/native evidence. Add two backend entry files to the accepted229-file
inventory; keep every existing assertion and standing locale failure separate.
Unavailable PostgreSQL is unexecuted. Respect the shared-machine quiet window;
snapshot all current evidence and ignored originals in a newI1 namespace before
generators. Preserve exact failed attempts, tested SHA, counts and backend identity.

Data integrity, ownership/regeneration, native export and existing browser/accessibility/
responsive behavior are regression gates; no surface redesign is part ofI1.
Deployment safety means no deployment or irreversible migration. Update the as-built
architecture, state, roadmap and handoff only to actual implemented/validated facts.
A separate exact-source reviewer must issue ACCEPT/HOLD. Stop afterI1 acceptance
or a material scope/authorization blocker; no dependent implementation is implied.
