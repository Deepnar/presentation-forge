# Handoff — audit delivered; V2-8G code awaiting full validation

2026-10-22, branch `v2`, scoped push `origin/v2`. Accepted baseline remains
`0cab854bce04b862060829812a9ab6ff0b765fd9`, independently accepted in
[the V2-8F decision](reviews/V2-8F-0cab854.json). V2-8G frozen implementation is
`f3e784ac6227f46628dc99a54762f6a861eeed64`; product adapter bytes equal `ec67315`,
with four subsequent test cases. Later documentation commits do not change source.
Do not promote this implementation or claim completed acceptance from focused tests.

The [architecture audit](V2-8-ARCHITECTURE-GAP-AUDIT.md), committed at `fea5b23`,
completed the requested inspection/planning phase from entry `ee52b50`. That phase
executed zero tests/models/services and changed no accepted state. It recommends
keeping Forge's native runtime. Its findings, P0/P1/P2 proposals and approval gates
are registered only in [the roadmap](ROADMAP.md#v2-8-audit-followups). Framework APIs,
licensing/current versions and real-model quality were not externally qualified.
No other audit proposal is approved for implementation.

After the report was presented, the clarification permitted writing code and
prohibited API-backed models and local inference. The separate
[V2-8G transport correction](ROADMAP.md#model-provider-stream-resource-bounds)
was implemented within that scope: fixed response-byte storage, monotonic deadline
checks and periodic yielding, late-fetch/read fencing and cancellation before reader
unlock. Both existing model protocols/configuration/error/usage/privacy contracts
remain unchanged. No framework, UI, routes, credentials, persistent data policy,
model configuration, source integration or deployment was added.

[V2-8G evaluation](V2-8G-EVAL.md) and evidence retain:

- Initial 14 injected-stream cases: 2 pass / 12 fail, 0 skip/cancel. Four synthetic
  child probes hit their 1500ms watchdogs; Node leaves failed, not cancelled.
- Same 14 assertions after correction: 14/14. First expanded run: 195/196, with
  a tracking-only state-pointer failure; its unchanged rerun passed 196/196.
- Final tests-only extension: **200/200** across eight complete offline files,
  including all 18 stream cases, 0 failures/skips/cancellations, 5.625s wall time.
  Earlier runs overlap; never add their totals. Exact frozen source, command,
  file markers, hashes and failed attempts remain in the new evidence namespace.
- Separate high-effort static reviewer `/root/v28g_source_review`: 0 tests / 0 edits,
  no confirmed product defect, no ACCEPT/HOLD. It inspected ec67315/bf2c6b3; the
  product adapter is unchanged afterward. Subsequent caller-abort/processing-deadline
  tests address two coverage gaps. Empirical retained-memory observation remains
  unexecuted; source inspection of one fixed buffer is not an RSS/heap measurement.

All current full acceptance gates are explicitly **unexecuted**. The 224-file plan
has 216 remaining files: 182 bulk, 26 serial browser/build owners and 8 PostgreSQL.
[Unexecuted scope](v2-8g-evidence/unexecuted-scope.json) and
[runbook](v2-8g-evidence/RUNBOOK.md) index exact coverage and missing command/native/
visual checks. Current-source typecheck/build/all50cells/native preservation/full
independent acceptance have not run. No exact leaf count is asserted for unrun files.
The protocol checker validates metadata only, never behavioral acceptance.

The audit and code follow-up made **zero real model API calls and zero local
inference calls**. New stream cases use explicitly injected synthetic transports;
other selected cases use loopback fixture HTTP, not a model server. No browser,
PostgreSQL/Docker service, worker, renderer, benchmark, build/typecheck or model
process was launched. No sustained intensive-run quiet qualification was performed;
the short CPU/memory/backing-storage precheck applies only to the focused cases.
Elevated global I/O PSI has unresolved provenance. No competing workload was altered.
No owned validation service or job remains. Do not start heavy jobs without measured
headroom, current evidence/original snapshots, isolation and the existing contract.

Existing evidence was not regenerated. Historical V2-8F execution/cleanup remains
historical, not a new pass. BYOK locale was not rerun for V2-8G; native-ID, SVG,
narrow/fit and provenance limits remain in their prior records. Interactive
PowerPoint/live-quality checks remain unexecuted. Original three untracked paths
are untouched: `.agents/`, `PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`,
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`.

Stop at the current code/validation checkpoint. Continue only the approved transport
contract; the parent V2-8, durable turn/data-policy decisions and Assistant surface
retain their [roadmap gates](ROADMAP.md#v2-8-audit-followups). No self-acceptance or
progression into another feature, infrastructure, migration or deployment.
