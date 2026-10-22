# Independent review — native PowerPoint shape identity

**ACCEPT** `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9` for the
bounded canonical scene-to-PPTX identifier correction. No blocking findings.
Reviewer/context: `/root/native_id_review`, separate from implementer `/root`.
Accepted baseline compared: `f3e784ac6227f46628dc99a54762f6a861eeed64`;
task-entry HEAD: `7f4c1e8b97a2e1b7987d9c089910f7323610a41d`.
Pushed implementation packet inspected: `a369067`; later handoff `5087c73`
contains no product delta. Independent evidence is committed in `94920cf`
and exact review archives in `43cbd3d`.

## Source and contract findings

The accepted invariant remains intact: intent does not gain coordinates, styling
or renderer instructions. The correction runs in the canonical in-memory renderer
after PptxGenJS serialization, so existing file, HTTP and runtime consumers inherit
the same result. It changes no scene, command, persistence, authentication,
dependency, browser or legacy-renderer contract.

Within each generated presentation shape part, all existing valid numeric IDs are
reserved before allocation. Each first occurrence retains its exact lexical ID;
only later duplicates receive deterministic unused IDs. IDs can repeat across
different parts. Generated slide/layout/master/notes parts share this policy.
Invalid unsigned identities fail closed. Animation/build/legacy target attributes
and connector endpoints that reference a duplicated ID refuse export, preserving
the ambiguity instead of guessing which object was intended. Already-unique
archives return unchanged bytes. This is deliberately a generated-output adapter,
not an arbitrary or imported-OOXML repair interface.

The four required gates are justified by the bounded source change. Existing
milestones retain their previous nine-gate contracts, including schema minimums
and complete file inventories. Independent execution covers all governance
negative cases; the corrected new test checks schema refusal and a separate
wrong-inventory refusal without weakening export assertions.

## Independently executed

- **271 pass / 0 fail / 0 skip / 0 cancelled** across12 complete existing test
  files and five supplemental identity/refusal cases. This includes native
  rendering, preflight, governance, saved-project export, headless tools and
  additional layout/chrome/plate/composition coverage. Coverage overlaps the
  implementer's376 cases and is not added as distinct primary coverage.
- Five unchanged supplemental cases repeated after renaming the evidence script
  to avoid default test discovery: **5/5**, explicitly overlapping. All276
  acknowledged leaf executions passed;271 are reported as distinct review cases.
- Fresh canonical export, same-archive normalization, input-scene equality,
  native payload/relationship audits, three independently rasterized archives,
  historical hashes and packet/source consistency checks passed. The protocol
  validator reported0 errors and0 warnings.

The54-part same-archive audit proves all45 non-identity parts are byte-exact,
including embedded workbooks, with **no timestamp exception**. Nine identity
parts were checked; only the three slide parts changed. Slide1 changes
`[1,2,3,2]` to`[1,2,3,4]`; slide2 repairs its later3/5 duplicates to2/4;
slide3 repairs its later7 duplicate to6. All first IDs and non-ID XML remain exact.
Both charts, their two embedded workbooks, five native tables, media and all
relationship targets survive. A separate fresh renderer export matches this
projection, normalizing only generated created/modified fields in outer and
embedded workbook core properties. All161 historical/canonical original hashes
remain unchanged.

Nine fresh raster pages produced six before/after comparisons at1467×825 with
**zero changed channels**. The three distinct full-size fresh pages were visually
inspected. Exact pixel equality establishes the same views for the other variants.
An enlarged table detail and PDF text resolved an initial mistaken full-slide
interpretation: both tables on slides2/3 are present. No new clipping, overlap or
canvas shift was observed.

The primary review test group took23.179s; fresh export/raster command2.018s;
archive audit0.114s. The three-slide fresh renderer observation was56.505ms.
These are local observations, not production percentiles or PowerPoint timings.
Seven resource observations passed the quiet-window/monitor policy without a
critical condition. CPU peaked at23.03%, memory stayed above40GiB available;
unresolved global I/O PSI provenance remains recorded. No competing process was
stopped. No owned job or service remains.

## Inspected implementation evidence and limits

The full19-file log inventory and **376/376** primary totals were independently
audited against the required plan and exact implementation. Typecheck passed;
all50 benchmark cells were checked against accepted V2-8G compiler quality fields,
invariance and counterfactuals, with zero L1 findings. Those two gates were
inspected through retained execution evidence, not independently rerun.
The original fail-first `[1,2,3,2]` failure and retained schema/test/timestamp
harness failures have narrow, supported classifications; no product assertion
was weakened and all required checks have completed.

Interactive Microsoft PowerPoint selection/edit/save/reopen remains **unexecuted**;
this decision makes no full interactive-fidelity claim. Historical archives are
not silently repaired. Legacy renderer identity risk and mixed-run SVG parity
remain separate roadmap entries. PostgreSQL, fault, browser and UI production
build checks were not rerun under this explicit renderer-only contract and are
not counted as passes. The standing en_IN BYOK locale9pass/1fail result remains
historical and separate; no waiver is required for the four passing gates.

No real model API call, local inference, content-quality evaluation, service
provisioning, migration or deployment occurred. Original untracked `.agents/`
and the two master/workdoc paths were untouched. No product source was changed
by review. The accepted source SHA is unchanged through the evidence commits.

[Independent assessment](../v2-pptx-id-evidence/independent/assessment.json),
[execution records](../v2-pptx-id-evidence/independent/execution.json),
[archive audit](../v2-pptx-id-evidence/independent/archive.json) and
[reproduction notes](../v2-pptx-id-evidence/independent/README.md) retain exact
commands, hashes, source identity and exclusions. ACCEPT permits planning only;
no dependent feature, deployment or infrastructure action is authorized.
