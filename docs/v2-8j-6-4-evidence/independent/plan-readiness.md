# J6-4 independent planning readiness

**READY_FOR_DIRECTION** for corrected contract
`36146428ae99162f16ec2fef0f23fc93532f6dd7`, initially proposed at
`92ee9775f4bad1fb3891ad43987c802751a42abd`. Accepted runtime remains J6-3
`8d34c95faf7a5c4d9e04dec590b362895d4fd283`. Reviewer/context
`/root/j63_plan_review` is separate from planner `/root`. No unresolved blocking
contract gap remains. This is neither human approval nor implementation acceptance.

The [proposal](../../V2-8J-6-4-PLAN.md) and
[roadmap entry](../../ROADMAP.md#assistant-citation-editable-appendix) form a bounded
headless-first appendix contract. HEAD and local origin/v2 match the reviewed
commit; accepted runtime paths have no delta. State preserves accepted J6-3 and an
unauthorized next candidate. Unrelated untracked work was preserved.

## Planning corrections

1. **Ordinary scene text can later reach providers.** The original notice described
   project/admin/copy/download access and persistent scene/history retention, but
   omitted an existing ordinary-text consequence. `app/web/src/lib/v2assistant.js`
   submits scoped `get_slide`/`get_selected_elements` reads, and
   `packages/tools/session.ts:projectElement` projects ordinary text runs. Full
   materialized titles/URLs/private queries can therefore become configured-provider
   context in a later AI turn. Correction `9a7294b7ea2beeee243331322de819af823e7dd9`
   explicitly discloses this, keeps insertion free of model dispatch/research grants,
   and adds a narrow offline projection check. Registry privacy and materialized
   ordinary-text access are now clearly distinct.
2. **Capture applies to preview as well as apply.** The initial immutable-input
   requirement named Apply, though Preview also crosses asynchronous theme,
   validation and transaction boundaries. Accepted `src/projects/citation-export.js`
   and the snapshot-authority trap require capture at each public entry. Correction
   `09bfd1fcfe6d868d63b99d8236124bcaf7daee52` explicitly bounded-clones/freezes both
   operations' complete owner/project/theme/request inputs before any await, captures
   CLI token presence/value and covers both in the planned strict-input cases.
3. **Canonical saves retain their existing pruning policy.** The initial promise
   that earlier history remains exact conflicts with `saveScenes` in both stores,
   which invokes `src/projects/history.js:computePrunePlan`. Correction
   `36146428ae99162f16ec2fef0f23fc93532f6dd7` preserves original scenes/sources/citations
   without dedicated history rewrites, while explicitly retaining canonical pruning.
   It grants no new pinning/lifetime/permanent-undo promise, limits restoration to
   still-recoverable versions and adds one planned retention-boundary assertion.
   The reviewer's first message misstated the audit-row count; it was promptly
   corrected to the actual constants. No mistaken numeric policy was added to plan.

These were source-backed planning gaps, not executed product failures. Original
versions remain in Git; no product source was modified for this review.

## Source-backed feasibility and scope

`src/projects/citation-export.js` already qualifies exact-owner saved document,
catalog, target/content/visibility/range state using bounded J2 readers in one
parent-locked snapshot. The proposed appendix must reuse those rules and refuse
the complete operation on unresolved associations. Its counts-only preview cannot
become write authority or a saved disclosure receipt.

`withCitationTransaction` in both stores exposes the canonical document and
`saveScenes`. `packages/model/engine.ts` supports deck-level `slide.insert` and
`slide.setLayoutState` in one human batch; `src/projects/runtime-document.js` commits
only validated scene changes while preserving metadata and canonical history
retention. Detached appended scenes
fit the existing `recompileSlide` hands-off rule. The proposal preserves original
scenes/citations/sources/history, appends no source registry/manifest and correctly
distinguishes confirmed rollback from unknown commit acknowledgement. Already-open
editors retain existing stale-save/draft/session behavior; no live adoption is added.

`src/theme-loader.js`, `packages/core/design.ts`, compiler typography/text-fit and
background primitives provide the proper IO/normalization/compiler seams. The plan
requires explicit theme resolution, design fingerprint binding, readable floors,
bounded complete-fit pagination and collision checks. It does not pretend current
generic fitting already implements long-reference splitting: that new deterministic
compiler work must preserve complete literal content and prove readable first,
continued and last pages. No geometry moves into the domain/renderer or model.

Ordinary canonical text scenes support native editability without another export
document. Existing qualified notes export still requalifies current citations and
requires fresh notes consent; raw/unqualified cited refusal remains. Materialized
text survives source clear/history independently, including ordinary admin reads
and later scoped AI context. That is an intentional new policy to approve, not a
source-registry authority leak to obscure or a permission inherited from J6-1/2/3.

The focused validation is proportionate: new compiler/domain cases, small actual
SQLite/PostgreSQL mutation/race/fault cases, CLI/native checks, one long fixture's
SVG/native raster with unchanged original-slide control, and typed seam checking.
Real PG and native visual evidence are required for the changed behavior; absence
holds acceptance. No new UI, production rebuild, old interaction matrix, provider
call or broad historical sweep is warranted. Future browser controls, on-slide
markers and semantic creation remain separately gated on the canonical primitives.

## Checks and required direction

[Lightweight checks](plan-checks.json): **17 passed,0 failed**. Independently executed
`npm run dev:protocol` exits0 with0errors/0warnings. Exact local refs, ancestry,
runtime/state preservation, disclosure/capture text, links/anchor and whitespace
were checked. No product tests, database/API calls, services, browser/build/native
render, model/search/provider/GPU work, Git mutations or other agents ran.

Obtain explicit human choice on appendix-first versus marker-first direction and
the materialization of complete titles/URLs/private queries as ordinary editable
scene/history text, including existing project/admin/download access, independent
retention after source/chat clear and later configured-provider context through
ordinary scoped AI reads. This review grants no implementation or disclosure
authority. After approval, pin the focused inventory before code and retain the
separate exact-source implementation acceptance gate and scoped closeout stop.
