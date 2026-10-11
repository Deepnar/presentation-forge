# V2-4C-1 evidence — micro ticks and multi-series pie

Two-slide intent through the real compiler (warm-humanist);
browser shots are headless-Chrome captures of `/scenes.html`,
PPTX shots are LibreOffice rasters of the native export.

| file | shows |
|---|---|
| browser-micro-after / pptx-micro | axis reads 0 / 0.000001 / 0.000002 / 0.000003 in the browser (before: `0\|0\|0\|0` measured strings); PPTX shows the same values with denser native ticks |
| browser-pie2 / pptx-pie2 | A 1:2 pie with hollow `□ B (not shown)` in the browser; PPTX draws the same A pie with a category legend and drops B from the file without a trace |

Before-values are recorded measured strings (deterministic —
the defect was textual, verified failing on `5d00a3b`).

Regenerate: `node tools/v2-4c1-eval.mjs` (needs Chrome,
LibreOffice, poppler; a few minutes). Full outputs:
`out/v2-4c1/browser/`, `out/v2-4c1/pptx/`,
`out/v2-4c1/eval-manifest.json`.
