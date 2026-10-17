# V2-7C-2 — unified project discovery

Implementation under validation, 2026-10-17, branch `v2`. Accepted baseline:
f79ae07d6ad1696da3106a2a1148ae0ce7f58f51; task entry5190887.
The human approved the recommended single Projects grid containing saved editable
presentations and generated decks/reports, with search/type filters and distinct
original/copy entries. The bounded contract is [in the roadmap](ROADMAP.md#v2-7c-2-plan).

The grid now reads the existing saved/generated catalogs independently, retains
source-qualified identities, preserves report-only routes and explicit editor
handoff, and combines metadata/content search with type filters. List reads never
import or mutate either document. Deletion identifies the selected copy.

The latest implementation checks pass: catalog units 17/17, actual HTTP 8/8,
complete actual Chrome 16/16 (including development StrictMode), governance 22/22.
These preliminary working-tree runs are not the final matrix. The 205-file
inventory has 176 bulk files, 25 serial browser/build owners and four PostgreSQL
files. All final gates remain pending until exact-source execution completes;
no acceptance is claimed. Commands are in the [runbook](v2-7c-2-evidence/RUNBOOK.md).

Independent read-only review found modal shortcut/focus escape and deletion
errors behind the modal. Scoped corrections keep navigation shortcuts deferred,
focus contained while busy, and errors visible/focused in the selected-copy
dialog. A new development check reproduced StrictMode invoker restoration
failure (0 pass / 1 fail, 15 other cases unexecuted by filter); combining listener
cleanup and restoration corrected it. The complete 16-case browser rerun passes.
Final dialog captures wait for fade-in completion and settled hit targets.

Earlier attempts are retained in ignored `out/v2-7c-2-validation/`: the expanded
unit run caught a malformed undefined list being treated as empty (16 pass / 1
fail), corrected by explicit source-array validation. The initial HTTP run was
6 pass / 2 fail from an invalid test import mode and its dependent missing copy;
the corrected fixture passes all eight. Chrome attempts were 8/11, 11/13 and
14/15 passing; their failures were test receipt/shape/selector expectations and
route/search timing. Assertions were preserved while fixtures and readiness
conditions were corrected. The initial JSX build caught an extra sidebar brace;
the corrected production builds pass. Final counts will identify each executed
gate separately from attempts and repeated backend runs.

Known BYOK locale, Fit, B2 restore timeout and C1 transient narrow capture records
remain separate roadmap items. No Auto writing-quality, hosted deployment or
interactive Microsoft PowerPoint claim. Preserve C1 cover bounds, original
report/research/script access, B2 explicit conversion and canonical authorization.
No deployment, migration, toolbar, agent runtime or other feature scope.

The first exact-source matrix stopped on the canonical7A file:26 pass /2 fail,
zero skip/cancelled. Its servers isolated config/DB but inherited the real legacy
deck directory; unified discovery correctly exposed it. The helper also measured
click coordinates before generated loading settled, reaching Delete in place of
Open. Separate scratch deck roots and read/animation readiness correct the test
fixture without weakening leaf assertions. The independent reviewer confirmed
this classification. Raw failure output stays in ignored scratch because it
contains real deck titles. The other24 serial files and later groups were
unexecuted in that superseded attempt. The frozen source is now
`9fd8b92c84876de92f6713cb2b513876f9036a83`; every final gate is being rerun.

That source's complete matrix passed 2320/2320, including199 serial cases,
with build/typecheck/50 cells passing. The separate PostgreSQL catalog repeat
was15 pass/1 fail: saved-delete error recovery stayed on an unchanged dialog.
The original failure did not capture pointer events. An unforced instrumented
case passed1/1; controlled completion of the existing view animation after
measurement reproduced the failure0/1 with unchanged assertions. Delete moved
28px left; trusted down/up/click landed on the dialog background and DELETE
attempts remained zero. The same controlled check with actual animation readiness
passes1/1. Each filtered diagnostic left15 other cases unexecuted; none substitutes
for the complete file. The separate reviewer inspected this causal proof.

The correction changes only the catalog browser helper: wait for actual view/modal
animations before the existing stable-geometry/hit-target gate. Runtime and
assertions are unchanged. Exact traces/counts are in attempts.json and
attempts/dialog-transition-trace.json. Remaining supplemental/native commands were
unexecuted after the stopped repeat. The final frozen source is now
`bf1bd8f7dbce827be04ed530b2e7330b385e8baa`, with every gate rerun for one coherent
final packet.
