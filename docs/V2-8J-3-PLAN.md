# V2-8J-3 — headless citation reference and snippet locator checks

Status: proposed contract, planning only. The 2026-10-28 continuation authorizes
preparation of the next dependency; implementation direction is not yet recorded.
Accepted baseline: `6d51cd409945e94266e23596b57f925553e62e31` (J2).
Planning entry HEAD: `14aabf642933ffa4c870149ae1a5512f8d35900a`.
Branch/push target: `v2` / `origin/v2`.
The [roadmap](ROADMAP.md#assistant-citation-reference-checks) is the sole work and
dependency registry. This document bounds one proposed implementation, not the
remaining source-integrity program.

## Problem and prerequisite inspection

J2 retains selected owner-private immutable snippets. It does not bind a source
to saved slide content or establish what a locator means. A matching source ID,
number, URL or semanticRef cannot establish factual support. Before attaching
citations durably, the project boundary needs a reusable deterministic check of
the exact saved target and exact retained excerpt in one authorized snapshot.

Inspected at the planning entry:

| Existing boundary | Consequence |
|---|---|
| `packages/model/intent.schema.json` has slide sourceRefs and block evidenceRefs; `semantics.ts` deliberately performs no storage lookup. | Semantic references are not proof of existence or claim support. |
| `packages/model/scene.schema.json` and `packages/projects/project-document.schema.json` have no citation attachment. | Do not label a caller-supplied pair as a saved citation or introduce a side document that pretends to be authoritative. |
| Compiler mechanisms may emit several elements with one semanticRef; regeneration reconciles by exact ID or a unique compatible match. | Do not infer an element/block mapping from semanticRef alone. |
| `src/projects/sources.js` validates bounded catalog metadata and selected source bodies under J2 authority. | Reuse its rules; do not weaken identity, first provenance, clear generations or corruption checks. |
| Both withSourceTransaction wrappers expose only document id/revision, while withRuntimeTransaction holds the exact owner-checked parent lock and full saved document. | Separate getProject/resolve calls cannot establish one snapshot; nested registry transactions may block or deadlock. |
| Source clear advances generation without altering scenes/history; history restore advances document revision without restoring sources. | A read result is a snapshot observation, never durable attachment or authorization. |
| Legacy conversion still refuses claim cites; native export consumes scenes only. | This foundation must not remove conversion refusals or advertise citation-preserving export. |

The accepted J2 source, decision and focused evidence are spot-checked as the
prerequisite. No outstanding J2 implementation/review gate is reopened.

## Recommended direction and bounded scope

Build a **headless read-only citation-reference checker first**. It checks explicit
saved slide/element targets and optionally an exact excerpt-relative quote locator
against the retained J2 web source. It returns target existence, source retention
and locator match as separate facts. Claim support is always **not assessed**.

This is a durable primitive for later attachment/creation, not a temporary citation
store. It adds no retained data, model tool, public transport or UI. It cannot attach,
approve, save, clear or export anything. Persistent scene attachments, command/undo/
history/copy behavior and native citation presentation remain separately gated in
the parent roadmap entry. Keeping those out also avoids inventing a visual citation
surface or silently changing how existing Save as a new project behaves.

The alternative is to agree and implement the larger scene/command/history/copy/
export attachment contract now. That changes authoritative document semantics and
requires substantially broader preservation and export evidence. Recommend the
read-only foundation so those later decisions can reuse an already qualified seam.

## Proposed callable contract

Use shared framework-free project-domain logic (for example
`src/projects/citation-references.js`) over the configured project backend.
No HTTP route, CLI, editor integration, automatic J1/H hook or provider context.

Trusted binding is captured before the first await, exactly as in J2:
`{ id, owner }`, with the established canonical project ID and exact nonempty
owner string or local null-owner identity. Unknown fields/admin options refuse.
The caller does not select backend, SQL, permissions or a provider.

The single strict request contains:

```text
{
  projectRevision, sourceGeneration, sourceRevision,
  references: [
    {
      target: { kind: "slide", slideId }
           | { kind: "element", slideId, elementId },
      sourceId,
      locator?: { kind: "snippet-utf8-v1", startByte, endByte, quote }
    }
  ]
}
```

All revision/generation numbers are nonnegative safe integers. Targets use
nonempty bounded IDs up to the existing command-domain 200-character limit;
source IDs have J2's canonical src_ plus64 lowercase hex form. Accept1..24
references, at most24 distinct sources; an identical complete target/source/
locator tuple repeated in one request is invalid. Different ranges against the
same source/target remain distinct. Absent locator means source association only;
explicit null or unknown locator kinds are invalid. Reject unsupported fields,
executable/accessor/nonplain inputs, dangerous keys, cycles and oversized DTOs.
Clone/validate the complete binding, request, targets, locators and quotes before
awaits, not just their outer arrays. Whole request/response ceiling is384KiB.

### One current owner/document/catalog snapshot

Enter exactly one canonical owner-checked parent-locked transaction. Check the
saved document revision and exact source generation/revision before publishing
any reference result. A mismatch refuses the complete request with a sanitized
stale-project or stale-catalog outcome. Foreign/missing projects share not-found;
no admin bypass or global source existence query is introduced.

Add a **narrow internal read-only adapter seam** if needed, for both actual
backends, exposing only the saved document/target projection, actual dialect and
transaction-local read capability required by the shared checker. Keep existing
withSourceTransaction and H/runtime public shapes unchanged. Do not expose
saveScenes, beforeCommit, raw SQL input, arbitrary callbacks or a database handle
through the new callable domain. No provider/network work runs under the lock.

Extract/reuse J2's transaction-local catalog/body read validation behind its existing
public registry factory; do not copy SQL rules into a second implementation or call
registry.resolve recursively inside the outer transaction. Existing source APIs,
return shapes, immutable semantics and error propagation must stay unchanged.
No getProject-then-resolve composition, nested transaction or release/reacquire
window is allowed. Select/validate at most24 source bodies and the existing bounded
513 metadata rows; retain SQL byte caps/fatal SQLite decoding before materialization.
Saved document reading/validation remains under the existing bounded120-slide,
project-payload ceiling. Publish only requested target observations, never the full
document, unrelated scenes or source bodies.

No scene/document/history/chat/source counter or content writes occur. Existing
idempotent schema initialization is inherited; no new DDL/table/version is added.
All domain results are checked for complete output bounds before leaving the
transaction and deeply frozen. No content-bearing diagnostics or caller-supplied
error text; unexpected backend errors are sanitized storage-unavailable outcomes.

### Target observation, not attachment

A slide target is present only if exactly one saved slide has its exact ID.
An element target additionally needs exactly one exact element ID in that slide's
group-child tree. Traverse each requested slide at most once with an iterative
walk, at most10000 visited elements across the request and group depth at most128.
Exceeding either budget refuses the complete request with target-budget-exceeded;
never truncate traversal and falsely report absence or uniqueness. These are new
checker limits, not changes to which scenes the editor accepts. Never fall back
to a similarly named element, another
slide, a substring, semanticRef, compiler role or tombstone. Valid but unknown IDs
yield missing-target; duplicate/ambiguous target identities yield ambiguous-target
and never a fabricated unique match. Document/schema corruption still refuses
the complete request rather than publishing partial observations.

Hidden and locked elements, including institutional chrome, may be observed as
existing: this is read-only existence, not permission to edit or claim attribution.
Group containers and nested children are independently addressable by exact ID.
No source-to-block relation, content equality or factual support is inferred from
any existing target. All rendered text/chart/table/layout/style bytes stay intact.

### Retained source and snippet-relative locator

Resolve only in the bound project's exact catalog snapshot using J2's canonical
validators. A well-formed foreign or unknown source ID is missing-source, without
probing another project. Invalid selected persisted content/catalog is a whole-
request invalid-state refusal; do not downgrade corruption to a missing source.
First stored retrieval/provider metadata and the source ID formula stay unchanged.

An optional snippet-utf8-v1 locator means only the decoded retained **excerpt**:

- startByte inclusive, endByte exclusive; both safe integers with
  `0 <= startByte < endByte <= 8192` at input and endByte no greater than actual
  excerpt UTF-8 bytes at resolution. A range must start/end at Unicode scalar
  boundaries and select a nonempty sequence. These are not character, UTF-16,
  JSON-payload, page, paragraph, document or URL offsets.
- quote is nonempty valid Unicode scalar text, at most8KiB UTF-8. Compare its exact
  UTF-8 bytes with that slice: no trimming, case folding, Unicode normalization,
  line-ending repair, ellipsis insertion or fuzzy matching. Preserve a literal
  leading BOM as excerpt content. Input syntax/bounds failures refuse before
  storage; source-dependent out-of-bounds/split-code-point ranges are invalid-locator,
  and a valid range with different quote bytes is locator-mismatch.
- J2's accepted JSON vocabulary can retain escaped lone UTF-16 surrogates.
  Do not silently convert them to U+FFFD via Buffer/TextEncoder and call that
  evidence. A retained excerpt containing an unpaired surrogate is a retained
  source but has an unsupported-excerpt locator outcome. It is not rewritten,
  silently dropped, or newly refused by J2. Invalid scalar quote input refuses
  before storage. Valid literal U+FFFD and supplementary characters remain valid.
- Locator precedence is exact: absent locator always means not-requested, even
  when the source is missing. A requested locator with a missing source is
  unavailable; with a retained unpaired-surrogate excerpt it is unsupported-excerpt
  before any byte encoding/slicing. Otherwise source-dependent bounds/code-point
  boundary failure is invalid, then exact quote comparison gives mismatch/matched.
  A successful exact quote check is locator-matched only.
  It is never verified claim support, freshness, full-page/DOI/file integrity,
  anti-injection qualification or permission to fetch anything.

### Complete bounded results and stale observations

Return the checked project id/revision and source generation/revision plus exactly
one ordered outcome per input index. For each index, keep separate fields for
target (present/missing/ambiguous), source (retained/missing) and locator
(not-requested/matched/mismatch/invalid/unavailable/unsupported-excerpt), and always
claimSupport:not-assessed. The strict complete result shape is:

```text
{ ok: true,
  snapshot: { projectId, projectRevision, sourceGeneration, sourceRevision },
  references: [{ index, target, source, locator, claimSupport: "not-assessed" }] }
```

Each observation enum uses exactly the spellings above, index is its zero-based
input position, and no unknown result fields are accepted. Failure is exactly
`{ ok: false, code, message }`, with a static sanitized message and one of
invalid-request, not-found, stale-project, stale-catalog, invalid-state,
target-budget-exceeded, result-too-large or storage-unavailable. No diagnostic
input/path/content or partial references array accompanies a failure.
Do not collapse these facts
into a success/verified-citation badge. No URL/title/excerpt/quote or unrelated
source metadata is echoed, stored or logged in this response.

A missing/ambiguous target does not short-circuit independent source/locator
observations; every requested reference receives all three observations. Target
presence never changes locator precedence or assesses the truth of the target's
content. Corrupt selected state and budget failure still refuse the whole request.

Malformed input, stale snapshots, backend failure, corrupt selected state or an
oversized complete response publishes no reference outcomes. Well-formed missing
target/source and locator disagreement are explicit batch observations, not partial
successful attachment. The result carries no reusable capability, approval,
execution right or retention receipt. Source clear/save/restore/delete can make it
stale immediately after the lock releases; later attachment must re-enter canonical
authority and recheck current document/catalog and exact source identity.

Retain the accepted adapter lock-wait policy: cardinality bounds are not a new
wall-clock deadline or cancellation guarantee. No Promise.race that abandons work,
H timeout change or background continuation is introduced. Public integration
still needs its own transaction-wait/cancellation contract.

## Non-goals and forward compatibility

No persisted citation/claim/locator record, scene/intent schema field, command,
compiler/rendering change, visible footnote, notes, export manifest, history/copy
rewrite, legacy refusal removal, public API/CLI/UI, research registration, provider
context, H grant, model/search/API/local inference/GPU call or activation.
No paper/file/page fetch, SSRF surface, embeddings or new data-retention policy.

Look-ahead: later scene-owned attachments must store project/generation/source
identity and optional snippet-relative range with canonical revision/history
semantics, without copying snippets/quotes into recoverable scene snapshots.
They need explicit invalidation on content changes, source clear/missing outcomes,
same-project duplicate behavior and atomic project-copy rebind/remapping before
being enabled. A valid requested target/source pair here does not solve any of
those mappings. Native bibliography/notes/visible citation direction, non-snippet
locators and verified claim support remain separate contracts in the roadmap.
Semantic creation must consume the accepted identity checks and deterministic
compiler/approval/preservation seams, never layout code authored by the model.

## Focused validation after implementation direction

Planning now: diff/link/state consistency and dev:protocol only. No product tests,
services, build, rendering or model calls for this document.

After approval, select a small new/affected inventory, with exact cases recorded
before execution rather than copying a historical matrix:

- Pure input/result and locator checks: captured requests, strict fields, duplicate
  tuples, safe bounds, byte limits, complete frozen outcomes, exact Unicode/BOM/
  supplementary/U+FFFD handling, unpaired-surrogate refusal/unsupported-excerpt,
  mismatch versus invalid range and no claim-support escalation.
- One shared actual-backend contract on fresh temporary SQLite and owned isolated
  PostgreSQL: exact-owner/local/foreign isolation; current/stale document/catalog;
  slide/group/child/hidden/locked/missing/ambiguous targets; retained/missing source
  and corrupt selected source refusal; unchanged scenes/history/chat/catalog before
  and after both successful and negative reads. Reopen once for persisted sources.
- One bounded lock interleaving per backend proves clear or save cannot fall between
  target and source reads. The second writer waits; later old-token reads refuse.
  A thrown read/invalid result must release the lock and publish no partial result.
  Missing PG is unexecuted, never green. Never reuse unrelated databases or recreate
  the removed I4/J2 services.
- Rerun only J2 pure plus its affected shared registry contract if extraction or
  wrapper code changes; do not repeat unrelated J1/provider/browser/old bulk suites.
  Typecheck/import-boundary checks cover any new strict TypeScript/shared imports;
  no generated types drift run is needed if no schema/generated target changes.
  Run narrow governance inventory checks only for changed gate wiring.

Serial low-priority files with finite watchdogs, no concurrent build/browser work.
Measure CPU/memory/I/O admission before real storage validation/service setup.
Retain every attempt, actual backend/source SHA/delta, exit/count/skip/cancel and
explicit excluded coverage. Performance observations are fixture durations only.
No old browser/build/render/native/50cell/broad-fault matrix or live qualification:
those behaviors are unchanged. Common correctness/security/integrity/compatibility/
evidence gates apply; visual/native/a11y/responsive gates reuse accepted evidence.
Standing BYOK locale, earlier J1/I7 timing and inherited I4/native/visual provenance
limits stay separate, not reclassified as passing or reopened without a reason.

Acceptance needs one-snapshot owner/target/source checks on both actual backends,
honest locator/claim separation, bounded unchanged J2 behavior, no new retention or
effects, and a separate exact-source ACCEPT/HOLD. Update architecture as built only
after code exists, and propagate roadmap/eval/state/handoff with truthful evidence.
Push scoped commits to origin/v2. Stop after this slice's review and closeout;
acceptance will not authorize persistent attachment, creation, UI, paid infrastructure,
production migration or deployment. Planning review is technical readiness only;
record human direction on this bounded contract before implementation.
