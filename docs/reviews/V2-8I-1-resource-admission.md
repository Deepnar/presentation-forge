# V2-8I-1 resource-admission audit

**Continued environment hold was recommended for the observations through
2026-10-24 08:41:43 UTC.** The evidence did not justify relaxing the admission
thresholds. This is not an implementation HOLD or ACCEPT. I1's full validation and
independent implementation decision remained pending.

Reviewer/context: `/root/turn_contract_review`, separate from implementer `/root`.
Frozen implementation/tests: `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`;
accepted baseline: `22e7c9749865f3e7c2d62fb8724136e0f19048b0`.
Inspected checkout: `31765805b6ebae9b96583bd3cf5096649d291c76`.

The earlier audit was delivered before a usage-limit interruption prevented this
note from being written. This note recovers that completed audit on the later human
resume; it does not repeat resource sampling or assess continuation 4. Root reports
that continuation 3 subsequently stopped without a backend or full validation job.
Its later 27-sample retained record is distinct from the 19-sample cutoff reviewed
here. The new continuation may proceed if its own fresh unchanged gate qualifies.

## Inspected evidence and identity

| Evidence | Range or identity |
|---|---|
| Prior continuation samples | `docs/v2-8i-1-evidence/development/continuation-resource-window.jsonl`; 58 samples, 08:17:13.473345–08:31:31.445736 UTC |
| Prior summary | `docs/v2-8i-1-evidence/environment-held-continuation.json` |
| Earlier continuation 3 entry | `out/v2-8i-1-validation/continuation-3-entry.json`; start 08:36:57.017825 UTC |
| Earlier continuation 3 samples inspected | `out/v2-8i-1-validation/resource-window.jsonl`; 19 selected records, 08:37:12.060304–08:41:43.015487 UTC |
| Admission implementation | `docs/v2-8i-1-evidence/quiet_window.py` |

SHA-256 values verified during the earlier audit:

- Prior 58-sample file: `1dc3437837aa605ac1a3bc6943e0219ead5a6568e2597fb7f2730c712d940639`.
- Prior summary: `1dda2e3bc6cd9989bfd6b71e872e0ae18a82059163ac17de2b37e322dae0aedb`.
- Continuation 3 entry: `8d5dfca75b52cbc1387357ff152ec36ea7eadeb9253da08cb6abeca8e97d9fcf`.
- Selected 19 continuation 3 records: `ac969afb1046e15867eb8652ed167b9a4258e54c1d8742c2f74819b5733c1bcf`.
  This hashes the concatenated original JSONL line bytes, including their original
  newlines, selected inclusively between the entry timestamp and the stated cutoff.
  It is not a hash of the subsequently appended whole file.
- Admission script: `a0ab51d4fefa1e14d6ad3da2c87d191ba2ee94ea4f8306fa9344e410e83ee9bb`.

## Observations

| Metric | Prior 58 samples | Earlier continuation 3, first 19 samples |
|---|---:|---:|
| Sampled duration | 872.9703 s | 285.9079 s |
| Duration-weighted CPU busy mean | 24.3576% | 29.1199% |
| Maximum sampled CPU busy | 81.7524% | 75.9443% |
| Ready samples | 19 | 7 |
| Qualifying rolling 180-second windows | 0 of 47 | 0 of 8 |
| NVMe duration-weighted busy mean | 6.1696% | 5.7288% |

The prior run's longest ready streak was four samples, approximately one minute.
Twenty samples had CPU busy at least 25%; 27 failed a storage quiet condition;
two had CPU PSI `some avg10` at least 10; two observed userspace D-state threads.
These reasons overlap. The low overall CPU mean therefore did not establish a
sustained quiet window. Even its lowest-CPU rolling window, mean 11.2590% and peak
13.5168%, failed storage/blocked-thread/fresh-readiness conditions.

Prior NVMe busy peaked at 21.3001%; weighted queue averaged 0.2828 and peaked at
1.1045, with sampled inflight count up to seven. Available memory was
33.2193–39.6159 GiB and memory PSI `some avg10` was zero. Memory was not the blocker.
The last two observations at the continuation 3 cutoff were both not ready.

The host exposed 24 online logical CPUs, one thread per core, and this reviewer's
allowed CPU list was 0–23. Capacity/frequency observations were nonuniform: sampled
CPUs 0/7 reported a 5.4 GHz maximum, while 8/15/16/23 reported 4.7 GHz; observed
`cpu_capacity` values ranged from 765 to 1024. Affinity does not reserve CPU capacity
or establish which cores a future low-priority child will receive. No claim of an
unrestricted ancestor cgroup quota or dedicated fast cores was established.

## Admission interpretation and recommendation

The inspected policy requires a rolling duration-weighted window of at least
180 seconds with CPU mean below 25%, sampled CPU peaks below 50%, iowait mean below
20%, bounded storage mean/peaks, sufficient available memory, no observed userspace
D-state thread and no critical observation. It additionally requires two fresh
ready observations. Individual readiness requires CPU below 25%, CPU PSI below
10, memory PSI below 1, more than 8 GiB available, iowait below 20%, storage busy
below 5%, weighted queue below 0.5 and inflight at most one. Each later job receives
its own fresh approximately 30-second admission.

The read-only calculations reconstructed the rolling windows using the retained
sample durations and the script's conditions. The reported 0/47 and 0/8 are window
admission results, not failed product tests or continuous peak measurements. The
15-second sampling interval cannot exclude shorter bursts. Global I/O PSI was
elevated, including approximately 15–46 in the inspected observations, but its
provenance remains unresolved; it was not attributed to another process, GPU or
specific storage device. Process-list CPU percentages were not treated as fresh
per-process utilization or proof of causation.

Twenty-four available CPUs provide meaningful capacity, and serial low-priority
Node/browser/LibreOffice jobs reduce competition. Neither establishes an appropriate
quiet window during measured CPU bursts, runqueue pressure and storage activity.
Browser/render jobs also use child processes and additional threads; low priority
does not guarantee their timing or isolate unrelated work. The retained evidence
does not provide a controlled comparison that justifies weaker thresholds.

The existing 180-second qualification plus fresh 30-second job admission is a
reasonable conservative filter for the observed bursty workload, although these
numbers are not claimed to be uniquely optimal. The recommendation at the stated
cutoff was to continue the environment hold, retain all product assertions and
isolation, and make no threshold change merely to obtain a run. No unrelated job
may be stopped and no other database substituted. A genuinely fresh later window
can qualify under the existing contract without contradicting this earlier hold.

The reviewer performed read-only source/data calculations and host inspection in
the earlier audit. No tests, services, database operations, generators or model
calls were executed. This recovery writes only this note; it changes no source,
helper, evidence, snapshot, admission threshold or acceptance state.
