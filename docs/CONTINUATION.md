# Continuation from the repository alone

Start by reading AGENTS.md and HANDOFF.md, then DEVELOPMENT-PROTOCOL.md,
development-state.json, ROADMAP.md §12, BLOCKED.md/TRAPS.md and the active evaluation.
No previous conversation, private scratchpad, external master prompt or particular
agent provider is required. PRODUCT-VISION.md and ACCEPTANCE-CRITERIA.md define
stable direction and gates; role instructions live in docs/agents/.

## Establish current truth

```sh
git status --short --branch
git rev-parse HEAD
npm run dev:protocol
```

`development-state.json` is the current index: accepted baseline, implementation
under evaluation, active task/eval and validation evidence/statuses. The code SHA
may precede later documentation commits. Validate ancestry and inspect the diff;
do not silently replace that pointer with the documentation commit running now.
The validation program began from accepted V2-6C `97a12de` and V2-7A implementation `a298767`.
Narrow corrections through `fe749fb` have complete retained validation and a
separate ACCEPT decision in reviews/V2-7A-fe749fb.json. V2-7B-1 source `662f7d6`
is independently accepted in reviews/V2-7B-1-662f7d6.json. V2-7B-2 source
`03cc89e` is independently accepted in reviews/V2-7B-2-03cc89e.json. The state file
indexes the current full source and decision; never infer acceptance
from a green report. Tested code and subsequent evidence commits are distinct.

Read ARCHITECTURE.md's V2 sections, V2-5A-EDITOR-ARCHITECTURE.md with later editor
evaluations, V2-6-PERSISTENCE-ARCHITECTURE.md, V2-6C-HOSTED-STORAGE.md and
V2-7-FRONTEND-ARCHITECTURE.md. Earlier evals are historical evidence; the roadmap's
later acceptance state and the supplied baseline do not become pending merely
because old eval wording predates review.

## Current slice — J6-2 implementation under independent review

Human direction was pinned8ba322e9 before runtime. Frozen source/tests
`6068a2a7c5643a1958a140bcc60d0df6b891ccec` is pushed origin/v2. Read
[V2-8J-6-2-EVAL.md](V2-8J-6-2-EVAL.md), state and HANDOFF: selected22/22 focused
cases, final build and viewed desktop/narrow evidence are complete. Independent short/zoom/unmount replay and two new controller challenges pass3/3.
Final separate packet audit/decision is pending; accepted baseline
stays J6-1 below. Preserve all prior failed attempts/source-capture limitations.
No old matrix, typed/native/store change, PG/service recreation, real model/search
or production activation is authorized. Continue review/corrections/closeout only;
stop at J6-2. Roadmap alone owns later candidates.

## Latest accepted slice — J6-1 qualified citation notes export complete

Human approved reviewed ae96d717 on2026-10-29, pinned91e06210 before runtime.
Corrected source `ecf82d3fa74bb7fcfc111e5cbeaf36bcb49fa47d` is independently
[accepted](reviews/V2-8J-6-1-ecf82d3f.json); stable separate decision committed
unchanged at68f8da17. Read [evaluation](V2-8J-6-1-EVAL.md), approved contract,
state and HANDOFF. Selected33/33, final typecheck0, independent final2/2 and
305/0 packet audit are complete. All root39=35pass/4fixture-fail, independent
6=2pass/2fixture-fail/2valid-product-fail retain every attempt. Reconstructed
old test files exactly match contemporaneous hashes; no original capture or
single green whole-file process is inferred from executed-leaf unions.

One owner-bound saved project/catalog snapshot qualifies every citation before
native generation. Explicit consent exports full title/URL values to literal
speaker notes with verified portable mappings; empty authored slide scope now
refuses after independent fail-first correction. Private0600 exclusive publication
preserves existing files. No scene/history/source mutation, public/UI export,
provider/model/search call or activation. Raw/file/current GET cited refusal stays.
Representative notes and three pixel-identical slide/control rasters were viewed;
long printed fit and interactive Microsoft PowerPoint are not claimed.

