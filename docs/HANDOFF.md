# Handoff — V2-8H contract prepared, data policy unapproved

2026-10-22 · branch `v2`; authorized push `origin/v2`.
Accepted baseline remains `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`, independently
accepted in [the native-ID decision](reviews/V2-PPTX-ID-45c2c4c.json). Its
[evaluation](V2-PPTX-ID-EVAL.md) retains completed tests and native evidence.
Planning-entry HEAD: `2e0e40d4007be462c111bc2a0fe38398a048f7ba`.

The current request continues the next immediate task and clarifies that browser
editing is the main product. Browser authoring already uses editable Layer-C
objects; Microsoft PowerPoint interaction checks concern exported files, not an
Office dependency for editing browser projects. PRODUCT-VISION now states this.

The next [roadmap contract](ROADMAP.md#assistant-turn-approval-contract) is prepared
in [V2-8H-EVAL.md](V2-8H-EVAL.md). It is a proposed headless durable conversation/
turn/proposal boundary, atomic approval+enqueue/cancel over the existing project
transaction, and conservative provider-attempt recovery. No second scene, queue,
edit cursor or automatic retry of ambiguous billed requests is proposed.

The recommendation is owner-only visible chat stored with the project until
explicit clear/project deletion, bounded records/content, no raw provider/tool
transcripts or hidden reasoning. Clearing chat preserves already committed deck
content/history and existing run records. The human data-policy direction remains
unapproved; a technical review cannot supply it. Do not add storage, migrate data
or implement the new architecture from the planning document alone.

State still indexes the accepted native-ID implementation and its four completed
historical gates. Only nextCandidate points at V2-8H, authorized false. Planning
creates no new product acceptance or passing implementation evidence. Future work
and approval state live only in the roadmap; the contract describes proposed
acceptance evidence, not executed tests.

No product/test/schema changes, tests, builds, browsers, benchmarks, services,
model API calls or local inference have been executed for V2-8H. Lightweight
planning/governance results and any plan-only review are recorded in its evaluation.
No owned validation job or service remains. Preserve historical originals; never
rerun old evidence scripts into their existing namespaces.

Original untracked paths remain untouched: `.agents/`,
`PRESENTATION_FORGE_V2_1_MASTER_AGENT_PROMPT.md`,
`PRESENTATION_FORGE_V2_2_ARCHITECTURE_WORKDOC.md`.
