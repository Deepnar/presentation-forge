# V2-8J-6-1 — owner-qualified citation notes export

Status: **independently ready for direction; human approval and implementation pending**.
Exact reviewed contract `ae96d71755114c9dbdbfc209d5c81763a4aa5e3b` is
[READY_FOR_DIRECTION](reviews/V2-8J-6-1-plan-3b6bf65f.json); the stable separate
review was committed unchanged at78ed0744. This supplies no disclosure permission.
Accepted baseline: `f6487737557c20d481cbc3e84216d7144bb116e8` (J5), independently
[accepted](reviews/V2-8J-5-f6487737.json). Planning entry:
`2fb36ad0e2694abfd953722fe5605dfa9e674a62`; branch v2, push origin/v2 only.
[The roadmap](ROADMAP.md#assistant-citation-native-presentation) owns scope and
sequence. This is a proposed bounded contract, not implemented behavior or a
second work list. The current continuation authorizes preparing/reviewing it.

## Recommended direction

Implement a **headless saved-project export with citation speaker notes**, requiring
an explicit owner instruction on each invocation. Notes carry only retained source
**title and complete URL**, with deterministic portable slide/object labels and a
clear “claim support not assessed” statement. Full URLs can include private query
parameters; approved title/URL values can themselves contain identifiers or secret
query values. This is a **field allowlist**, not substring redaction: append no
Forge account/project/source/citation IDs, excerpt/quote, provider, retrieval/
publication, anchor/hash or byte-range fields, and derive no portable label from
those fields. Preserve the approved title/URL values without deleting substrings.
Existing authored slide content remains unchanged.

A downloaded file is an independent copy: clearing sources/deleting the project
cannot revoke its notes. No server export cache, export history, new source
retention or consent preference is stored. This extends disclosure beyond J5's
private same-owner retention, so it needs explicit human data-handling direction.

Speaker notes preserve the visible layout and editable native objects. The
bounded complete text belongs to the native Notes editor; **printable notes-page
fit is not promised**. Long notes can overflow the library’s fixed printed notes
body even when their XML and full text are valid. This contract does not resize
fonts, truncate notes, create continuation slides or claim paper pagination.
Visible on-slide references/appendices, printable notes design and browser export
interaction remain separate
subcontracts in the roadmap. Do not insert hidden slide shapes, mutate scenes or
claim research/grounding support. Browser editing remains the primary workspace;
this slice concerns portable PowerPoint output only.

## Bounded scope, invariants and exclusions

- One canonical project/scene document. Export is read-only: no engine command,
  save, scene/history/undo/source mutation, schema migration or second document.
- Reuse exact-owner canonical parent locking, J2 catalog/body validation, J3/J4
  target/content/range observations and the existing native renderer/preflight.
  Current retained content is not proof of factual support or a prior attachment.
- Owner-null local projects remain available only to the explicit local principal.
  Invalid supplied credentials never downgrade to anonymous access. Hosted owner
  authentication/verification stays required. Admin CRUD grants no private-source
  override; inaccessible and missing project refusal is indistinguishable.
- No public export endpoint, browser UI, generic notes editor, provider context,
  model/search/source-page retrieval, paid service, deployment or production activation.
  No source/citation re-import or round-trip Forge metadata claim.
- Generic renderPptx/preflightScenes/renderPptxToFile calls without qualified
  authority retain cited-scene refusal. Existing saved-project GET export,
  developer/browser and legacy paths gain no source lookup or disclosure flag.
  Generic cited create/import and all existing non-citation native safety checks stay.

## Canonical operation and point-in-time authority

A shared headless `createProjectCitationExporter(backend)` supplies metadata-only
snapshot inspection and rendering. Inspection returns exact current project/source
revision counters and citation count, without titles/URLs/bodies; it grants no
reusable permission. Rendering accepts the exact `{id, owner}` binding and strictly
bounded request `{projectRevision, sourceGeneration, sourceRevision,
disclosure: 'source-title-url-v1'}`. No caller scenes, source body, notes, output
mapping, owner/admin override or renderer bypass field is accepted.

Capture/freeze the complete binding/request synchronously before any await using
the existing descriptor-safe JSON rules. Bind trusted credentials once at the
entry point. A plain acknowledgement, earlier inspection or supplied counters are
not authority: every render re-enters the canonical exact-owner transaction.

Under one canonical parent lock:

1. Read and validate the saved document and expected project revision. Read J2's
   bounded catalog and check expected generation/revision. Never combine separate
   unlocked document/source reads or qualify a live unsaved client snapshot.
2. Validate the complete J4 citation metadata/project binding. Collect every
   citation on every scene, including references whose targets are hidden/orphaned.
   Keep current120-slide/512-citation/128-per-scene structural ceilings; inspect
   the complete catalog accounting (at most513 metadata rows).
3. Resolve only referenced source bodies in chunks of24, with16KiB/source and
   existing512-source/4MiB catalog limits. Qualify each source project, canonical
   identity and current generation; stale/missing/foreign/corrupt references refuse
   the whole export. Never fetch URLs, synthesize sources or silently omit entries.
4. Each target must exist uniquely in its containing scene. Reuse content digests
   and require the saved anchor to match current target content. An attached range
   must be valid against the retained UTF-8 snippet; this observes bounds, not a
   stored quote match. Invalid/unsupported range or changed content refuses rather
   than certifying support. No locator means “not requested,” not an error.
5. Reject references to hidden targets/ancestors or system chrome. Source scope
   and native mappings both exclude system-chrome subtrees, exactly as J4 content
   projection does; that furniture still renders normally. For slide/group
   citations, reject hidden non-chrome descendants within the cited scope rather
   than disclose sources attached to omitted content. Visible ordinary locked
   objects remain exportable: edit protection is not a source disclosure grant or
   export prohibition. Distinguish visibility from J4's combined blocked flag.
6. Capture private immutable scenes and a complete title/URL/target projection.
   Require scalar Unicode. Encode title/URL as quoted literal data, visibly escaping
   C0/C1 controls, CR/LF/tab, Unicode line/paragraph separators and bidi-formatting
   controls before XML escaping, so field data cannot forge labels or direction.
   Preserve their data values through this reversible representation. Emit only
   XML-safe text; malformed surrogates/unsupported data refuse without repair.
   Never interpret HTML, Markdown, instructions, hyperlinks or relationships. Cap generated
   notes at1MiB UTF-8 per slide and4MiB per deck, including target labels; exceeding
   the cap refuses the entire export. Preserve the original URL, including query.

Release the database lock before PPTX/ZIP generation, file I/O or rasterization.
The exported result represents the qualified point-in-time snapshot. Concurrent
clear/delete after release cannot revoke already captured portable content, just
as it cannot revoke a downloaded file; it must not cause mixed-generation output.
A clear/delete/save winning the lock first must invalidate old expected counters.
These are snapshot semantics, not a new lock-wait deadline/cancellation guarantee.
The source/title notes never trigger URL fetching. Existing authored scene image/
background asset embedding remains under its inherited renderer policy; this is
no new fetch grant, asset-hardening change or SSRF qualification. Use embedded
assets in all development fixtures; real network/model/search calls stay forbidden.

## Central renderer and portable mapping

Use one shared renderer. The qualified path passes an **opaque process-local,
single-use prepared authority**, held in a module-private identity map, bound to
its exact immutable scene/projection snapshot and title-URL disclosure policy.
The exporter consumes it immediately; it is never returned, serialized, stored,
placed in an HTTP DTO or given to tools/H/Assistant. The renderer owns the issuer,
private identity map and consume operation. At trusted host assembly, the domain
facade supplies an executable canonical qualification callback; only its completed
qualification can mint the private handle. It is consumed before asynchronous
ZIP/native generation; failures consume it too and no retry reuses it. The facade
returns only the result, never issuer/handle/qualifier access. Existing raw renderer
options and external JSON cannot supply that callback or mint authority.
This is an external-caller boundary, not a sandbox against arbitrary trusted Node
code. Dependency direction is src domain → renderer factory, with renderer using
scene/projection types and callbacks only: no SQL/auth/src/server import or cycle.

The central preflight may lift only the citation-preservation refusal for that
qualified snapshot; chart/table/schema/image/other safety checks remain active.
No public allowCitations/ignoreCitations option, deleting citation arrays to sneak
through raw preflight, or second renderer is permitted. Forged, cloned, consumed,
foreign or mismatched prepared objects must refuse. No general notes option is
introduced for arbitrary unqualified scenes through this capability.

Build portable labels from deterministic scene/draw order, not private IDs. The
notes label each association C1… and identify “this slide” or its rendered object
label(s). Assign deterministic native Selection Pane names to emitted primitives
in the qualified path. A group maps to its actually emitted visible **non-chrome** descendants within
the same J4 anchored scope;
images with multiple native primitives map to all of them. Empty/non-rendered
cited targets refuse. Multiple citations to one source retain each association;
no occurrence is silently deduplicated away.

Keep an ephemeral render trace from authoritative targets to those native names.
Verify exact slide and object coverage against actual generated OOXML after the
existing uniquePptxShapeIds pass; do not equate raw scene IDs with numeric cNvPr
IDs. Unexpected extra slides, ambiguous/missing names or incomplete coverage refuse
before publishing bytes. Notes must map to the corresponding slide relationship,
including slide-level citations. The mapping must not leak original engine IDs.
All slide text/chart/table data, geometry/z-order and native identity normalization
remain intact. No new hyperlink, external relationship or fetching follows a URL
in notes. Notes say explicitly that these are retained sources with unassessed
claim support; never “verified,” “supported” or “exact quote.”

## Headless CLI and publication

Add `npm run export-project -- <id> --output <new-path> --include-source-notes`.
Without the explicit disclosure flag, cited export refuses with a bounded message;
it never silently falls back to uncited or metadata-free output. Reuse captured
trusted-token authentication/verification and backend selection, with no admin
source override. The CLI first observes metadata-only revision counters, then
renders exactly that snapshot. A stale result refuses without automatic retry or
silently changing the version being exported.

Finish qualification, native generation and coverage checks before publishing a
file. Refuse an existing output target. On the local POSIX filesystem, create an
owned0700 temporary directory on the output filesystem and a0600 temporary file;
verify owner/private mode before writing. Flush/close the complete bytes, then
use an exclusive atomic hard-link publish to the final name, retaining0600 mode,
and remove only the owned temporary link/directory. A competing final name must
produce EEXIST, never replacement. If the filesystem cannot provide this private,
exclusive publication, refuse as unsupported; do not fall back to rename-overwrite
or open-final-then-write. No new cross-platform ACL implementation is implied.
Never truncate/replace an existing file or leave a partial final PPTX on refusal. Clean owned temporary resources on every
path, close backend pools and sanitize errors. Publication acknowledgement failure
can leave an unknown complete-file outcome; never claim absence or retry blindly.
Logs/errors contain no private notes or source body. Return private bounded result
metadata, never a reusable source/approval receipt. No server artifact is retained.

Uncited current exports remain usable without new consent. The existing GET and
raw/browser/file renderer entry points continue refusing cited inputs; query/body
flags cannot opt those paths in. This foundation therefore does **not** complete
the parent browser citation-export interaction; the roadmap records that seam.

## Focused verification after human approval

Planning runs no product tests/services. Proposed files/gates below do not exist
or claim results; pin the final inventory at implementation entry.

| Gate | Smallest meaningful new/affected checks |
|---|---|
| Notes domain | New pure cases for input capture, strict fields, complete mappings/labels/disclosure allowlist, stale/hidden/orphan/ambiguous/content/range failures, Unicode/XML and notes capacity; no factual-support claim |
| Notes stores | Shared focused actual SQLite/PostgreSQL contract for exact owner/null/admin boundaries, one-snapshot expected counters, >24 referenced sources, unchanged project/catalog/history and clear/save/delete winning parent-lock races |
| Notes native | One small mixed text/chart/table/group fixture: actual notes XML/relationships/native object mapping, field-allowlist privacy (including approved values containing identifier-like strings), no appended private IDs/excerpts/provider metadata, no notes-URL fetch; qualified capability replay/forgery/mismatch refusal; focused uniqueness and raw direct/file refusal controls |
| Notes CLI/containment | Explicit consent, auth/no downgrade, stale/no retry, 0600 private files/exclusive atomic output/temp cleanup, sanitized failures; current saved GET stays cited422 and uncited success without adding public transport |
| Typecheck | Once for the changed typed renderer boundary |
| Native visual | Rasterize and inspect this small fixture's slides and one representative short notes page serially; demonstrate native text/chart/table content survives and slide layout remains stable against its uncited render control; sample notes inspection is not a general printable-fit claim |

Native visual work must use available local tooling and verify actual notes-page
support. Absent native rendering of the short sample is unexecuted evidence, not a
green XML-only visual claim. Exercise long notes for exact bounded text preservation
and the declared print-limit notice; do not certify them as fitting a printed page.
Stored byte ceilings are resource limits, not typography/fit guarantees. No interactive Microsoft PowerPoint claim is required. Own all new
fixture outputs and do not overwrite historic evidence/original PPTXs.

Reuse accepted J2/J3/J4/J5 evidence for unchanged operations. No full legacy/browser/
PG/fault/50-cell sweep, old screenshots, production build or model/API/search/GPU
run. A tiny stored-HTTP containment check does not justify a browser suite or new
build. Use bounded serial watchdog/nice/CPU limits and own CPU/memory/I/O monitoring;
leave unrelated work alone. PostgreSQL unavailable means unexecuted, not passing.
Only targeted failures/shared-core risks justify expansion. Review inspects these
results and adds narrow new challenges without duplicating them.

Common gates: correctness/security/data integrity/backward compatibility apply to
qualification, consent and output publication; scene ownership/regeneration/undo
apply as exact non-mutation/preservation checks. Native and visual gates apply to
new notes/mapping. Browser/accessibility/responsive gates have no new surface here;
accepted unchanged evidence is reused. Documentation/evidence and deployment-safety
gates apply; no deployment/migration occurs. Standing BYOK locale and prior timing/
I4/native/visual provenance limits stay separate and unrerun.

## Acceptance and stop

Implementation acceptance needs the approved disclosure contract, complete focused
actual-backend/native evidence and separate exact-source review. All associations
must qualify and map, portable fields must stay within the approved allowlist,
raw/public cited paths must still fail closed and no human scene/history may change.
Record tested SHA/delta, all attempts/totals/unexecuted cases, native artifacts and
inspected images, exact resource/fixture ownership and remaining uncertainty.
The human direction question must include complete-URL query disclosure, independent
portable retention and the absence of a general printable notes-page-fit promise.

For **this planning pass**, stop after independent technical readiness, lightweight
documentation checks, scoped push and the concrete human direction question. Leave
J5 accepted and nextCandidate.authorized:false. Readiness does not authorize code,
tests, schema/database work, private disclosure or activation. After approved J6-1
implementation/review, stop at its handoff; later browser/surface, visible citation,
claim/research/semantic work needs its own roadmap contract and direction.
