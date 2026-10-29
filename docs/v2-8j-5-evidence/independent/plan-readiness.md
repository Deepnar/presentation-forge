# J5 independent plan readiness

Decision: **READY_FOR_DIRECTION** for plan commit
`1b37cdd674fa680ac15bb266e2e16bf4eff25f05`, initially proposed at
`a20ae631090220e6a36c6eb8901fa1d796e28e34`. Reviewer/context:
`/root/i8_source_review`, separate from planner `/root`. Accepted runtime remains
J4 `665cd0459b0f267b32e808a59046e3d0b914e74f`. Review date:2026-10-29.

The revised contract is a coherent next dependency after J4 deliberately gated
cited project creation. It can preserve live unsaved scenes while creating an
independent, owner-private retained-source set and rebinding only citation source
identity. It does not turn retained identity, anchors or byte ranges into proof of
claim support. Technical readiness supplies no human retention approval or
implementation acceptance.

## Source basis and scope

Read the working agreement, protocol/reviewer/common acceptance instructions,
current state/continuity/handoff/blocker/trap pointers, the J5 contract and active
roadmap entry. Inspected the narrow canonical project/document/history,
source-reader/schema/registry, private transaction refusal, authentication/CLI,
project-client/autosave, SceneViewer and guarded App/router seams. This was not a
repeat of accepted J4 review or validation.

The existing project create path atomically inserts its document and create-history
baseline but explicitly refuses citations (`src/projects/store.js:120`). Both
stores already serialize owner-qualified writes through the parent authority.
J2's reader supplies the bounded catalog scan and canonical selected-body checks
(`src/projects/source-read.js:31` and `:62`), while its table keys and cascading
foreign keys scope retention by project (`src/projects/source-schema.js:6`). A
new narrow copy transaction can combine these primitives; composing existing
public create and resolve calls after unlocking would not satisfy the contract.
The private PostgreSQL refusal bridge must remain intact.

The plan correctly distinguishes saved-revision drift from source-generation
drift. Save-as-new may recover a live document after an original save conflict;
requiring the old saved revision or saving/reloading the original first would
defeat that behavior. Current owner/catalog qualification still refuses every
missing, foreign, corrupt or old-generation referenced source. Selected source
bodies are read in chunks of24 within the single transaction, up to512 sources,
with catalog metadata513 and existing per-body/catalog byte bounds. Rewritten
destination canonical bodies, counts, project bounds and new create history must
be checked before commit. Unrelated source bodies and original history/chat/runs
are excluded.

The proposed HTTP/CLI authority is stricter than a naive reuse of local CRUD's
anonymous fallback: invalid supplied credentials cannot downgrade to owner-null,
and admin CRUD cannot grant private source copying. Existing uncited permissions
stay preserved. Independent copy retention is an explicit new human data-handling
decision. Generic raw cited create/import and central native export refusal remain
closed; later presentation/provider/research work is outside this slice.

## Findings resolved before readiness

1. **Mutable request capture.** Schema reuse did not alone prevent a caller from
   changing owner/project/scenes during validation or lock acquisition. Existing
   source/citation entries capture private requests before awaiting. Commit
   `c5367911f7191dc114fe5a3a2cebb4ea8275f53b` now pins complete bounded synchronous
   capture, top-level/identity/unknown-field rejection and frozen private copies;
   asynchronous validation and all later work use those copies.
2. **Commit uncertainty.** The initial rollback-on-any-commit-fault wording was
   stronger than PostgreSQL's best-effort rollback can establish after lost
   COMMIT acknowledgement (`src/projects/store-postgres.js:185`). The same commit
   now distinguishes confirmed rollback from an unknown complete-copy outcome,
   retaining atomic all-or-none durability and prohibiting automatic retry or a
   false assertion that nothing was created.
3. **Dirty document transfer through the router.** SceneViewer's ordinary Discard
   marks the source abandoned (`:1717`), and ordinary Save calls saveNow (`:1741`).
   Neither can silently authorize the proposed dirty-copy handoff. The same
   correction defines a one-use prepared-copy leave result for the exact confirmed
   snapshot/destination/session/document, final synchronous checks after awaited
   router traversal and validation at destination mount. It preserves normal
   save/discard/cancel navigation and treats intentional remount separately from
   an external discard/unmount.
4. **Save dispatch and publication fence.** SceneViewer recursively drains saves
   at`:1245` independently of its autosave timer. Commit
   `8b7f06a06aaa2a73e6adf37406b0c16c7b25e389` explicitly fences that drain and
   manual/autosave dispatch, permits only an already-dispatched save to settle,
   and guards its late publication. A stale/failing save alone does not veto
   recovery. Only this operation's pause can be released, and only the still-current
   original editor can resume autosave.
5. **Assistant draft outside scenes.** The existing leave guard includes
   `hasDraft()` and ordinary leave discards that text (`SceneViewer.jsx:1710` and
   `:1750`). A confirmed scene copy cannot cover it. Final commit
   `1b37cdd674fa680ac15bb266e2e16bf4eff25f05` refuses entry with an unsent Assistant
   draft, rechecks all drafts before dispatch/final router commit and defers
   adoption if Assistant text appears in flight. Chat is neither discarded,
   submitted nor copied incidentally.

No unresolved material technical planning issue remains. Returned source-rebound
scenes require a fresh engine/empty session undo and an authorized route identity;
merely updating projectRef or a query URL is insufficient. Later edits, drafts,
session changes and navigation must preserve the original editor or suppress late
publication. These are implementation obligations, not observations of working J5
behavior. The inherited await/adoption risk remains source-inspected and
unreproduced until the planned focused delayed-response check establishes it.

## Evidence and stop point

HEAD and origin/v2 were independently read as the final reviewed plan SHA. A
read-only committed diff showed no changes under packages/src/app/test from the
accepted J4 source. Root-owned unstaged continuity/state files and the original
untracked paths were preserved. Only this report and its JSON decision were
written by this review; root owns subsequent commits.

Executed product tests0, database calls0, services0, browser calls0, builds0,
model/search calls0 and Git mutations0. No behavior, screenshot, crash recovery,
database concurrency or performance was independently exercised in this
documentation-only review. Lightweight source/Git reads and review-artifact
consistency are distinct from product execution.

After human approval, the selected new pure/shared actual SQLite+PostgreSQL,
HTTP/CLI, single serial browser file and typecheck are appropriately focused.
The amended planned coverage includes mutation fencing, ambiguous commit/response,
dirty prepared-copy navigation and normal leave choices. Existing/midflight
Assistant draft assertions follow the explicit final contract. Retain failed
attempts and exact source/backend evidence; missing services remain unexecuted.
No old model/browser/native/benchmark matrix is justified here.

Stop at the human decision on same-owner retained-snippet duplication,
independent destination retention, whole-copy source refusal and guarded existing
editor handoff. J4 remains accepted; J5 remains unauthorized until that direction.
Readiness does not authorize implementation, activation, deployment, portable
citation disclosure or subsequent roadmap work.
