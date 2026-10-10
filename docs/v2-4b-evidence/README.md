# V2-4B evidence — calibration afters vs PPTX reference

Befores live in `docs/v2-4a-evidence/` (browser-status,
browser-metric, browser-chart); the PPTX reference is
unchanged by this slice (renderer-pptx untouched), so its
rasters are copied here for self-contained review.

| file | shows |
|---|---|
| after-status / pptx-status | F1 fixed: `IMPLEMENTED` clears `26/26` and `877/878` |
| after-metric / pptx-metric | F1 fixed: numerals sit inside their cards |
| after-chart / pptx-chart | labels at true size, bars exact, still no value axis (V2-4C) |
| after-table | header/body at true size, grid geometry intact |
| after-prose | bullets and spacing clean at true size |
| after-chromed | marks, presenter, number agree with PPTX |

Measured projection values (before → after): status
203.1/11.0 → 204.6/13.3; metric 236.7/59.4 → 285.1/72.0.
Full matrices: `out/v2-4a/browser/` (10), `out/v2-4a/pptx/`
(41). Regenerate: `node tools/v2-4a-eval.mjs` (needs Chrome,
LibreOffice, poppler; several minutes).
