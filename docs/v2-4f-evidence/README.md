# V2-4F evidence — live compiler-to-browser integration

Full driver output is gitignored (`out/v2-4f/`: 8 UI-driven
screenshots, `eval-manifest.json` with per-shot ids/deltas,
`live-mechanism.pptx` + LibreOffice rasters). Every shot below
was read at full size. Regenerate: `node tools/v2-4f-eval.mjs`
(builds the viewer, serves API + dist on one origin, drives
the real Live panel with trusted clicks).

| shot | shows |
|---|---|
| `live-loading.png` | slowed compile: old fixture stays mounted while "compiling…" shows |
| `live-mechanism.png` | live technical deck, title selected, inspector grounded |
| `live-data-chart.png` | live line chart 3.0→2.5 with legend, ring on title |
| `live-status.png` | IMPLEMENTED/PLANNED badges + QUALIFIED qualifier from live intent |
| `live-chromed.png` | locked banner + footer chrome on a live deck; body selected, chrome excluded |
| `live-dark-plate.png` | gradient-mesh-dark plate + ring readable on dark |
| `live-narrow.png` | 900×1400 live deck holds |
| `pptx-live-chart.png` | native PPTX raster of the identical live scenes: "Conductivity", Oxide 1.2 / Sulfide 12.5 |

Findings: live and fixture decks render through one viewer
path (filmstrip, zoom, selection, fonts, chrome); recompiles
swap atomically with selection cleared; invalid input and
unknown themes are 422s recorded in the manifest (the panel
only offers valid examples); overlay deltas ≤ 0.1px.
