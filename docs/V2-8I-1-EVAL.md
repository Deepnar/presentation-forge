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


## Development execution (not acceptance gates)

Source checkpoint `6af5a5f` contains the five routes, shared both-store HTTP tests,
complete-inventory governance and the parameter error correction. The independent
[plan review](reviews/V2-8I-1-plan-e24a281.md) was READY_FOR_IMPLEMENTATION. Exact-source
implementation review and all final gates remain pending.

The first SQLite development run executed 16 cases: 14 pass, 2 fail, zero skips or
cancellations. Both failures were incorrect fixtures: cancel/clear authorization
checks used a decision body instead of each method's valid input, and the registered
account had not actually been promoted to administrator. Corrections retain the
404 assertion and now prove real admin access to project CRUD while private chat
remains denied. An additional actual ownership-transfer case was added. The next
SQLite plus protocol run passed 49/49 (17 HTTP and 32 governance), zero failures,
skips or cancellations. Its separate development typecheck was still awaiting a
quiet window at this checkpoint; no typecheck pass is claimed.

A single-request lightweight malformed-URI probe reproduced a product regression:
Express decoded parameters before the prefix parser and returned HTML, echoing the
fixture path without private cache headers. A scoped late handler fixed this.
Independent source review then found that the raw predicate needed to match
Express's case-insensitive routing. The uppercase fail-first probe reproduced the
same disclosure; `/i` and lower/upper/mixed-case shared assertions correct it.
Both post-correction single-request probes pass. These are development probes,
not complete matrix execution. Raw failures, source hashes and corrected results
remain in `v2-8i-1-evidence/development/`. No assertions were weakened.


Independent source review also identified coverage gaps for local ownerless policy
and admin decide/cancel. The shared contract now exercises the complete ownerless
lifecycle on each backend, with authenticated access denied to that ownerless chat,
and all five administrator cross-owner denials. Unsupported private-prefix paths
now return fixed JSON404 rather than the default HTML path echo. A single-request
fail-first probe confirms the former HTML response; its first after-probe retained
an incorrect `invalid-request` oracle for404, then the corrected `not-found` oracle
passes. This probe mistake did not change the product refusal or shared assertions.
Source checkpoint `5170adc` includes these narrow corrections. The old coordinator
was stopped while waiting with no child process active: no test was cancelled,
and the development typecheck remains unexecuted. Final validation requires the
new source and its expanded case inventory; prior passes are not retagged.


The corrected-source development check at `5170adc` passed **50/50**: 18 SQLite
HTTP cases and 32 development-protocol cases; zero failures, skips or cancellations,
19.877 seconds. It admitted after two fresh quiet samples. Raw TAP, exact command,
SHA and admission samples are retained under `development/candidate-*`.
Independent source inspection found no remaining material blocker, but did not
execute tests or issue acceptance. The full 231-file matrix, actual owned PostgreSQL,
build/typecheck/benchmark/native/browser gates and final independent execution are
still unexecuted at this checkpoint. Sustained resource qualification is running.


## Validation checkpoint and recommendation

Frozen source: `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`. The independent source
inspection reports no remaining material blocker; it executed no tests and does
not supply acceptance. Recommendation: **keep I1 unaccepted pending complete final
validation and independent execution**. Accepted baseline remains H `22e7c97`.

| Execution | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|
| First SQLite development attempt (16 cases) | 14 | 2 | 0 | 0 |
| Corrected pre-URI SQLite/protocol repeat (49 cases) | 49 | 0 | 0 | 0 |
| Frozen-source SQLite/protocol development check (50 cases) | 50 | 0 | 0 | 0 |

These are separate executions and overlapping tests, not an aggregate primary
matrix. Lightweight single-request probes are separate from those leaf counts:
lowercase URI, uppercase URI and unsupported-path fail-first probes each exited1;
URI/case corrections exited0. The unsupported-path first after-probe exited1 from
its wrong `invalid-request` oracle; corrected `not-found` probe exited0. Retained
logs classify these product and harness failures separately.

All nine final gate records remain unexecuted, with zero current complete-matrix
files executed out of231 (195 bulk,26 serial browser/build,10 PostgreSQL). Both-store
focused acceptance, actual PostgreSQL contracts/concurrency/faults, full browser
behavior, production build, typecheck, canonical50 cells, four distinct persisted/
native cases, final screenshots/native rasters and independent execution are not
claimed. The actual number of leaf cases in that future complete execution is not
inferred from historical totals. No final screenshots or persisted native evidence archives were produced or
visually inspected for I1. The SQLite development case exercised actual HTTP PPTX
export and OOXML assertions in memory; it did not rasterize or preserve that export. The standing BYOK locale failure remains separate
and was not rerun; historical H locale counts are not current execution.

The [resource checkpoint](v2-8i-1-evidence/environment-held.json) retains31 samples
over466.87seconds, duration-weighted CPU31.51%, peak87.30%. Required180-second
sustained admission was not achieved. Earlier development admission sampled18.82
minutes separately. A brief quiet window admitted the50-case development check;
it did not authorize the longer regression workload. No I1 PostgreSQL container,
snapshot, bulk/browser/build/benchmark/native generator or migration was started.
The owned service name is absent and5544refuses connections. Waiting monitors were
stopped without cancelling a test leaf or affecting unrelated processes. No active
validation/background continuation remains.

Performance available today: local development50-case run19.877seconds, including
child startup and actual SQLite HTTP fixtures. This is not an opening-performance,
production-latency or provider-quality result. New benchmark/large-deck/canvas
measurements remain unexecuted. Existing accepted editor/fit/native-consumer and
locale limitations remain recorded in the roadmap. No real model APIs or local
inference ran.
The [runbook](v2-8i-1-evidence/RUNBOOK.md) preserves exact continuation commands;
stop at I1 until the required gates and independent ACCEPT/HOLD are available.
