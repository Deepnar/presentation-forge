# V2-8C provider exchange boundary evaluation

Implementation is complete and frozen at `e41d509c20fca21a70b9a0c587ccb83684aee7e6`. Required validation is complete;
independent review is pending. The task entered from accepted baseline
`1fb39ff75cd473ecaf2884232d5d7465d50a9af2`, entry checkout
`405a062a9c1bbc9e2358457913f87907cf6b1bb7`, branch `v2`, push `origin/v2`.
The current continuation and standing recommended-choice direction authorize the
[next bounded contract](ROADMAP.md#v2-8c-provider-boundary). No acceptance is claimed.

## Validation contract

Provider-neutral typed exchanges, explicit capabilities and actual HTTP adapters
for OpenAI-compatible Chat Completions and Anthropic Messages consume the existing
scoped instruction/tool catalog. Normalized responses are schema-validated proposals;
canonical tools/runtime retain ownership, revisions and durable effects. No new
framework, provider settings/credential storage, public HTTP, autonomous loop, UI,
search, generation, production migration or deployment is included.

Focused protocol/transport and real persisted integration tests cover both wire
formats/backends, invalid/foreign/stale/protected edits, exact preservation, output
bounds, refusal, truncation, cancellation, timeout, errors and secret-safe diagnostics.
The full215-file inventory in v2-8c-evidence/validation-plan.json retains26 serial
browser/build owners, PostgreSQL contracts/process faults, build/type/50 cells and
fresh inspected browser/native evidence. All common correctness/integrity/ownership,
undo/preservation/native/regression/compatibility/documentation gates apply.
Interaction/accessibility/responsive gates use unchanged-UI regressions. Provider
live qualification, new UI and deployment are outside the contract.

## Final-source execution and status

All nine required gates passed on frozen implementation e41d509. Product/test code
has no delta after that SHA; later commits contain documentation/evidence and the
resource-aware validation harness. Baseline remains V2-8B until a separate exact-source
ACCEPT. Implementer recommendation: accept the bounded exchange contract after that
review; do not advertise completion of the parent V2-8 milestone.

| Execution | Files/cases | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Non-browser bulk |183 files|2235|0|0|0|
| Serial browser/build owners |26 files|208|0|0|0|
| PostgreSQL contracts/runtime/provider/concurrency/faults |6 files|86|0|0|0|
| Complete inventory |215 files|2529|0|0|0|
| Distinct persisted provider/native supplements |4 cases|4|0|0|0|
| Provider focus, repeated separately |3 files|66|0|0|0|
| Resource-window provider qualification, repeated separately |1 file|46|0|0|0|
| Governance index after evidence assembly, repeated separately |1 file|25|0|0|0|
| Standing en_IN BYOK locale probe, separate expected exit1 |1 file|9|1|0|0|

Primary distinct total2533/2533;137 successful repeat executions (66+46+25) are separate.
No required test remains unexecuted. Build and strict typecheck exited0; the canonical
benchmark executed all50 cells in441ms, with all five invariance checks agreeing.
Its recorded Git HEAD0be971d is a documentation descendant of e41d509. The default
bulk locale is C.UTF-8; the separate en_IN probe preserves the known locale defect.
The complete7A shell suite passed28/28, and current handoff11/11 passed without the
previous isolated restore timeout. No test assertion or timeout was weakened.

Exact commands/watchdogs, per-file exits/totals, source and backend are in
[v2-8c-evidence/logs/coordinator.json](v2-8c-evidence/logs/coordinator.json) and
[full-matrix.json](v2-8c-evidence/full-matrix.json). Eight machine-readable gate reports
and the separate visual report index raw logs. Four native supplements exercised
both real storage backends and both actual local HTTP wire fixtures; they are not
mocked editing engines. Live commercial provider endpoints, hosted Auto content
quality and interactive Microsoft PowerPoint remain unexecuted and outside this
bounded qualification. No live credentials were read.

## Resource recovery and evidence preservation

The first final-source segment completed focus66, bulk2235 and19 serial files147.
The coordinator was deliberately paused for shared I/O pressure, then lost during a
host restart. Selection TAP emitted5/5 but its process exit was not saved; it was
rerun5/5 with a saved zero exit, and the unacknowledged log is not counted as a pass.
Remaining jobs were unexecuted before restart and have now completed. The earlier
52821fb cancellation is retained in the chronology below, not relabeled as e41d509.
Stopping quiet-window waits before any child/service started is not a cancelled test.

The old owned auto-remove/tmpfs PostgreSQL service c0d62e38 disappeared during the
restart before a saved pre-removal database count; that count is unavailable, not
zero. The replacement owned service2670350f8e8e867b1923c327f5235fd44783e0b5a26dc48d25d5a176d6330809
runs PostgreSQL15.18 on127.0.0.1:5544 with1CPU/512MiB and192MiB data tmpfs. Both
identities and the restart are recorded in this evidence namespace. Keep the current
service for independent review, then save/fsync its database-count observation before
stopping/removal and verify port closure. No unrelated service was used or stopped.

Resource assessment covered repository/output and Docker storage on nvme0n1, /tmp
and PostgreSQL data in tmpfs. Three-minute duration-weighted headroom qualification
measured mean CPU10.71%, NVMe1.89% busy and weighted queue0.116, with bounded peaks
and fresh readiness checks. Every later heavy job used two fresh15-second acceptable
samples; long jobs were monitored. Global I/O PSI/iowait remained elevated with
unresolved provenance. An observed graphics worker does not prove its cause. The
separate reviewer assessed the measurement approach and safeguards before execution;
raw samples and exact limits are retained in resource-assessment.json,
resource-window.jsonl and sustained-window.json. No production percentile claim is made.

All3198 snapshot evidence files, including32 pre-existing original archives, were
restored and hash-verified. Five separately preserved baseline browser archives were
restored only after fresh native capture; all baseline witness hashes matched. Two
were recovered from matching prior backups, not reconstructed. Eight new headless
originals plus five fresh browser originals are preserved here with hashes. No old
archive is relabeled as this run. Original .agents/ and both PRESENTATION_FORGE_V2_*
untracked documents remain untouched. During partial-state indexing, two required
reason fields were initially omitted; the validator caught this metadata error,
778b777 corrected it and the current protocol check reports0errors/0warnings.

## Visual and performance evidence

All115 final images were inspected through20 contact sheets and full-resolution
narrow-dialog/native risk cases:76 browser PNGs,23 native and16 SVG rasters. See
[VISUAL-REVIEW.md](v2-8c-evidence/VISUAL-REVIEW.md), images.json and original archive
manifests. No new foreground overlap, clipped dialog or canvas regression was found.
Native OOXML and visible output retain real text/chart/table editing, human styling,
geometry, unrelated scenes and history restoration. The120-slide deck opened in1543ms
with120 thumbnails; maximum measured canvas delta is0.049484px across6 cases.

Four local HTTP exchange samples range2.861–16.222ms; durable commit2.313–7.440ms;
reopen0.356–7.555ms; each bounded trace1285bytes. Existing actual process-kill recovery
samples are194.647ms SQLite and237.935ms PostgreSQL from claim through worker commit,
excluding lease wait. These are local protocol/backend samples, not live LLM latency,
production percentiles or conversational network exactly-once guarantees. Detailed
measurements are in performance.json and the50-cell benchmark artifact.

## Remaining limitations and recommendation

Canonical catalog and cache-accounting defects were corrected narrowly with fail-first
coverage before the final freeze; no additional product regression was found during
complete final validation. The standing BYOK locale failure, inherited Fit/narrow
canvas overflow, rail/capture/pending-search limitations and first-run SVG rich-text
flattening remain separately scoped in the roadmap. Consumer rasterization does not
qualify interactive PowerPoint. Live-provider/content qualification is unexecuted;
fixtures prove protocol and command plumbing only. Elevated I/O PSI/iowait and the lost
service's unavailable pre-removal count remain explicit environmental limitations.

Recommend independent acceptance of this bounded slice. No Assistant UI, autonomous
provider loop, common search, credential storage, deployment or migration follows
from this evidence. Future work remains only in the roadmap; stop after review,
owned cleanup and handoff.

## Protocol sources

The existing OpenAI-compatible ecosystem uses the
[Chat Completions function-tool wire contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
The second adapter uses the distinct
[Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create)
and [client tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).
These source the protocol mappings; configured models supply explicit capabilities,
not inferred claims about model availability. Responses/streaming/reasoning/files
remain separate future scope rather than silently mapped to this subset.

## Development and early review chronology

The initial protocol tests passed37/37, SQLite integration10/10, then provider
focus60/60 on both real backends. An initial TypeScript schema type mismatch was
corrected before those checks. These working-tree runs are development evidence,
not final-source acceptance or live-provider qualification.

A separate read-only audit found that context-provided schemas could be replaced
with permissive objects, allowing noncanonical proposal arguments even though the
runtime would reject execution. A fail-first selected run failed2/2 (40excluded)
on both protocol families. Canonical catalog definitions now validate before HTTP
and again when parsing. Every complete request independently uses the same
validatedToolRequest primitive as the actual tool session; supplied JSON Schema
is never compiled by the provider parser. Runtime authority remains unchanged.
The corrected provider/foundation/boundary set passed127/127 twice; final-source
repeats and the complete inventory remain separate. See attempts/development/.

## Cancelled first source and usage correction

Source52821fb passed focused62 and bulk2231. The implementer explicitly cancelled
its active7A job before correcting a discovered usage-normalization defect; that
file emitted suite bodies but no complete totals/watchdog success and is not a
passing gate. One file is cancelled, with complete leaf totals unavailable. The
remaining25 serial and6 full-matrix PostgreSQL jobs, build/type/benchmark/native
were unexecuted in that attempt (the focused provider PG cases had executed).
Raw output, current shell captures and interruption status are retained in
attempts/source-52821fb. All3171 snapshot files, including32original archives, were
restored with matching hashes before correction. No unexecuted/cancelled check is
reclassified as passing.

The initial test expected both APIs' raw input counter to mean the same thing.
[Anthropic cache accounting](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
requires adding reported cache reads/writes to uncached input; the
[Chat Completions prompt breakdown](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/list)
is already included in the prompt total. A new fail-first selected run failed2/2
(42excluded). Normalized inputTokens now includes reported cached input exactly
once; optional cache breakdowns are preserved, unavailable breakdowns stay absent,
and invalid counters refuse. This changes no caching request or credential policy.
The corrected provider focus passed66/66 and typecheck passed. The entire final
inventory is refrozen and will run afresh; prior results remain prior-source.
