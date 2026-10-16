# V2-7 Frontend Architecture — unified workspace

Updated: 2026-10-16. V2-7A independently accepted at `fe749fb`; V2-7B-1
source `f52d193` is under validation and independent review. Parent V2-7 remains
in progress.

## 1. Product model: Workspace → Project → Editor

One hierarchy, three surfaces, one representation (ProjectStore
documents of Layer-C scenes through the revisioned engine):

- **Workspace** (`#/projects`, `views/Workspace.jsx`) — the entry
  point for saved presentations: project cards from
  `GET /api/v2/projects` only, with open/rename/delete/export/
  history and AI/layout/blank creation. No frontend-only list.
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
- **Center**: the slimmed view toolbar (fixture select, nav,
  zoom, live, projects, edit, add-shapes, text cluster, status),
  banners (edit/save/switch/text conflicts), the canvas, and a
  status line. Canvas keeps the majority of the width.
- **Right rail** (`aside[aria-label="Inspector"]`, fixed 288px):
  Inspector and Assistant tabs. Inspector shows the selection
  readout, the contextual format panel (text/shape/chart/table —
  the same components and commit paths as the old bottom dock),
  and slide properties when nothing is selected. Fixed width is
  load-bearing: swapping panels on selection never moves the
  stage, preserving the V2-5D no-reflow contract the bottom dock
  used to keep (the center column no longer reserves inspector
  space at all).
- Dialogs (projects, history, gallery, present, leave guard) are
  fixed overlays with Escape/backdrop close and focus return to
  the opener.

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
  headless command, described in §7. Chat still opens the legacy deck; there is
  no browser handoff action. The historical partial bridge in
  `packages/model/legacy.ts` remains separate and is not used for durable imports.

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

"Create with AI" still opens the existing chat briefing, whose completion opens
the legacy deck. The remaining browser action is tracked only in
[V2-7B-2](ROADMAP.md#v2-7b-candidate); it is not implemented or authorized here.
