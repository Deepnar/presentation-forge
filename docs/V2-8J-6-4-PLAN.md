# V2-8J-6-4 — editable References appendix, headless first

Status: **proposed; human surface/data-handling direction pending**.
Accepted baseline8d34c95faf7a5c4d9e04dec590b362895d4fd283 (J6-3), independently
[accepted](reviews/V2-8J-6-3-8d34c95f.json). Planning entry HEAD
66f3dfd04504b7458c8636de082c70fc237bba91; branch v2, push origin/v2 only.
[Roadmap](ROADMAP.md#assistant-citation-editable-appendix) owns future scope.
This proposal authorizes no code, product tests, private disclosure or service.
Keep J6-3 accepted in state; readiness is not implementation acceptance.

## Direction proposed for approval

Build an explicitly requested **References appendix** before adding on-slide
source markers. Append deterministically paginated ordinary editable slides after
existing slides. Full retained source titles and URLs appear as literal text;
long entries continue on further pages rather than truncate or shrink below a
readable floor. Existing slides, citation metadata, source registry and theme
remain unchanged. Every appendix page says claim support is not assessed.

The first bounded implementation is headless: an exact-owner preview/apply facade
and CLI. Reopening the saved project in the existing browser editor shows the same
editable appendix scenes; existing qualified notes export renders those same scenes
to native PowerPoint. No new browser control or export mode is part of this slice.
This provides a usable stored document feature while later UI direction remains
separate. The alternative is on-slide source markers first, with their own geometry,
selection and marker-to-reference policy. Do not implement either before direction.

**New disclosure/retention to approve:** full titles and complete URLs, including
private query values, become ordinary scene text in the project and Version
history. Existing project access rules (including administrator access), ordinary
text reads/copies and eligible downloads apply to that copied text. Source clear
and chat clear do not remove it; undo/restore may bring it back from deck history.
Downloaded files keep their copies independently. Source catalog bodies remain
owner-private and unmodified; excerpts, quotes and provider fields are never copied.
A source-notes consent or opening Sources is not consent to this materialization.

## Qualification, consent and one atomic write

- Reuse exact-owner trusted-token authentication, including credential-free local
  null-owner behavior. Supplied invalid tokens never downgrade, and administrator
  privileges cannot resolve or materialize another owner's retained sources.
- Preview uses one canonical saved document/catalog snapshot. Fully validate the
  document and all citation associations, resolving current sources in bounded
  batches. Reuse existing export target/visibility/chrome/content/range rules;
  unavailable, stale, hidden, ambiguous or changed associations refuse the whole
  operation. A valid locator is not verified claim support. Do not compose paged
  public reads across snapshots or omit unresolved associations silently.
- Preview returns bounded counters, unique-reference/association/page counts and
  normalized-design fingerprint, with the retention notice. It grants no write
  authority and includes no excerpts or raw retained bodies. No citation-bearing
  project is a valid empty successful appendix; uncited projects report no work.
- Apply captures strict immutable request/owner before any await, requiring exact
  project revision, source generation/revision, design fingerprint and fresh
  explicit `source-title-url-scene-v1` consent. Requalify inside the existing
  `withCitationTransaction`; use `createDocument` and one human command batch of
  canonical slide operations, then `saveScenes` for one durable revision/history
  entry. Do not call a nested standalone save or introduce a parallel document.
- No renderer/service may write layout geometry outside the deterministic compiler.
  No raw scene input, model tool, provider preparation or automatic approval is
  introduced. Canonical output must pass full project/schema and deterministic
  fit checks. No native rendering runs inside the database transaction; qualified
  native preflight and export parity are proved afterward in focused validation.
- Store no second source registry, source excerpt, consent capability, cached plan
  or private scene manifest. Original scene content/order/ownership/tombstones,
  sources, citation records and earlier history remain exact. No-change/refusal
  writes nothing. Transaction failure rolls back the entire batch and new history.
- Requests are single attempts. An old revision refuses on retry; unknown commit
  acknowledgement is reported as unknown and requires inspecting current history.
  Do not promise automatic retries or exactly-once delivery. Deliberately applying
  a fresh new preview may append another independent snapshot; never find/replace
  or overwrite earlier human-edited References pages.

An already-open editor keeps its own document/drafts and session undo. Headless
insertion does not inject commands into that session or trigger automatic adoption;
its later stale save uses existing conflict handling. Explicit reopen attaches the
new saved document with fresh session undo. Version history supplies durable
restoration, including restoration that brings copied source text back.

## Deterministic composition and future compatibility

Use an internal validated semantic reference list, never model-authored geometry.
Read only qualified title/URL, first occurrence order and containing-slide ordinals.
Deduplicate by exact retained source identity within its generation; equal URLs
alone do not merge distinct sources. Display a sequential reference label and
saved slide numbers, without engine/project/source/citation IDs. Slide numbers
are explicitly labeled as a snapshot at creation; no live on-slide marker mapping
or automatic renumbering after later deck edits is claimed.

Compile ordinary Layer-C native text scenes in `packages/compiler/` using normalized
DesignSystem tokens and existing fit/measurement primitives. Preserve all source
characters, rendering control/bidi characters visibly. Wrap long unbroken URLs and
split a long entry across continued pages at Unicode-safe boundaries; concatenating
content segments recovers the complete displayed title/URL. No links, external
fetches, raster backgrounds or renderer-owned appendix layout. Stable inputs and
compiler format produce identical content/pagination. Collision-free scene/element
identities derive from the captured revision plus reserved namespace and are checked
against the complete project, not minted independently per page.

Resolve the saved theme name/variant through the existing normalized-design adapter.
For absent theme metadata require an explicit existing theme choice; invalid or
changed themes refuse rather than silently adopting a host default. Preview/apply
must use the same design fingerprint. Appendix body/URL text is at least12pt with
at least1.2 line spacing, increasing to any larger theme role floor; headings retain
theme roles. Reserve title, continuation label and unassessed-support notice before
packing entries. Never leave an entry heading stranded from its first content line.
Fitting failure at the floor refuses; it is not a truncated successful page.

Bounds: existing512 project associations/sources,24-body batches,10k target nodes
and128 depth remain. At most120 total saved scenes and the existing6MiB project
JSON-character limit; additionally bound new output to8MiB UTF-8,100k output nodes
and120 new pages. These ceilings are refusals, not fit guarantees. Do not change
existing limits to make an oversized appendix pass. Theme resolution/measurement
has finite work per bounded input; no model/GPU/render call in the compile path.

Human-authorized insertion produces independent editable content. Mark new pages
detached from future semantic regeneration through canonical layout-state commands;
existing pages are not recompiled. Normal edits, deletion, duplication, save and
history restoration work on those scenes. No automatic refresh/clear propagation
is promised. Future refresh/on-slide attribution must preserve human changes and
obtain its own provenance/retention contract; it cannot silently retake ownership.

## CLI and native boundary

Proposed entry: `npm run add-project-references -- ID [--theme NAME]` previews
metadata only. Applying requires explicit expected counters/fingerprint and
`--include-source-text` after preview. Use `FORGE_PROJECT_TOKEN`, existing backend
selection, bounded JSON/error output and exact-owner behavior. Return only counts,
new revision and ordinary success/refusal metadata; do not echo full source values.
Close owned pools and sanitize errors. No server/HTTP/browser route is added here.

Existing raw/unqualified cited PPTX refusal remains. The already accepted qualified
notes export can include saved appendix scenes only with its existing fresh notes
consent and full current qualification. Appending references never grants native
export authority, repairs an invalid citation, adds source fetches, or bypasses
notes/export safeguards. Native text must be editable; no interactive Microsoft
PowerPoint certification is inferred from OOXML and raster evidence.

## Focused evidence after approval

Planning uses documentation/source consistency checks only. Implementation would
pin a focused inventory before code, reusing accepted evidence for unchanged areas:

| Gate | New/affected evidence |
|---|---|
| Compiler/domain | Stable ordering/dedup, Unicode/control text, exact full content, multi-page long entries, orphan headings, readable floors, ID collisions, complete project/node/page/byte limits, target/source/range refusal and strict captured inputs |
| Canonical persistence | Small new shared actual SQLite/PostgreSQL cases: exact owner/admin/null boundaries; catalog/save/clear races; one command/history commit; rollback on fault; stale/unknown outcomes; untouched original scenes/sources/history; new-page edits and restoration |
| CLI/native | Metadata-only preview, explicit disclosure/counter/design binding, no retry/private echo; existing qualified notes export versus raw cited refusal; literal complete native editable text, mappings and IDs |
| Visual | One small long-reference fixture compiled once: browser SVG view and native raster of the same appended scenes; inspect first/continued/last pages, full text endpoints, readable fit and unchanged original-slide render control |
| Typecheck | Once for new typed compiler seam; schema generation/drift only if typed schema actually changes |

No new UI means no production rebuild or full browser interaction suite. A bounded
read-only browser probe may load the saved appended document for parity/visual proof;
it does not justify retesting old editing suites. If probe needs the production
bundle, reuse the accepted build when runtime UI is unchanged. No full legacy,
old PG/fault,50-cell, provider/search/model/GPU or release matrix. PostgreSQL absent
means its selected cases unexecuted and acceptance held, not green. Native visual
tooling absent means visual evidence unexecuted, not a passing XML-only substitute.
Inspect headroom, bound/monitor owned groups, run serial low-priority jobs and leave
unrelated work alone. Independent review inspects retained results and adds one
narrow challenge instead of duplicating the matrix. Preserve BYOK locale separately.

Common correctness/security/data-integrity/history/native/regeneration gates apply
at the affected seams. Browser editing/accessibility/responsive gates have no new
surface and reuse accepted evidence; document insertion and visible/native text
still need the focused proof above. No migration/deployment or paid infrastructure.

## Acceptance and stop

Human approval must explicitly cover appendix-first direction and ordinary scene/
history text disclosure/retention. Exact-owner authority, deterministic readable
pagination, complete preserved values, one atomic canonical save and native/browser
scene parity must pass selected evidence with separate exact-source ACCEPT.
Record all commands/totals, source/delta, failure classifications, resource ownership,
images and remaining limits; update architecture/roadmap/state/handoff only as built.
For this planning turn stop after reviewed concrete proposal, lightweight checks,
scoped push and the direction question. Keep J6-3 accepted and candidate unauthorized.
No implementation/tests, UI, live model/search, activation or dependent work follows
from planning readiness. Later browser controls live only in the roadmap.
