# V2-7 Frontend Architecture — unified workspace

Updated: 2026-10-18. Accepted source and review are indexed in development-state.json.
V2-7C-2 discovery is independently accepted at `bf1bd8f`; see
[decision](reviews/V2-7C-2-bf1bd8f.json). Parent V2-7 remains
in progress. C3 control separation is implemented pending its own validation/review.

## 1. Product model: Workspace → Project → Editor

One hierarchy, three surfaces, one representation (ProjectStore
documents of Layer-C scenes through the revisioned engine):

- **Workspace** (`#/projects`, `views/Workspace.jsx`) — the entry
  point for saved presentations and generated decks/reports. Canonical
  `GET /api/v2/projects` and `GET /api/decks` metadata form a disposable typed
  projection; the two stores and documents remain independent. Saved entries
  retain open/rename/delete/export/history and AI/layout/blank creation.
- **Project** — the saved document itself (identity, title,
  revision, scenes, history). Addressed by id in `#/project/:id`
  (and `#/project/:id/history`); the route is the identity, so
  refresh, deep links, and back/forward behave.
- **Editor** (`components/SceneViewer.jsx` in embedded mode) —
  one mounted editor per project (`key={projectId}`), exactly one
  engine document and one adapter at a time, detached on unmount.

The legacy scenes page (`scenes.html`, fixture/deck query params)
stays as the standalone viewer all headless and browser suites
drive; the workspace mounts the same component with a project id
instead. The existing hash router uses `lib/guarded-hash-router.js` for central leave
policy, link interception and indexed history restoration; project routes remain
part of the same App route hierarchy.

### Unified discovery (V2-7C-2)

`lib/projectCatalog.js` qualifies identities as `saved:<id>` and
`generated:<slug>`, then orders metadata by modification time and identity.
Titles, mutable origin metadata and coincident identifiers never merge copies.
Reads do not convert, change scenes or write history. Generated cards use the
existing original destination; report-only entries open Report. The explicit
Open in editor action and its durable import receipts remain in the deck/chat
surfaces. All projects returns from legacy deck/report/research/script pages to
the same discovery page; the sidebar retains chats and one Projects shortcut.

Each workspace effect owns independently abortable saved/generated reads,
source-local retries, a bounded deadline and a debounced generated-content search.
Title/theme/identifier matches stay available when content search fails. The
existing owner-checked deck search supplies content hits only for entries already
in the authorized metadata projection. Saved/generated/report type filters do
not affect authorization. Partial errors never become a successful empty catalog.
The C1 cover loader supplies the same session fence and bounded preview work;
departure, StrictMode replay and identity invalidation dispose discovery requests.
Late results cannot publish under a different query, lifetime or session.

Generated previews retain the legacy thumbnail/fallback in fixed 16:9 space and
mount near the viewport; saved entries retain C1 revision-scoped scene previews.
Delete confirmations identify which copy is affected and invoke only that
source's canonical delete. Errors stay focused inside the active dialog;
pending work traps focus on the busy dialog. Global project-search/new-chat
shortcuts defer while a modal is active. Ctrl/Cmd+K otherwise uses the central
leave guard before focusing discovery search, including pending editor drafts.

## 2. Editor shell layout

```
┌───────────────────────────────────────────────────┐
│ Top bar: back · title · save · undo · history ·   │
│          export · present · assistant · inspector │
├──────────┬────────────────────────────┬───────────┤
│ Left     │ Center                     │ Right     │
│ rail:    │ view toolbar · banners ·   │ rail:     │
│ slides / │ canvas · status            │ inspector │
│ layers   │                            │ assistant │
└──────────┴────────────────────────────┴───────────┘
```

- **Top bar** (`data-topbar`): project identity and document
  operations. Title renames metadata-only (Enter commits,
  Escape/blur cancels, stale surfaces inline). Save pill shows
  confirmed states only. Present opens a read-only fullscreen
  overlay (arrows/Esc). Assistant toggles the placeholder tab.
- **Left rail** (`aside[aria-label="Slides"]`): filmstrip with
  tabs for slides/layers, chooser, bulk bar. Collapsible; on
  narrow viewports an overlay behind the top-bar toggle.
- **Center**: project routes retain previous/next, zoom/Fit, Edit/Done,
  text/shape insertion, pending-text Commit/Cancel and descriptive slide/selection/
  layout status. Fixture selection, Live compilation and the duplicate Projects
  dialog are standalone-only controls; their panels are also excluded in embedded
  mode. Banners retain edit/save/switch/text conflicts. Canvas keeps the majority
  of the width; the fixed-height toolbar scrolls without wrapping.
- **Right rail** (`aside[aria-label="Inspector"]`, fixed 288px):
  Inspector and Assistant tabs. Inspector shows the selection
  readout, the contextual format panel (text/shape/chart/table —
  the same components and commit paths as the old bottom dock),
  and slide properties when nothing is selected. Fixed width is
  load-bearing: swapping panels on selection never moves the
  stage, preserving the V2-5D no-reflow contract the bottom dock
  used to keep (the center column no longer reserves inspector
  space at all).
