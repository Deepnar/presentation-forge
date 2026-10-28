# V2-8J-4 — revisioned citation metadata and lifecycle

Status: **proposed; human architecture/data-handling direction pending**.
This document proposes implementation scope; it is not authorization or acceptance.
The [roadmap](ROADMAP.md#assistant-citation-lifecycle) owns the work and dependencies.

Accepted baseline: `edda5ec7c2105bebff4a429a04b3fbe5b09048b4` (J3), independently
[accepted](reviews/V2-8J-3-edda5ec.json). Planning entry:
`309ced20e1f72510a352e4bc769d2f69797acf94`, branch `v2`, push `origin/v2` only.
J2/J3 runtime and their evidence remain accepted; this planning pass changes no
product, schema, tests, database or service. There are no remaining J3 gates.

## Proposed decision and bounded result

Save small, unverified citation records **inside authoritative SlideScene**, with
headless owner-bound attachment/removal/inspection, validated commands and exact
undo/history preservation. Store IDs, a source generation, optional snippet byte
ranges and a content hash. Store no new source bodies, quotes, claims or trust flags.
Qualify each use against current owner/document/catalog state; saved metadata is
never a receipt, approval, provider grant or proof of support.

Recommend explicitly refusing citation-bearing **new-project creation/copy and
native PPTX export** in this slice. Existing uncited flows continue. Source-aware
copy and visible/native citation presentation need their own contracts, recorded
in the roadmap. No metadata may be silently stripped to make either path work.
This bounds the work without pretending the parent citation-integrity item is done.

Human direction is required because J3 approved read-only observations; this adds
authoritative metadata retained through deck history and changes cited-deck copy/
export behaviour. Technical readiness cannot supply that policy approval.

## Preconditions, invariants and non-goals

- Reuse J2 immutable private sources and J3 exact target/scalar locator checks.
  Recheck within the write transaction; an earlier J3 observation grants nothing.
- One scene document, canonical project revision and canonical Version history.
  No sidecar citation document, receipt ledger, new queue or parallel edit cursor.
- The model never writes layout. DeckIntent, tool catalogs, provider projections,
  research grants, H approval/run authority and Assistant surfaces do not expand.
- Existing projects with no citations retain their byte-preserving semantics.
  No backfill, old-project migration or automatic citation invention from legacy
  sourceRefs/evidenceRefs. Old readers must refuse unsupported fields, not drop them.
- No citation UI, HTTP/CLI exposure, provider context, model/search/network call,
  fetched page/file/DOI locator, factual support assessment, visual footnote,
  speaker note, hosted activation, deployment or production migration.
- No frontend Save-as-new race correction here: the inspected risk and future
  source-aware copy integration belong to their separate roadmap entry.

## Authoritative representation and admission

Add optional scene-level `citations`, absent by default; records have exactly:

```text
{ version: 1,
  id: "cit_" + 32 lowercase hexadecimal digits,
  target: { kind: "slide", slideId }
        | { kind: "element", slideId, elementId },
  source: { projectId, id: "src_" + 64 lowercase hexadecimal digits, generation },
  anchor: { kind: "content-sha256-v1", digest: 64 lowercase hexadecimal digits },
  locator?: { kind: "snippet-utf8-v1", startByte, endByte }
}
```

IDs/integers use J3/J2 bounds and safe nonnegative generation. Locator has J3's
nonempty half-open input ceiling8192; no saved quote. No unknown/null fields.
Maximum128 records per scene,512 per project,2KiB UTF-8 JSON per record and1MiB
aggregate citation JSON per project, within the existing project payload limit.
Citation IDs are project-wide unique; exact duplicate target/source/generation/
locator tuples **within one containing scene** refuse rather than silently merge.
The same tuple may occur in different scenes, including a preserved orphan after
slide duplication; it never authorizes following a target out of its container.
Empty arrays are accepted and preserved; removal of the last record uses absence
canonically.

Scene shape validation checks structural limits. Project validation additionally
requires every `source.projectId` to equal the canonical document ID; there is no
foreign/global source lookup. Cover generic create/save, runtime saveScenes and
history restore in **both** adapters, plus engine initialization, inserted scenes
and element/slide payload ingress. Do not assume the new attachment operation is
the only way to receive scene metadata. Element-local citation fields stay invalid.

Metadata on generic saves/restores is **unverified data**: missing targets/sources,
old generations and changed anchors may persist. They never certify that a source
existed or an attachment operation happened. This deliberately permits legitimate
session undo (200 snapshots) after durable history payload pruning (20 snapshots)
and source clear. A current-doc/history-membership allowlist would incorrectly
reject such undo; no new provenance ledger is proposed. Source IDs alone disclose
no body and confer no read or execution privilege. Forged well-formed metadata is
also unverified; derived results never promote it into factual support or approval.

Generic new-project creation rejects any nonempty citation array before writes,
including copied/imported/raw scenes; callers cannot claim the new server-minted
project ID. No partial project/history/source catalog or metadata stripping.
Existing-project saves cannot introduce foreign project bindings. Existing admin
CRUD authority is unchanged, but never becomes private-source resolution authority.

## Headless operations and canonical atomicity

Add a strict headless citation domain with exact `{id, owner}` binding, captured
deeply before awaits using J3's owner/null-owner policy, with no admin option.
Three bounded operations, each at most24 distinct citation IDs and384KiB DTO:

- **Attach/replace:** request current projectRevision, sourceGeneration,
  sourceRevision and changes `{mode:"add"|"replace", id, target, sourceId,
  locator?}`. Optional locator is the full J3 request form including transient
  quote. Add requires unused ID; replace requires existing ID. Duplicate changes,
  missing replace IDs and duplicate tuples refuse the complete request.
- **Remove:** request projectRevision and existing citation IDs. No catalog token
  or source-body resolution is needed to remove unresolved records. Unknown or
  duplicate IDs refuse the complete request, without an existence oracle across
  projects. A missing target never prevents removal of its metadata.
- **Inspect:** request projectRevision, sourceGeneration, sourceRevision and
  existing citation IDs; qualify saved records only. It never attaches/refreshes
  an anchor, changes a locator, registers a source or returns a source body.

Enter one canonical exact-owner parent-locked transaction; validate current saved
revision before any result/write. Attach/inspect also require the exact current
catalog generation/revision and reuse transaction-local J2 catalog/body validators.
No nested registry/checker transaction, release/reacquire gap or duplicated SQL.
Expose only the narrow internal transaction seam needed for shared validation and
canonical saveScenes/history; do not widen H's error, save or approval interfaces.
Retain the PostgreSQL deliberate-refusal-through-rollback bridge and existing lock
wait semantics. No provider/network work under the lock and no abandoned timeout
Promise. Cardinality limits do not imply a new wall-clock/cancellation guarantee.

For attachment require exactly one current target, current-generation retained
source and, when requested, scalar-valid exact quote match. Reject locked/hidden
element targets, protected ancestors and system chrome; a group also refuses if
its authored descendant scope includes a locked/hidden/protected node. A slide
association targets the slide as a whole, not permission to alter locked chrome.
Removal changes metadata only and may remove records from locked/hidden/missing
targets; it grants no scene-content edit. Existing general lock rules stay intact.

Compute the anchor from the captured target and save only the locator's range.
Run validated `citation.put`/`citation.remove` operations through the revisioned
engine as one atomic batch, then persist scenes plus canonical history in the same
transaction. Internal engine commands carry schema-valid **unverified** records;
they cannot resolve sources or attest ownership. New citation commands are denied
to actor:agent and excluded from H/content-tool schemas/allowlists. Also refuse
actor:agent payloads newly supplying/altering citation metadata through generic
ingress, including full citation-bearing slide.insert payloads; checking only the
new command names is insufficient. Ordinary agent content/style edits preserve
existing records byte-for-byte. Existing same-project slide duplication may use
the engine-owned deterministic citation remapping below, not caller-supplied
metadata; this adds no tool/H grant. Canonical undo/redo restores exact snapshots
through the engine's existing private restoration path. Browser human edits may
preserve metadata through the existing full-scene save path without gaining a
qualified attachment or private-source read capability.

A complete no-op replace changes no project/history/catalog counters. Successful
changed attachment/removal advances project revision once with one canonical
history event; source counters/bodies, title/theme, chat and other scene bytes stay
unchanged. A partial failure or history-write failure rolls back everything.
Deep-freeze complete bounded results; static sanitized errors, no raw input/SQL/
quote/hash-source text in diagnostics. Pin exact schemas/error enums during
implementation, preserving J3's private not-found and stale/invalid distinctions.

## Content anchors and current observations

Use one browser-safe, pure versioned projection and asynchronous WebCrypto SHA-256
helper, with no Node crypto/fs import into model/engine/compiler/browser modules.
Hash UTF-8 of JSON.stringify(["forge-citation-content-v1", projection]); hash the
captured immutable JSON projection before publishing or committing any operation.
The projection is an ordered tuple vocabulary, never object-key-order dependent:

- text: kind plus ordered paragraphs, each bullet boolean and concatenated run
  text; run/style segmentation does not change wording, paragraph boundaries do;
- chart: kind, chartKind, categories, series names and numeric values in order;
- table: kind, header-or-null and ordered cell rows;
- image: kind, exact src and alt-or-null strings; no fetching or image-byte claim;
- shape/line: kind only; geometry/style has no authored semantic payload here;
- group/slide: kind plus ordered authored child projections. System chrome is
  excluded using the canonical isSystemChrome policy; hidden authored content is
  included. IDs, semanticRef, recipe/layout, geometry, style, locks, visibility,
  provenance, ownership flags, tombstones and citation metadata are excluded.

The scene schema permits absent kind-specific payloads. Project an absent text,
chart, table, image or group payload as the explicit tuple [kind, null], rather
than throwing or confusing it with a present empty payload. A slide always uses
its schema-required elements. Image fields come from element.image, text from
element.paragraphs; absent optional fields use the stated null/false defaults.

Preserve exact wording, Unicode, BOM and line endings; JSON escaping retains
unpaired UTF-16 surrogates losslessly before encoding. No normalization/repair.
Finite numbers use JSON number serialization (-0 becomes0). Anchors compare
authored content only; equality is neither source support nor visual equivalence.
Reuse iterative exact-ID traversal, at most10000 total nodes/depth128 over the
distinct inspected slides, and cap aggregate serialized projection input at384KiB
per operation. Overflow refuses the operation, never truncates an anchor. These
are citation operation limits, not new limits on ordinary uncited editing.

Inspect returns snapshot project/catalog tokens and one result per requested ID:
target present/missing/ambiguous/scope-mismatch; content current/changed/unavailable;
source retained/missing/stale-generation; locator not-requested/range-valid/invalid/
unavailable/unsupported-excerpt; **claimSupport:not-assessed** always. Target scope
must match the containing scene; never follow an orphan into another slide.
Missing/ambiguous/scope-mismatch means content unavailable. A source-generation
mismatch takes precedence over body lookup; never revive old references merely
because identical snippets were registered again after clear. Absent locator is
always not-requested; missing/stale source makes a requested locator unavailable;
retained lone-surrogate excerpts remain unsupported before byte encoding, otherwise
reuse J3 scalar/range bounds. A saved range has no quote and cannot yield J3's
quote-matched status. Output contains no source URL/title/excerpt/quote/content
projection or stored trust flag. Corrupt selected state/budget/stale/storage errors
produce whole-request refusal, with no partial observations.

Every result can become stale immediately after release and grants no reusable
approval/retention/attachment capability. Generic forged anchors may compare equal;
the only assertion is equality of current projected content to stored hash.

## Edit, regeneration, undo and history lifecycle

Ordinary text/chart/table/content edits preserve records and old anchors verbatim;
inspection reports changed content. Geometry/style/lock/visibility changes preserve
records too; they do not refresh evidence. Deletion leaves an explicit orphan
until removal; undo restores the exact target and metadata. Slide deletion removes
its scene-owned records; undo/history restores them without recreating sources.

Same-project slide duplication remints citation IDs and uniquely mapped exact
slide/element target IDs. Build an old-ID cardinality-aware mapping alongside the
existing recursive element-ID reminting; that mapping does not exist today. Keep
source project/generation, locator and anchor unchanged. Citation IDs are labels,
not capabilities: deterministically increment the original128-bit hexadecimal
suffix modulo2^128 until unused in the complete deck citation-ID set, reserving
each result before the next record (at most513 candidates under the project cap).
Do not suffix a fixed-format ID with "-copy" or add random replay differences.
Missing, ambiguous or already
scope-mismatched targets keep their old target tuple, so the duplicate reports
scope-mismatch and cannot accidentally bind a new element. Never semanticRef
retarget or silently discard records. Deck-wide citation-ID/capacity checks apply
atomically, including duplicate/insert batches and exact undo/redo snapshots.

Recompile carries the previous scene citation array verbatim, including orphans;
content equality is checked later. Do not use compiler semanticRef fallback to
retarget citations. Detached scenes remain untouched. Fresh compilation creates
no citation metadata. Canonical history restores records/hashes/ranges exactly;
source catalog and its generation are not history-restored. Source clear preserves
scene/history bytes and leaves stale-generation records; chat clear preserves
both sources and citations. Project deletion uses canonical cascade and existing
history deletion. This adds no promise of backup/media secure erasure.

## Copy and export containment

Reject any citation-bearing new-project copy/import/create atomically, including
live unsaved scenes. No source bodies are copied and no source ID is invented.
The existing Save-as-new error handling must retain the current project/drafts.
Do not change it to install a partial copy. Full source-aware copy and its observed
await-race risk are explicitly outside this slice.

Add one fail-closed guard in canonical `preflightScenes`, before visibility/content
filtering: any nonempty scene citation array refuses **before native bytes**. Cover
resolved, stale and orphaned records, slide-level citations and hidden targets.
Every renderPptx caller receives the same guard, including direct/browser/file and
stored-project export. A stored-project/admin export must never resolve private
sources. No silent notes/URL/snippet disclosure, discarded metadata or pretend
editable citation export. SVG previews remain visually unchanged and gain no
citation badge/claim. Uncited native exports retain accepted behaviour/evidence.

## Focused validation after separate implementation approval

Planning runs only documentation/governance checks. After approval, pin the exact
small test-file inventory in the implementation evaluation/state before execution:

1. New pure schema/engine/anchor/lifecycle checks: strict caps/duplicate/foreign
   structure, generic ingress, atomic batches, locks, no-op, undo200 after source
   clear/history20 pruning, content-change versus style stability, Unicode/tuple
   hash determinism, orphan/ambiguous duplicates, detached/exact-ID regeneration.
2. One shared domain contract on actual SQLite and actual PostgreSQL: exact owner,
   stale project/catalog, transient quote checks, unverified full-save/restore,
   clear/re-register, private-output bounds, atomic history failure, generic create
   refusal and unchanged source/chat state. One bounded lock interleaving per
   backend challenges attachment versus source clear/save; no broad fault sweep.
   Missing PostgreSQL is unexecuted, never green. Use new isolated owned fixtures;
   never recreate completed J2/J3 services or reuse another project's database.
3. Narrow affected command/tool/package/schema-drift checks; ensure old tool
   catalogs/projections and actor:agent cannot acquire citation commands/content.
   One central preflight refusal check through renderPptx, without expensive
   rasterization. An uncited preflight fixture establishes no new refusal.
4. Typecheck and `npm run dev:protocol`; `npm run types:generate` only if schema
   generation changes require it. Compare generated drift intentionally.

Common gates: correctness/data integrity/authorization/undo/preservation/backward
compatibility/documentation apply. Native gate applies to fail-closed preflight,
not a new rendering-quality claim. Browser/accessibility/responsive/visual gates
are inapplicable to this headless metadata slice unless implementation requires a
new browser-visible behaviour beyond existing surfaced refusal; then amend scope
and evidence before coding it. No full legacy/browser/build/benchmark/J1/provider
matrix or model/GPU work. Accepted unchanged visual/native evidence is reused.
Admit expensive backend work only in a quiet window; bounded serial isolation,
watchdogs and actual backend/source SHA in logs. Record all pass/fail/skip/cancel
and unexecuted totals, preparation errors and applicable exclusions separately.
Measure new operation duration in selected fixtures; make no large-deck benchmark
or hard wall-clock claim. Repeat a pass only for a relevant subsequent change.
Independent review inspects retained evidence and runs narrow challenge checks.

Standing BYOK locale, prior J1/I7 timing, native/visual qualification and historical
I4 provenance limits stay separate and unrerun. No new measurements or product
tests executed in this planning pass; no runtime risk is claimed resolved by prose.

## Acceptance, reporting and stop

Require exact schema round trips and canonical write/history/undo preservation,
owner-only fresh qualification, no new retained source/quote/claim or provider
authority, explicit stale/orphan outcomes, safe copy/export refusal, selected real
backend evidence and independent ACCEPT/HOLD for the final implementation SHA.
Keep J3 accepted baseline until that decision; no self-acceptance. Update as-built
ARCHITECTURE only when implementation exists. Report final HEAD/changed files,
commands/totals/unexecuted cases, corrections, durations, limits and recommendation.

Now: independently review this **plan**, record READY_FOR_DIRECTION or blockers,
publish focused documentation and ask the human to approve this bounded metadata/
unverified-state/copy-export policy. **Stop before implementation.** Readiness is
not acceptance, new data-handling authorization or approval of later roadmap work.
