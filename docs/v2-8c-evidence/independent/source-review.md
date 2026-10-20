# Independent source and contract audit

Reviewer/context /root/v28c_final_review; implementer /root. Accepted baseline
1fb39ff75cd473ecaf2884232d5d7465d50a9af2; exact implementation
e41d509c20fca21a70b9a0c587ccb83684aee7e6. Final pushed evidence packet
edf318bbacd122a4fee9b6f86a348ecb8e469e65 has no later product/test delta.

The complete product/governance source delta was inspected independently. New
provider.ts imports only accepted semantic tools, context and skill policy;
network/credentials stay in src/agent/model-provider.js. No model layout fields,
renderer-owned layout, alternate document, UI, storage/auth policy, package,
provider setting, search or autonomous loop was added. Session changes extract
the existing canonical request validation and return cloned canonical schemas.
The durable implementation remains unchanged.

Canonical catalog equality runs before dispatch and during parsing; complete
requests pass through the same validatedToolRequest used by real tool sessions.
Permissive replacement schemas cannot admit extra layout/authority fields.
Tool names remain scoped, IDs unique/bounded, calls bounded, edit base revision
matches acquired context, and terminal reason/call cardinality must agree.
These are proposals: canonical runtime still owns scope, stale persistent
revisions, protection, owners, atomic command application and history.

Both wire builders retain system policy and user data separation. Profiles
explicitly declare supported tool exchange; unsupported capabilities refuse,
without model-name inference or downgrade. Model identity returned by provider
is separately normalized. Chat prompt usage is inclusive; Anthropic uncached,
read and write counters are summed once. Optional unavailable counters remain
absent and output usage cannot exceed the prepared allowance.

Transport source inspection covers private credential closure, URL restrictions,
explicit auth/header placement, redirect:error, no retry, generic diagnostics,
content type/UTF8/JSON checking, response byte bounds including chunked bodies,
headers/body timeout and caller cancellation. Request bounds include wire tool
wrappers. Accessors and non-JSON input are refused at the context/options
boundary. Successful response content remains untrusted model text/proposals.

Independent inspection found no blocking defect. Actual execution is recorded
separately in runs.json; source inspection alone does not supply acceptance.
Fixture HTTP/backend checks qualify this bounded exchange contract only, not
live provider availability, quality, conversational orchestration or common search.

Official protocol documentation was opened independently on2026-10-20. The
[Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
confirms function tools, parallel-tool control, completion limits and the prompt
usage breakdown. The
[Messages reference](https://platform.claude.com/docs/en/api/messages/create)
confirms distinct top-level system placement, API-key/version headers and refusal
stop details. The
[cache accounting guide](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
confirms summing uncached input, cache reads and cache creation. These are document
cross-checks of the implemented subset, not live endpoint/model qualification.
