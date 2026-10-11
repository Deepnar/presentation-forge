# V2-4C-2 evidence — fallback tables preserve every value

Same two-series input (A=[1,2], B=[30,40]) compiled before and
after the Layer-B fallback. Before (V2-4C-1): browser A-pie +
`□ B (not shown)`, PPTX A-pie with B dropped from the file
(probe: one `<c:ser>`, no `<c:v>30</c:v>`).

| file | shows |
|---|---|
| browser-pie-before | the warning this slice retires for canonical compiles |
| browser-pie-fallback / pptx-pie-fallback | identical editable tables, every token present |
| browser-doughnut-fallback / pptx-doughnut-fallback | doughnut input, same table contract |

After-PPTX file facts (measured): one `ppt/charts/*.xml`
(the micro bar only); slide2 cells
`["Share and spare","A","B","x","1","30","y","2","40"]` —
every authored token editable in PowerPoint.

Regenerate: `node tools/v2-4c1-eval.mjs` (needs Chrome,
LibreOffice, poppler; a few minutes). Full outputs:
`out/v2-4c1/browser/`, `out/v2-4c1/pptx/`,
`out/v2-4c1/eval-manifest.json`.
