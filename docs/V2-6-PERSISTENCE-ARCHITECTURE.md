# V2-6 Persistence Architecture — durable projects

Date: 2026-10-13. Baseline `fa557c4` (V2-5K layout gallery).

## 1. What persists and what does not

The durable unit is the **project document** (`packages/projects/`): a
versioned envelope around the ordered authoritative `SlideScene`
collection the command engine owns. The store holds exactly this
document — never the AI prompt, never a DeckIntent, never React state
(selection, drafts, zoom, viewer snapshots), never DOM nodes, handlers,
functions, or class instances.

| survives reload | does not survive |
|---|---|
| project id, title, timestamps | in-memory engine revision (restarts at 0) |
| durable save revision | undo/redo stacks (deferred — see §6) |
| ordered scenes with ids, order, z ranks | applied-envelope id set (replay guard is per session) |
| text runs, shape geometry, chart data, table matrices | open text drafts, unapplied chart/table grids |
| provenance, customized flags, suppressed tombstones | SSE/live-compile state, viewer selection |
| hidden/locked states, groups, recipeId, layoutState | font-load state |

## 2. Document contract (version 1)

`packages/projects/project-document.schema.json` owns the envelope;
each scene re-validates against the Layer-C scene schema on every
write and read. Fields: `id` (`p-` + 24 hex, minted once, never
regenerated), `title`, `schemaVersion: 1`, `revision` (durable save
counter), `createdAt`/`updatedAt`, optional `theme` reference,
optional `origin` creation record, `scenes[1..120]`.

Versioning seam: readers accept exactly version 1. An unknown future
`schemaVersion` refuses with a named error — never a silent repair, and
never a lossy downgrade. Missing optional fields (`theme`, `origin`)
load as absent. Schema failures refuse the whole write; there is no
partial project.

## 3. Storage backend and durability limits

`src/projects/store.js` implements the `ProjectStore` interface
(create/get/list/save/rename/remove) over the **existing** node:sqlite
database (`src/db.js`, table `v2_projects`) — no new dependency. The
interface is the seam: a future hosted database replaces this module
without touching the project model, the engine, or the routes.

Honest limits: this is a local-disk file (WAL journal,
`CONFIG/forge.db` or `FORGE_DB_PATH`), not cloud storage. It survives
process restarts and reboots on the same volume — proven by close/reopen
round-trips in the suite — but not volume loss, image rebuilds without
the mount, or multi-host deployments. A `gitignored` output directory
is deliberately NOT the store.

Crash consistency: one row per project holding the full versioned JSON.
Validation runs before any transaction opens; writers serialize through
one FIFO lane (node:sqlite holds a single open transaction and save
validation awaits AJV, so concurrent writers would otherwise BEGIN
inside each other — the same shape as the engine's own boundary); the
revision check and the write share one `BEGIN IMMEDIATE` transaction.
A failed save leaves the stored row untouched, and the suite asserts
the revision and bytes are intact after every failure class.

## 4. Revision model: two counters, never confused

- **Durable revision** lives on the project document, starts at 0,
  advances by exactly one per successful save or rename.
- **Engine revision** lives in the in-memory document, starts at 0 on
  every load, advances per committed command/undo/redo.

The client binds them: after load, engine 0 ↔ durable N, and
`savedEngineRev` records the engine revision confirmed by the last
PUT. Dirty means the engine moved past it. A save submits
`baseRevision: N` with the full scenes; the store commits iff
`N === stored`. Reloading at engine 0 can never bypass the conflict
contract because the check is on the durable counter, which the client
cannot reset.

Save outcomes are explicit: `saved`, `noop` (identical state, no
advance), `stale-revision` (409 with expected/actual, edits kept),
`invalid-document` (422, edits kept), `storage-unavailable` (503,
editing continues with a warning).

## 5. Concurrency without merging

Optimistic concurrency, no OT, no CRDTs (V2-5A §3 extended to disk).
Two editors on one base produce exactly one winner; the loser gets
`stale-revision` with both numbers and keeps its full unsaved state
with an explicit banner (reload-newer / save-as-new / retry). Proven by
parallel-save tests at the store lane and by a two-Chrome session in
the browser suite. Unsaved client edits are never dropped by a failed
save and never overwritten by a stale one.

## 6. Undo/redo restoration policy

Durable undo history is **deferred, explicitly**. The engine's snapshot
images are a runtime cache under the 200-entry cap; the stored format
carries scenes + revision only. After reload, history is empty and
`canUndo/canRedo` are false — asserted, not implied. What undo would
have restored (abandoned wording, prior geometry) simply never became
durable state, so regeneration sees exactly what was saved. The
envelopes + semantic inverses remain recorded in-session for audit and
replay; a future slice may persist them as an audit log (see §8).

## 7. Server and browser binding

`app/server/v2-projects-routes.js` is a thin transport: body caps
(~6MB, backstopped by the 8MB JSON limit), project-id shape checks
(no traversal — `../`, separators, and 200-char ids refuse with 400),
per-scene validation, and status mapping. No scene logic, no second
deck model, no reinterpretation of slide content.

Hosted policy: local boxes allow anonymous single-user use (the same
standing as ownerless legacy decks); hosted deployments require a
session on every project route (401 otherwise — verified live), owners
scope to their own email, admins see all. `FORGE_V2_PROJECTS=0`
disables the surface entirely.

`app/web/src/lib/v2project.js` owns the client contract: the saved
pill reflects confirmed PUTs only; a save captures the scenes snapshot
plus the engine revision at submit, and marks saved only if the engine
still sits at that revision when the response lands — edits made
mid-flight stay dirty and reschedule. Autosave coalesces rapid edits
into one PUT after a 2s quiet period, never overlaps saves, retries one
transient failure, then surfaces and waits. Open text drafts commit
first (block on failure); unapplied chart/table grids never enter a
payload — only Apply writes, so a save can never capture a half-edited
matrix. Refresh/close warns while dirty or saving.

## 8. Migration and future seams

- Stored `schemaVersion` + exact-version readers (§2).
- `origin.kind` records the creation path for later generated-vs-human
  analytics without re-deriving it from scenes.
- Per-slide provenance/`customized` flags and `suppressed` tombstones
  already distinguish generated, human-authored, customized, and
  detached content — the project level does not duplicate them.
- Future durable undo: persist envelopes + inverses as an append-only
  audit log beside snapshots (the engine already records both shapes).
- Future AI turns: ride the same envelopes with `actor: "agent"`; the
  stale-base rejection is already the turn-conflict primitive.
- Future storage migration: implement `ProjectStore` against the new
  backend; the document, engine, and routes are untouched. A migration
  reads v1 documents and writes v2 — never a silent in-place repair.

## 9. What this slice does not do

No user accounts (reuses the existing session gate), no collaboration
or real-time editing, no sharing links, no file import, no dashboard
redesign, no new layout templates, no renderer changes, no agent
runtime. The persistence layer stores what the editor owns.