- History/gallery/present and standalone Projects dialogs retain their existing
  close/focus lifetimes. Navigation and switch guards retain their existing
  Save/Discard/Cancel semantics. Embedded project switching goes through the
  canonical guarded Workspace/Projects route, rather than the harness dialog.
- Human-facing project slide/format labels use slide positions and object kinds;
  standalone diagnostics preserve identity strings. Data attributes/internal IDs,
  the engine document, commands, fixed inspector width and native export stay
  shared. Layer tooltips and blank-history fallbacks use descriptive labels in
  production. Read-only status derives from canonical persistence state rather
  than treating every loaded project as an unsaved edit. This is presentation by
  mode, not a second renderer or command path.

## 3. State ownership

- Authoritative slide content lives in the engine document only.
  React holds navigation state (`projectId`, rails, tabs, dialogs,
  drafts-in-form) and never mutates scenes outside the adapter.
- Save state reflects confirmed PUTs; mid-flight edits stay dirty. A save
  promise is awaited before departure and newer engine revisions are drained
  before Save & leave succeeds. Dirty detection reads the document and pending
  inline draft, including failed saves and Done/read-only mode. Explicit discard
  suppresses further saves for that document. Rename/scene revisions share the
  durable counter. API errors retain status/code for hosted recovery.
- Embedded binding waits for the font-gated viewer and checks its identity after
  asynchronous document creation; teardown detaches one adapter/document.
- Creation builders (`lib/v2create.js`) produce validated scenes
  (blank, 15 layout skeletons with minted ids); `apiCreate`
  persists them; the router opens the result. No template engine,
  no fake projects.
- Generation has a shared conversion/creation service, authenticated route and
  headless command, described in §7. Completed chats and the legacy deck page
  offer the explicit browser action described in §8, preserving original-deck
  access and human edits through stable durable receipt identity. The historical
  partial bridge in `packages/model/legacy.ts` remains separate and is not used
  for durable imports.

## 4. Navigation and guards

- Dashboard ↔ editor over hash history: back/forward remount
  cleanly; refresh reopens the routed project; deletion
  navigates home to the workspace. App navigation, same-page hash links and
  browser Back/Forward share the editor guard. Indexed history is restored before
  an asynchronous choice; Cancel retains the original entry and document.
- Unsaved work is guarded at every exit: project switching reuses
  the switch guard; workspace leave uses the same policy (Save &
  leave only when a project is bound, else Discard/Cancel);
  refresh/close keeps `beforeunload`. Text drafts commit first
  and block on failure; unapplied chart/table grids never enter
  payloads (unchanged policy).
- Permission failures render states, never a stranded editor:
  401 dashboard offers sign-in (App owns the modal), 403/disabled
  and 503/unavailable render honest panels with retry.

## 5. Styling and responsive

- Tailwind v4 tokens (`styles.css`) for all shell chrome; canvas
  SVG internals untouched. Dark follows `data-theme`; the
  existing reduced-motion query covers shell transitions.
- Desktop-first: canvas flex-1; rails fixed width. The top bar and view toolbar
  scroll horizontally without shrinking controls, making late controls reachable.
  Final evidence is recorded in `V2-7A-EVAL.md`. Narrow
  (`useNarrow`, 767px): rails collapse to top-bar toggles and
  reopen as overlays; toolbar scrolls horizontally; zoom/fit and
  editing keep working; dashboard reflows by grid.
- One accent, one danger, one amber; consistent 12px shell type;
  visible focus via native outlines on token backgrounds.

## 6. Assistant boundary (planned, not built)

The Assistant tab is a labeled placeholder: no input, no send,
no history, no implication of edits. The integration contract
for the future slice: turns address the bound project id, submit
envelopes through the engine (`actor: "agent"` + `agentId`),
obey the stale-base conflict path, and record provenance —
exactly the path manual edits already take. No new document
model, no second permission system.

## 7. Generated-source conversion and creation (V2-7B-1)

`src/projects/import-generated.js` orchestrates source snapshot → typed intent →
shared deterministic compilation → scene validation/content/fit/native-export
gates → atomic ProjectStore creation. `src/v2-compile.js` is also used by the
stateless live compiler. It resolves canonical theme/style/mode, plates and
adapter-supplied chrome below HTTP. There is no new semantic vocabulary,
renderer layout or parallel editing representation.

`legacy-conversion.js` audits all 74 schema type names. Fifty have field-gated
mappings; the remaining 24 refuse. Each family's declared typed fields are
checked recursively before conversion, including nested objects and arrays.
Unsupported fields/types, media, true speaker notes, citations, authored flow
orientation, unsupported chart kinds and capacity/fit failures refuse the entire
deck. Visible `speaker_note` becomes visible semantic content. Presenter text
uses canonical locked chrome; default slide numbers and boolean chrome policy
are preserved. Nonempty effective institutional identity/brand/roster content
(base → operator → owner → source metadata) refuses until its adapter is audited.
See the evaluation's exact field matrix; a type name is not blanket support.

