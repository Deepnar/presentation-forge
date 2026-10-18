# V2-8A — validated tool/context foundation

Approved2026-10-18: **Tool/context foundation first**. Accepted baseline
484875ff5c826a34028889ed2fc6118bfdc407ad; frozen implementation **d4f446c7b2fcae851c37d1a46288cf91317c38b4**,
branchv2. Validation in progress; no V2-8A acceptance.

The [approved bounded contract](ROADMAP.md#v2-8a-scope-proposal) and
[as-built architecture](V2-8-AGENT-ARCHITECTURE.md) define scope and authority.
Strict scoped tools/context use the live engine; no Assistant UI, provider calls,
durable runtime, storage migration, deployment or paid infrastructure is added.

Early independent audit found generic result contracts and table dimension edits
could violate the content boundary. Exact nested discriminated schemas and fixed
table row/column counts correct both, with fail-first cases retained. A reviewer
also caught the duplicate-data case being masked by invalid dimensions; both
updates are now individually valid. Real regeneration preservation and the existing
TypeScript generated-usage runtime test are included. Pre-freeze93/93 and typecheck
pass; final209-file execution, native/visual review and separate acceptance pending.

Reproduction: [runbook](v2-8a-evidence/RUNBOOK.md),
[inventory](v2-8a-evidence/validation-plan.json),
[preliminary attempts](v2-8a-evidence/attempts.json). Previous C3 execution does
not validate this source. Standing BYOK locale, B2 timeout, Fit and capture limits
retain their separate roadmap ownership.


First complete attempt atf5591f7: bulk2143/2143; serial stopped after23/26 files,
170pass/1fail,0skip/cancelled. Remaining37 serial and42 PostgreSQL cases were
unexecuted at that stop; build/type/benchmark/native commands had not run.
The source-retry failure is distinct from the old restore timeout. A bounded full
diagnostic reproduced a trusted gesture miss (down on button; up3.4ms later on
paragraph after26px movement; no import request). This establishes the traced
reproduction's harness cause, not the exact original untraced sequence.

The canonical B2 click helper now waits mount animations/fonts, uses instant nearest
scrolling and3 stable/unobscured center comparisons before the same trusted click.
All original assertions remain. Corrected complete file passes11/11; a separate
1-case trace asserts trusted down/up/click all remain on the same stable action,
with one dark-mode import200 and the saved editor. Initial helper draft failures
are retained in attempts.json. No app/legacy product source changed.
The entire209-file matrix now reruns on the refrozen source; no passing retry
silently substitutes for failed original execution. Old restore timeout remains open.