Actual empty database catalog/0other clients was saved/fsynced before one exact-ID
removal, and private files/runners/service absence are independently verified.
No owned service remains. Do not recreate fixtures or repeat completed cleanup.
J6-1 closeout is complete; further direction and scope are solely in the
[roadmap](ROADMAP.md#assistant-citation-native-presentation). Acceptance authorizes
planning only, not the later browser/public export implementation or activation.

## Accepted predecessor — J5 source-aware project copy complete

Human approved the reviewed J5 contract1b37cdd6 on2026-10-29, pinned7df22d94 before
runtime. Exact source `f6487737557c20d481cbc3e84216d7144bb116e8` is independently
[accepted](reviews/V2-8J-5-f6487737.json); stable decision committed unchanged at
e95cafad. Read [evaluation](V2-8J-5-EVAL.md), contract, state and HANDOFF.
Selected39/39, build/typecheck0, independent new actual-PG2/2 and338/0 packet audit
complete. All root114=102pass/12fail retain fixture errors/expected fail-firsts;
no required gate remains unexecuted. No unchanged old matrix was repeated.

Referenced private sources copy atomically to the same owner with new bindings and
independent retention; guarded fresh-engine adoption preserves later human work.
Generic cited create/import and unqualified native export remain refused. Exact owned cleanup
saved/fsynced actual0catalog before one removal; independent service/private-file/
runner absence verification is complete. No owned service remains. Never recreate
old fixtures or repeat cleanup. Current shared-machine policy monitors bounded own
load and leaves unrelated work alone; global PSI alone is not attribution.

J5 closeout is complete. Accepted qualified notes export is separately recorded
in J6-1 above. Further scope/direction is solely in the
[roadmap](ROADMAP.md#assistant-citation-native-presentation); acceptance permits
planning, not dependent implementation, model/search runs or activation.

## Accepted predecessor — J4 citation metadata lifecycle complete

Human approved bounded J4 on2026-10-28, pinned b0cb7aa before runtime after
independent readiness of plan bbfbf8c. Exact source
`665cd0459b0f267b32e808a59046e3d0b914e74f` is independently
[accepted](reviews/V2-8J-4-665cd04.json) on2026-10-29 after packet ef1d11ac audit;
root committed the stable decision unchanged at452bc61e. Read
[contract](V2-8J-4-PLAN.md), [evaluation](V2-8J-4-EVAL.md), manifest, state and
[roadmap](ROADMAP.md#assistant-citation-lifecycle).

Selected41/41 (pure13, actual SQLite7/PostgreSQL7, boundary14), typecheck0 and
independent2/2 pass. All root attempts68=66pass/2fixture-fail/0skip/cancel and
original review/harness mistakes remain explicit, with exact invocation/source
applicability. No product test was repeated during acceptance propagation.

Scene-owned metadata survives edits/undo/history/regeneration without restoring
cleared sources or acquiring provider authority. Fresh headless operations retain
exact-owner locking and separate target/content/source/range observations; support
is not-assessed. J4 originally refused cited new-project copying and native export; qualified
copy is separately accepted in J5 above, while export remains refused.
No model/search call, UI, public transport or activation was added. Actual0 catalog
was saved/fsynced before one exact-ID removal; root and reviewer independently
verified absence/private credential deletion. No owned service remains. Never
recreate old fixtures or repeat completed cleanup helpers.

J4 closeout is complete. J5 above supersedes only the qualified copy refusal;
all later scope and direction remain in the linked roadmap, not this history.

## Accepted predecessor — J3 citation-reference checks complete

Human approved the reviewed read-only foundation first on2026-10-28, pinned8a01b6c
before runtime. Frozen sourceedda5ec7c2105bebff4a429a04b3fbe5b09048b4 is independently
[accepted](reviews/V2-8J-3-edda5ec.json) from J2. Read [contract](V2-8J-3-PLAN.md),
[evaluation](V2-8J-3-EVAL.md), manifest, state and HANDOFF. Required50/50 plusselected
governance2/2, typecheck0 and independent2/2 pass, all0fail/skip/cancel. Root product
checks ran once. Metadata/admission/launcher preparation errors remain separate;
no unavailable child or backend was counted passed. Invocation/source applicability
and otherwise uncaptured unchanged package comparisons remain explicit.

The headless checker observes exact saved targets, retained snippets and optional
UTF-8 quote locators in one owner-bound snapshot. It attaches nothing and always
reports claim support not-assessed. No new retention, scene/source/history/H write,
public surface, provider context, model/search call, activation or render change.
Owned PostgreSQL was removed once after a saved/fsynced actual0-user-DB catalog;
exact-ID absence and temporary credential deletion were independently verified.
No owned service or validation process remains. J3 closeout is complete; later
scope/authority lives only in [the roadmap](ROADMAP.md#assistant-search-source-integrity).
Acceptance permits planning only, not dependent implementation.

## Accepted predecessor — J2 project web-source registry complete

Human approved scoped retention/implementation on2026-10-28, pinned6416e1b before
runtime. Frozen source6d51cd409945e94266e23596b57f925553e62e31 is independently
[accepted](reviews/V2-8J-2-6d51cd4.json) from J1. Read [contract](V2-8J-2-PLAN.md),
[evaluation](V2-8J-2-EVAL.md), state and HANDOFF;
[the roadmap](ROADMAP.md#assistant-project-source-registry) owns scope/direction.
Selected57/57, typecheck0 and independent2/2 pass, with0fail/skip/cancel in the
final selection. All root attempts107=95pass/12fail retain overlapping runs,
five fixture errors and seven corrected PostgreSQL refusal-propagation failures.
Early capture omissions and final list-only source applicability stay explicit.

The headless owner-private registry retains explicitly selected web snippets until
source clear/project deletion. Chat clear/history restore preserve sources; source
clear is not history-restorable. No automatic J1 registration, H/host/Assistant
research authority, citation attachment, verified locator/claim or public activation
is added. Owned PostgreSQL was removed once after a saved/fsynced actual0 user
database catalog; exact-ID absence/private-credential removal were independently
verified. No owned service remains. No live model/API/search/GPU call or production
migration occurred. J2 closeout is complete; acceptance permits planning only and
later scope/authority lives in the roadmap.

## Accepted predecessor — J1 headless canonical web research complete

Human approved scoped query disclosure on2026-10-27. Frozen source
f161901cf29bd7ebd2c12ef634a86cacf5f90ea3 is independently
[accepted](reviews/V2-8J-1-f161901.json). Read [contract](V2-8J-1-PLAN.md),
[evaluation](V2-8J-1-EVAL.md), state and HANDOFF. Selected153/153, finaltypecheck0
and independent2/2 pass; earlier root181pass/3fail/1cancel and independent
fail-first1pass/1fail are retained with overlap/applicability, not erased. The initial
OpenAI timeout cause remains unresolved despite the later complete4/4 pass.

Research is a separate granted headless entry. Base/durable/H/host/Assistant paths
gain no search authority; J1 itself adds no source persistence, public activation
or model run. Private shared capability consumption and full canonical request
binding close the review finding. Owned temporary SQLite/loopback fixtures and
observers are closed; no persistent service was acquired. Earlier API1723 was
untouched and is now absent with external lifecycle unknown. J1 closeout is
complete; later direction and authority live only in
[the roadmap](ROADMAP.md#assistant-search-source-integrity).

## Accepted predecessor — I8 browser Assistant complete

Human approved the existing Assistant tab; frozen source
b9c2d2075da21608a92a458c1395ede0bbe67297 is independently [accepted](reviews/V2-8I-8-b9c2d20.json). Read [contract](V2-8I-8-PLAN.md), [evaluation](V2-8I-8-EVAL.md),
state and HANDOFF; [roadmap](ROADMAP.md#assistant-visible-editor) alone owns scope.
Selected product26/26, governance4/4, typecheck0 and independent final3/3 pass.
Chrome7/7 is selected-case coverage, not a green whole-file process. Preserve
all failed attempts and applicability/provenance notes. No real/local model,
activation or dependent feature authorized. I8 closeout is complete; later scope/authorization remains solely in the roadmap.

## Accepted predecessor — I7 exact-turn wake complete

Human approved exact project/generation/turn targeting on2026-10-27. Exact source
3da0801f64e88f7911f655cee288bb9b750c7c3d is [independently accepted](reviews/V2-8I-7-3da0801.json)
from I6 baseline dce5628. Read [contract](V2-8I-7-PLAN.md), [evaluation](V2-8I-7-EVAL.md),
state and HANDOFF. Required33/33 (new19 plus affected14), selected governance4/4,
typecheck0 and new independent2/2 pass. Earlier fail-first harness limitations and
SQLite7/1 then isolated1/1 then final8/8 remain explicit; its initial cause is
unresolved. Source hashes match frozen bytes, with no SHA-only reruns or old matrix.
Shared finite admission and direct H/I2 target work remain default-off. No UI,
activation, real API/local inference or renderer change. Owned fixtures are closed,
and the pre-existing local API is untouched. Stop after I7 docs/commit/push closeout;
subsequent contracts and authority exist solely in the roadmap.

## Accepted predecessor — I6 explicit finite wake complete

Human-approved explicit wake is independently accepted at source
`dce562834f2d4641280d8df6f61dd4872d566b87` in
[the decision](reviews/V2-8I-6-dce5628.json): [evaluation](V2-8I-6-EVAL.md),
[contract](V2-8I-6-PLAN.md), [roadmap](ROADMAP.md#assistant-authenticated-wake).
Required26/26 and affected governance37/37 pass, typecheck0; independent3/3 new
challenges pass, all final0fail/skip/cancelled. Earlier13 overlaps without separate
Node exit; reviewer import-load failure precedes its final3/3, both retained.
Tested working bytes match frozen source; later commits are docs/evidence only.
No old matrix, PG, browser/build/native, live model or activation was executed.

Wake remains default-off and acknowledges a finite owner-wide hint, not dispatch,
full drain or fair progress through long terminal histories. Explicit session/account
identity and empty job contexts preserve existing authority. Pending opening cannot
admit after close/expiry; an admitted coalesced receipt may be delivered after close.
No test/worker/service remains. I6 closeout is complete; the roadmap alone owns later
UI/progress contracts and implementation authority. Read HANDOFF for current state.

## Accepted predecessor — I5 Auto host pickup complete

The human-approved Auto-only/default-disabled bridge is independently accepted
at source5cf5b5cff53c781291ba094163c68eb189bfbc66 in
[the exact-source decision](reviews/V2-8I-5-5cf5b5c.json). Read
[the contract](V2-8I-5-PLAN.md), [evaluation](V2-8I-5-EVAL.md), state and HANDOFF.
Required unit19/SQLite8/CLI5 all pass, typecheck passes, affected governance36/36
passes and independent new challenges3/3 pass; all0fail/skip/cancelled. Only
new/affected behavior ran. No old matrix/model/GPU/service/artifact execution or
production activation occurred. Source is frozen; later commits are docs/evidence.
I5 closeout is complete. Acceptance permits planning, with later authority and scope
solely in [the roadmap](ROADMAP.md#assistant-surface-integration).

## Accepted predecessor — I4 complete

Owner-scoped work discovery is independently accepted at exact source
`8378a20a819de569ef7b10b747d7ba6c481f529e` in
[the decision](reviews/V2-8I-4-8378a20.json). Read [evaluation](V2-8I-4-EVAL.md),
HANDOFF and state:238primary files3097/3097 plus4distinct native cases, focused48
and independent30overlapping repeats, all9gates/119images/15original archives.
Separate locale9/1 remains. Source175 partial execution is retired; all originals
were preserved/restored. The finisher ranONCE. Never resume completed or retired
I4/I3 generators/coordinators/finishers against restored bytes.

The formerly ownedI4 backend is absent and5544refuses connections, independently
verified. No pre-removal catalog/count or removal cause is available; the decision
accepts that operational provenance limit for source correctness and does not
certify the planned cleanup procedure. Current independent PG replay is unexecuted;
retained actual PG/process execution remains evidence. Never infer0 or recreate
that removed service. No test/browser/coordinator/owned service remains.

[Focused validation](DEVELOPMENT-PROTOCOL.md#focused-validation-policy) is now the
human-directed default: test new/changed behaviour and affected boundaries, reuse
accepted old evidence, and broaden only for concrete risk/release reasons. Do not
repeat the full historical matrix by habit. I4's broad run completed before that
instruction arrived; review used only30focused repeats. I4 closeout is complete;
later scope remains in [the roadmap](ROADMAP.md#v2-8-remaining).

## Accepted predecessor — I3 complete

[V2-8I-3 authenticated durable submission](ROADMAP.md#assistant-turn-submission)
is independently accepted at source `2ba82cb5c321c21d5648f577469f69e82cdcfb24` in
[the exact-source decision](reviews/V2-8I-3-2ba82cb.json), from I2baseline58662ec.
Read [the evaluation](V2-8I-3-EVAL.md), current HANDOFF and state. All234primary
files pass3048/3048 plus4distinct native flows; focused66 and independent346+4
are overlapping repeats. All9gates/build/type/50cells/119images complete; standing
locale9pass/1fail remains separate. No product correction was needed in final run.

Historical6965files/221original PPTXs and5canonical outputs were restored;
independent7306files/236PPTXs+5canonical originals still match. The finisher ran
ONCE and the packet is frozen: never rerun it against restored originals. Exact
owned cleanup saved/fsynced actual0catalog before single stop, then verified bounded
and fresh independent absence/5544refusal, retaining first transient absent=false.
No test/coordinator/service remains. No real API/local inference or interactive
PowerPoint run occurred. Earlier admission/cancelled/classifier provenance and
remaining visual/I/O limits are in the evaluation, not silently removed.

I3 acceptance itself supplied no dependent authority. The later explicit continuation
and separately ready I4 contract now authorize only that bounded discovery slice. Do not recreate the removed backend or resume this completed
coordinator. AGENTS is current and requires direct repository work, with no relay
or model-provider allowlist.

## Previous accepted slice — I2 historical reproduction

**V2-8I-2 bounded explicit-turn worker** is independently accepted at source
`58662ecc074f7cc29bf29a0dd410d581ffca0eef` in
[the exact-source decision](reviews/V2-8I-2-58662ec.json). Read
[its contract/evaluation](V2-8I-2-EVAL.md),
[current runbook](v2-8i-2-evidence/RUNBOOK.md), HANDOFF and state before executing
anything. All234primary files passed3015/3015 plus4distinct native/persistence
cases. Focused79, corrected-development120 and independent313+4 successful repeats
overlap those cases. All nine gates, build/typecheck/50cells and119-image inspection
passed. The separate locale probe remains9pass/1standing failure. Initial106pass/
2invalid-fixture failures and all helper/governance corrections remain archived.

All6488historical files/196PPTXs and5canonical originals were restored/hash-verified;
the independent6847-file/211-PPTX snapshot also matches. Twenty-five exact new
original archives across both namespaces passed native identity inspection. Owned
cleanup saved/fsynced actual0projectDBs before a single exact-ID stop; bounded
absence/5544refusal and independent verification passed. No validation process or
owned service remains. The root packet-summary is its preserved pre-review snapshot;
[the closeout record](v2-8i-2-evidence/acceptance-closeout.json) attaches the decision
and cleanup without rewriting reviewed evidence.

For fresh reproduction use a new namespace, all-current snapshots and a new owned
service in a quiet window. Never recreate the removed service or rerun finishers
against restored canonical originals. No live model/local inference was used or
authorized. The internal B loop exercises multistep bounds; H proposals remain one
batch. I2 is complete; its stop boundary was observed. The later human continuation
is recorded above; dependent scope still needs its own concrete contract.

## Accepted prerequisite history

The following records are historical validation and cleanup, not the active
runner or permission to rerun old evidence helpers against restored originals.

The prerequisite **V2-8I-1 authenticated conversation/approval transport** is
independently accepted at `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d` in
[the exact-source decision](reviews/V2-8I-1-5170adc.json). Read
[the evaluation](V2-8I-1-EVAL.md), [runbook](v2-8i-1-evidence/RUNBOOK.md), state and
HANDOFF. All231primary files passed2933/2933 plus4distinct persisted/native cases;
build/typecheck/50cells and119-image inspection passed. Focused34cases and231
independent successful executions overlap primary files. The separate locale probe
remains9pass/1standing failure; it is not a passing case or a waived required gate.

All6102historical files and5canonical originals were restored/hash-verified;15new
implementer originals and2fresh independent HTTP originals are retained. The
reviewer verified6444current files/194PPTXs before its checks and all still matched
at its preservation checkpoint. The later evidence-helper label correction is
explicitly hash-bound. Exact owned-service cleanup saved/fsynced actual0catalog
before a single stop and independently verified exact-ID absence/5544refusal.
No process/service remains from this run. Do not rerun finishers against restored
canonical originals or recreate a removed backend. For new reproduction use a
fresh namespace, all-current snapshots and a new owned service in a quiet window.
I1 stopped after acceptance; later authorized scope is indexed above and in the roadmap.

H was the previous accepted baseline at `22e7c97`, with its separate
[decision](reviews/V2-8H-22e7c97.json). Its 2,898 primary cases, four distinct native
cases, 115 images and 13 original PPTXs remain historical evidence. Its owned
service was removed after a saved/fsynced zero-database observation. Later read-only
verification proves exact-ID absence and port refusal; do not recreate it or
reconstruct prior bytes. I1 requires fresh snapshots and its own owned service.

The approved [V2-8A foundation](ROADMAP.md#v2-8a-scope-proposal) is independently
accepted atd4f446c in [the decision](reviews/V2-8A-d4f446c.json).
State/[evaluation](V2-8A-EVAL.md) index exact source,209-file2393/2393 plus1distinct
headless case, independent148/148 and all command/visual evidence. The owned service
was removed after a saved zero-database observation;5544closed. Its absence does not
invalidate historical execution or supply a pass for a future run.

The human selected the recommended [V2-8B durable run core](ROADMAP.md#v2-8b-scope-proposal)
on 2026-10-19. Its [evaluation](V2-8B-EVAL.md) freezes the implementation/check
contract. Exact source `1fb39ff` is [independently accepted](reviews/V2-8B-1fb39ff.md).
The 212-file 2462/2462 matrix plus 2 distinct persisted native cases passed, as did
build/type/50 cells and independent 65 current-source checks. Earlier 204 independent
checks on `501f2f8` remain historical, with source-delta proof and 34 overlap. The owned
service was removed after a saved zero-database observation; port 5544 is closed. Missing
PostgreSQL on a future run means its checks are unexecuted, not automatically green.
Preserve known Fit/timeout/capture/locale/mixed-runSVG limits and the explicit
2ignored-original-PPTX provenance limitation. All original3untracked paths stay
untouched. No new feature, infrastructure, migration or deployment is authorized
by acceptance. Use the [active runbook](v2-8b-evidence/RUNBOOK.md) when reproducing; earlier
reports are historical evidence, not execution of a later source.

[V2-8C provider exchanges](ROADMAP.md#v2-8c-provider-boundary) are independently
accepted at `e41d509` in [the exact-source decision](reviews/V2-8C-e41d509.json).
State/[evaluation](V2-8C-EVAL.md) index 2533/2533 distinct primary checks, 137 separate
repeats and 320/320 independent executions with explicit overlap. Build/type/50 cells
and browser/native inspection passed. The separate locale probe remains 9 pass/1
standing failure. Current owned PostgreSQL was removed after a fresh saved/fsynced
zero-database observation; port 5544 is closed. The earlier reboot-lost service
has no saved pre-removal count; that count remains unavailable. All 3473 files in
the independent snapshot were restored/hash-verified and 10 new independent
originals preserved, in addition to 13 new implementer originals.

For reproduction use [the current runbook](v2-8c-evidence/RUNBOOK.md) and its full
215-file inventory, snapshotting all current evidence and ignored originals before
any generators and creating an owned isolated PostgreSQL service. Do not rerun
finish-evidence.py against restored canonical out/ originals: its fresh-source hash
checks deliberately refuse. Provider fixtures prove protocol/command plumbing, not
live model quality or the parent two-provider/common-search gate. No Assistant/new
UI is part of this slice. Acceptance permits planning only; the next candidate
remains unauthorized in state and future work lives in the roadmap.

[V2-8D provider-backed run preparation](ROADMAP.md#v2-8d-provider-run-preparation)
is independently accepted at8c1e5c4 in [the decision](reviews/V2-8D-8c1e5c4.json).
State/[evaluation](V2-8D-EVAL.md) index2643distinct primary checks,134separate repeats,
358independent executions with explicit overlap, build/type/50cells and inspected
browser/native evidence. Standing locale remains9pass/1fail separately. The reviewer
finished and staged its explicit decision before a usage-limit interruption; root
committed that unchanged record. Accepted V2-8C evidence is historical prerequisite
execution, not a new8D run.

The owned service was removed after a saved/fsynced zero-project-database observation;
5544is closed. Use [the8D runbook](v2-8d-evidence/RUNBOOK.md) and218-file inventory for
fresh reproduction, preserving all evidence and ignored originals first. The root
snapshot3631files and reviewer snapshot3898files were restored/hash-verified;23new
original PPTXs are retained across both namespaces. Existing visual/live-quality/
provenance limits remain. Do not rerun finish-evidence.py against restored canonical
out/ originals. Next-candidate status remains unauthorized; stop after this closeout,
and keep all future work in the roadmap.

[V2-8E bounded tool-conversation preparation](ROADMAP.md#v2-8e-bounded-tool-conversation)
is independently accepted at c71d65e in the
[exact-source decision](reviews/V2-8E-c71d65e.json).
State/[evaluation](V2-8E-EVAL.md) index complete final-source validation and acceptance. After the human resumed, the
221-file matrix passed2733/2733 plus4distinct persisted/native scenarios,110separate
repeats, build/type/50cells and115inspected images. Locale remains9pass/1fail separately.
The paused4067-file and resumed4183-file evidence snapshots and5canonical originals
were restored/hash-verified. Actual retained browser exports are distinguished
from newly produced headless originals. Historical paused results are retained in
the [assessment](v2-8e-evidence/paused-2026-10-21/assessment.json); their old unexecuted
status is resolved by the later complete packet, not erased.

The independent reviewer executed504/504successful checks plus the separate
9pass/1standing locale failure, inspected115packet/54fresh images and verified
16native archives. Its498packet repeats and6new probes are not added to2737.
All4443evidence files/96PPTXs plus5canonical originals were restored/hash-verified;
10fresh original PPTXs were preserved. The inherited
[native shape-ID issue](ROADMAP.md#native-pptx-shape-id-uniqueness) remains explicit.
The resumed owned service was removed after its fresh saved/fsynced actual0-project-
database observation; exact absence/5544closure are proved in
[cleanup evidence](v2-8e-evidence/owned-postgres-cleanup.json).
[The runbook](v2-8e-evidence/RUNBOOK.md) defines fresh reproduction; never rerun
finish-evidence.py against restored canonical originals. Acceptance and cleanup
are complete. No further feature is authorized; future scope is only in the roadmap.

The [V2-8F shared search boundary](ROADMAP.md#v2-8f-shared-search-boundary) is
independently accepted at `0cab854` in the
[exact-source decision](reviews/V2-8F-0cab854.json). [Evaluation](V2-8F-EVAL.md) and
state index 2,786 primary distinct passes, 48 separate focused repeats, all nine
gates, 115 inspected packet images and 595 independent passes. The latter repeat
592 packet cases and add three probes; they are not added to the primary total.
The reviewer inspected 54 fresh images and 16 native archives, restored all 4,918
evidence files plus five canonical originals, and retained ten fresh original PPTXs.
The interrupted unacknowledged 477-case report remains excluded; all 477 were rerun
with recorded exit 0. Locale remains 9 pass/1 standing failure separately.
The owned service was removed after a fresh saved/fsynced actual zero-project-DB
observation; exact-ID absence and port 5544 closure are
[verified](v2-8f-evidence/owned-postgres-cleanup.json). Use the
[8F runbook](v2-8f-evidence/RUNBOOK.md) with a new namespace and all-current snapshots
for reproduction; do not run generators against restored canonical originals.
Read current HANDOFF before any job. Acceptance and cleanup are complete; no next
feature or parent V2-8 completion is authorized by this decision.

The 2026-10-22 [architecture audit](V2-8-ARCHITECTURE-GAP-AUDIT.md) is a separate
inspection-only report; it executed no tests/models/services and changed no accepted
state. Proposed priorities live in [the roadmap](ROADMAP.md#v2-8-audit-followups).
The later clarification permits only the separate [V2-8G transport correction](ROADMAP.md#model-provider-stream-resource-bounds)
using code and deterministic fixtures, with no API-backed model or local inference.
The correction at `f3e784a` now has complete 224-file validation: 2,801/2,801,
plus four distinct persisted native cases, build/typecheck/all 50 cells and current
visual/resource observations. The separate locale run remains 9 pass / 1 standing
failure. Exact source is [independently accepted](reviews/V2-8G-f3e784a.json), with
668 successful independent executions, current visual/native inspection and no
blocking finding. [Its evaluation](V2-8G-EVAL.md) and state record exact evidence.
The owned service was removed after a fresh saved/fsynced zero-project-database
count and verified 5544 closure; [cleanup](v2-8g-evidence/owned-postgres-cleanup.json)
is complete. Read current handoff/state before work; audit proposals retain their
roadmap gates and acceptance authorizes planning only.

On a shared machine inspect load, free memory and `/proc/pressure/io` and wait for
an appropriate quiet window. Do not interrupt unrelated work. Forge PostgreSQL
uses TEST_PG_URL or the isolated default on port 5544; other projects' databases
are not substitutes. When absent, PG contract/concurrency/fault/browser checks
remain unexecuted.

The canonical test entrypoints are:

```sh
node --test test/dev-protocol.test.js
node --test --test-concurrency=1 test/v2-project-catalog-7c.test.js test/v2-project-catalog-http-7c.test.js test/v2-project-catalog-chrome-7c.test.js
node --test --test-concurrency=1 test/v2-runtime-8b.test.js test/v2-runtime-process-8b.test.js test/v2-runtime-postgres-8b.test.js
node --test test/v2-edit-chrome-7a.test.js
node --test test/v2-projects-6c-sqlite.test.js
node --test test/v2-projects-6c-postgres.test.js
node --test test/v2-projects-6c-concurrency.test.js
node --test test/v2-projects-6c-faults.test.js
node_modules/.bin/vite build --config app/web/vite.config.js
npm run typecheck
node tools/v2-benchmark.mjs --out out/v2-8i-2-benchmark --raster none
```

Use a process-group watchdog for each browser file and run browser files strictly
serially; each may rebuild shared dist. Bulk inventory and exact bounded runner
commands are in [the current validation runbook](v2-8i-2-evidence/RUNBOOK.md) and its linked
`validation-plan.json`. Do not run plain npm test
concurrently with browser/build validation. The benchmark must report all 50
cells, not merely the 12 benchmark assertion tests. Render/preview and inspect
PPTX rasters when claiming render quality; raster-none benchmark results alone
measure compiler/OOXML properties, not visual quality.

## If the original planner/reviewer is unavailable

Recover the authorized scope from the active task/evaluation and linked roadmap.
Complete already approved validation, document unavailable checks accurately,
commit/push scoped work and prepare a review request: baseline → pushed SHA,
original scope/non-goals, changed files, exact tests and visual evidence, defects,
corrections, known failures and recommendation. Leave review pending without an
independent reviewer. A reviewer follows agents/REVIEWER.md and issues ACCEPT or
HOLD. The planner follows agents/PLANNER.md only after that decision; next-candidate
status never grants coding authorization.
