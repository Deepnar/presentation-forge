# V2-8A — validated tool/context foundation

Approved2026-10-18: **Tool/context foundation first**. Accepted baseline
484875ff5c826a34028889ed2fc6118bfdc407ad; frozen implementation **f5591f7174006d4282cde56532e280e1184f6951**,
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
