# V2-8I-8 — existing-deck browser Assistant contract

## Authority and baseline

Entry HEAD **3b35c39ea1ec951f5e42624171d106b2c9681fdd**, branch v2,
push origin/v2 only. Accepted implementation **3da0801f64e88f7911f655cee288bb9b750c7c3d**
is independently accepted by [the I7 decision](reviews/V2-8I-7-3da0801.json).
Its closeout is complete; runtime/test/governance bytes at entry match that source.
Original .agents/ and the two untracked prompt documents remain untouched.

The 2026-10-27 continuation authorizes the immediate next planning work. This
was a proposed surface contract. The human has now selected **Existing Assistant
tab (Recommended)** on2026-10-27, authorizing this bounded implementation and
focused offline validation. The [independent plan review](reviews/V2-8I-8-plan-d5f789a.json)
requires the clarifications below, pinned before code. The roadmap
requires agreeing that interaction; the choice now supplies direction. Keep the accepted I7 state/validation until a new
approved implementation exists. No service, browser/build, model or GPU work is
needed to prepare this contract. No live inference, configuration activation,
deployment, irreversible migration or new paid infrastructure is authorized.

## Recommended surface and bounded result

Use the **existing right-rail Assistant tab** in the saved-project editor. Keep
its desktop width and Inspector peer tab; on narrow screens reuse the overlay
rail. A separate chat page is the alternative, but would need a revised contract
for editor context and navigation. The recommended direction adds no new page or
mandatory separate wake button.

The panel contains a saved message timeline, a freeform composer, a visible
current-slide/selected-objects scope, canonical status and proposal cards with
**Approve** / **Reject**. Questions and instructions are normal text, not a
required questionnaire. The first capability edits existing text, chart data and
table cells through accepted semantic tools. No new-deck creation, slide structure,
layout/theme edits, research/search, attachments or provider picker is included.
Those remain in their existing roadmap entries. This does not complete parent V2-8.

Schematic, within the current editor rail:

    Inspector | Assistant
    Saved conversation                 Clear / Export
    You: Shorten this slide's wording.
    Assistant: Proposed wording…       Saved status
    Proposed changes                   Approve / Reject
    Scope: Current slide / Selected objects
    [ Ask a question or describe a change…            ]
    Send                               Cancel processing (when applicable)

Reuse existing semantic colors, typography and controls. Text, data and status
must fit the rail without expanding it or moving the canvas on message/selection
changes. Long messages/proposals wrap and scroll; polling must not steal scroll
position or keyboard focus. Existing tab/open/close actions may resize the stage
as they already do; capture that separately from unexpected content-driven shifts.

## Submission, context and authority

1. **Supported surface.** Bind only an actually loaded saved project with a
   current Bearer session. Standalone fixtures, recoverable/unbound documents,
   missing account and read-only editor states show clear reasons and no
   Send/Approve. Existing stored chat can still be read by its authenticated
   owner when host execution is disabled. No admin foreign-chat bypass or
   ownerless/local-provider routing is added; accepted lower-level local tools
   remain unchanged.
2. **Availability before enabling Send.** Add an owner-bound read-only
   GET /api/v2/projects/:id/conversation/availability, ahead of the existing
   conversation fallback. Return only {ok:true,version:1,enabled:boolean}, private
   no-store, no query/body overrides. Missing/foreign project is the same404;
   absent/invalid private Bearer snapshot is401, ineligible/recreated account403,
   disabled project service503. After private numeric/email eligibility checks,
   use the canonical owner-scoped project read and recheck numeric identity across
   awaits. enabled means the existing hosted Auto/host/wake flags are enabled;
   it is advisory configuration, never provider readiness, budget admission,
   dispatch or completion. No provider/configuration/secret lookup, reservation,
   run claim or worker starts. Every actual action keeps its own current checks.
   Put composition in a shared headless helper with operator parity:
   agent-chat availability --owner OWNER --project ID (no --provider/input).
   It supplies trusted current numeric identity and returns the same projection.
   Hosted flags remain default-off; tests enable only isolated fixtures.
