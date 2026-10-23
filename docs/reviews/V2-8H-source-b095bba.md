# V2-8H cancellation correction — source readiness

Date: 2026-10-23. Reviewer/context: `/root/turn_contract_review`, separate from
implementer `/root`. Exact implementation:
`b095bbac40ccbe0be7a38724f7854b9e8e15d313`; correction compared with
`464c6d787d77444b7110226d2fc14649acd8e5f1`. Accepted product baseline remains
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.

**Source readiness: READY_FOR_FULL_VALIDATION.** The reproduced cancellation
blocker in the historical [464c6d7 HOLD](V2-8H-source-464c6d7.json) is corrected in
this exact source. No further blocker was found in this narrow delta. This is not
final ACCEPT, does not replace required backend/process/visual evidence, and does
not change accepted product or review state.

## Correction inspected

The implementation delta adds a cancellation outcome helper at
`packages/agent/turns.ts:181–188`, dispatches an already-aborted final outcome to
that helper before installing successful-publication guards at line 254, and
handles an abort-induced publication rollback in a fresh owner-checked
transaction at lines 283–287.

The helper requires the captured generation, server turn ID and preparation
fence. It can cancel the same turn after lease reconciliation, while a newer
generation or fence refuses with `lease-lost`. It preserves completed/published
outcomes by refusing states outside its permitted preparation/recovery set.
It does not reset cumulative reservations, settle a receipt twice, allocate a
replacement provider request, or modify the canonical edit/run authority.

Source inspection also confirms that SQLite preserves the domain error object
and PostgreSQL's adapter passes supported domain errors through its sanitizer;
the `turnCode: cancelled` rollback path can therefore reach this correction on
both adapters. Actual PostgreSQL execution was not performed by this reviewer.

The changed shared contracts add abort-after-claim and abort-during-provider
cases, register them for both backends and strengthen the publication abort case
to require persisted `cancelled` status. These test changes were inspected, not
run as suites by this reviewer. Implementer-reported fail-first and corrected
suite/typecheck results are not included in independent execution totals below.

## Independent targeted execution

Command, run with source `b095bba`:

```sh
node docs/reviews/V2-8H-source-b095bba-probe.mjs
```

The [probe](V2-8H-source-b095bba-probe.mjs) exercises the real turn service with
canonical scene fixtures and a serialized transactional in-memory backend. Each
transaction clones its records, applies the final guard before commit and rolls
back by discarding its clone on error. Providers are deterministic in-process
fixtures. The replacement generation/fence cases force specific legal
interleavings; they are not actual multi-process race evidence.

Exit 0; **5 targeted cases passed, 0 failed**, in one invocation:

| Case | Observed durable outcome |
|---|---|
| Abort after claim, before dispatch | `cancelled`; after 31-second database-clock advance, retry refuses `needs-user-action`; zero provider fixture calls and zero reservation |
| Abort during provider call | `cancelled`; retry refuses; one fixture call, retained 2,048-token reservation and one known receipt |
| Abort during final visible-result row write | Publication rolls back, cancellation commits; no visible reply/proposal; retry refuses; reservation/known receipt preserved |
| Clear/new generation before old cancellation | Old worker returns `lease-lost`; new generation and submitted replacement turn survive; zero fixture calls |
| New preparation fence before old cancellation | Old worker returns `lease-lost`; replacement's completed reply survives; exactly one fixture call |

These cases replace the historical probe's resurrection outcome with durable
cancellation and demonstrate that the correction does not cancel a replacement
generation or worker fence. The historical finding remains true for `464c6d7`.

For source identification, `packages/agent/turns.ts` SHA-256 at execution was
`f361ecae94a636bb8294938922a98f9aa69e1a372b29b13965eceb63e922ac05`;
the source/test working-tree diff against `b095bba` was empty.

## Limits and acceptance gate

Independent correction execution: five in-memory cases; **zero database
operations, services, network/model API calls, local inference calls, full test
suites, builds, typechecks, browsers, benchmarks or native exports**. Three
deterministic provider fixture calls occurred across the five cases. No resource
qualification or full validation result is inferred from these small probes.

The full V2-8H [contract](../V2-8H-EVAL.md) and its required gate inventory remain
the acceptance authority. Actual both-store contracts, PostgreSQL/process fault
checks, complete regression, bounded serial browser runs, build/typecheck,
50-cell benchmark, inspected browser/native preservation and original archives
remain unexecuted by this reviewer. Standing BYOK locale and inherited
whole-exchange unknown-usage limitations remain explicit. Final independent
ACCEPT requires assessment of the complete exact-source evidence packet.
