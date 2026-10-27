# V2-8I-5 — Auto-only host pickup evaluation

Accepted entry baseline8378a20a819de569ef7b10b747d7ba6c481f529e (I4), separately
accepted in [its decision](reviews/V2-8I-4-8378a20.json). Branch/push v2/origin/v2.
The human2026-10-27 answer “Approve Auto-only (Recommended)” authorizes
[the clarified contract](V2-8I-5-PLAN.md), after independent plan reviewf67bab6.
Source5cf5b5cff53c781291ba094163c68eb189bfbc66 is independently accepted in
[the exact-source decision](reviews/V2-8I-5-5cf5b5c.json), from the separate
reviewer context /root/turn_contract_review. Acceptance covers the approved
default-disabled offline contract; it authorizes no activation or real model spend.

## Implementation and bounded behavior

`packages/agent/turn-pickup.ts` composes one-row I4 discovery with canonical H/I2
inspection and work. Exact non-null owner/input snapshots precede awaits; finite
sequential scan/work/time limits and completion-only cursors avoid skipping an
unfinished hint. Canonical safe pre-dispatch recovery may prepare; ever-dispatched
ambiguity remains fenced. Approved runs execute without provider/secret lookup.
Results whitelist metadata and cap the entire JSON envelope at131072UTF-8bytes.

`src/agent/auto-host-policy.js` requires explicit hosted enablement, current exact
account-email/ID eligibility and locally configured Auto profile/model/capabilities.
No model-list, local-model or provider fallback occurs. Secrets remain transport
closure state. Each provider exchange atomically reserves account Auto budget
before network. Estimate = complete prepared wireUTF-8bytes + output-token cap.
Known normalized input+output usage settles once in one SQLite transaction; cache
counts are already included in input. Unknown/malformed/aborted or failed settlement
retains its reservation. Over-estimate actual usage is charged fully and closes
further dispatch for the invocation. This is token estimation, not a hard dollar
ceiling or shared-host account-admission guarantee. Existing schemas/ledgers remain.

`agent-chat pickup --owner OWNER --input FILE` is the thin operator entry, rejecting
project/provider overrides and returning bounded private status. Bounded scan/work
continuation can exit0; failed/refused/unfinished outcomes exit1. The bridge stays
disabled by default. This development made no real API/local inference call,
production configuration change, service/container, scheduler or Assistant UI.

## Focused test plan and status

[The selected inventory](v2-8i-5-evidence/validation-plan.json) contains three new
entry files and typecheck, four required gates. Affected governance tests also
exercise milestone/schema changes. No old bulk/browser/PG/build/50-cell/native
sweep is needed because those implementations are unchanged. PostgreSQL is not
executed or relabeled green; old I2/I4 evidence is accepted prerequisite evidence.
Temporary SQLite/account databases and loopback/injected providers are the only
runtime fixtures. No historical/canonical artifact generator is invoked.

Final exact-source execution2026-10-27UTC, Node24.16.0:

| Check | Total | Pass | Fail | Skip | Cancelled | Duration |
|---|---:|---:|---:|---:|---:|---:|
| New policy/cycle unit |19|19|0|0|0|247ms|
| Actual SQLite integration |8|8|0|0|0|563ms|
| Child-process CLI |5|5|0|0|0|3324ms|
| Required test total |32|32|0|0|0|4134ms|
| Directly affected governance |36|36|0|0|0|see raw log|

Typecheck exited0 in1466ms. [Summary](v2-8i-5-evidence/summary.json) links
four per-gate metadata/log records; raw observed file markers bind each required
suite to the selected inventory. [Source hashes](v2-8i-5-evidence/source-manifest.json)
match frozen runtime/test/governance bytes. Governance36 ran on identical affected
contents before the source-freeze commit; it is additional evidence, not one of
the four runtime gates. There are68 distinct new/affected leaves in these two
sets, without adding overlapping development attempts or independent repeats.
Durations are small fixture-run observations, not production percentiles.

The gates ran serially at nice10/ionice2:7 with3minute watchdogs. Shared I/O
pressure/competing work remained; [resource observations](v2-8i-5-evidence/raw/final-resource-preflight.json)
justify only these short headless checks, not expensive validation. They took
5.6seconds combined. No unrelated process was interrupted. All32 selected new
cases executed; the excluded unchanged historical matrix, PG, browser/build/
benchmark/native and live-provider work are unexecuted in I5, not passes.
Independent review inspected all32 required and36 affected leaves, the four gate
records and exact source hashes. It executed three new supplemental challenges,
3/3pass and0fail/skip/cancelled: competing sessions against one remaining actual
account reservation, in-flight preparation cancellation, and actual CLI SIGTERM.
These remain separate from retained68 cases. No prior passing case was repeated.
[Review evidence](v2-8i-5-evidence/independent/packet-audit.json) and
[the report](reviews/V2-8I-5-5cf5b5c.md) record commands, resource observations
and explicit test-slot release. No blocking product regression remains.

## Development failures and corrections

The initial unit run reported16pass/3fail of19: returned cursor objects retained
the internal JSON-clone null prototype rather than the public cursor DTO shape.
Cursor normalization was corrected, retaining all assertions. The first combined
run then reported29pass/3fail of32TAPtests, including one grouping parent (31leaf
cases:28pass/3fail). One fixture retained a closed database handle; two expected
needs-user-action where accepted H returns refused/provider-error. Those fixture
expectations were corrected from source, with no product/assertion relaxation.
The corrected development run passed31/31. A new CLI failure-exit assertion then
raised the final inventory to32; all32 passed on the frozen source.
The first governance run35pass/1fail of36 exposed missing new gate IDs in the state
schema; the exact schema correction passed36/36. All raw attempts are retained in [raw evidence](v2-8i-5-evidence/raw).

## Limits and stop

Single account-database deployment only; broader per-account distributed admission
remains in [the roadmap](ROADMAP.md#assistant-trace-budget). Conservative unknown
usage can retain budget after a crash, without automatic retry/refund. An elapsed
budget cannot cancel an entered database commit. Live-provider quality, browser
Assistant/wake integration, provider search/creation and native consumer qualification
retain their roadmap contracts. Standing BYOK locale and I4's unavailable historical
pre-removal count remain inherited limitations, not new I5 test results.

All four required gates and independent acceptance are complete. State, roadmap,
working agreement and handoff now identify accepted I5. The frozen implementation
SHA remains distinct from later evidence/documentation commits. Stop after the
scoped origin/v2 push; no dependent implementation, activation or real model spend.
No atomic in-flight account-revocation fence or hard SQL deadline is claimed.
