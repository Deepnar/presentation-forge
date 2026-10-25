# V2-8I-2 initial source review — correction required, acceptance pending

Reviewed committed source/tests `b07052c2ccfa1de14735d73e000214efff4afc3e`
against accepted I1 `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`, the
[approved contract](../V2-8I-2-EVAL.md) and
[plan review](V2-8I-2-plan-3ffebec.md). Pushed checkpoint
`d7f231452036bc54c1bacf68c242f56d2381d25b` and `origin/v2` both contained the
candidate before inspection. Reviewer/context: `/root/turn_contract_review`;
implementer: `/root`.

This is source review only. No test, service, model call, generator or resource
qualification was executed by the reviewer. Root retains the execution slot.
The initial pass found a narrow CLI-result discrepancy. Subsequent implementer
development execution exposed two invalid H fixtures that this source review
missed; the corrected assessment below preserves that mistake and required fixture
correction. No implementation ACCEPT is supplied.

## Actionable findings

**[P2] CLI exits zero when an approved execution is refused or yields unfinished.**
At exact candidate `src/agent/turn-cli.js:48–50`, exit status considers `result.ok`,
terminal failed/cancelled/expired run status and selected terminal turn states, but
ignores the worker's disposition/reason. At `packages/agent/turn-worker.ts:85–86`,
a busy claim returns a successful status wrapper with `reason:'busy'` and an
unchanged running run. A lost lease at lines90–98 likewise returns an authoritative
status wrapper rather than `ok:false`. Both therefore exit0 from the CLI despite
execution refusal. Pre-aborted still-queued approved execution also exits0, and
observing another host's `preparing` turn exits0. A step-limit reason is likewise
ignored by that exit classifier, but current valid one-batch H work cannot reach
the cap; it is not a reachable CLI scenario. Existing CLI cases at
`test/v2-turn-worker-process-contract.js:111–140` cover successful/replayed work,
invalid input/config and signals during preparation; they do not pin these exits.

The persisted JSON is truthful and no extra work or corruption follows from this
finding. The mismatch is with the planned refusal/noncompletion CLI semantics;
shell callers cannot rely on exit status as intended. Narrow correction: preserve
the metadata and canonical worker behavior, but explicitly classify CLI exit status
and exercise real held-lease/refused/abort paths plus a lease-loss contract. Do not
add retry, cancellation, queueing or a second lease authority to fix an exit code.

The implementer acknowledged this initial discrepancy during review and pinned
the intended replacement table: busy, lease-lost, aborted, step-limit and initial
preparing/busy yield exit1; failed/refused/cancelled/expired/needs-user-action also
remain1. A final persisted succeeded run dominates a raced terminal refusal and
returns0. Awaiting explicit decision and an ordinary settled reply return0. The
new table is a bounded CLI clarification, not a new product-policy decision.
Correction source and new assertions were not yet reviewed or executed in this
note. Step-limit exit classification is defensive for the internal seam; it is not
a reachable current-H CLI probe. Initial source/admission evidence must remain
historical.

## Independently inspected source conclusions

- `turn-worker.ts:54–60` copies exact binding/input and captures the validated
  options signal before its first await. `turns.ts:61–70` adds H inspect with the
  same synchronous boundary and existing transaction/reconciliation/generation
  checks. Unknown keys, executable accessors and caller-owned mutation are covered
  in both-store contracts; the existing binding suite gains inspect without
  weakening its prior operations.
- The new H lookup deliberately retains existing `turnView`, including private
  visible content. Worker status instead constructs explicit turn metadata at
  `turn-worker.ts:63–68` and includes only canonical `RunView`; it never spreads
  the full turn, preparation result, proposal or advance tool result. Every final
  status promise is awaited inside the fixed-error catch at lines101–105. The
  contract covers sentinels and an error on the final read, concurrent approval,
  clear and owner revocation. No new HTTP route, logger or provider-data storage
  is introduced.
- A submitted turn delegates exactly once to H prepare with persisted revision
  and the supplied provider; missing provider refuses before dispatch. Approved
  execution derives only the persisted run ID, uses B claim/advance/renew and
  exits on canonical refusal. The eight-call loop counts actual successful
  advances separately, never polls/reclaims on busy or retries after dispatch,
  and creates no worker timer/queue/approval/scene authority. Existing H exchange
  deadlines, cancellation accounting and no-dispatch recovery remain intact.
- Final owner/generation-checked status controls reported state. A phase names
  what this invocation attempted, while turn/run fields describe what persisted;
  concurrent approval cannot be misreported as still waiting. Clear cancels the
  linked run through H before B can apply a cached approval; the final lookup
  refuses the old generation. Revocation/deletion suppress cached status.
