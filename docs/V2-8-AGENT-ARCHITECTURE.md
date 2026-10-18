# V2-8A tool and model-context boundary

Implementation in progress2026-10-18; acceptance/evidence are indexed in state.
The approved task and later-work ownership are in
[ROADMAP.md](ROADMAP.md#v2-8a-scope-proposal).

`packages/tools/session.ts` binds an existing live EditorHandle and trusted
application authority. The application supplies project/owner/actor identity,
agent identity, readable slides, explicitly editable targets, selection and budgets.
This is an internal headless capability, not an HTTP authentication mechanism.
Binding a document requires the application to have already authenticated and
loaded the correct owned project. Model arguments cannot supply authority, choose
another project, widen grants or override the engine actor. The session is frozen;
its grant arrays are copied and filtered against readable slides. Empty effective
edit grants produce an inspection-only catalog/context mode.

Requests and results have JSON Schemas, AJV validation and checked-in generated
TypeScript contracts. Strict Node24 TypeScript includes tools/agent/skill packages;
the dependency matrix permits tools→model, agent→tools/skill and skill→itself,
with no provider, network, renderer, app or storage imports in these packages.

Tool requests contain semantic data only:

- `get_project`: paged allowed-slide metadata, without content or theme state.
- `get_slide`: paged element content from an allowed slide.
- `get_selected_elements`: caller-bound selection, never an implicit whole deck.
- `edit_content`: one atomic batch of existing text-run, chart-data or table-row
  changes using an observed engine revision and a trusted call identifier.

Read projections allowlist IDs/kinds, protected/hidden/editability state and text/
chart/table content. They exclude coordinates, resolved fonts/colours/theme tokens,
media URLs, semantic/compiler internals and caller credentials. Document wording
remains user content; this is structural exclusion of machine configuration, not
redaction of arbitrary words that happen to name a colour or font.

Text edits address existing paragraph/run indices and replace wording only; run
and paragraph formatting stays intact. Multiple different runs of one element
are merged into one text command, and duplicate writes to the same run/data target
refuse. Chart and table operations reuse native canonical commands and validation. Table
updates retain the existing row and column counts because cell structure owns
resolved layout. Success results have tool-discriminated exact nested contracts;
unknown renderer/credential fields are rejected by their result schemas.
Geometry, styling, untouched content, tombstones and detached state are preserved.
The canonical command currently marks explicitly edited content as human-owned;
the envelope/log actor remains agent. This keeps the existing regeneration contract
and does not introduce a new ownership policy. Undo/redo belongs to the same live
engine; no extra document, persistent undo or saved-project mutation is introduced.

Foreign-owner reads/writes fail before inspecting the handle. Target grants and
read scope both apply. Locked/hidden targets and their ancestors refuse. The
engine remains final revision/command/result authority: concurrent edits cannot
both commit the same base revision; failed batches leave scenes/history unchanged.
Existing duplicate-envelope semantics are retained, without durable idempotency
claims. Session call/input/output budgets are trusted configuration; output-size
refusal for a mutation acknowledgement happens before engine submission. Input
copying rejects executable accessors, cycles, functions, unsafe keys, sparse arrays,
nonfinite numbers, excessive depth/nodes/characters and extra schema fields.
Errors use bounded static messages and do not echo payloads or raw exceptions.

`packages/skill/sections.ts` holds core invariant policy and separate inspection/
content-editing sections. `packages/agent/context.ts` obtains context only through
read-only scoped queries. Policy is a system message; the request and projected
content are encoded user data. Only the effective scope's tool catalog and skill
section are included. The composer includes policy, tool schemas, request and data
in a deterministic character budget, with an explicitly approximate chars/4 token
estimate. Oversized or refused context returns an error, not silent truncation.
Revision changes between reads or immediately after the final read refuse mixed
context. This module does not invoke a provider or execute edits while composing.

No Assistant UI, model adapter, autonomous run loop, durable job/store, provider
credentials, research/search integration, deployment or migration is shipped here.
Later integration must bind fresh trusted scope and preserve these authority and
revision boundaries; its work is recorded only in the roadmap.
