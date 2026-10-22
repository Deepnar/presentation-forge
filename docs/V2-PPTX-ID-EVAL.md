# Native PowerPoint shape identity correction

## Authorized contract

2026-10-22, branch `v2`, push `origin/v2`. The current request prioritizes the
inherited duplicate nonvisual shape IDs before any interactive-fidelity claim.
Accepted baseline: `f3e784ac6227f46628dc99a54762f6a861eeed64`;
task-entry HEAD: `7f4c1e8b97a2e1b7987d9c089910f7323610a41d`.

Correct collisions in the canonical scene-to-PPTX export only. PptxGenJS 4.0.1
uses `idx + 2` for text/shapes/pictures/charts but
`intTableNum * slide._slideNum + 1` for tables. The accepted V2-8D witness
contains `[1,2,3,2]`. IDs must be unsigned integers unique in each shape tree's
part; reuse across different slides is legitimate. Preserve existing unique IDs
and repair only later duplicates with deterministic unused IDs. Preserve every
other XML byte, relationship, native chart/workbook/table payload and scene field.
Do not guess the target of an ambiguous shape reference: refuse that export.

The correction belongs after library serialization, in the canonical in-memory
renderer shared by the filesystem/HTTP/runtime callers. No dependency upgrade,
scene/schema/storage/command change, legacy renderer rewrite, layout work,
Assistant work, model API call or local inference. Existing exported archives
remain historical evidence; exports from the corrected renderer get the fix.

Look-ahead: imported PPTX, grouping/connectors, animation and visual feedback must
retain real identities and references. This adapter handles generated exports;
it is not an imported-file repair API. The existing mixed-run SVG difference
retains its separate roadmap entry. Interactive Microsoft PowerPoint is not
available here and remains explicitly unexecuted.

## Required verification and gate applicability

- Correctness/native PPTX: fail-first mixed-object exports on multiple slides;
  unique numeric IDs including the root, collision-order cases, group children,
  decor, pictures/placeholders, tables and charts. Preserve input scenes and
  verify native objects, chart data/embedded workbooks, relationship targets,
  untouched parts and all XML except corrected ID attributes.
- Regression/backward compatibility: full files in the bounded export-consumer
  inventory, including preflight, content/style/layers/undo, saved-project export
  and governance checks. No filtered assertions. Canonical 50-cell benchmark,
  typecheck and before/after native raster comparison, inspected at full size.
- Data integrity, authorization, undo/redo and ownership: unchanged primitives;
  relevant existing export/engine tests apply. No new database or persistence
  behavior. PostgreSQL and cross-process fault suites are not required for this
  renderer-only correction and will be reported as not rerun, never passing.
- Browser/accessibility/responsive/production build: no browser or client source
  changes; these common gates are not applicable to the bounded correction.
  Native raster inspection is required, not a substitute browser acceptance.
- Documentation/evidence: exact source SHA/delta, raw logs, leaf totals, timings,
  hashes, resource observations, independent review, state and handoff.
- Deployment safety: no deployment, service provisioning or migration.

Validation uses fresh output namespaces, low priority, process watchdogs and
serial isolation after measured shared-machine headroom. Preserve historical
archives and canonical outputs; do not run their old evidence generators.
The standing BYOK locale failure remains separate and is not waived into green.

Acceptance requires exact-source independent review. Stop after this correction,
evidence and push; no dependent roadmap slice is authorized by its acceptance.

## Execution

