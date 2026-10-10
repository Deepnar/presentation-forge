# V2-4A evidence — browser viewer vs native PPTX

Same fixture scenes, two projectors: headless-Chrome
screenshots of `/scenes.html` (1440×900) vs LibreOffice
rasters of the native PPTX export. Full matrices live
gitignored in `out/v2-4a/`; these ten are the curated
findings from `docs/V2-4A-EVAL.md`.

| file | shows |
|---|---|
| browser-status / pptx-status | **F1**: `IMPLEMENTED` collides with `26/26` in the browser; PPTX clean |
| browser-metric / pptx-metric | **F1** again: numerals cross card tops in the browser, sit inside in PPTX |
| browser-chart / pptx-chart | boundedness by design: exact bar ratios, no value axis in the browser |
| browser-chromed / pptx-chromed | parity: presenter, number, content-mark agree (red block is the benchmark's placeholder crest in both) |
| browser-plate-dark / pptx-plate-dark | plate contract holds in the browser (raster, decor, surface ink) |

Regenerate: `node tools/v2-4a-eval.mjs` (needs Chrome,
LibreOffice, poppler; several minutes). Outputs
`out/v2-4a/browser/`, `out/v2-4a/pptx/<deck>/`,
`out/v2-4a/eval-manifest.json`.
