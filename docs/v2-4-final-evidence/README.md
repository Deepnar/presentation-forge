# V2-4-FINAL evidence — integration gate pairs

Full driver output is gitignored (`out/v2-4final/`: 16
browser shots across 7 themes + chromed, 8 native PPTX decks
× 12 slides with LibreOffice rasters, `eval-manifest.json`
with per-shot `missing: []`). Regenerate:
`node tools/v2-4final-eval.mjs` (live-compiles the 12-slide
mechanism intent per theme, round-trips one temp-fixture
build, reverts). Prior slice sets are reused, not
regenerated: `docs/v2-4d-evidence/` (48-shot font matrix),
`docs/v2-4e-evidence/` (selection), `docs/v2-4f-evidence/`
(live panel + PPTX).

| file | shows |
|---|---|
| `gate-swiss-divider-browser.png` / `gate-swiss-divider-pptx.png` | identical divider scene both ways: Inter display, subtitle, grid rules |
| `gate-scifi-chart-browser.png` / `gate-scifi-chart-pptx.png` | identical chart scene: bars A=1/B=2, ticks, legend, unit (accepted client differences: browser y-ticks stop at 2, PPTX at 2.5; legend side) |
| `gate-glass-divider-browser.png` | glassmorphism plate + Outfit display |
| `gate-mono-chart-browser.png` | high-contrast-mono Anton display + mono ticks, exact bars |
| `gate-warm-chromed-browser.png` | locked chrome variant, full filmstrip |
| `gate-dark-plate-browser.png` | gradient-mesh-dark plate divider |

Findings: all 16 browser captures report no missing faces;
all 8 PPTX decks carry 12 native slides; browser/PPTX agree
on meaning everywhere with only the accepted client-layout
differences named above (owned by V2-4C) and the 4.8px text
inset (owned by V2-4D).
