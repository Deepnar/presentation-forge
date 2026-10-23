# V2-8H full-contract source inspection — evidence pending

Date: 2026-10-23. Reviewer/context: `/root/turn_contract_review`, independent of
implementer `/root`. Reviewed implementation/test source:
`22e7c9749865f3e7c2d62fb8724136e0f19048b0`; accepted baseline:
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.

This is an interim source/evidence inspection record. **No new material source
blocker was found. No final ACCEPT is issued.** Full packet execution, visual and
archive assessment, owned-backend cleanup and final independent review remain
pending. Historical HOLD records remain specific to their earlier sources.

## Contract coverage inspected

| Boundary | Source conclusion |
|---|---|
| Owner/project authority | Every public operation privately snapshots `checkBinding` before any await. Transactions re-enter existing backend access checks; original mutable caller bindings do not reach later callbacks. No admin bypass or HTTP route was added. |
| Submission identity | Generation is explicit; no current-generation fallback exists. Immutable content/scope/saved-revision identity and client key replay are checked under the project transaction. One submitted/preparing/awaiting-decision turn is admitted. |
| Private storage | Request/reply/preparation input and canonical pending plan bodies have separate bounded payloads. UTF-8 byte budgets and simultaneous record/count caps are checked on admission; JSON escaping and supplementary Unicode are covered by shared save/load bounds. No provider transcript, read results or hidden reasoning field is stored. |
| Final-result reservation | Storage reservation precedes dispatch and is separate from cumulative output-token reservation. The 262,144-byte private reservation covers the maximum 131,072-byte pending plan plus 96,000-byte escaped visible reply and serialization overhead; existing submitted input is already charged separately. |
| Metadata/accounting bounds | Header fields/counters are fixed and safe-integer validated. Current turns/proposals/attempts and cross-generation unresolved slots are count bounded; no per-model or per-generation map grows in the header. Exactly-once settlement is guarded by attempt state within the project lock. |
| Preparation ownership | Expiring lease, turn revision and monotonically increasing fence protect claims/publication. Timed renewal cannot extend immutable preparation/plan deadlines. Cancellation outcomes persist separately from a rolled-back visible publication and cannot cancel a replacement generation/fence. |
| Recovery | Only a turn with no dispatched exchange can recover preparation. Abandoned reservations remain charged; per-fence sequencing and total per-turn attempt/token caps persist across recovery. Any earlier dispatch prevents rebuilding volatile history or automatically making another call. |
| Provider receipt ordering | Dispatch marker is committed before the external call. Accepted exchange usage settles before later tool/budget/publication refusal. A receipt-only crash requires user action. Unknown usage is never zero/refunded; a compacted attempt cannot settle or publish again. |
| Approval and replay | The immutable stored plan, digest, scope, saved revision and deadlines are validated. One project transaction records approval and queues the canonical existing run. A composed final guard checks expiry. Full committed decision identity replay precedes fresh revision/expiry checks, after owner/generation checks. |
| Cancellation/clear | Internal runtime cancellation shares the project serialization point with edits. Clear changes generation, cancels linked nonterminal runs, removes old visible/private rows and retains only existing bounded settlement slots. Committed deck/history/run data retains its accepted policy. |
| Scene/run authority | The extracted internal queue/lookup/cancel seam preserves the public runtime path. No second scene, edit cursor, queue, renderer layout authority, persisted undo stack or provider session authority was introduced. |
| CLI/provider boundary | `agent-chat` mirrors the headless operations with the existing trusted local-owner convention. Provider configuration remains host supplied; request JSON cannot carry persistence callbacks or approval plans. Existing exact-object enqueue capability is preserved. |
| Compatibility/governance | Existing runtime code was extracted without changing its effect/receipt cursor behavior. Schema I/O remains in the named Node adapter; the JSZip boundary exception is exact-file for already accepted shape-ID code. State/checker adds the frozen H gate inventory without self-acceptance. |

The inherited whole-exchange provider validator still cannot extract an independent
receipt from a rejected malformed exchange. Its outcome remains conservatively
unknown, explicitly documented in architecture/evaluation and the roadmap receipt
seam. No exact provider billing or per-account spend-ledger guarantee is inferred.
Saved conversation is not automatically persistent cross-turn model context, and
saved-revision checks do not claim to protect unsaved browser drafts. Those
integration limits remain explicit.

## Evidence inspected during this pass

The final-source focused evidence JSON and raw TAP tail agree on 90 pass, zero
fail/skip/cancel, with the four intended entry files. The non-browser evidence JSON
and raw TAP tail agree on 2,481 pass, zero fail/skip/cancel, using all 194 bulk
files at concurrency one. Focused cases overlap the complete matrix; their totals
are not added as distinct primary coverage.

At the coordinator snapshot read in this pass, seven of 26 serial files had
complete exit-zero records, totaling 62 passing leaves and no skips/cancellations.
The remaining serial/dedicated PostgreSQL gates and later build/type/benchmark/
native jobs were not yet complete. These are inspected implementer records,
not independent reviewer executions. No screenshot/raster inspection is claimed
in this interim record.

The coordinator checks ancestry and an empty scoped product/test diff against the
frozen source, verifies the complete disjoint 229-file inventory, serializes all
browser/build owners, preserves actual exit/counts and separates the locale
standing failure. The assembler counts the complete disjoint matrix separately
from repeated focused executions. Source inspection of the native helper shows
both provider families over both stores, actual persisted semantic edit/history
checks and native scene/export verification; that helper's future successful
execution is not inferred from reading its source.

Current source schemas, generated types, service/store/state, provider host hooks,
CLI/DDL, extracted runtime primitives, both backend transaction adapters, new
contracts/process helpers, architecture/evaluation and evidence orchestration were
inspected. No tests, database calls, services, provider/network calls, builds,
browsers, benchmarks or native generation were executed by the reviewer during
this pass. Only this review artifact was written. Final acceptance is pending
the complete exact-source packet and cleanup evidence.