3. **Two-stage immutable capture.** Pin token/session epoch, project, request text
   and selected scope at user intent; after successful bridge settlement finalize
   immutable saved/conversation revisions and the submission payload. All related
   saves/chat requests retain that captured credential and epoch across awaits;
   they cannot reread a replacement token and save under another account. Approval
   retains the clicked stored proposal revision; a human save making it stale
   requires a fresh explicit request, never rebinding the old approval.
   Reject stale callbacks after account/project change, unmount or newer request.
   Use exact authenticated fetch headers and AbortController for UI-owned reads;
   browser abort/disconnect does not cancel durable work. A changed token clears
   private panel state and stops pending retries/polls before another owner's read.
4. **Settle the deck first.** Send/Approve share a parent bridge over the live
   editor. Commit pending inline text through its accepted path, wait for an
   existing save, save dirty engine state and recheck project/session/document and
   engine/saved revisions after awaits. Failed text commit/save/conflict blocks
   the action and preserves the composer. Never submit against a render-only,
   stale, failed-save or mid-save snapshot. Do not reuse an older save response to
   mark newer human edits saved.
5. **Inspector drafts are distinct.** Chart/table grids are component-local,
   Apply-only drafts; saveNow does not commit them. Keep Inspector and Assistant
   panels mounted across tab changes, with inactive content hidden/inert, so
   switching tabs retains those drafts. Register their dirty state with the
   bridge. Send/Approve and saved-scene refresh block while an unapplied data draft
   exists and offer returning to Inspector to Apply/Cancel it; never infer values
   or auto-apply an invalid grid. Preserve existing element/selection/revision
   remount policies, rather than changing every accepted inspector workflow.
6. **Explicit semantic scope.** Offer Current slide and Selected objects (when
   nonempty). Show the actual target before Send; do not expand an in-flight scope
   when selection changes. Readable slide is the current saved slide. Editable
   targets are only semantic text/chart/table elements within that scope, excluding
   locked/hidden objects and protected ancestors; selection contains at most32
   exact object identities and editable targets at most256. Refuse excess/invalid
   scope visibly rather than truncating it. Selection limits **edits**, while the
   readableSlides grant still permits semantic reads of the current saved slide.
   Disclose that boundary beside the scope; do not promise selection-only provider
   visibility merely because the initial read selects objects. With no editable targets use inspect
   mode, with a visible questions-only explanation. Server tools remain authority
   even if a client is altered. No raw scene, coordinates, colors/fonts, API key,
   URL, provider profile, worker ID or claimed approval is supplied as model content.
7. **Bounded single-turn context.** Build the accepted H submission from current
   request and canonical semantic reads, not previous saved messages. Selected
   scope starts with get_selected_elements; Current slide starts with get_slide
   offset0/limit20, with existing bounded semantic read continuation. Fixed UI
   defaults: contextChars48000, maxOutputTokens2048, maxExchanges4, maxToolCalls16,
   maxOutputTokensTotal8192, subject to existing canonical/provider refusals.
   No advanced user budget editor or capability expansion. The UI states that
   each request uses the shown saved slide/selection; earlier chat is saved for
   reference and is not automatically sent to the model. Do not imply memory the
   backend does not implement.
8. **Durable submit then exact wake.** Submit through accepted /conversation/turns.
   Keep one requestKey/body until its result is known; an ambiguous network retry
   reuses it, never invents a replacement key. Acknowledged submission is shown
   as saved, then its exact generation/turnId is woken through I7 during the same
   Send interaction. No owner-wide wake, discovery scan or browser worker. Opening
   or polling the panel never starts execution or spending. On reload/reopen, read
   stored turns first; do not reconstruct an unknown submission from message text.

## Decisions, refresh and recovery

- Render user/reply/proposal content as text, without HTML execution. Proposal
  cards show the stored semantic changes and explicit Approve/Reject; they are
  not locally applied scene patches. Use the exact stored generation, conversation
  revision, proposal ID/revision, saved project revision and stable decision key.
  Approval follows the same draft/save bridge; rejection/cancel/clear do not
  silently save or discard the deck. On conflict refresh metadata and require
  another deliberate decision; do not retry a newly rebound approval automatically.
