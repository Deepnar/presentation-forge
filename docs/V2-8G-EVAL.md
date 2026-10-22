# V2-8G model-transport resource bounds evaluation

2026-10-22 · implemented; complete validation and independent review pending.
Frozen implementation `ec6731546ddfe8e0a47516b49b7aee5b510ed589`; later documentation/evidence commits do not change code.
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

Planning inventory retains all223 accepted files plus one stream regression file:
190bulk/26bounded serial browser-build owners/8PostgreSQL =224files. New focused
cases, full matrix, build/type/actual50cells, native/visual evidence and exact-source
independent review are pending. No prerequisite pass is execution of this correction.
Missing PostgreSQL is unexecuted, not passing. Keep the BYOK locale failure and
accepted native-ID/SVG/narrow/fit/provenance limits separate. No final-source totals
or performance measurements are available yet. Implementation SHA will be frozen
in a later evidence commit, with all tested working-tree deltas identified.

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
remains in focused-offline.{json,log}; a separate rerun will supply corrected totals.
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
