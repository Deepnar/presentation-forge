# V2-8I-1 independent source inspection

Reviewer/context: `/root/turn_contract_review`, separate from implementer `/root`.
Accepted baseline: `22e7c9749865f3e7c2d62fb8724136e0f19048b0`. Initial frozen source:
`0b5fd3879ffeb5a3e42fc890839a486f7d95aff5`; corrective source inspected:
`6af5a5f00a15b8a2356cfc13af13f3edc6c5dc9f`. Both were confirmed contained in the
local `origin/v2` tracking ref before inspection. Date: 2026-10-24.

**Source review only; no ACCEPT.** Full exact-source gates, final evidence and
independent applicable execution remain pending. This pass ran no tests, servers,
database calls, browser/build/generation or model calls. Only this note was written.

## Confirmed finding and inspected correction

The initial source's late raw-path error predicate at
`app/server/v2-conversation-routes.js:108` was case-sensitive, while production
Express routes/prefix middleware use case-insensitive matching by default.
An upper/mixed-case conversation URL with malformed encoded project-ID bytes can
fail decoding before private headers run, then miss that lowercase-only late
predicate. Express's default error formatter can consequently echo the raw path
and omit the private/no-store header. The original shared negative test covered
only lowercase URL prefixes.

This was reported before full validation. The implementer retained a fail-first
HTTP probe, then corrected the predicate with `/i` and expanded the shared test to
lower/upper/mixed-case URLs at `6af5a5f`. Source inspection confirms that narrow
correction matches Express policy and preserves fixed JSON/no-store/no-echo
assertions. The reported probe executions are implementer evidence, not reviewer
execution. Complete corrected-source backend contracts remain required.

## Other inspected boundaries

- The five routes construct only resolved owner/project authority and discard the
  project-admin bypass. H still performs current project access checks under its
  canonical transaction. Session validity is resolved on each HTTP request, with
  no stronger in-flight logout fence claimed.
- The prefix 8 KiB JSON parser precedes the existing global 8 MiB parser. Its
  error formatter and normal route errors use fixed allowlisted responses, with
  no raw exception/details/SQL/provider data. Mutation input is passed to H's exact
  validation without replacing generation/revision/decision identity.
- Pagination rejects ordinary repeated, bracketed, unknown and malformed values.
  Export validates the project ID before deriving an attachment filename and
  returns H's visible view. No raw plan, private receipt or provider context is
  serialized through a new DTO.
- Approval/rejection/cancel/clear delegate to accepted H services. HTTP does not
  introduce another queue, bypass replay/expiry or start workers/provider calls.
  Final approval expiry has an explicit allowlisted conflict mapping. Client
  disconnect is not passed as a cancellation authority for a committed decision.
- The shared HTTP contracts use actual production server wiring, real session
  auth, real backend preparation/storage and the canonical runtime. Isolated
  service injection is confined to response-loss synchronization and controlled
  transport-error classification. No product/domain source changed from H.
- Governance adds the two intended HTTP entry files without removing required
  existing scope or converting unavailable PostgreSQL into a pass.

No additional confirmed owner/approval/atomicity/provider-execution regression was
found in this pass. Two evidence details were reported for completion before final
review: direct coverage of the promised local anonymous conversation policy, and
admin denial for decide/cancel in addition to the existing read/export/clear case.
The current common implementation wrapper supports these policies, but that is
source reasoning rather than executed proof.

An additional error-formatting boundary was reported for clarification: unsupported
conversation paths/methods currently fall through to Express's ordinary HTML 404
formatter, which includes the raw pathname, although prefix no-store headers are
already installed. The explicit contract requires fixed JSON/no-echo for malformed
and oversized errors; if the policy covers every private-prefix refusal, a terminal
scoped fixed JSON 404 plus no-echo/content-type assertions is the narrow correction.
This observation does not claim disclosure of stored conversation data.

Only the approved lifecycle transport is reviewed. No Assistant UI, public
submission/preparation/execution, hosted worker, provider configuration, data-policy
change or live quality qualification is authorized or inferred. A separate final
exact-source ACCEPT/HOLD must follow the full evidence packet and independent
applicable execution after the validation slot is released.

## Narrow follow-up at 5170adc

Exact pushed source `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d` was subsequently
inspected read-only. The raw private-path predicate is now shared by the late error
handler and a terminal fixed JSON/no-store 404 handler. Unsupported execution paths
therefore no longer fall through to Express's ordinary HTML/path formatter. The
shared negative contract adds fixed `not-found`/no-echo checks, without exposing
any execution endpoint or altering H authority.

The added local ownerless lifecycle test covers read/export/approve/cancel/clear,
checks an authenticated owner cannot access that ownerless conversation, and
checks deck preservation. Both exact-tree backend entry callbacks forward the
environment override; PostgreSQL retains its selected backend/database alongside
the local-mode override. The admin-denial loop now includes all five operations.
An initial review message mistakenly carried forward the older callback text;
direct `git show 5170adc:<entry>` inspection resolved that question and it is not
a defect in this source. The reported wrong 400-code oracle in a root-only 404
probe is an evidence-harness failure, not a reason to alter product semantics.

No remaining material source blocker was found in this narrow correction. This is
not executed validation or ACCEPT: full exact-source gates, independent applicable
execution and final evidence/cleanup inspection remain pending. No tests/services
or product/test edits were performed by the reviewer.
