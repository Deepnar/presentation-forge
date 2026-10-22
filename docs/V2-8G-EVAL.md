# V2-8G model-transport resource bounds evaluation

2026-10-22 · complete validation; independent acceptance pending.
Frozen implementation `f3e784ac6227f46628dc99a54762f6a861eeed64`; later documentation/evidence commits do not change code.
Accepted baseline `0cab854bce04b862060829812a9ab6ff0b765fd9`; audit-entry checkout
`ee52b50bac2ce5704eda39a89ae959259497f331`; correction planning checkout `44377b0`.
Branch `v2`, scoped push `origin/v2`. The [bounded contract](ROADMAP.md#model-provider-stream-resource-bounds)
is separately authorized by the clarification permitting code but forbidding API-backed
models and local inference. The preceding architecture audit executed zero evaluations.

Correct the model adapter's source-inspected empty-read starvation, retained chunk
storage, monotonic deadline/cancellation and late-response lifetime concerns only.
Preserve both provider protocols, canonical tools/usage/privacy/authority, existing
byte/time allowances, no retries and redirect rejection. No UI, credentials, model
configuration, SDK/framework, search, persistence policy or deployment changes.

Correctness, privacy, backward compatibility, package boundaries, existing project/
command preservation, native/browser regression and documentation gates apply.
Use synthetic/injected transports and loopback HTTP fixtures only; no model inference
or real model endpoint is permitted. Do not start unrelated services or stop existing
work. Resource checks precede intensive execution. Test original archives/evidence
must be snapshotted before any later generator/browser/native run.

## Current validation result

All 224 planned files executed on frozen source f3e784a: **2,801 pass / 0 fail /
0 skip / 0 cancelled**, with no unexecuted inventory file. The four distinct
persisted native cases also passed. Build, typecheck, all 50 canonical benchmark
cells, native/browser export checks, memory observations and visual inspection
completed. All nine validation gates have evidence; independent acceptance is
pending and accepted baseline remains 0cab854.

| Primary group | Files | Pass | Fail | Skip | Cancelled |
|---|---:|---:|---:|---:|---:|
| Non-browser bulk | 190 | 2,427 | 0 | 0 | 0 |
| Serial browser/build owners | 26 | 208 | 0 | 0 | 0 |
| PostgreSQL, all backend files | 8 | 166 | 0 | 0 | 0 |
| Total | 224 | 2,801 | 0 | 0 | 0 |

The PostgreSQL project/import contract subset is 23 cases; the cross-process/fault
subset is 19 cases. Both overlap the 166 backend cases. The focused provider run
(196/196) and resumed resource qualification (17/17) overlap the primary matrix;
never add them as distinct coverage. The exact four-file model-provider gate passed 84/84, also overlapping the primary
set. A wider combined provider log is supplemental, not that exact gate.
The separate en_IN BYOK run is **9 pass / 1 standing failure**, 0 skip/cancel;
it is not counted as successful primary coverage. Raw attempts and commands are
retained in [the coordinator](v2-8g-evidence/logs/coordinator.json).

Node 24.16.0, temporary SQLite, actual loopback protocol fixtures, Chrome and
owned cached PostgreSQL 15.18 were used. The service identity is recorded in
[owned-postgres.json](v2-8g-evidence/owned-postgres.json); no other project database
was reused. All real model API calls and local inference calls remained zero.
The preceding architecture audit itself executed zero evaluations; these are the
separately authorized correction and continuation phases.

The original 180.512-second sustained window qualified CPU/memory/backing-storage
headroom. Unchanged two-sample guards and low priority/watchdogs preceded every
job. The recorded resource samples include 11 withheld pre-job samples and zero critical
running samples. Elevated global I/O PSI/iowait retains unresolved provenance;
no competing workload was stopped. See [resource assessment](v2-8g-evidence/resource-assessment.json).

## Earlier correction checkpoints

### Fail-first and correction

The new injected-stream file failed2pass/12fail out of14 on the prerequisite
adapter, with0skip/cancel. Four immediate-empty-stream child probes exceeded their
1500ms process watchdogs; their Node leaves failed, not cancelled. Other cases
exposed monotonic expiry, late-fetch fencing and late-body continued consumption.
These are reproduced transport resource defects, not live-model failures. Both
fragmented UTF-8/5000empty-chunk success cases already passed. Raw attempts and
exact test/adapter hashes are retained in fail-first-stream.{json,log}.

After the narrow correction, the same14assertions passed14/14 with0fail/skip/cancel;
the test hash is identical. The adapter now uses one fixed response-byte buffer,
monotonic checks, periodic event-loop yielding, late-response fencing and source
cancellation before reader unlock. Settings, canonical result/tool/usage rules,
protocols, credentials and no-retry behavior are unchanged.

The first expanded8-file offline run on ec67315 passed195/196,0skip/cancel. The sole
failure was the repository-state governance check: implementationHead still pointed
to the accepted prerequisite while the new milestone was unaccepted. Updating that
tracking pointer and the plan to the actual frozen ec67315 corrects the metadata;
no test assertion, validator rule or product source changed. The initial failure
remains in focused-offline.{json,log}; the separate rerun below supplies corrected totals.
The same8-file rerun passed196/196,0fail/skip/cancel on exact frozen ec67315 in
9.133s wall time, using injected transports and loopback HTTP fixtures only.
Final-focused-offline.{json,log} retain complete file markers and command/exit/hash.
These196checks overlap the full inventory; the earlier14-case corrected repeat is
not additional distinct coverage. The lightweight protocol checker reports0errors/
0warnings after pointer correction. No live model call or local inference occurred.
At that focused checkpoint, required full gates were pending, not skipped or green. The architecture audit's
zero-execution record is separate.

Stop after this correction's independent review, owned-resource cleanup and handoff.
Parent V2-8 and the other audit proposals remain unapproved for implementation.


## Separate source inspection and coverage additions

One separate high-effort context `/root/v28g_source_review` performed static source
inspection of ec67315 and its pushed bf2c6b3 packet, with0tests/0edits and no
ACCEPT/HOLD. It found no confirmed actionable product defect. It identified
unmeasured retained-memory bounds and missing targeted late caller-abort/response-
processing deadline coverage. Four additional injected cases now cover the latter
two situations on both protocols; the original14cases/assertions remain intact.
The new freeze adds tests only; adapter bytes are identical to reviewed ec67315.
Peak retained memory has not been measured. Single-buffer capacity is source-
inspected evidence, not an empirical RSS/heap bound. At that checkpoint, full validation and independent
acceptance were unexecuted; no browser, PostgreSQL service, build/typecheck,
benchmark or native generator had been launched in the bounded code follow-up.


## Focused checkpoint before this continuation

Frozen source f3e784a previously passed 200/200 across eight complete offline files,
including all 18 stream cases, 0 fail/skip/cancel, in 5.625 seconds. Those repeated
runs are retained in [expanded-focused-offline.json](v2-8g-evidence/expanded-focused-offline.json).
At that time 216 inventory files and the complete acceptance gates were unexecuted.
The continuation above now supersedes that pending-validation status without
changing product source or assertions.

## Continuation corrections and failure classification

No new product regression was found in the complete matrix. One supplemental
measurement command failed before any provider exchange: its harness requested a
1 MiB response allowance, exceeding the unchanged accepted 256 KiB maximum. Only
that owned measurement fixture/runbook was corrected. Its failing command, raw
output, original script and explicit two-entry snapshot adjustment remain in
[the retained attempt](v2-8g-evidence/attempts/invalid-resource-fixture/assessment.json).
The evidence checker also caught missing required state reasons and a provider
gate log containing extra files. Required reasons were restored, grouping was
corrected, and the dedicated exact four-file gate passed 84/84. Both failed
metadata attempts remain under attempts/state-index-reasons and state-index-scope.
No validator rule or test assertion changed.

Product configuration limits and test assertions were not relaxed. The corrected
four-scenario observation completed; previously acknowledged full executions were
retained, with a fresh 17-case resource qualification repeat. No timeout/cancelled
job was relabeled passing. The standing locale failure remains separate.

## Performance, preservation and visual evidence

- 50 benchmark cells completed in 523 ms of compiler/ZIP time. The runner recorded
  documentation/harness HEAD 2f53abb; [source integrity](v2-8g-evidence/source-integrity.json)
  proves no product/test/tooling delta from frozen f3e784a.
- The 120-slide project opened in 1,537 ms with 120 thumbnails. Shell chart/table
  canvas deltas were 0.04953 / 0.02929 px; maximum across all captured cases was
  0.171753 px. These are local samples, not production percentiles.
- With the accepted 256 KiB allowance, both protocol fixtures consumed 5,000 and
  200,000 empty reads and then returned valid content. Sampled retained ArrayBuffer
  growth was exactly 262,144 bytes in every fresh process; maximum sampled RSS
  delta was 786,432 bytes. Exchange times were 11.26–11.58 ms / 66.13–73.82 ms,
  respectively. Full-GC sampling changes timing; this is not peak RSS profiling
  or a general process memory ceiling. [Raw observations](v2-8g-evidence/stream-resources.json).
- Four persisted SQLite/PostgreSQL × two-protocol cases passed exact scene/history,
  OOXML, reopen and native export checks. Eight native archives and five actual
  authenticated browser export archives have retained hashes and fresh rasters.
- All 115 hash-reconciled browser/native/SVG images were inspected through 20
  contact sheets, with full-size narrow/dialog/native risk cases. No newly
  observed overlap, clipped dialog or unexpected canvas movement was found.
  [Visual review](v2-8g-evidence/VISUAL-REVIEW.md) records the inherited limits.
- All 5,137 snapshotted evidence files, including 129 current native originals,
  and all five canonical browser-output originals were restored/hash-verified.
  The explicit owned harness adjustment preserves its earlier bytes; historical
  evidence and original archives were not reconstructed or replaced.

## Remaining limitations and recommendation

Independent exact-source acceptance remains pending. The owned PostgreSQL service
is retained only for that review and requires saved-count/exact-ID cleanup afterward.
No live model/provider quality or interactive Microsoft PowerPoint check executed;
no such pass is claimed. Sampled memory is not a process peak measurement. Standing
BYOK locale, native shape-ID, mixed-run SVG, Fit/narrow/capture/timeout and historical
original-byte provenance limitations remain separate in the roadmap/prior records.

Recommendation: the complete evidence supports independent acceptance of this narrow
transport correction, subject to the reviewer's own checks and decision. The
implementer does not accept it. Parent V2-8 and other audit proposals retain their
roadmap approval boundaries; stop after review, owned-resource cleanup and handoff.
