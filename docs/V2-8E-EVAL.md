# V2-8E bounded tool-conversation preparation evaluation

Accepted baseline: `8c1e5c4e193340dd64ef3e68cd27bfe8ac55e23c`.
Entry checkout: `15e357c93bf301fd61867dd10e06a8921286568f`, branch `v2`;
authorized push `origin/v2`. The current continuation authorizes the bounded
[roadmap contract](ROADMAP.md#v2-8e-bounded-tool-conversation). Implementation,
validation and separate review are pending; no acceptance is claimed.

Correctness, authorization, data integrity, canonical commands, preservation,
backward compatibility, native export, browser/accessibility/responsive regression
and documentation gates apply. The existing UI remains a regression surface.
Deployment, new UI and live content-quality gates are outside this slice; local
HTTP fixtures cannot qualify live providers or the parent common-search workflow.

The new gate is tool-conversation, covering the strict boundary and both persistent
backends. The 221-file inventory preserves all accepted files and adds three
focused conversation files. Full bulk/serial/PostgreSQL/process/fault execution,
build/type/50 cells and inspected fresh browser/native evidence remain required.
Exact commands, source/backend and leaf pass/fail/skip/cancel/unexecuted counts will
be retained. Resource qualification, watchdogs and all-original snapshots precede
expensive validation; missing PostgreSQL is unexecuted. Standing locale and prior
visual/provenance limits remain separate. Old passing evidence is historical,
not execution of this source.

Official protocol references checked at planning:
[Chat Completions function calling](https://developers.openai.com/api/docs/guides/function-calling)
and [Messages tool-result handling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls).
The accepted Forge provider/command stack remains in use; no SDK/framework migration.


## Development status and frozen source

Implementation is frozen at `c71d65e189387684aac89ca9994acf8a9ff865c1`. No later
product/test/tools changes are permitted without updating the source pointer and
rerunning affected checks. The full 221-file matrix, final native/browser evidence
and separate acceptance remain pending.

[Development attempts](v2-8e-evidence/attempts/development/assessment.json) retain
expected fail-first cases and the trace-accounting defect: SQLite passed 28/30;
known response usage was lost when the tool-call budget refused a batch. Accounting
now precedes that refusal; unchanged tests passed 46/46. Source `db93d7e` then
passed 276/276 across nine files, including both new protocol/backend contracts,
accepted provider/preparation behavior, governance and type drift. These repeats
are not added to the final distinct matrix. The later test-only readiness diagnostic
retains bounded stage/code without driver bodies; original assertions/timeouts stay.

One separate high-effort reviewer performed a read-only plan audit, found no scope
blocker and identified lifetime/budget/correlation seams. It ran 0 tests, changed
0 files and supplied no implementation acceptance. Final independent execution
waits for the complete frozen-source packet and release of the heavy slot.