- Abort stops new claims/steps, while an already-entered B transaction retains
  canonical commit/fencing semantics. Approved execution is not converted into a
  user cancellation. Existing leases expire for explicit later recovery; neither
  cap nor shutdown forges a release token. CLI handlers are scoped/removed in a
  finally block and the selected store is closed. The CLI pre-inspects state and
  avoids otherwise-unused provider files for approved/observation paths, including
  unreadable-path assertions. Factory profile/method capture preserves the
  explicit trusted ModelProvider capability without selecting a default/fallback.

## Fixture and governance inspection

**[P2, fixture correction] The cap/shutdown fixture is not a valid H proposal.**
The shared normal preparation cases use an actual loopback ModelProvider and
ordinary single-batch H approval. However, the fixture at
`test/v2-turn-worker-contract.js:27–40` expands an H proposal to nine steps. It
parses a valid B run plan and updates its digest, but H `loadState` additionally
requires `canonical.steps.length===1` at `packages/agent/turn-store.ts:105`.
Normal H decide therefore refuses the modified stored proposal. My initial source
note incorrectly characterized this as a valid H fixture; I inspected B plan/digest
validation without completing the H canonical invariant check. That statement is
withdrawn. The tests cannot demonstrate worker cap/shutdown behavior as written.

Root reported a resource-qualified initial-source development run of108 leaves:
106pass/2fail, zero skips/cancellations. Both failures are these cap/shutdown
fixtures at H's canonical load check. These counts are implementer-reported; this
pass did not independently execute or reconcile the raw development log. They do
not describe a passing suite. Preserve the raw failed attempt; do not relabel it as a pass or weaken H to accommodate the fixture.

The proposed narrow correction is appropriate: extract the canonical claim/advance/
renew loop into internal `packages/agent/turn-work-execution.ts`, injected with the
existing runtime only inside the package. The public worker still accepts only
explicit turn identity and derives its run ID from H; no extra work input, public
adapter execution capability, approval route, queue or storage authority is added.
Direct helper tests can exercise actual B nine-step plans, canonical leases,
receipts, cap and yield/recovery on both stores. Normal H worker tests must retain
the single-batch model/explicit-approval path and add a negative expanded-proposal
assertion. Current valid H work cannot reach the eight-call cap; make that limit
of current coverage explicit rather than claiming a real CLI cap scenario.

An abort arriving after the actual one-step H transaction has entered may still
leave a succeeded run, as B already permits. Test and report that persisted result;
use the real B multi-step helper seam for between-step yield/recovery. The proposed
helper and replacement assertions are not yet source-reviewed or executed here.
No new public general-purpose executor or caller-supplied run ID belongs in the worker's
public input. Assertions for human preservation, ordinary approval and H's strict
canonical proposal invariant must remain intact.

The child fixture uses IPC readiness before work, then real SIGKILL checkpoints.
Preparation checkpoints follow committed reserved/dispatched/known rows. The
run-uncommitted checkpoint is inside canonical saveScenes; run-committed follows
the committed receipt transaction. Recovery advances the accepted injected DB-time
seam, retaining real storage, provider/receipt state and explicit restart. The
injected child provider is separate from the parent's HTTP fixture, so the parent
HTTP count is not a measurement of the child's exchanges. Claims of actual
external-provider dispatch must not be inferred from those counters.

Three new entry files register SQLite worker, PostgreSQL worker and both-store
process/CLI contracts. PostgreSQL absence produces an explicit skipped/unexecuted
case; final acceptance cannot count that as green. The frozen plan partitions234
files into196bulk,26serial and12PostgreSQL entries; the process file containing
both stores belongs to the isolated PostgreSQL group. Governance adds I2's focused
three-file inventory requirement and a negative missing-process-entry assertion,
preserving prior milestone requirements. The full union, actual counts and all
behavior still require complete execution; source inspection alone proves no
passing leaf, and the reported initial108-leaf run has two retained fixture failures.

Four distinct protocol/backend worker/native cases, all nine common gates,
234-file full regression, actual backend/process/CLI evidence, current images and
original archive/preservation/cleanup evidence, plus final separate execution and
exact-source review remain pending. No final-gate leaf counts are inferred from
I1, initial syntax/governance checks or the failed108-leaf development attempt. The
standing locale remains a separate failed probe, not a nonexistent-gate waiver.

Only this note was written by the reviewer. No product/test/state/evidence-helper,
snapshot or archive was modified, and no push or acceptance was issued. Root owns
the narrow correction, replacement freeze and validation; stop remains after I2.
