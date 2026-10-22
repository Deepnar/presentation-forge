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

Frozen implementation: `282ed6d`. Product correction: `a141fae`; subsequent
governance commits define explicit four-gate applicability for this renderer-only
slice while retaining the prior nine-gate contracts. The first schema check
reported a missing conditional object type; explicit types corrected that
governance authoring error before required regression execution.

Fail-first: the original implementation failed the mixed-object uniqueness
assertion with slide 1 IDs `[1,2,3,2]` (0 pass / 1 fail). The unchanged assertion
plus four focused cases then passed 5/5, 0 fail/skip/cancelled. Raw attempts are
retained under `v2-pptx-id-evidence/attempts/`. This is an inherited product defect;
no assertion was weakened. Complete required execution and review are pending.