Frozen implementation: `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
Product correction: `a141fae`; subsequent
governance commits define explicit four-gate applicability for this renderer-only
slice while retaining the prior nine-gate contracts. The first schema check
reported a missing conditional object type; explicit types corrected that
governance authoring error before required regression execution.

Fail-first: the original implementation failed the mixed-object uniqueness
assertion with slide 1 IDs `[1,2,3,2]` (0 pass / 1 fail). The unchanged assertion
plus four focused cases then passed 5/5, 0 fail/skip/cancelled. The first complete
19-file gate passed375/failed1: its new governance negative expected an inventory
error where the schema correctly rejected fewer than four gates first. The test
now checks that schema refusal and separately verifies a wrong inventory with
four entries. No export assertion or validator requirement was weakened.
The complete rerun on frozen source passed376/376, 0 fail/skip/cancelled.
Raw attempts remain under `v2-pptx-id-evidence/attempts/`.

### Completed required execution

| Gate | Result |
|---|---|
| Full affected export/governance inventory | **376 pass / 0 fail / 0 skip / 0 cancelled**, 19 complete files, serial, 13.439s |
| Typecheck | exit0, 1.168s |
| Canonical benchmark | **50 cells**, zero L1 findings, 515ms compiler/ZIP; all compiler quality fields, invariance and counterfactuals match accepted V2-8G |
| Native archive/raster inspection | 54 parts, all three slide identity scopes unique; three before/after pairs at1467×825, **zero changed pixel channels** |

[Plan and exact file inventory](v2-pptx-id-evidence/validation-plan.json),
[test record](v2-pptx-id-evidence/native-pptx.json),
[benchmark comparison](v2-pptx-id-evidence/benchmark-comparison.json),
[archive audit](v2-pptx-id-evidence/archive-comparison.json),
[raster comparison](v2-pptx-id-evidence/raster-comparison.json) and
[inspection manifest](v2-pptx-id-evidence/frontend-visual.json) retain commands,
logs, hashes and full implementation identity. Tests execute Node24.16.0 against
the in-memory renderer and isolated temporary SQLite saved-project consumers;
PptxGenJS4.0.1, LibreOffice and Poppler produce native exports and rasters.
The three-slide export measured59.840ms and132,892bytes on this host. These are
single local observations, not production percentiles or an interactive-PowerPoint
measurement. Repeated focused5/5 overlap the376 primary leaves and are not added.

The archive check preserves all non-ID projection XML, relationships, media,
chart values and embedded workbook data. Fresh exports naturally have different
created/modified times in outer and embedded `docProps/core.xml`; only those two
fields are normalized for cross-export comparison. The first audit correctly
exposed the previously unhandled workbook timestamps; its failed command/log is
retained in `attempts/first-archive/`. Narrowing that comparison to generated time
fields is a harness correction; every other workbook part remains byte-exact.
The same-archive regression separately proves non-shape parts remain byte-exact
through correction and an already-valid ZIP returns unchanged bytes.

All six native rasters were inspected, with an enlarged left-table detail to
resolve full-slide viewing uncertainty. Both tables on slides2/3 are present;
no clipping, overlap or canvas shift was introduced. **161 existing original
PPTX archives**, including five canonical outputs and the exact accepted V2-8D
collision witness, retained their hashes. No historical generator was rerun.

The initial180.448s headroom window averaged4.64% busy CPU,8.13% I/O wait,
1.24% physical-disk busy and0.071weighted queue, with ample memory and no userspace
blocked threads. Fresh pre-job guards withheld validation during transient disk/
userspace blocking and then admitted bounded low-priority work. Elevated global
I/O PSI retains unresolved provenance, recorded in the raw observations. No
unrelated process was stopped and no service/database was provisioned.

### Limitations and recommendation

There are **zero unexecuted required checks**. The206 unrelated test files,
PostgreSQL/fault/browser suites and UI production build were not rerun for this
renderer-only correction; [the applicability record](v2-pptx-id-evidence/unexecuted-scope.json)
does not count them as passing. The separate standing en_IN BYOK failure remains
historically9pass/1fail and was not rerun. V2-8G's complete matrix remains historical
prerequisite evidence, not a new execution on this source.

Interactive Microsoft PowerPoint selection/edit/save/reopen is **unexecuted**.
Old exported archives are not silently repaired; re-export through the corrected
canonical renderer creates corrected IDs. Legacy generation identity risk and
mixed-run SVG fidelity retain separate roadmap entries. No real model API call,
local inference, search, Assistant feature or content-quality evaluation occurred.

Implementer recommendation: accept the bounded identifier correction after
independent exact-source review; no full interactive-fidelity claim. Review is
pending and the accepted baseline remains `f3e784a` until a separate decision.
