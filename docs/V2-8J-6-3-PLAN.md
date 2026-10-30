# V2-8J-6-3 — saved Sources inspector

Status: **independently accepted implementation8d34c95f**.
Separate [decision](reviews/V2-8J-6-3-8d34c95f.json) was committed unchanged
ate96c9ba1; see [evaluation](V2-8J-6-3-EVAL.md). The historical planning body below
is the approved contract, not authorization for dependent scope.
The2026-10-30 reply “ok continue” to the concrete recommended Inspector/full-URL
disclosure question approves only this reviewed contract. Direction and focused
inventory were pinned before runtime; separate implementation acceptance is complete.
Exact contract65287b6181aa72ee7515ea8a3d407f5e81c6aca9 passed separate
[planning review](reviews/V2-8J-6-3-plan-65287b61.json), committed unchanged
at3b3f6c11. No technical contract correction was required. Readiness does not
authorize implementation, product execution or the new browser disclosure.
This status header follows the reviewed contract; its body remains unchanged.
Accepted baseline6068a2a7c5643a1958a140bcc60d0df6b891ccec (J6-2), independently
[accepted](reviews/V2-8J-6-2-6068a2a7.json). Planning entry HEAD
62fdffabe7909305acf15882d7c518eb08442537; branch v2, push origin/v2 only.
The2026-10-30 continuation authorizes preparing the next contract, not selecting
a new presentation/privacy policy without direction. Keep J6-2 accepted in state.
[Roadmap](ROADMAP.md#assistant-citation-source-inspector) owns scope and dependencies.
No implementation, product evaluation, service, native render or model/search call
is authorized by this planning document. Independent readiness is not acceptance.

## Proposed direction and rationale

Add a collapsed **Sources** section to the existing project editor's Inspector.
An explicit owner click reads saved references for the current saved slide, or
for a single selected object on it. Multiple selection uses the slide view with
an explicit scope label. Include slide-level associations in the slide view;
object view is only that object's associations. Keep the existing Inspector and
Assistant tabs. No new page, toolbar or canvas overlay.

Show the saved revision, complete retained source title/URL, and separate target,
content, retained-source and snippet-range observations. Always state **“Claim
support is not assessed.”** No excerpts, original quotes, provider/backend fields,
queries separate from the retained URL, source bodies, digest or raw saved scene
enter the browser DTO. Full URLs can themselves contain private query values.
These are existing owner-private sources, displayed transiently to their owner;
this introduces no new stored source/chat/history data or portable file disclosure.

This bounded read surface makes current citation metadata inspectable before
visible slide attribution/paginated references. It does not complete that parent:
[visible/printed presentation](ROADMAP.md#assistant-citation-native-presentation)
and [semantic creation](ROADMAP.md#assistant-semantic-creation) retain their own
contracts. A dedicated source-management page is the alternative direction; this
slice contains no add/remove/clear/attach/search controls in either option.

## Exact surface behavior

- Available only on a bound, non-recovery saved project in the project editor,
  including clean Done/read-only views. Unbound/legacy/standalone scene fixtures
  retain current behavior; no general source browser is added there.
- Opening Sources is the explicit read action. Closed, inactive Inspector or
  other route performs no background polling, prefetch or automatic resolution.
  Expanding preserves the existing formatting/grid panels and their drafts.
- Pending inline/title/grid/Assistant drafts and dirty engine content are allowed:
  show **“Saved revision N. Unsaved edits are not included.”** when relevant.
  Observations refer to that saved snapshot, never to live unsaved content.
  Reading Sources never commits, saves, discards, adopts or reloads the document.
  Intercept pointer focus changes that would blur-commit inline edits or cancel
  title drafts; keyboard navigation keeps its existing explicit editing policy.
- Show explicit empty/error/busy/stale states, never a false “verified” badge.
  Missing/deleted objects remain visible as unresolved associations in their
  containing saved slide; scope-mismatched targets are not silently retargeted.
  A selected new/unsaved object has an explicit “not in saved revision” empty state.
- A current retained source may display its title/URL even if the target/content
  observation is unresolved. Missing/stale-generation sources omit title/URL;
  do not resolve an equivalent ID from a newer generation as a replacement.
  Current content and a valid snippet range do not establish claim support.
- Render complete title/URL as plain text, escaped by React, with wrapping and
  literal visible escapes for control/bidi characters. No HTML/Markdown injection,
  URL preview, link navigation, clipboard action, source fetch or telemetry.
  Native text selection remains available. The UI does not append private IDs.
- At most24 associations per page, stable saved order; **Show more** is explicit.
  No infinite scrolling or polling. A page is published atomically after complete
  validation. Stale catalog pagination clears private rows and asks for explicit
  **Refresh sources** at the same saved project revision; a newer project asks
  for deliberate reopen/refresh through existing project controls. No silent retry.
- Each read captures token/account epoch, project/saved revision, authoritative
  document identity, scope and navigation/mount/read generation. Recheck every
  awaited stage. Closing/rail deactivation, scope, project, route, session change
  or authoritative save/restore/copy/AI reload aborts delivery and removes private
  title/URL rows. Session ABA is guarded by epochs, not token/URL equality alone.
  Late responses cannot repopulate a newer scope or clear its newer state.
- One current UI request, no queued automatic retry. Collapse removes all private
  page data/cursors from component memory; no local/session storage, saved consent,
  logs, provider context, scene/history writes or client cache. Already displayed
  data may remain in browser internals; this is not a secure memory-erasure claim.
- Reuse rail scrolling and fixed width: expansion does not change canvas geometry,
  selection, zoom, scroll or engine. Native button with aria-expanded/aria-controls,
  labeled section/status, logical tab order and visible focus; preserve narrow
  rail's existing topmost Escape/focus behavior. Verify320px/short/emulated200%
  reflow for wrapping and reachable actions; do not add another competing modal.

## Coherent headless read and CLI parity

Introduce a bounded owner-qualified citation-view read facade using the accepted
`withCitationReadTransaction` callback. Capture strict plain JSON binding/request
before awaiting; validate the full saved document and exact owner inside the
transaction. Reuse J2 catalog/accounting/body readers and J4 canonical target,
content-anchor and range observation algorithms. If extracting a shared pure
observation helper is necessary, preserve J4's existing public DTO/semantics and
run only its affected observation cases. Never compose public J4 inspect and J2
resolve across separate snapshots or nest their transactions.

Request: expected project revision, containing saved slide ID, optional single
selected element ID and optional opaque cursor. A first page reads current catalog
identity; each later page must match project/catalog generation+revision, scope
and saved ordering. Cursor is a bounded validated position hint, not authorization;
all current owner/snapshot checks still run. Do not accept client citation arrays,
source IDs, scenes, owner/admin fields, source text or claimed observations.

Response: exact ok/snapshot/scope/total/rows/nextCursor shape. Each row contains a
citation identifier for internal keying, saved target identity, independent J4
status observations, claimSupport:not-assessed and title/URL only for its current
retained source. No canonical source payload escapes through object spread.
Validate response shape/status enums/counters/IDs/scalar text and actual UTF-8 bytes
on both server and browser. Target/body corruption refuses the complete page with
a static error; legitimate missing/stale references produce explicit unresolved
rows. Match by containing saved slide first so orphan/mis-scoped rows remain visible.

Keep limits finite: existing512project/128scene citations;24page rows/body reads;
source catalog/accounting caps4MiB/512; existing10000node/128depth target observation;
query8KiB UTF-8, cursor512bytes, success256KiB UTF-8 and error8KiB. Use existing
source title500/URL2000 schema limits, source identity and canonical body checks.
Read only referenced page bodies, never the whole catalog's snippet content.
Avoid truncating a source/row to squeeze under a byte cap; refuse the whole page.

Add explicit owner-token CLI JSON stdout parity through the same facade, e.g.
`npm run inspect-project-sources -- <id> --revision N --slide ID [--element ID]
[--cursor CURSOR]`. No output file, raw error/body/token logging, automatic retry,
mutation or implicit export. `FORGE_PROJECT_TOKEN` binds once using the same strict
trusted-token policy; supplied invalid credentials cannot become local-null.

## Private HTTP boundary

Propose GET `/api/v2/projects/:id/citation-view` with strict revision/slide/optional
single-element/cursor query fields. Query is bounded before parsing; no request
body. HEAD/POST/unknown methods or suffixes refuse without domain work. Match raw
family paths for early private headers and static late decoding/errors, before
CORS/global parsing. Existing non-disclosing CORS OPTIONS is an explicit exception.
No generic request body reaches the global8MiB parser through this family.

Reuse J5/J6 trusted Bearer policy: verified exact owner, no admin override/cookie
fallback, local-null only without supplied credentials; Forge cookie-only and
empty/malformed/supplied bad Authorization refuse. Capture account/token once;
canonical owner check repeats in the read transaction. Foreign/missing indistinct.
`private,no-store`, Pragma:no-cache and Vary:Authorization on every private result,
including parser/raw-path failures. Browser uses captured Bearer, credentials:omit,
cache:no-store, redirect:error; MIME and actual UTF-8 body caps precede rendering.

Finite per-process admission2active/1owner for this new read family, no queue or
background retry. Hold until actual transaction/read settles even if delivery is
aborted. No slot across page interactions. This is not distributed quota, a hard
SQL lock-wait deadline or interruption of already-running work. Existing export
admission/permissions remain unchanged; do not widen accepted export/copy routes.

## Look-ahead and non-goals

The projection retains canonical citation/source IDs internally and independently
labels target/content/source/range/support states; later semantic proposals and
visible/printed attribution can reuse canonical authority without treating this
read as an attachment, verified claim, export consent or saved receipt. No second
scene/provenance document or renderer-owned layout is introduced. On-slide numbers,
references/appendix slides, printable notes pagination, new locators/claim checking,
research grants, source mutation/management, Assistant tools/context, activation,
provider routing/model calls, dependencies and deployment are outside this slice;
future scope stays solely in the linked roadmap entries.

## Focused evidence after human direction

Planning uses only source/document/governance inspection; no product run or service.
Pin a new inventory after direction. Use the smallest checks establishing this new
read surface; accepted unchanged J4/J6 native/store behavior is not rerun broadly.

| Gate | Bounded new/affected evidence |
|---|---|
| Domain/read | Strict immutable input, coherent exact-owner SQLite snapshot across competing save/clear, current/missing/stale/content/range rows, containing-scope orphans,24/25 pagination/cursor stale/refusal, corruption and byte/traversal limits; no scene/history/catalog mutation |
| Transport/CLI | Actual owned temporary SQLite/API/CLI projection parity, owner/null/foreign/admin/unverified/bad credentials, private parser/path/query/method/MIME/byte bounds, no body/excerpt/error disclosure and finite slot through abort/fault settlement |
| Client | Captured snapshot/scope/session ABA, every awaited boundary, obsolete page/cancel cannot affect newer state, exact DTO/actual UTF-8 bounds, inactive/collapse cleanup and explicit stale refresh; production controller, not copied guards |
| Browser | One serial file with a few combined scenarios: current saved slide/object/missing associations, unapplied text/title/grid drafts survive opening/closing Sources, stale pagination and held route/session/actual reload suppression, keyboard/narrow/short reflow and measured unchanged canvas; inspect screenshots |
| Build/governance | One reused production web build; typecheck only if typed code changes; exact source/delta/backend/argv, all attempt counts and source snapshots captured before execution, docs/architecture/roadmap/state/handoff, separate independent exact-source review |

No new PostgreSQL fixture is planned while the accepted transaction adapters/SQL
readers remain unchanged. If new adapter/SQL behavior becomes necessary, revise the
focused inventory before the relevant actual-PG check; unavailable is unexecuted.
No old matrix, native raster/PPTX regeneration,50cells benchmark, real model/search/
GPU/provider call, persistent service, migration or production activation. Existing
J6-2 export, rendering, undo/regeneration and BYOK locale evidence stay separate.

Correctness, source privacy, read-only preservation, transport/browser lifecycle,
accessibility/responsive, backward compatibility and evidence gates apply. Native
rendering/deployment are not applicable: no such behavior changes. Inspect CPU,
memory and actual storage activity before build/browser; nice/idle I/O, limited
CPU affinity, finite process-group watchdog and owned resource sampling. Leave
unrelated work alone; no old backend reuse/cleanup. Retain every failed attempt;
rerun only an affected changed/failing boundary, never just for SHA identity.

## Direction, acceptance and stop

Prepare and independently review this concrete contract, then obtain human choice
on the Sources-in-Inspector surface and transient owner-only title/full-URL browser
disclosure (including private query values). AGENTS requires that decision for a
new product/data-handling surface. The alternative dedicated source-management
surface is a different contract. No implementation begins before that choice.

After direction, implement only this approved read slice and its focused evidence,
obtain separate exact-source ACCEPT/HOLD, propagate scoped docs/commits/push and
stop. Do not self-accept or begin visible slide/native pagination, research or
semantic creation from this contract's readiness/implementation acceptance.
