# J6-3 independent planning review

**READY_FOR_DIRECTION** for proposed contract commit
`65287b6181aa72ee7515ea8a3d407f5e81c6aca9`, from accepted J6-2 source
`6068a2a7c5643a1958a140bcc60d0df6b891ccec`. Reviewer/context:
`/root/j63_plan_review`, separate from planner `/root`. No blocking technical
contract gap was found. This is contract readiness, not human direction,
implementation authorization or implementation acceptance.

The reviewed contract is [V2-8J-6-3-PLAN.md](../../V2-8J-6-3-PLAN.md), indexed by
[the roadmap](../../ROADMAP.md#assistant-citation-source-inspector). HEAD and the
local origin/v2 ref both name the exact reviewed commit. The commit changes only
the plan, roadmap and next-candidate index. Accepted runtime paths have no delta
from J6-2; state preserves its accepted baseline and unauthorized candidate.
Unrelated `.agents/` and both master-prompt files were observed and preserved.

## Source-backed assessment

- **One coherent read is feasible without new mutation authority.**
  `src/projects/store.js:832` and `src/projects/store-postgres.js:868` already
  expose the parent-locked citation read callback without save authority.
  `src/projects/source-read.js` supplies catalog accounting, capped selected-body
  reads, fatal SQLite decoding and canonical source validation. The plan correctly
  requires full-document validation and one transaction, rather than combining
  separate public J4 inspect/J2 resolve results. New adapter or SQL behavior would
  require revising the stated evidence selection before its actual-PG check.
- **Unresolved records stay inspectable without becoming verification.**
  `src/projects/citations.js` distinguishes containing-scene scope, target,
  content, retained generation and range observations. Shared target/content
  helpers and `src/projects/snippet-locator.js` support the proposed projection.
  The plan preserves orphan/mis-scoped rows, refuses corrupt complete pages,
  never substitutes newer-generation sources and keeps claim support
  not-assessed. A retained title/URL may be shown despite an unresolved target;
  that disclosure choice is explicit, rather than an accidental qualification.
- **The existing Inspector has suitable lifecycle seams.**
  `app/web/src/components/SceneViewer.jsx` keeps formatting panels mounted in a
  fixed-width scrolling rail and tracks saved/engine revisions, title/grid/inline
  drafts, document identity and save/copy/restore/Assistant reload state.
  `app/web/src/lib/projectSession.js` supplies session epochs; the accepted export
  integration captures navigation stamps. These are feasibility evidence only.
  J6-3 must implement its own read lifecycle: drafts are allowed, observations
  describe the saved snapshot, and pointer activation must preserve edits.
  The contract already requires production-controller race tests plus actual
  browser draft/focus, narrow/short/reflow and measured canvas checks.
- **The new disclosure is bounded and separately gated.**
  Accepted J6-2 (`docs/reviews/V2-8J-6-2-6068a2a7.json`) exposes only citation
  counts in browser metadata; full title/URL values enter a consented download.
  J6-3 is a new browser read surface. Its explicit-open action, plain-text control
  escaping, no navigation/fetch/telemetry, strict private DTO/body limits, finite
  admission through actual settlement, no automatic retry and collapse/session
  cleanup form a coherent proposed boundary. `app/server/v2-native-export-routes.js`
  and `src/projects/copy-auth.js` provide accepted private-header/authentication
  precedents without granting this new route automatically.

The focused evidence selection is proportionate to the change: real owned
SQLite domain/HTTP/CLI behavior, production client controller, one serial browser
file and one reused build. Conditional affected J4 cases cover any shared helper
extraction. Broad old matrices, native regeneration, provider/model/search/GPU and
new persistent infrastructure are unjustified at planning time. Standing BYOK
locale and unchanged adapter/native limitations remain separate.

## Checks and remaining direction

[Lightweight checks](plan-checks.json): **15 passed, 0 failed**. This includes
independently executed `npm run dev:protocol` (exit0,0errors,0warnings), ancestry,
exact refs, delta/state preservation, local links/anchor and whitespace checks.
No product leaf tests, services, database/API calls, builds, browsers, native
renders, network Git operations, model/search/provider/GPU calls or Git mutations
were executed. No UI, accessibility, security, performance or race pass is inferred
from this planning review.

The next action is the concrete human choice required by AGENTS and the protocol:
approve or revise the read-only Sources section in the existing Inspector and
explicit owner-only browser display of complete retained titles/full URLs,
including private query values. The dedicated source-management surface remains a
different contract. No excerpt disclosure, new retention, source mutation,
provider context, citation presentation/export change or semantic/research
activation is authorized. Human direction must precede implementation; later
exact-source independent ACCEPT/HOLD is still required.
