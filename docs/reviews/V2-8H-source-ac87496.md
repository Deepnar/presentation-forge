# V2-8H binding correction — source readiness

Date: 2026-10-23. Reviewer/context: `/root/turn_contract_review`, separate from
implementer `/root`. Exact corrected source:
`ac8749613bfbd927dab629f479d3d05f10a99195`; compared with held source
`cc3ed185afda2058afa6f9b177f2d497fe30719c`. Accepted baseline remains
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.

**Source readiness: READY_FOR_FULL_VALIDATION.** The ordinary binding-reuse
defect in the historical [HOLD](V2-8H-source-cc3ed18.json) is corrected. No new
blocker was found in this narrow delta. This is not final implementation ACCEPT
and does not change the accepted baseline or development state.

The source change makes one private `checkBinding` copy as the first statement of
each public read/export/submit/clear/cancel/decide/prepare operation. It precedes
all awaits, including submission/decision/configuration digest work. Every
existing closure, result helper, queue call, provider bridge and subsequent
transaction therefore captures the private operation binding. Existing backend
ownership checks still run; no caller object is frozen and no capability,
serialization, generation or approval rule is loosened.

The seven added reusable both-store contracts were inspected. They immediately
reuse the original caller object for another same-owner project and require the
requested A operation to finish, A to remain readable, and all B rows to remain
unchanged. Linked-run read/export/cancel and decision/preparation paths are
included. Root-reported fail-first and corrected backend results are not counted
as independently executed here.

## Independent execution

```sh
node docs/reviews/V2-8H-binding-probe.mjs
```

Exit 0; **7/7 independent in-memory cases passed**, zero failures, in one
invocation. Exact stdout is [preserved](V2-8H-binding-ac87496-result.json).
The [probe](V2-8H-binding-probe.mjs) guards execution by comparing the
actual service source bytes with the named Git commit. Its serialized
transactional backend applies commit guards and preserves separate project
rows. It uses the real turn service, canonical scene/tool fixtures and
deterministic in-process provider responses; it opens no database or socket.

| Operation | Observed result after immediate caller object reuse to B |
|---|---|
| Read | A's existing linked run returned; B unchanged |
| Export | A's existing linked run returned; B unchanged |
| Submit | A turn submitted and readable; B unchanged |
| Clear | Only A's turn removed; A readable; B turn and complete rows unchanged |
| Cancel | A's linked run cancelled; B unchanged |
| Decide | A's canonical run queued; A remains readable; B unchanged |
| Prepare | A receives an awaiting-decision proposal; B unchanged |

In every case B retained its original turn identity and its complete
conversation/turn/proposal/attempt/run rows compared equal to the pre-operation
snapshot. Five deterministic provider fixture calls occurred across the cases.
The service source SHA-256 was
`723f6e44d4ca4757ebd8f2e9547e496489b38b41b1e6ff1e969d3bb16a5dee95`.
The scoped source/test diff against `ac87496` was empty at inspection.

Independent correction execution used zero database operations, services,
network/model API calls, local inference, full test suites, builds, browsers,
benchmarks or native exports. These in-memory cases do not establish actual
SQLite/PostgreSQL or cross-process behavior. Complete current-source validation,
including both stores, serial browser/build owners and inspected native/browser
preservation, remains required under the approved [contract](../V2-8H-EVAL.md).
Historical evidence is retained and is not silently counted as replacement-source
execution. Standing BYOK locale and inherited whole-exchange usage limitations
remain separate. Final independent acceptance remains pending.
