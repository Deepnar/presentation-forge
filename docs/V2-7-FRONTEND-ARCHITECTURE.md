# V2-7 Frontend Architecture — unified workspace

Date: 2026-10-14. Baseline `97a12de`. Parent V2-7 in progress.

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
instead. No second router: the hash router gains two routes.

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
- Save state follows `lib/v2project.js` unchanged: the pill
  reflects confirmed PUTs; mid-flight edits stay dirty;
  rename/scene revisions share the durable counter.
- Creation builders (`lib/v2create.js`) produce validated scenes
  (blank, 15 layout skeletons with minted ids); `apiCreate`
  persists them; the router opens the result. No template engine,
  no fake projects.
- Generation (chat → deck.yaml) has NO bridge into V2 projects:
  no translator, route, or UI path exists. Recorded as the V2-7B
  blocker — see §6.

## 4. Navigation and guards

- Dashboard ↔ editor over hash history: back/forward remount
  cleanly; refresh reopens the routed project; deletion
  navigates home to the workspace.
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
- Desktop-first: canvas flex-1; rails fixed width. Narrow
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

## 7. Generation handoff (V2-7B blocker)

"Create with AI" opens the existing chat generation workflow
(`#/chat` deck briefing). What is missing end-to-end: a
translator from generated `deck.yaml` content to validated
Layer-C scenes plus the UI handoff that loads them into a
persisted project. Until that slice, generated decks and saved
presentations are neighboring worlds with a labeled door between
them — never presented as one thing.
