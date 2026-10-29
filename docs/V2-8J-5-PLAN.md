# V2-8J-5 — source-aware copy and safe editor adoption

Status: **proposed; human direction required before implementation**.
The [roadmap](ROADMAP.md#assistant-citation-project-copy) owns this work and its
dependencies. This document is the bounded contract, not implementation evidence.

Accepted baseline: `665cd0459b0f267b32e808a59046e3d0b914e74f` (J4), independently
[accepted](reviews/V2-8J-4-665cd04.json). Planning entry:
`2fa10cc5ee907052ca139bc2092854186d2df6a0`, branch `v2`, push `origin/v2` only.
J4 has no pending validation/review/cleanup gate. This pass changes documentation
only; no product test, database, service, model or search run is needed for planning.

## Recommended decision and bounded result

Extend the existing Save-as-new actions to copy live scenes with **only their
referenced retained snippets** into a new project belonging to the same exact
owner. Rebind source identities atomically and safely install the returned scenes
in a fresh editor session. Preserve unsaved content and the existing controls.

Each destination retains its private snippets independently until its own source
clear or project deletion. Clearing/deleting the original does not revoke copies.
Refuse the entire cited copy when any referenced source is missing, from an old
generation, foreign or corrupt; do not silently drop metadata or invent evidence.
Citation-bearing native export remains refused under the separate presentation
contract. This proposal adds no new provider or research authority.

Human direction is required: J4 approved metadata preservation and copy refusal,
not duplication of retained private snippets or this editor handoff. AGENTS.md
requires direction for user data-handling and major surface/architecture changes;
technical readiness is not that approval. One direction decision covers the
bounded domain/transport/editor result below, followed by independent acceptance.

## Preconditions, invariants and non-goals

- One authoritative scene document, canonical project ownership and history.
  The model never writes layout. No compiler, renderer or DeckIntent redesign.
- Reuse J2 source identity/normalization and J4 citation structural limits.
  Saved metadata stays unverified: source retention, target existence, anchor
  equality, locator validity and factual support remain separate observations.
- No copy of chat, proposals, approvals, runs, source-project history, unrelated
  registry entries or hidden provider transcripts. No automatic provider context.
- No source/citation management UI, new dashboard layout, native attribution,
  speaker notes, factual claim assessment, local/API/model/search call, hosted
  activation, paid infrastructure, deployment or production migration.
- Generic raw create/import must continue refusing nonempty citation arrays.
  Do not add a public allow-citations flag or weaken native preflight.
- Preserve current uncited creation/copy behavior, including its existing CRUD
  permissions. Private-source copying never inherits an admin ownership override.
  No change to accepted H/host/Assistant, source-clear or undo retention policy.

## Domain request and exact ownership

Add a shared headless copy operation, with an explicit adapter capability to
create the destination inside the source project's canonical transaction.
The input is the bound source project ID plus a validated **live** snapshot:
title, scenes and optional theme metadata. The server supplies origin `mixed`;
caller-supplied owner, destination ID, source bodies, catalog counters, provenance,
SQL or permission flags are invalid. Reuse title, scene, dangerous-key and project
payload validation. Validate citations against the source ID before rebinding,
then validate the complete new document against the destination ID.

Before the first await, synchronously capture a bounded plain-JSON clone of the
**complete binding and request**, reject unknown fields/invalid top-level shapes
and identity, and freeze those private copies. Use the existing6MiB JSON-character
and8MiB transport-byte ceilings rather than the smaller source-list DTO limit.
All later asynchronous schema checks, locks, hashes, writes and output use only
that captured request/binding; never reread caller-owned objects after capture.
Mutation while awaiting validation or a lock must not change owner, source ID,
scenes, title or theme. Reuse accepted J2/J4 input fencing, not just their schemas.

Resolve a trusted principal at HTTP/CLI entry, and bind `{id, owner}` exactly.
Hosted requests require the existing authenticated/verification policy; local
anonymous use binds only owner-null projects. An invalid supplied credential
must not become anonymous owner-null access. Admin status supplies no private
source permission. Missing and inaccessible projects have the same refusal shape,
without title, source ID, body or catalog disclosure.

The submitted scenes are the content to copy, including unsaved human changes;
do not reload saved scenes as a substitute or save the original first. A newer
stored project revision alone does **not** refuse this operation: Save-as-new is
also the existing recovery action after a save conflict. Under the source lock,
read the current canonical document/owner and catalog, and qualify every submitted
source reference against that current catalog generation and immutable identity.
An editor's old project revision is not permission to use cleared evidence.

The response contains the new validated project and bounded summary counts plus
the observed source project/catalog revisions. It returns no source bodies or
ID-to-body map. These observations describe this completed snapshot only; they
are not durable receipts, freshness grants or content-support certifications.

## Atomic source copy and preservation

1. Lock/read the source parent with exact owner checks. SQLite uses its serialized
   write transaction; PostgreSQL uses the canonical parent-row lock. Concurrent
   source clear, delete, save and copy serialize through that same authority.
2. Validate source document, live scenes and citation/project limits. Collect at
   most512 distinct referenced IDs; every `source.projectId` must equal the bound
   source and every generation must equal the current catalog generation.
3. Reuse the bounded J2 catalog consistency scan and canonical body reader.
   Resolve selected bodies in chunks of at most24 inside this transaction, rather
   than limiting the whole deck to24 or reading unbounded rows. Keep existing
   per-source16KiB, catalog512/4MiB and metadata513-row ceilings. A corrupt catalog
   refuses even when the corruption concerns an unselected row's byte accounting.
4. Mint a destination ID. Recompute each selected source ID with J2's project-bound
   identity formula and rewrite only each citation's source project/ID/generation.
   New destination generation is0; a nonempty initial catalog has revision1.
   Preserve URL, title, excerpt, publication, original first provider and retrieval
   metadata exactly. Copying is not retrieval. Recheck canonical destination body
   sizes, hashes, total bytes and the final project bounds after rewriting.
5. Preserve slide/element/citation IDs, containing-scene relationships, ordering,
   geometry/style, ownership, tombstones, detached state, anchors and byte ranges.
   IDs are project scoped. Preserve well-formed orphan targets and stale content
   anchors without retargeting or promoting them to verified support; they can be
   reported unresolved later. A missing/stale **source** instead refuses the copy.
6. Insert the destination document, its selected catalog/bodies and its canonical
   revision0 `create` history baseline in one transaction. No other history or
   runtime state is inherited. The original document/catalog/history is unchanged.
   On validation/source/insertion faults, roll back the entire transaction. A
   confirmed rollback leaves no target rows; durability is always all-or-none.
   A lost COMMIT acknowledgement can leave an unknown **complete-copy** outcome,
   not a proven rollback. Report that uncertainty and never retry automatically
   or claim that an ambiguous commit created nothing.

For an uncited snapshot the headless operation may create an empty-source copy;
use J2's empty generation0/revision0 semantics. The browser may retain generic
create for uncited scenes. It must use the source-aware operation for cited scenes
only when the editor is actually bound to that source project. A recoverable
last-project hint is not a binding; an unbound cited snapshot refuses explicitly.

Factor/reuse canonical destination insertion and revision validation without
nested transactions or create-after-source-unlock gaps. Keep the new capability
specific to copy: do not widen H/runtime source or citation transaction wrappers
with arbitrary destination-write authority. Reuse the accepted private domain
refusal bridge so both adapters return the same intentional refusal codes.

## Thin transport, CLI parity and retries

Add `POST /api/v2/projects/:id/copy`, private/no-store, through the shared domain
operation. Use the existing project enable/auth policy, strict input allowlist and
existing6MiB JSON-character bound within the unchanged global8MiB parser limit.
Do not expose source registration/resolution or enlarge global transport limits.
Map malformed input to400/422, inaccessible source to404, stale/missing retained
source to409, capacity to413 and storage failure to503, with bounded private errors.

Add a headless CLI command with the same input JSON and source project binding,
read from a size-bounded file or stdin. Resolve `FORGE_PROJECT_TOKEN` using canonical
session/verification authority; hosted use requires it, local tokenless use only
accesses owner-null projects. It calls the same domain function, writes bounded
JSON/error output, closes owned pools and changes no environment-selected backend.

Keep explicit create semantics: **one deliberate request creates one snapshot**.
There is no durable exactly-once promise, idempotency ledger or automatic retry.
The editor permits one in-flight action and disables duplicate submission. If the
response is lost after commit, creation is unknown; keep the current editor intact
and tell the same session to check the workspace before retrying. Another explicit
request can create another copy. Do not reuse the legacy import-request ledger or
store trusted replay authority in editable origin metadata. A future need for
exactly-once copying requires its own contract, not a false guarantee here.

## Existing editor controls and safe adoption

Apply the same guarded lifecycle to the existing Save-as-new / Save-current-deck
actions for both cited copies and uncited generic creation. No new copy surface
or bulk-copy dashboard action is proposed.

- At entry, require a writable current document; reject unapplied chart/table or
  title drafts/title requests and an unsent Assistant draft with a useful
  existing-surface message. Reuse the Assistant's `hasDraft()` leave safeguard;
  chat text is outside the copied scene snapshot and must not be silently
  discarded, submitted or copied. Commit an
  inline text draft under the captured document/session guard; failed commit
  retains the draft and sends no copy request. Recheck after every await.
- Fence pending saves: pause future autosave and manual-save dispatch, cancel its
  timer and fence the independent recursive `saveNow` drain continuation. Allow
  only an already dispatched save to settle before recapturing project identity
  and the live snapshot. A stale/failing save alone must not veto Save-as-new
  recovery. Its success/error publication must retain captured session/document
  guards so it cannot repaint an adopted project or a new account. Do not trigger
  another save or drain merely to copy. Recheck grid/title/inline/Assistant drafts and
  auth/document identity before dispatch.
- Capture the account/session token, mounted viewer, document identity, abandonment
  state, project ID/revision, engine revision, all draft state and viewport. Pin request
  authorization to that captured session, including anonymous local identity;
  never substitute whichever account happens to be current after an await.
- Edits may continue during the request. A successful response does not mark those
  later edits saved. Recheck the entire captured state immediately before adoption,
  including after asynchronous engine preparation and at the router transition.
- If unchanged, install returned authoritative rewritten scenes in a **fresh**
  engine with empty session undo. Keep the original deck and its durable history;
  the copy starts its own history. Retain slide/selection/zoom/scroll where valid,
  and explain the session-undo reset through the existing status surface.
- Embedded mode must use the existing guarded hash router. Carry a one-use,
  session-bound prepared-copy handoff through the authorized transition/remount;
  final freshness checks, including `hasDraft()`, precede replacement of the source editor. Do not just
  change `projectRef`, bypass ordinary leave guards, rewrite its query URL, or
  remount from the older source snapshot. Standalone mode keeps its existing
  project-query convention after the same guarded installation.
- Give copy adoption an explicit prepared-copy-aware leave result. It may release
  the exact original snapshot only because that same snapshot is confirmed saved
  in this destination; it must not call the ordinary Discard branch, save the
  original, mark it abandoned or interpret a user Discard as copy authorization.
  Consume this one-use handoff for only its captured destination/session/document
  at the final synchronous router commit, after any awaited history traversal.
  Then the intentional source remount/unmount is part of this handoff, distinct
  from an external discard/unmount. Cancel, another route, edit/draft drift (also
  newly entered Assistant text) or an
  auth change invalidates adoption and keeps ordinary save/discard/cancel policy.
  The destination mount must still validate the bound handoff before installation.
- If new edits/drafts/pending saves prevent adoption, keep the source editor,
  drafts, undo and truthful dirty/conflict state. The committed copy is available
  through the existing workspace. Show a bounded copy-saved/adoption-deferred
  notice only to the captured session; do not navigate or mark the source saved.
- If the account, document or route changed, the viewer unmounted or the source
  was discarded, suppress late success/error/save-state/last-project/URL updates.
  Do not reveal the old account's copy identity in a new session. A copy already
  committed remains private to its owner; aborting fetch is not rollback.
- On refusal/failure keep the current engine/drafts/undo and honest save status.
  Release only this operation's pause/busy state. Resume autosave only for the
  still-current original editor and never save old source IDs into the new copy.

The existing await/adoption hazard is source-inspected at the planning entry,
not reproduced. Establish a narrow failing delayed-response test before calling
it a regression or claiming a correction.

## Focused verification after approval

Use offline fixtures only. Proposed new test filenames below identify focused
gates; they do not claim files or results already exist. Register the approved
inventory with the protocol validator/state when implementation starts.

| Gate | Selected behavior and proposed invocation |
|---|---|
| `copy-contract` | `node --test test/v2-project-copy-8j.test.js`: pre-await mutable-input fencing, exact rebind/preservation, duplicate-source deduplication, limits, orphan/content-anchor preservation, stale/missing/foreign/corrupt refusal |
| `copy-sqlite` | `node --test test/v2-project-copy-sqlite-8j.test.js`: real adapter atomic project/catalog/history, exact-owner/null/admin refusal, live unsaved and save-conflict recovery, independent clear/delete, >24 selected sources, fault rollback |
| `copy-postgres` | `node --test test/v2-project-copy-postgres-8j.test.js`: same shared focused contract on actual PostgreSQL plus one parent-lock copy-versus-clear/delete race; unavailable is unexecuted, never passing |
| `copy-transport` | `node --test test/v2-project-copy-transport-8j.test.js`: thin HTTP/CLI parity, captured credentials/no anonymous downgrade, input/privacy/size errors, ambiguous commit/response and no retries, generic cited-create/native refusal remains |
| `copy-browser` | `node --test test/v2-project-copy-chrome-8j.test.js`: actual dirty Save-as-new with unsaved edits and cited fixture; prepared-copy leave/fresh undo, embedded and standalone identity/reopen, pending drafts, delayed-response edit/session/navigation guards, ordinary leave choices and truthful failure; one new focused file only |
| `typecheck` | `npm run typecheck` once after relevant source changes |

Keep shared scenarios in one adapter contract rather than duplicating assertions
by backend. Combine related cases where that keeps a meaningful check small.
Run browser/build work once in bounded serial isolation in a quiet window; retain
the harness's one production build as build evidence rather than duplicate it.
Use a watchdog and honest leaf pass/fail/skip/cancel/unexecuted totals. Inspect final
wide/narrow copy-status screenshots for overlap/clipping and compare canvas bounds,
selection and viewport before/after adoption. Record copy duration/source count and
bounded-read sizes from the >24 fixture; no benchmark sweep or model-quality claim.

Reuse accepted J2/J3/J4 evidence for unchanged operations. Do not rerun the legacy
bulk/browser/PG/fault/50-cell matrix, old Assistant suites, native raster renders or
GPU/model work. Expand only for a concrete failure or newly exposed shared-core
risk. Before any necessary owned PG fixture, inspect shared-machine pressure and
follow current fixture ownership/actual-catalog cleanup rules. Never recreate or
repeat completed I4/J2/J3/J4 cleanup. Run new challenges in independent review,
not a duplicate of the entire implementation selection.

Common gates: architecture/security/data integrity/backward compatibility apply
to domain, adapters and transport; undo/ownership/regeneration apply to byte-exact
preservation and fresh-session adoption, not a new compiler run. Browser/accessibility/
responsive gates apply to the changed existing actions, focus/status and viewport.
Native gate is central refusal containment only; no fidelity/visual export claim.
Deployment gate prohibits activation/migration. Documentation/evidence and focused
regression gates apply fully. Standing BYOK locale, earlier J1/I7 timing and
native/visual/I4 provenance limitations remain separate and unrerun.

## Acceptance and stop

Acceptance requires the complete bounded result, selected gates and exact-source
independent review: source-copy all-or-nothing, current owner/catalog authority,
private retention independence, no live-edit loss, truthful save/adoption behavior,
unchanged generic cited-create/export refusal and no provider/host expansion.
The implementer cannot accept its own work. Keep source manifest/logs, backend,
all attempts and exact totals, screenshots inspected, exclusions and residual
uncertainty in `V2-8J-5-EVAL.md` only after implementation; update architecture as
built then. Propagate roadmap/state/continuity and push scoped commits to origin/v2.

For this planning pass, stop after independently reviewed contract, lightweight
documentation checks, scoped commit/push and the concrete human direction question.
Leave J4 accepted and `nextCandidate.authorized:false`; no runtime/test/schema/
database change is authorized by readiness. After approved implementation/review,
stop at this slice's handoff. Later presentation/claim/research/semantic work stays
in the roadmap and requires its own direction.