- After approval, issue exact I7 wake within the same interaction. Existing H/I2
  remains the only queue, approval, lease, edit, cancellation and history authority.
  Show queued/running/succeeded/failed/refused/expired/cancelled from stored state;
  neither202 nor an approved proposal means an edit has completed. Human editing
  can continue; any saved-revision change retains canonical stale-run protection.
- On succeeded saved revision, fetch/validate the authoritative project. Replace
  the editor document only if its project/session and clean engine/saved revision
  still match, no inline/data/title draft or save is pending, and no later local
  mutation occurred during the fetch/prepare. Perform a short guarded attachment,
  preserving the active slide, valid selected IDs, zoom and scroll where possible.
  If those conditions changed, preserve all local work and show that saved changes
  await loading; reuse explicit conflict/save-copy/discard/reload choices. Never
  merge server edits into an unsaved scene or send a duplicate human save of AI work.
- **Undo policy is explicit.** Within an attached document manual undo/redo remains
  session-only. Loading an AI-saved revision uses the existing authoritative reload
  path and clears that session undo/redo, as existing History restoration does.
  Announce this before Approve and after loading; link Version history to restore
  pre-apply content as a new durable revision. Do not claim the toolbar Undo undoes
  a server-applied AI revision, or introduce a second client command replay.
- Only one mutation is pending per panel. Poll canonical read pages sequentially,
  with no overlapping fetch or animation-frame loop. Read pages are capped20;
  initial latest-page loading can use total then a bounded offset read. Preserve
  generation/revision identity across pages and offer Load older. While visible
  and active, poll every2seconds for the first20seconds, then every5seconds, with
  a130second observation budget; stop on a terminal/decision-needed state. Pause
  while hidden/unmounted/signed out; reopen performs a fresh read, never wake.
  Three consecutive read failures stop with an explicit Refresh action. Exhausting
  observation is shown as paused/unknown, not success, failure or cancellation.
- At most one automatic wake retry may follow a valid bounded Retry-After for
  wake-cooldown/host-busy/wake-capacity, with captured session/project/turn still
  current. No indefinite self-retry or provider fallback. Nonretryable disablement,
  auth/stale/budget/refusal states surface directly. An error-only Retry processing
  action can wake the same saved target deliberately, without a second submit or
  approval; it must still re-enter canonical checks. No routine second wake button.
- Cancel remains reachable once submit is durably acknowledged even if wake
  admission is still pending. Supersede/abort only the UI wake request/retry lane
  as needed, then use canonical H cancel for the current bound generation/turn.
  Late wake receipts cannot resurrect an older UI action. Cancel targets the saved generation/turn and uses H cancellation; it does not
  mean merely stopping a fetch, and an already-entered commit can finish. Clear
  requires confirmation that saved visible chat/proposals will be removed and
  pending work cancelled, while deck/history remain. It uses exact generation/
  revision; stale clear requires refreshed confirmation. Export uses accepted
  private conversation export; no raw provider/tool transcript is added.
- Composer text is in-memory for the mounted project only, retained across tabs
  and rail close. No new localStorage/private-draft persistence policy. Project
  navigation/refresh with an unsent message warns explicitly. If deck edits also
  exist, guard choices name both effects: Save presentation/discard message/leave,
  discard edits and message/leave, or Stay. Never auto-send a draft on leave.
  In-flight submission may already have committed; a response that arrives after
  leaving cannot replace another project's state. On reopen show canonical chat.
- On logout/account change/foreign or deleted project, stop callbacks and clear
  private UI state. Preserve accepted manual-document recovery behavior and never
  save old project/chat data under a replacement account. No indefinite polling,
  DOM listeners, retry timers or overlay focus handlers survive disposal.

## Keyboard, responsive behavior and disabled states

Use real tabs with tab/tabpanel relationships and arrow/Home/End navigation.
Inactive panel fields cannot receive focus. Composer has a label; Enter inserts
newline, Ctrl/Cmd+Enter sends when enabled, and IME composition never triggers Send.
Canvas Delete/undo/slide shortcuts must not fire while typing in the panel.
Status announcements are polite and do not reread the entire timeline on every
poll. New messages auto-scroll only near the bottom; otherwise show an unread cue.

