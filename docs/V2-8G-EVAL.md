# V2-8G model-transport resource bounds evaluation

2026-10-22 · implemented; complete validation and independent review pending.
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

## Required inventory and status

The inventory retains all 223 accepted files plus one stream regression file:
190 bulk / 26 bounded serial browser-build owners / 8 PostgreSQL = 224 files.
Frozen implementation f3e784a passed 200 focused cases across eight complete files;
216 files remain unexecuted. The full matrix, build, typecheck, all 50 benchmark
cells, native/visual evidence and independent acceptance remain pending. No
prerequisite pass counts as execution of this correction. PostgreSQL checks were
not run or probed; unavailable checks would remain unexecuted, not passing. Keep
the standing BYOK locale failure and accepted native-ID/SVG/narrow/fit/provenance
limits separate. Focused timings below are not full performance qualification;
retained memory has not been measured.

The shared machine has unrelated active workloads. The first lightweight read-only
sample showed CPU7.29%, iowait8.33%, available memory about33.2GiB and elevated
unresolved I/O PSI; no causal attribution is made. This sample alone does not
qualify an intensive run. No competing process was altered.

## Execution record

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
Required full gates remain pending, not skipped or green. The architecture audit's
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
inspected evidence, not an empirical RSS/heap bound. Full validation and independent
acceptance remain unexecuted. No browser, PostgreSQL service, build/typecheck,
benchmark or native generator has been launched in this bounded code follow-up.


## Current bounded-code checkpoint

Final frozen source f3e784a passed **200/200** across8complete offline files,
0fail/skip/cancel, in5.625s wall time. Its18stream cases are included in200; earlier
14/14and196/196 repeats are not added. Raw command, exact SHA, file markers and
log hash are retained in [expanded-focused-offline.json](v2-8g-evidence/expanded-focused-offline.json).
All sources remain synthetic/injected or loopback fixtures:0real model API calls
and0local inference. The adapter is byte-identical to the separately inspected
ec67315; subsequent source delta adds only4test cases.

[Unexecuted scope](v2-8g-evidence/unexecuted-scope.json) lists216remaining inventory
files:182bulk,26browser/build owners and8PostgreSQL. Full gates (including complete
model-provider backend coverage), build, typecheck, all50benchmark cells, native/
visual supplements, empirical retained-memory observation and independent acceptance
are unexecuted. Exact current leaf counts in unrun files are not asserted. No
sustained intensive-run quiet qualification was performed; the short resource
precheck applies only to the small focused cases. No PostgreSQL service was created
or probed, browser launched, native archive rendered or historical evidence changed.
Standing BYOK locale was not rerun for8G and is not counted as a new failure/pass.

The code-only follow-up is pushed as an implementation awaiting complete validation,
not an accepted milestone. Accepted baseline stays0cab854. The separate static
[source-review summary](v2-8g-evidence/static-source-review.json) explicitly has
0tests/0edits and no acceptance decision. No remaining audit proposal is authorized.
