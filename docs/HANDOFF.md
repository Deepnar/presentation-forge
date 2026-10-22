# Handoff — V2-8G accepted and cleaned up

2026-10-22 · branch `v2`; authorized push `origin/v2`.
Accepted baseline and frozen implementation:
`f3e784ac6227f46628dc99a54762f6a861eeed64`.
Previous accepted baseline: `0cab854bce04b862060829812a9ab6ff0b765fd9`.
Later documentation/evidence commits change no product source; inspect Git HEAD
for the final closeout commit rather than replacing the implementation pointer.

[Independent decision](reviews/V2-8G-f3e784a.json) and
[report](reviews/V2-8G-f3e784a.md) supply ACCEPT from separate context
`/root/v28g_source_review`. Evidence commit `5abf393`; decision commit `59c1fcd`.
State is validated / review accepted / accepted true, with all nine gates passed.
The complete [evaluation](V2-8G-EVAL.md) and
[changed-file inventory](v2-8g-evidence/changed-files.json) retain scope/provenance.

The correction bounds model response buffering/lifetime through a fixed byte
buffer, monotonic checks, periodic yielding, late-work fencing and cancellation
before reader unlock. Both protocols and accepted configuration/tool/usage/privacy/
authority contracts remain unchanged. No model layout, framework, UI, routes,
conversation persistence or source integration was introduced.

- Complete matrix: **2,801 pass / 0 fail / 0 skip / 0 cancelled**, all 224 files:
  190 bulk / 2,427 cases; 26 serial / 208 cases; 8 PostgreSQL / 166 cases.
- Four distinct persisted native cases passed. Build, typecheck, all 50 canonical
  benchmark cells, native/visual/resource supplements completed.
- Exact provider gate 84/84, wider focused 196/196 and resource repeat 17/17 overlap
  primary coverage. Do not add repeated checks as distinct tests.
- Independent execution: **668/668**, 0 fail/skip/cancel; 653 primary leaves across
  32 files, four native cases and 11 additional PostgreSQL handoff executions.
  Other primary coverage was inspected through the exact-source packet.
- Separate en_IN BYOK locale: **9 pass / 1 inherited failure**, repeated by both
  contexts and excluded from successful totals. Failed attempts remain retained;
  no validator, assertion or configuration limit was weakened.
- 115 packet images and 71 fresh independent images inspected, including full-size
  risk cases. Local 120-slide opening samples: 1,537 / 1,543 ms; maximum canvas
  deltas: 0.171753 / 0.171730 px. Benchmark compiler/ZIP: 523 / 429 ms.
- Both contexts' four fresh-process memory observations retained exactly 256 KiB
  of ArrayBuffer growth at 5,000/200,000 empty reads for both protocols. Full-GC
  samples are not peak process memory or production percentiles.

The architecture audit remains an earlier inspection-only phase with zero tests/
models/services. The separately authorized correction/validation used synthetic or
actual loopback fixtures: **zero real model API calls and zero local inference**.
No content-quality or interactive Microsoft PowerPoint pass is claimed. Standing
native-ID, SVG mixed-run, Fit/narrow/capture/timeout and original-byte provenance
limitations remain explicit in the roadmap/prior evaluations.

The reviewer usage interruption occurred after 17 durable job acknowledgments;
recovery verified actual exit/log hashes and no incomplete job, then resumed only
missing guarded supplements/restoration. Root restored 5,137 evidence files and
five canonical originals; reviewer restored 5,422 files including 142 PPTXs and
all five canonical originals. All hashes matched; no original bytes reconstructed.
Unchanged headroom guards qualified intensive work; global I/O PSI provenance is
unresolved and no competing process was altered.

[Owned PostgreSQL cleanup](v2-8g-evidence/owned-postgres-cleanup.json) is complete.
Root saved/fsynced a fresh actual zero-project-database observation before removing
only the exact owned `forge-v28g-validation` container, then verified absence and
5544 closure. No validation job or owned service remains. Its future absence is
not execution of new PostgreSQL checks. Never rerun completed finish scripts
against the restored canonical originals; use a fresh namespace/full snapshot.

Stop here. Parent V2-8 is not complete. The next contracts and human-direction
boundaries live only in [the roadmap](ROADMAP.md#v2-8-audit-followups); acceptance
permits planning, not implementation, deployment or infrastructure changes.
Original untracked paths remain untouched: `.agents/`,
`PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`,
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`.
