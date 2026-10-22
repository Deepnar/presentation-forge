# Handoff — native PPTX shape identity independently accepted

2026-10-22 · branch `v2`; authorized push `origin/v2`.
Accepted baseline and frozen implementation:
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
Previous accepted baseline: `f3e784ac6227f46628dc99a54762f6a861eeed64`.
Task-entry HEAD: `7f4c1e8b97a2e1b7987d9c089910f7323610a41d`.
Later commits contain documentation/evidence only; inspect Git for final HEAD.

[Independent decision](reviews/V2-PPTX-ID-45c2c4c.json) and
[report](reviews/V2-PPTX-ID-45c2c4c.md) supply ACCEPT from separate context
`/root/native_id_review`, decision commit `7d24aa2`; evidence `94920cf` and exact
native review archives `43cbd3d`. No blocking finding or waiver. State is validated,
review accepted, accepted true; all four explicitly applicable gates passed.
The [evaluation](V2-PPTX-ID-EVAL.md) and
[changed-file inventory](v2-pptx-id-evidence/changed-files.json) retain provenance.

The canonical generated scene-to-PPTX renderer preserves first/unique IDs and
assigns deterministic unused IDs to later collisions after library serialization.
Ambiguous shape references refuse export. Input scenes, native geometry, styles,
content, relationships and other package payloads stay unchanged. Already-valid
archives retain their bytes. Legacy generation and Assistant implementation are
outside this correction.

- Required: **376 pass / 0 fail / 0 skip / 0 cancelled**, 19 complete files serially,
  13.439s. Typecheck passed; all **50 canonical cells**, zero L1 findings, 515ms;
  compiler quality, invariance and counterfactual fields match accepted V2-8G.
- Independent: **271/271**, zero fail/skip/cancel, plus **5 overlapping repeats**
  after a script rename. Do not add these to root coverage as distinct tests.
- Native audit: 54 parts, 45 non-identity parts byte-exact in same-archive repair;
  only three slide identity parts changed. All first lexical IDs, two charts/
  workbooks, five tables, media and relationship targets preserved.
- Root three raster pairs and reviewer nine fresh pages/six comparisons show zero
  changed pixel channels at 1467×825. Native views and enlarged table detail
  inspected; no new clipping, overlap or canvas shift.
- All 161 historical original PPTX hashes, including five canonical outputs and
  exact accepted V2-8D collision witness, remain unchanged. The independent exact
  synthetic before/repaired/fresh PPTX archives are committed separately.

Retained failures: inherited uniqueness 0/1; initial conditional-schema typing;
first new governance negative expected inventory rejection instead of earlier
schema rejection (375/1); first archive comparison omitted generated workbook
created/modified timestamps. Narrow harness corrections preserve all product
assertions and non-time native bytes. Focused 5/5 overlaps the 376 primary leaves.

The 206 unrelated files/PG/fault/browser suites and UI build were not rerun and
are not counted as passing. The standing BYOK locale 9/1 remains historical.
Interactive Microsoft PowerPoint selection/edit/save/reopen is unexecuted;
no full interactive-fidelity claim. Old exports require canonical re-export to
receive corrected IDs. Legacy identity risk and mixed-run SVG fidelity retain
separate roadmap entries. No real model API, local inference or content-quality
qualification occurred.

No owned validation job/service remains; none was provisioned for this task.
Quiet-window guards withheld competing activity before low-priority serial jobs;
global I/O PSI provenance remains unresolved. No unrelated process was altered.
Never rerun completed evidence scripts into their old namespaces or use older
finishers against canonical originals. Reproduce in fresh paths per the
[evidence notes](v2-pptx-id-evidence/README.md), preserving all original bytes.

Normal conversational creation is not shipped. V2-8A–G are accepted foundations;
Assistant remains a placeholder. Exact remaining contracts and human-direction
boundaries live only in [the roadmap](ROADMAP.md#v2-8-audit-followups), including
durable conversation/approval ownership. Acceptance permits planning only;
no dependent feature, infrastructure, migration or deployment is authorized.
Stop after this correction's final scoped push and handoff.

Original untracked paths remain untouched: `.agents/`,
`PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`,
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`.
