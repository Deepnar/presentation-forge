# Chart-editor evidence

Real Chrome runs over committed fixtures (`mech-warm-humanist-plain`
slide 6 `m-chart`, `mech-warm-humanist-chromed` slide 6), plus
headless engine/OOXML assertions in `test/v2-chart-edit.test.js`.

Reproduce:

```
node tools/chart-eval.mjs                 # out/chart-editor/eval-*.png + eval-manifest.json
node --test test/v2-chart-edit.test.js    # 26/26 headless
node --test test/v2-edit-chrome-chart.test.js  # 2/2 real Chrome (isolated; needs google-chrome-stable)
```

Only single-series bar charts exist in the viewer fixtures, so the
browser proves bar editing deeply while line/pie/doughnut/hbar/area
and multi-series safety are proven headlessly (SVG + OOXML).
`manifest.json` is the driver's verbatim output.

| shot | shows |
|---|---|
| `inspector.png` | selected chart with the data-editor grid |
| `committed.png` | renamed category + edited value committed in one revision, bars rescaled |
| `added.png` | added category and series on the plot with updated legend |
| `pie-refused.png` | explicit refusal banner for a 2-series pie switch; chart and draft intact |
| `eval-panel.png` | editor grid over the bar chart |
| `eval-edited.png` | edited value committed |
| `eval-line.png` | bar switched to a native line chart, data intact |
| `eval-chromed.png` | renamed category on a chromed slide, marks intact |

Authoritative data vs native output: the headless suite asserts
series counts, names, categories, and inline `numCache` values in
`ppt/charts/chart1.xml` per scene (`docs/CHART-EDITOR-EVAL.md`
§§7, 10). A standing pipeline fact: the embedded
`Microsoft_Excel_Worksheet1.xlsx` is a 0-byte placeholder — values
are verified in the inline `strCache`/`numCache` blocks instead.
