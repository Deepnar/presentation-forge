# Independent native shape identity review evidence

Reviewer context: `/root/native_id_review`, separate from implementer `/root`.
Frozen source: `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
Accepted baseline compared: `f3e784ac6227f46628dc99a54762f6a861eeed64`.
The implementation/evidence packet was pushed before independent execution.
No product, existing test, schema or validator source was changed during review.

`assessment.json` indexes independent execution and inspected implementation
evidence. `execution.json` and raw logs retain exact commands, leaf totals and
timings. The primary group passed **271/271**, zero failures, skips or cancellations:
12 complete repository test files plus five supplemental cases. These overlap the
implementation's 376 primary leaves and must not be added as distinct coverage.

The supplemental script initially ran as `edge.test.mjs`; it was renamed to
`edge-check.mjs` to avoid default test discovery. Its unchanged five cases were
repeated successfully in `renamed-edge.log`. All 276 acknowledged independent
leaf executions passed; the five repeats add no distinct cases. The runner now
references the retained name; the original 271-case command/log is preserved.

`export.mjs` copied the retained before archive into a fresh output namespace,
normalized that exact archive, and separately exported fresh scenes through the
current canonical renderer. Scene input remained exact. LibreOffice/Poppler
rasterized all three archives into nine pages. Six comparisons at1467×825 found
zero changed channels. The three distinct full-size fresh views were inspected,
with the retained enlarged table detail resolving initial full-slide uncertainty.

`audit.py` verified 54 package parts. All45 non-identity parts remained byte-exact
when repairing the same archive, without timestamp exceptions. Nine identity
parts were checked; only three slide parts changed, and only later duplicate IDs
changed. First occurrence lexical IDs and every non-ID XML byte remained exact.
The separate fresh export matches the repaired projection, allowing only generated
created/modified fields in outer and embedded workbook core properties to differ.
Two charts, their two workbooks, all five native tables, relationship targets and
native media survived. All161 historical/canonical original hashes still match.

`packet-audit.py` independently checked the implementation's complete19-file,
376-case log inventory; typecheck record; all50 benchmark cells against accepted
V2-8G quality/invariance/counterfactual values; source equality; and raster hashes.
These are inspected evidence, distinct from independently executed271 cases.

`run.py` uses measured30-second quiet-window guards, low CPU/I/O priority, serial
execution, process-group monitoring and five-minute watchdogs. Seven retained
resource samples had no critical condition. CPU peaked at23.03%; available memory
stayed above40GiB. Global I/O PSI provenance remains unresolved. No competing
process, service or database was altered. There is no owned running job/service.

The runner creates its output directory and logs exclusively. Do not rerun it
against these completed outputs or run historical finish/generation scripts.
For reproduction, copy the scripts to a fresh evidence namespace, change their
output/evidence constants together, and retain the same source and commands.
The before archive and all three exact review archives/images are retained here.

Interactive Microsoft PowerPoint selection/edit/save/reopen is unexecuted.
PostgreSQL/fault/browser/build checks are outside this approved renderer-only
contract and were not rerun. The standing en_IN BYOK failure remains historical
and separate. No model API, local inference, content-quality evaluation, service
provisioning, migration, deployment or dependent feature was performed. The three
original untracked paths were untouched. Future scope remains in the roadmap.
