# V2-4D evidence — browser fonts, six inspected pairs

Full driver output is gitignored (`out/v2-4d/`: 48 browser
screenshots across 8 decks, 8 native PPTX + LibreOffice
rasters, `eval-manifest.json` with per-shot `missing: []`).
This directory holds the curated reviewable set: six
browser/PPTX pairs actually looked at, covering display
titles, body prose, metrics, tables, charts, and chrome.

| browser | pptx | shows |
|---|---|---|
| `browser-warm-humanist-prose.png` | `pptx-warm-humanist-prose.png` | Source Serif 4 display + Inter bullets |
| `browser-swiss-divider.png` | `pptx-swiss-divider.png` | Inter display + chrome (banner, crest, number) |
| `browser-editorial-divider.png` | `pptx-editorial-divider.png` | Playfair Display divider |
| `browser-mono-table.png` | `pptx-mono-table.png` | Anton title + IBM Plex Mono table |
| `browser-sci-fi-chart.png` | `pptx-sci-fi-chart.png` | Space Grotesk title + mono chart labels |
| `browser-glass-metric.png` | `pptx-glass-metric.png` | metric figures + units |

Findings: every pair renders in its intended face on both
sides; no clipping, overlap, wrapping change, or chrome
regression. The known ~4.8px left-text difference is the
PPTX 0.05in text-box margin against box-exact SVG — left
unchanged by design (see `docs/V2-4D-EVAL.md` §5).
