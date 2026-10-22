# Handoff — native PPTX shape identity correction under review

2026-10-22 · branch `v2`; authorized push `origin/v2`.
Accepted baseline: `f3e784ac6227f46628dc99a54762f6a861eeed64`
([V2-8G decision](reviews/V2-8G-f3e784a.json)).
Frozen correction: `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
Pushed root evidence packet: `a369067`.

The current explicit request prioritizes the inherited duplicate nonvisual
PowerPoint shape IDs and asks how far conversational creation remains.
[The bounded contract/evaluation](V2-PPTX-ID-EVAL.md) and
[roadmap entry](ROADMAP.md#native-pptx-shape-id-uniqueness) are authoritative.
The canonical renderer now preserves first/unique IDs and assigns deterministic
unused IDs to later collisions after library serialization. Ambiguous shape
references refuse export. Scene, geometry, native content and relationships stay
unchanged; already-valid archives retain their bytes. Legacy generation and
Assistant implementation are outside this correction.

Root required execution: **376 pass / 0 fail / 0 skip / 0 cancelled**, 19 complete
files serially,13.439s; typecheck passed; all50canonical cells completed in515ms,
zeroL1 findings and unchanged compiler quality/invariance/counterfactual fields.
Native audit54parts, two charts/workbooks, three slide identity scopes corrected.
Three1467×825before/after raster pairs are pixel-identical; six images plus the
left-table enlarged detail inspected.161historical original PPTXs, including five
canonical outputs and exact accepted8D collision witness, retain their hashes.

Failed attempts are retained: inherited uniqueness0/1; first scoped negative
expected semantic inventory rejection instead of earlier schema rejection375/1;
first archive comparison omitted nested workbook generated timestamps. Corrected
harness expectations preserve export assertions and all non-time workbook bytes.
Focused5/5 overlap the376 primary leaves. No new product regression remains.

Four explicit gates apply to this renderer-only correction; older nine-gate
contracts remain enforced.206unrelated files/PG/fault/browser suites and the UI
build were not rerun and are not counted as green. The standing locale9/1 is
historical and not rerun. Interactive Microsoft PowerPoint is unexecuted; no full
interactive-fidelity claim. Legacy native table identity and mixed-runSVG limits
remain in their separate roadmap entries. No real model API/local inference.

State: validated, independent review pending, accepted false; baseline unchanged.
One separate high-effort context `/root/native_id_review` is reviewing exact source
and executing fresh guarded supplements after root finished. It must commit its
own ACCEPT/HOLD record; root must not self-accept. No root validation job/service
remains. Measured quiet-window guards withheld competing activity; globalIOPSI
provenance remains unresolved, and no unrelated process was altered.

Never rerun completed root scripts into their existing output namespace or use
old evidence finishers. See current plan/logs for recorded commands; reproduce in
fresh paths and preserve originals. No service was provisioned for this task.

The normal conversational creation path is not shipped: accepted V2-8A–G are
foundations, and Assistant is still a placeholder. Exact remaining contracts and
human-direction gates live only in [the roadmap](ROADMAP.md#v2-8-audit-followups).
No dependent slice is authorized by acceptance. Stop after this correction's
review, evidence, scoped push and handoff; do not start Assistant or other features.

Original untracked paths stay untouched: `.agents/`,
`PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`,
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`.