`import-source.js` admits only ready, bounded, alias-free regular source files
without active checkpoints or incomplete plans. Source and target require exact
owner identity, including administrators; a local headless operator may import
only ownerless decks. Source bytes and effective identity are rechecked before
persistence. The digest covers raw source/plan, theme/style/mode and normalized
chrome policy. Source files are not modified.

`POST /api/decks/:slug/v2-project` accepts `{requestId, mode?}` through existing
authentication/verification and project-enabled gates. `npm run import-project --
<slug> --request-id <stable-id> [--mode light|dark]` uses the same service; hosted
calls require an existing session via `FORGE_IMPORT_TOKEN`. The legacy
`GET /api/decks/:slug/project` keeps its artifact metadata contract.

Both stores keep `v2_project_imports` receipts keyed by a hash of owner + stable
request identity. Receipt, project and revision zero commit atomically. A retry
returns the current edited project without recompiling, rejects changed source
with 409 and a deleted target with 410. Receipts intentionally outlive target
deletion to prevent silent resurrection. SQLite serializes writes and bounds
cold-process contention; PostgreSQL uses a unique reservation inside the creation
transaction and a separate advisory-locked initialization transaction. No process
local map supplies durability.

The browser scene validator is generated from the canonical scene schema by a
Vite plugin. The Node path keeps runtime AJV validation; the browser receives
equivalent standalone code, avoiding runtime code generation under the unchanged
server CSP. There is no checked-in validator/schema fork. Actual-server browser
checks exercise this policy rather than bypassing it through a static proxy.

"Create with AI" opens the existing chat briefing. The browser handoff below
uses the accepted creation service without changing that generation pipeline.

## 8. Explicit generated-deck handoff (V2-7B-2)

`OpenInEditor` appears in completed presentation chats, including threads with
later turns, and on finalized legacy deck pages. Report actions are unchanged.
The shared `editorHandoff` controller sends the versioned `browser-editor-v1`
request identity to the existing authenticated import route. The service scopes
it by owner/source, so both entry points and reloads replay one durable receipt.
This browser identity is independent of any explicitly requested CLI import.
Remembered source mode is resolved before enabling the action. A failed chat
source read exposes retry rather than silently keeping the action disabled.

The controller coalesces clicks, waits for server confirmation and navigates
through the existing guarded router. Unmount disposes view ownership; hash/token
checks prevent late navigation after context changes. Token storage events and
same-document context changes expose reload guidance without enabling writes
under stale account state. Refusals retain structured diagnostics and focus the
error region; the original deck and saved-project dashboard remain accessible.

Changed source and deleted-target receipts remain refusals. The action never
rotates identity to replace edits, creates another copy implicitly, regenerates a
saved scene or resurrects deletion. It opens a saved editable copy with separate
subsequent edits; it does not synchronize changes back into legacy YAML. No new
conversion types, assets, notes, database tables or security policy are added.
Implementation validation/review status is in [V2-7B-2-EVAL.md](V2-7B-2-EVAL.md).

## 9. Saved-project cover cards (V2-7C-1)

Workspace cards project the first persisted scene through the same sceneToSvg
and scene-driven font loader used by the editor. They add no editor document,
command or mutable layout state. A fixed 16:9 media region contains the slide at
its native proportions, including blank/detached/hidden-element behavior. The
existing title/actions remain below; the cover itself is a labeled Open button.

The thin GET /api/v2/projects/:id/cover?revision=n transport calls
src/projects/cover.js over the selected ProjectStore's canonical getProject.
It reuses exact owner/admin/local policy; foreign/missing projects return 404,
revision mismatch 409, invalid query 400 and oversized preview 413. Responses are
private/no-store and contain only projectId,revision and first scene. The first
scene projection's serialized UTF-8 payload is limited to 2MiB. Metadata lists never include
scene bytes; no cache table, filesystem artifact, migration or retained image
is introduced. The projection is directly callable headlessly with either store.

Each mounted workspace effect owns a fresh loader, including StrictMode replay.
Near-viewport cards subscribe to a two-job queue; jobs have a 15s deadline including
queue/font work. Offscreen/departed leases cancel; late results cannot render or
publish. The memory-only revision LRU holds at most 24 entries/8MiB and clears with
the view/account. Canonical validation and font readiness precede rendering;
cancellation is checked after both awaits. Failed font loads are evicted from
the shared font-promise cache. Failed dynamic rules are released with identity
guards; failed static rules are recreated with their original source and unicode
subset policy. Successful faces remain cached. Unsupported font families are
identified separately. A transient error can retry without disabling the other
card actions.

Token storage events, focus/visibility checks, a one-second same-document check
and action capture invalidate a stale account view into focused Reload recovery.
No previews from a new token are silently loaded into an old account's list.
Implementation and exact validation/review status live in V2-7C-1-EVAL.md and
state; C2 list consolidation reuses the same revision-scoped resource.
