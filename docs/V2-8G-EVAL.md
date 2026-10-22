# V2-8G model-transport resource bounds evaluation

2026-10-22 · implementation in progress; no independent acceptance.
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

No correction tests have executed at this planning checkpoint. Required final
checks are pending, not skipped or green. Failing attempts and corrections will
be retained separately from frozen-source execution. The architecture audit remains
a separate documentation-only task and its zero-execution statement is unchanged.

Stop after this correction's independent review, owned-resource cleanup and handoff.
Parent V2-8 and the other audit proposals remain unapproved for implementation.
