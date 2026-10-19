# V2-8C provider exchange boundary evaluation

Implementation is complete and frozen at `52821fb26b796889da3154998480d2ed7d725bd9`. Final validation and
independent review are pending. The task entered from accepted baseline
`1fb39ff75cd473ecaf2884232d5d7465d50a9af2`, entry checkout
`405a062a9c1bbc9e2358457913f87907cf6b1bb7`, branch `v2`, push `origin/v2`.
The current continuation and standing recommended-choice direction authorize the
[next bounded contract](ROADMAP.md#v2-8c-provider-boundary). No acceptance is claimed.

## Validation contract

Provider-neutral typed exchanges, explicit capabilities and actual HTTP adapters
for OpenAI-compatible Chat Completions and Anthropic Messages consume the existing
scoped instruction/tool catalog. Normalized responses are schema-validated proposals;
canonical tools/runtime retain ownership, revisions and durable effects. No new
framework, provider settings/credential storage, public HTTP, autonomous loop, UI,
search, generation, production migration or deployment is included.

Focused protocol/transport and real persisted integration tests cover both wire
formats/backends, invalid/foreign/stale/protected edits, exact preservation, output
bounds, refusal, truncation, cancellation, timeout, errors and secret-safe diagnostics.
The full215-file inventory in v2-8c-evidence/validation-plan.json retains26 serial
browser/build owners, PostgreSQL contracts/process faults, build/type/50 cells and
fresh inspected browser/native evidence. All common correctness/integrity/ownership,
undo/preservation/native/regression/compatibility/documentation gates apply.
Interaction/accessibility/responsive gates use unchanged-UI regressions. Provider
live qualification, new UI and deployment are outside the contract.

## Current status and limitations

All final-source required checks are pending. Accepted baseline stays V2-8B until independent
exact-source ACCEPT. No provider endpoint or hosted content quality has executed.
Fixture protocol verification is not live provider qualification. No live credentials
are required or read for deterministic tests. Existing locale/timeout/Fit/catalog
loading/capture/SVG and original-PPTX provenance limits remain separate in the roadmap.

## Protocol sources

The existing OpenAI-compatible ecosystem uses the
[Chat Completions function-tool wire contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
The second adapter uses the distinct
[Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create)
and [client tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).
These source the protocol mappings; configured models supply explicit capabilities,
not inferred claims about model availability. Responses/streaming/reasoning/files
remain separate future scope rather than silently mapped to this subset.

## Development and early review chronology

The initial protocol tests passed37/37, SQLite integration10/10, then provider
focus60/60 on both real backends. An initial TypeScript schema type mismatch was
corrected before those checks. These working-tree runs are development evidence,
not final-source acceptance or live-provider qualification.

A separate read-only audit found that context-provided schemas could be replaced
with permissive objects, allowing noncanonical proposal arguments even though the
runtime would reject execution. A fail-first selected run failed2/2 (40excluded)
on both protocol families. Canonical catalog definitions now validate before HTTP
and again when parsing. Every complete request independently uses the same
validatedToolRequest primitive as the actual tool session; supplied JSON Schema
is never compiled by the provider parser. Runtime authority remains unchanged.
The corrected provider/foundation/boundary set passed127/127 twice; final-source
repeats and the complete inventory remain separate. See attempts/development/.