Opening the narrow overlay focuses its heading or explicit composer on user
intent, traps focus only while functioning as a modal overlay, and returns focus
to its trigger when closed. Escape closes the topmost confirmation first, then
the rail; it never cancels a turn or discards a draft implicitly. Do not stack
left/right overlays. Inspector selection changes and chat scroll/proposal updates
cannot shift the canvas unexpectedly. Use existing dark/light/reduced-motion tokens.

When unavailable/default-off, show a truthful status and existing owner history
controls; Send/Approve are disabled. Existing manual editing, save, export,
Inspector, History and workspace routing continue. No legacy chat behavior changes.

## Implementation seams and look-ahead

Keep conversation fetch/lifecycle and immutable action state in small framework-free
client modules, with a focused Assistant component and the SceneViewer bridge.
Add only the availability helper/CLI/thin private route needed for truthful
pre-submit availability; do not refactor H/I2/I5/I6/I7 engines or persistence SQL.
No new framework, model SDK, durable queue, schema migration or document authority.

Future semantic creation/research, richer cross-turn context and provider routing
retain their own roadmap contracts. The saved turn/proposal identity and target wake
support them without replacing this panel primitive. General owner-wide fairness
is unnecessary for a known visible turn; no status UI should promise it.

## Focused acceptance gates after direction

Plan four gates, with actual counts recorded after execution rather than invented:

1. Framework-free client contracts: immutable session/project/action binding,
   idempotent retries, bounded scope/context, status/page polling and cleanup,
   draft/save/clean-refresh races, refusal paths and inactive-tab draft preservation.
2. New availability plus transport/operator integration on actual temporary SQLite:
   owner/numeric identity, foreign/admin refusal, default-off/no provider/secret
   resolution, strict inputs, CLI parity and legacy conversation route compatibility.
   Reuse accepted canonical edit/history and I7 evidence; test changed entry seams.
3. One focused serial Chrome file against the production bundle and isolated API,
   using deterministic loopback responses: natural-text Send/proposal/Approve/apply/
   History/reopen, semantic text/chart/table, reject/cancel/clear/export, pending
   text/grid/save/title drafts, stale/multitab/account-switch recovery, read-only/
   default-off, keyboard/IME/Escape/focus, narrow rails and cleanup. Bound each case
   and process group. Build Vite once inside this isolated file and retain its
   actual exit/log separately; never overlap another build/browser. Inspect only
   new-flow desktop light/dark and narrow screenshots, measure canvas rectangles
   around tab/selection/message/proposal states, and report actual counts/deltas.
4. Typecheck. Gate/schema changes need only new/adjacent governance inventory
   checks, not the historical full governance file. React source review and focused
   browser production build supply JS/JSX coverage; do not mistake package typecheck
   for checking legacy JSX.

Correctness, ownership, data integrity, session-undo/history, browser/a11y/responsive,
compatibility and docs are applicable through those flows. No compiler, renderer,
regeneration vocabulary or native PPTX bytes change: reuse accepted export/native
coverage instead of another raster/50cell/119image sweep. No PostgreSQL DDL/query
changes are proposed; PG contracts/fault/browser are unexecuted unless a concrete
new shared-backend concern is found, never passing by implication. No old bulk or
all-browser replay. Browser/build runs wait for a quiet shared-machine window;
planning and lightweight checks proceed while busy. Use no real API/local model,
GPU work, production flags/services or removed I4 infrastructure.

Standing BYOK locale, I7's unresolved initial SQLite wait, synthetic-history limits
and inherited visual/native/live-provider/I4 operational provenance remain explicit.
Required new checks must pass without weakened assertions. Preserve failures,
cancellations, skips/unexecuted cases, exact backend/commands/source hashes and
actual screenshot inspection. No live content-quality or latency qualification.

After scoped implementation: independent exact-source ACCEPT/HOLD with retained
focused evidence and narrow new challenges; update as-built architecture, roadmap,
evaluation, state and handoff, commit/push scoped paths to origin/v2 and stop after
I8. Human surface direction is now pinned; no implicit dependent implementation
or activation follows this approved slice.
