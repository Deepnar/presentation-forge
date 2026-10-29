# V2-8J-6-2 — browser citation notes export

Status: **planning; independent technical readiness and human direction pending**.
Accepted baseline `ecf82d3fa74bb7fcfc111e5cbeaf36bcb49fa47d` (J6-1), independently
[accepted](reviews/V2-8J-6-1-ecf82d3f.json). Planning entry
`fa5c6c7b906bccfd01e030bb3fa833a7e2e69bfe`; branch v2, push origin/v2 only.
Current continuation authorizes preparing this contract, not the public transport
or UI implementation. [Roadmap](ROADMAP.md#assistant-citation-browser-export)
is the sole work/dependency registry. Keep J6-1 accepted in development-state.json.

## Recommended surface

Use the **existing Export action**, with a source-notes confirmation only for cited
saved decks. Ordinary uncited downloads retain their direct path and existing
project-CRUD permissions. No new toolbar, chat page, source browser or persistent
consent setting. Cover the saved workspace card, project editor top bar and the
standalone scene viewer's bound-project Projects action. Generated/legacy deck
exports and unsaved standalone fixtures keep their existing paths.

1. In an editor, require a clean saved project before requesting any export.
   Block pending inline/text, grid/table/chart or title drafts, save/rename work,
   dirty/conflicted/failed/unavailable saves, restore/copy or authoritative reload.
   Say “Finish editing and save this presentation before exporting.” Preserve
   every draft and focus. Export itself never commits, saves, discards or reloads.
   A clean saved read-only/Done view remains exportable; leaving Edit does not
   prove cleanliness. Use engine/saved revisions and live refs, not status text.
2. Capture the project, displayed saved revision, token/account identity, route and
   mount/action generation. Request the existing ordinary PowerPoint export.
   Uncited success downloads only if its returned saved revision matches the
   capture and the client is still current/clean. Stale list/editor information
   asks for an explicit refresh/reopen; never silently export a different revision.
3. Only a stable `citation-preservation-required` refusal from that unqualified
   route offers the new notes flow. A generic422/network/auth failure never means
   permission to retry another path. No raw byte file or consent is produced by
   the initial cited refusal.
4. Read exact-owner metadata through the new private endpoint. Show a compact
   modal titled **Export with source notes**, with saved revision and citation
   association count, no retained source titles/URLs/excerpts or source-list preview.
   The revision/count summary is the bounded preview. Inaccessible/stale/corrupt
   state stops the flow with a static message, never a source disclosure.
5. State: **“This PowerPoint file will include full retained source titles and
   URLs in speaker notes, including private query values. Clearing sources or
   deleting this project will not remove notes from a downloaded file. Claim
   support is not assessed. Long notes may overflow printed notes pages.”**
   Buttons: **Cancel** (initial focus) and **Download with source notes**.
   This named button is fresh per-export consent; nothing is prechecked, saved,
   reused, automatically retried or inferred from inspection or the earlier click.
6. Confirm sends one current exact-snapshot request. On a complete qualified
   response and a final current/clean check, create one temporary Blob URL and
   request one browser download. Announce “Download requested,” not a claim that
   the OS saved a file. No automatic retry after a lost/ambiguous response.

Keyboard: Tab/Shift+Tab remain inside the topmost modal, visible focus rings,
Escape cancels/invalidates even during a pending request, backdrop cancels, and
focus returns to the still-connected trigger. Closing makes late completion inert.
Use existing UI tokens/dialog conventions, with an internal scroll area and
reachable actions at narrow320–375px/short viewport/200% zoom. The existing
ConfirmModal blocks cancellation while busy, so it cannot be copied unchanged.
Avoid competing document-level dialog traps in the standalone Projects overlay
or narrow inspector; suspend/compose the parent trap while this modal is topmost.
No layout/canvas/selection/zoom/scroll change or editor-engine replacement occurs.

The alternative is an always-visible export-options dialog for every deck. The
recommended conditional flow preserves the common uncited click and avoids a
new browser source-data preview/retention surface. Human direction must agree this
surface and new owner-only HTTP disclosure before code. J6-1 approved CLI disclosure
only; its acceptance explicitly excluded public/browser transport.

## Thin HTTP over accepted authority

Add a dedicated private family:

- `GET /api/v2/projects/:id/native-export`: J6-1 metadata-only `inspect` result,
  containing only `{ok,snapshot:{projectId,projectRevision,sourceGeneration,
  sourceRevision},citationCount}`. No title, URL, body, handle, approval or renderer
  access. No query/body inputs. HEAD must not accidentally execute a render;
  reject unsupported family methods/paths with bounded private errors.
- `POST /api/v2/projects/:id/native-export`: exact J6-1 request
  `{projectRevision,sourceGeneration,sourceRevision,disclosure:'source-title-url-v1'}`.
  Call the accepted `createProjectCitationExporter(backend).render` once. Do not
  accept scenes, notes, owner/admin overrides, source fields, output options,
  alternative disclosure values or client-prepared receipts. It is an explicit
  notes export, not an uncited fallback endpoint. Zero current citations may
  complete as the same exact qualified snapshot; UI metadata drift still refuses.

Both use one captured trusted Bearer/account binding; no admin source override.
Hosted missing/invalid/unverified credentials refuse. Local owner-null is admitted
only with no supplied credentials; malformed/empty Authorization must never become
anonymous. Bearer has no cookie fallback. A Forge-session cookie without an explicit
Bearer is rejected on this new family, including local mode; unrelated cookies are
not credentials. Browser fetch uses `credentials:'omit'` and the captured Bearer.
Reuse the shared J5/J6 trusted-token policy and verification semantics; sanitize
operation wording. Do not reuse general projectOwner's local catch-to-anonymous
or admin CRUD rule for private source access. Canonical owner rechecks remain in
J6-1's transaction. Missing and foreign projects are indistinguishable.

Before the global8MiB parser, install this family's private headers and a2KiB
UTF-8 JSON identity-encoding parser with static parse/size/type errors. Reject
unexpected query fields and body fields/unsafe values. Match the family in late
raw-path errors too: malformed parameter decoding, unknown suffix/method, invalid
JSON/encoding and unexpected failures never echo body/token/notes or framework
stacks. `Cache-Control: private, no-store`, `Pragma: no-cache`, `Vary: Authorization`
and bounded static JSON errors apply to handled metadata/binary/refusal paths.
No cookie scope/CORS/deployment/authentication policy is widened.

Successful POST has the native PPTX MIME, attachment disposition using a bounded
safe project-ID filename and exact project/source snapshot headers. The browser
validates status/MIME/counters before consuming bytes; never download a JSON/HTML
error as `.pptx`. Do not set binary headers or send partial bytes before qualification,
native coverage and byte-size checks complete. A64MiB complete artifact ceiling
on this new private transport refuses oversized output; this is not a pre-generation
asset-memory/fetch qualification. Bound browser body consumption independently of
Content-Length, abort over the same ceiling, and release partial chunks on refusal.
No server artifact cache, file, history record, consent preference or export job.

Finite admission for POST: at most2 active generations per host process and1 per
owner identity (including one local-null principal); extra calls return busy429
with no queue or automatic retry. Acquire before generation and release exactly
once on every success/refusal/error. Disconnect/abort suppresses delivery; it must
not be claimed to interrupt already-running library generation. Retain the slot
until its actual generation settles. Process-local admission is not a distributed
quota/deadline. Metadata does not generate and stays within J6-1's bounded read.

J6-1 remains the only qualification/renderer authority, with the same canonical
lock release, source bounds, complete literal title/URL notes, native mapping and
empty-authored-scope refusal. A clear/save/delete winning the lock first invalidates
expected counters. Clear/delete after qualified capture cannot revoke portable
bytes; the file represents that point-in-time snapshot. Native library/ZIP or
asset failures return no partial response. Inherited authored scene asset embedding
is unchanged; this adds no notes/source-page fetch or SSRF/fidelity claim.

## Existing ordinary export compatibility

Keep `GET /api/v2/projects/:id/export.pptx` unqualified: cited scenes still422;
query/body disclosure flags cannot enable notes. Preserve uncited general CRUD
permissions, including existing administrator uncited access; never route those
callers through the private source facade as an automatic fallback.
Add only private no-store headers, a stable cited-refusal code and a saved-project
revision response header from the exact document already used to generate bytes.
These HTTP metadata changes supply client freshness checks, not citation authority.
All other preflight, direct raw/file renderer and legacy deck behavior stays.
This contract does not certify or refactor general legacy CRUD authentication;
new source-disclosing endpoints have their own strict owner binding above.

## Client lifecycle and editor invariants

Use one shared component/controller across all saved-project export entry points.
Capture a ticket synchronously before asynchronous work; immutable project ID,
saved revision, token/account generation, route/navigation stamp, mount/action
identity and authoritative editor document identity are checked before dispatch,
after every awaited stage and immediately before link activation. Invalidate on
cancel, unmount, project/route/session/account change, including actual logout/login
transitions back to the same project. A late response cannot open a modal, replace
new status/drafts, create/click a link or publish under a newer session.
Capture fetch so mutable ambient localStorage/cookies cannot substitute authority.
Only the current ticket may clear its own busy/error state.

Editor checks use live refs for pending inline/grid/title edits, dirty engine versus
saved revision, pending save/title request, restore/copy/reload and recovery state;
recheck both before opening confirmation and confirming/downloading. Do not equate
read-only with saved, or call saveNow/commitPendingEdit/engine commands. The export
interaction must not blur-commit an active inline draft as a hidden side effect;
intercept the triggering pointer action early or block before it can settle edits.
Keyboard navigation retains its existing explicit editing policy. Selection/zoom/
panning alone may continue without invalidating the document ticket; export never
restores an old viewport. Unsent Assistant text stays intact and is not exported;
scene-changing AI reload/approval or history restoration invalidates a pending export.

The workspace card supplies the displayed revision and account/navigation capture.
A stale metadata/counter/refusal never silently refreshes consent to a later version;
close and require a deliberate new action after explicit refresh/reopen. Rename
and delete invalidate that card's ticket. Existing failures leave drafts and deck
visible with a local alert; do not show raw server HTML/body/provider errors.

Use a ref synchronously to prevent rapid duplicate starts/confirms. AbortController
bounds late network delivery where available; cancellation remains logically safe
without transport cancellation. Private Blob chunks/URLs stay operation-local, are
never persisted/logged or injected as preview HTML. Remove the temporary anchor in
finally. Revoke an unclicked URL immediately; an already-clicked URL gets a bounded
one-second consumption grace with eventual revocation even if the component unmounts.
The download may already have started when a later route/session change occurs;
never claim cancellation can revoke an already dispatched download.

## Focused implementation evidence after direction

Planning runs source/governance/link checks only, with no product execution/service.
Pin a new focused inventory at implementation entry, preserving accepted J6-1 tests
and evidence rather than rerunning its SQLite/PG/native/visual matrix.

| Gate | Smallest meaningful selected evidence |
|---|---|
| HTTP | One new isolated local API suite for actual new metadata/PPTX POST and cited old-GET refusal, owner/null/foreign/admin and bad-credential no downgrade, strict body/parser/raw-path/private headers, stale counters, output MIME/size and finite slot/error/disconnect cleanup; use accepted domain/store evidence with focused boundary fakes for resource faults |
| Controller | Pure lifecycle cases for captured identity/revision, each async boundary, cancel/ABA navigation/session, duplicate confirm, stale/no retry, capped body consumption, MIME/counter checks and Blob/link cleanup; real guard logic is invoked, not copied into tests |
| Browser | One bounded serial Chrome file with a few combined scenarios: workspace cited confirm/download+cancel and uncited direct control; editor inline/grid/title/dirty/read-only/save/restore/copy/reload blockers with held completions; route/session/unmount suppression; keyboard/nested-modal and narrow confirmation; standalone bound-project action. Preserve actual downloaded bytes for structural notes check and inspect desktop/narrow screenshots/canvas bounds |
| Build | One production web build, reused by the serial browser fixture; no concurrent Vite build or broad old browser run |
| Governance | Exact source/delta/log/totals, screenshots actually viewed, source/schema/links and separate review. No new typed renderer code planned; typecheck only if typed boundary actually changes |

No PostgreSQL fixture is planned: adapters/qualifier do not change. If review finds
an adapter change, revise the focused inventory before the relevant new actual-PG
contract; unavailable means unexecuted. No full old matrix, canonical50cells,
legacy content-quality/GPU/model/search/API-provider call or new native raster is
needed. Reuse accepted J6-1 visual notes evidence; verify one newly downloaded
PPTX's notes relationships/text to establish transport fidelity. No production
activation, paid service, migration or deployment.

Admit the build/Chrome check only after actual CPU/memory/storage headroom and own
process limits are measured. Use one bounded serial nice/idle-I/O process group,
finite watchdog and owned CPU/RSS/I/O observation; leave unrelated work alone and
avoid global-PSI cause attribution. Do not create/reuse old backend fixtures or
repeat completed cleanup. After passing a relevant selected check, repeat only for
new edits/findings; review chooses narrow new challenges, not the whole matrix.

Correctness/security/backward compatibility, read-only data preservation,
accessibility/responsive, new browser/native transport and evidence gates apply.
Engine undo/regeneration/native drawing reuse accepted evidence because no document
command or drawing change is in scope. Standing BYOK locale and inherited J1/I7/I4/
native/print/asset/lock-wait limits stay separate and unrerun. Record exact totals,
all attempts, unexecuted checks and request/download timing without quality claims.

## Acceptance and stop

Before code: obtain independent contract readiness, then explicit human agreement
on the conditional confirmation surface, clean-saved-only editor policy and new
owner-only browser transport. The concrete question must preserve the full-URL
query disclosure, independent downloaded retention, print limit, no automatic save
and offline validation restrictions. Readiness is not user approval.

After direction, implement only this contract, verify the selected actual browser/
transport result, get separate exact-source ACCEPT/HOLD and propagate its decision.
No source snippets enter browser previews/history, no privileged admin source route,
no lost human draft or late/wrong-session download, no cited generic bypass and no
new raw layout/renderer/provider authority. Complete scoped commits/push/handoff,
then stop at J6-2. Further visible/printed citation, research/claim support and
semantic creation remain solely in the roadmap under their own gates.
