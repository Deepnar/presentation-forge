# Native PowerPoint identity evidence

Exact source: `45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.
[Scope and results](../V2-PPTX-ID-EVAL.md), `validation-plan.json` and the four
state-linked JSON records define this renderer-only inventory. The independent
ACCEPT is in `../reviews/V2-PPTX-ID-45c2c4c.json`.

`logs/` retains complete serial test, typecheck, benchmark, raster and archive
commands. `attempts/` retains the original uniqueness failure, schema authoring
error, governance expectation failure and workbook-timestamp harness failure.
They are not deleted or counted as passing. The final full affected test log
contains 376 passing leaves in all 19 required files, without filters/skips.

`archive-comparison.json` compares fresh original/fixed exports, permitting only
created/modified time differences in outer and embedded core properties in
addition to corrected shape IDs. The independent same-archive audit permits no
timestamp exceptions and proves every other part byte-exact. Exact synthetic
original/repaired/fresh archives are committed under `independent/archives/`.
Images, hashes and independent execution details remain under their own prefixes.
The 161 pre-existing original hashes in the root archive audit match final files.

The recorded `validate.py` sequence has completed. Do not rerun it in place:
it deliberately refuses existing logs/exports. A fresh reproduction must use a
new evidence/output/benchmark namespace and preserve every existing original.
Use the same file inventory, Node 24, low priority, serial isolation and process
watchdogs. Inspect CPU/memory/physical storage/pressure and qualify headroom using
`quiet_window.py` before expensive checks. Do not stop unrelated processes.
Root and independent original resource observations retain unresolved global I/O
PSI provenance. No service or model call is needed for this correction.

For a new archive-only reproduction, copy the committed `before.pptx` into a fresh
output directory, normalize it through `uniquePptxShapeIds`, and compare every
package part/shape reference before rasterizing with `src/preview.js`. The
independent `audit.py`/`export.mjs` show the exact recorded assertions and paths;
copy/adapt their output paths rather than overwriting retained evidence. Native
XML/raster success does not replace Microsoft PowerPoint interaction checks.
