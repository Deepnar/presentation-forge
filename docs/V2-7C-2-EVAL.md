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
