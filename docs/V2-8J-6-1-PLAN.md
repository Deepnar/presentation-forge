# V2-8J-6-1 — owner-qualified citation notes export

Status: **proposed; human direction and implementation pending**.
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
parameters. Excerpts, quotes, provider names, retrieval/publication metadata,
account/project/source/citation IDs, content hashes and byte ranges are excluded
from added portable metadata. Existing authored slide content remains unchanged.

A downloaded file is an independent copy: clearing sources/deleting the project
cannot revoke its notes. No server export cache, export history, new source
retention or consent preference is stored. This extends disclosure beyond J5's
private same-owner retention, so it needs explicit human data-handling direction.

Speaker notes preserve the visible layout and editable native objects. Visible
on-slide references/appendices and the browser export interaction remain separate
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
  model/search/network retrieval, paid service, deployment or production activation.
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
5. Reject references to hidden targets/ancestors or system chrome. For slide/group
   citations, reject hidden non-chrome descendants within the cited scope rather
   than disclose sources attached to omitted content. Visible ordinary locked
   objects remain exportable: edit protection is not a source disclosure grant or
   export prohibition. Distinguish visibility from J4's combined blocked flag.
6. Capture private immutable scenes and a complete title/URL/target projection.
   Validate all text as scalar Unicode and XML-safe. Quote/escape title/URL fields
   as data so embedded newlines/control-like strings cannot forge notes entries;
   do not interpret HTML, Markdown, instructions, hyperlinks or relationships.
   Refuse unsupported text rather than repair, truncate or fetch it. Cap generated
   notes at1MiB UTF-8 per slide and4MiB per deck, including target labels; exceeding
   the cap refuses the entire export. Preserve the original URL, including query.

Release the database lock before PPTX/ZIP generation, file I/O or rasterization.
The exported result represents the qualified point-in-time snapshot. Concurrent
clear/delete after release cannot revoke already captured portable content, just
as it cannot revoke a downloaded file; it must not cause mixed-generation output.
A clear/delete/save winning the lock first must invalidate old expected counters.
These are snapshot semantics, not a new lock-wait deadline/cancellation guarantee.

## Central renderer and portable mapping

Use one shared renderer. The qualified path passes an **opaque process-local,
single-use prepared authority**, held in a module-private identity map, bound to
its exact immutable scene/projection snapshot and title-URL disclosure policy.
The exporter consumes it immediately; it is never returned, serialized, stored,
placed in an HTTP DTO or given to tools/H/Assistant. The mint/consume seam is
trusted host assembly only, not a public renderer flag or external JSON API.
This is an external-caller boundary, not a sandbox against arbitrary trusted Node
code. Inspect package import direction before implementation; keep scene types
and rendering free of SQL/auth/server imports and avoid a circular dependency.

The central preflight may lift only the citation-preservation refusal for that
qualified snapshot; chart/table/schema/image/other safety checks remain active.
No public allowCitations/ignoreCitations option, deleting citation arrays to sneak
through raw preflight, or second renderer is permitted. Forged, cloned, consumed,
foreign or mismatched prepared objects must refuse. No general notes option is
introduced for arbitrary unqualified scenes through this capability.

Build portable labels from deterministic scene/draw order, not private IDs. The
notes label each association C1… and identify “this slide” or its rendered object
label(s). Assign deterministic native Selection Pane names to emitted primitives
in the qualified path. A group maps to its actually emitted visible descendants;
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
file. Refuse an existing output target, use an owned same-directory temporary file
and an exclusive publish operation; never truncate/replace an existing file or
leave a partial final PPTX on refusal. Clean owned temporary resources on every
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
| Notes native | One small mixed text/chart/table/group fixture: actual notes XML/relationships/native object mapping, no added private IDs/excerpts/provider metadata, no URL fetch; qualified capability replay/forgery/mismatch refusal; focused uniqueness and raw direct/file refusal controls |
| Notes CLI/containment | Explicit consent, auth/no downgrade, stale/no retry, exclusive output/temp cleanup, sanitized failures; current saved GET stays cited422 and uncited success without adding public transport |
| Typecheck | Once for the changed typed renderer boundary |
| Native visual | Rasterize and inspect this small fixture's slides and notes pages serially; demonstrate native text/chart/table content survives, notes do not overlap/clip and slide layout remains stable against its uncited render control |

Native visual work must use available local tooling and verify actual notes-page
support; absent native notes rendering is unexecuted evidence, not a green XML-only
visual claim. No interactive Microsoft PowerPoint claim is required. Own all new
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

For **this planning pass**, stop after independent technical readiness, lightweight
documentation checks, scoped push and the concrete human direction question. Leave
J5 accepted and nextCandidate.authorized:false. Readiness does not authorize code,
tests, schema/database work, private disclosure or activation. After approved J6-1
implementation/review, stop at its handoff; later browser/surface, visible citation,
claim/research/semantic work needs its own roadmap contract and direction.
