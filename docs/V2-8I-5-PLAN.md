# V2-8I-5 — explicit Auto host policy and bounded pickup

## Authority and current status

The2026-10-27 continuation authorizes preparing the immediate dependency after
acceptedI4. EntryHEAD360c44554a57ab1961374dc2b13bea6ac0df5c08; accepted source
8378a20a819de569ef7b10b747d7ba6c481f529e, separately accepted in
[the decision](reviews/V2-8I-4-8378a20.json). Branch/push v2/origin/v2.
This is a proposed contract, not implementation authority. The roadmap explicitly
requires agreement on host/provider scheduling; contributor rules also require
human direction for provider-spend/security/data-handling changes. No runtime,
credential/configuration, database, model or production change has been made.

## Recommended direction and rationale

Start with an explicitly enabled, operator-invoked **Auto-only** host bridge for
existing-deck turns. It prepares proposals and executes only already-approved
canonical runs. Keep BYOK and local routing unchanged in their existing flows;
do not introduce those routes into this new host bridge yet. No fallback between
providers, accounts or billing owners. Validation uses offline fixtures only.
Implementation approval does not enable the bridge or authorize a real model run.

Source inspection shows why generic legacy role resolution is insufficient:
`src/cloud.js` can discover remote/local models and resolve fallback credentials;
`resolveUserSecret` can return a stored key even for a different provider ID.
`src/account.js` uses ambient async context; project ownership is exact email,
whereas account budgets use numeric user IDs. The new boundary must bind those
identities explicitly, not infer policy from ambient settings or a discovery hint.
Existing H limits are per-project/turn; they are not account-wide spend admission.

## Proposed bounded implementation

1. **Explicit trusted owner.** One invocation handles one non-null exact project
   owner. Resolve its current account ID/email from the account store and reject
   missing, deleted or ineligible accounts. Snapshot plain inputs before awaits;
   no admin bypass, arbitrary owner list, ownerless hosted fallback or browser
   owner/provider/URL/key input. Recheck eligibility before each provider dispatch.
   I2 remains responsible for current project ownership/generation/leases/revisions.
2. **Explicit trusted provider policy.** Default disabled; require a server/operator
   enable flag and configured Auto profile/model/capabilities. Read configuration
   locally without `/models`, Ollama, health or token probes. Resolve only the
   existing operator Auto secret into a transport closure; never use generic
   user-key fallback or expose secrets in turns, traces, CLI output or context.
   Missing/unsupported configuration refuses before dispatch. A configured
   capability is an operator assertion, not live model qualification.
3. **Account admission before network.** Reuse existing account Auto admission
   and conservative reservation/settlement semantics in a provider decorator.
   Bound each exchange by canonical context/history/output limits, reserve an
   explicit positive estimate atomically before network, and refuse if admission
   cannot be established. Do not treat client limits or H counters as spending
   authority. Settle known validated usage once; unknown/dispatched/cancelled usage
   retains its reservation. A crash may conservatively retain an estimate, never
   create permission for a free retry. No new billing ledger, price guarantee,
   automatic rebilling or distributed account-quota claim. Initial adapter supports
   the existing single account-database deployment; shared-host account admission
   remains the separate roadmap contract.
4. **Finite headless pickup.** Compose accepted I4 discovery and I2 worker through
   a backend-injected library and thin operator `agent-chat pickup` action.
   Input is an exact bounded object containing cursor, maxScannedRows1..50,
   maxWorkItems1..5 and maxElapsedMs1000..110000. A fresh internal worker identity
   is generated per invocation. Process sequentially, one metadata row per read,
   so a stopped invocation never advances past unhandled hints. Filtered rows
   count toward scanned bounds and still advance. Return the last completed
   position, completion/stop reason and bounded private metadata only, with the
   existing131072-byte envelope cap. No private bodies, provider keys or capability
   tokens. Fixed sanitized errors include truthful partial progress when an
   earlier canonical operation already completed; the cycle is not atomic.
5. **Canonical effects only.** Submitted turns enter I2 preparation under approved
   provider/account policy. Preparing/expired/approved-terminal hints are observed
   or fenced by I2; they do not cause a new dispatch. Approved active runs enter
   I2 execution without provider lookup or account spending. Awaiting human
   decisions remain untouched. No approval, enqueue bypass, second queue, scene
   mutation or reconciliation path is added. Cancellation stops new work and
   aborts in-flight preparation; an already-entered canonical commit may finish.
   The elapsed budget is an admission/cancellation bound, not a hard SQL deadline.
6. **No activation surface yet.** No HTTP route, server auto-start, daemon, cron,
   background polling, browser/SSE worker ownership, user enumeration or deployment.
   CLI owner is trusted operator input and accepts no inline provider/key/URL.
   Existing explicit work/discover actions remain compatible. Later authenticated
   wake/scheduling calls this same headless boundary after its separate contract.

The exact provider-decorator/error mapping and conservative estimate are finalized
against existing H/Auto semantics before implementation. If those semantics cannot
preserve account admission and unknown-usage fencing without a broader ledger or
policy change, stop with that concrete conflict instead of silently bypassing it.

## Focused verification and acceptance

Use temporary SQLite/account stores and injected or loopback fixture providers.
No live gateway, local inference, GPU work, existing database or removedI4 service.
Proposed required inventory is four narrow gates, not the historical nine:

| Gate | Relevant evidence |
|---|---|
| Pickup/policy unit contracts | Default-off/config/owner snapshots; exact input/response caps; sequential bounds and resumable filtered pages; account admission failure produces zero network calls; no credential fallback/leak; cancellation and partial-progress behavior |
| Actual SQLite integration | Submit→pickup→proposal→explicit approval→pickup→reopen/history; same-owner identity/budget binding, two-owner isolation, stale/clear/delete races, no automatic approval; known/unknown usage reservation and replay behavior |
| Operator process entry | Bounded private JSON, forbidden authority flags, default-off refusal and one loopback happy flow; prompt exit/signal cleanup using isolated FORGE_CONFIG_DIR/FORGE_DB_PATH |
| Typecheck | Changed TypeScript and package boundaries |

Run lightweight protocol/schema consistency checks when updating the gate mapping.
Reuse accepted I2/I4/transport tests and evidence for unchanged internals. No full
legacy bulk, browser, PostgreSQL, production build,50-cell benchmark or native
render sweep by default. No new SQL/store method is proposed; PostgreSQL behavior
is inherited, not freshly executed. Add narrowly affected cases only if actual
implementation changes those boundaries. Record real counts, overlaps, exclusions
and remaining risks; do not invent leaf totals or turn unavailable services green.
Independent review inspects the diff/evidence and chooses small challenge checks.

Acceptance requires all proposed policy/cycle behavior exercised, no unfenced
network call, no automatic edit approval, exact owner/account association, no
private output, bounded continuation and separate exact-source ACCEPT/HOLD.
Preserve the standing BYOK locale failure and inherited visual/provider/native
limits; they are not new failures or reasons to rerun unchanged old suites.

## Look-ahead and stop point

The later Assistant uses authenticated submit/status/decision APIs, settles editor
drafts before saved-revision capture, and wakes host work independently of its tab.
This boundary does not make saved chat provider context or add search/creation.
Per-account distributed admission and provider qualification remain explicit
roadmap dependencies. Provider/admission injection keeps that future change out
of canonical turn/run authority and document storage.

After approved implementation, update as-built architecture/state/evaluation,
record focused evidence and independent decision, push only scoped changes to
origin/v2, then stop. No Assistant, scheduled pickup, BYOK host route, production
activation, real model call, migration or paid infrastructure follows automatically.
