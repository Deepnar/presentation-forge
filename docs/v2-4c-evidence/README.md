# V2-4C evidence — browser charts vs native PPTX (identical scenes)

A chart intent compiled through the real compiler (warm-humanist
plain+chromed, high-contrast-mono, gradient-mesh-dark); browser
shots are headless-Chrome captures of `/scenes.html`, PPTX shots
are LibreOffice rasters of the native export.

| file | shows |
|---|---|
| browser-bar-multiseries / pptx-bar-multiseries | grouped series, zero baseline, legend mapping, unit caption |
| browser-bar-signed | negatives below / positives above a real zero line |
| browser-hbar | genuinely transposed bars, categories vertical, value axis horizontal |
| browser-line / pptx-line | scaled paths, per-series markers, same relationships (axis limits differ: Office auto vs deterministic nice) |
| browser-area | zero-baseline fill, stroked edge, overlapping not stacked |
| browser-pie / pptx-pie | exact 1:3:2 sweeps in authored order (start angle and hues differ by client; legend right vs bottom) |
| browser-doughnut / browser-doughnut-dark | even-odd transparent hole incl. over plate; zero-share Polymer listed, unsliced |
| browser-bar-dense | 8 crowded categories with full labels; exact fractional ticks (0/2.5/5/7.5) |
| browser-bar-mono | monochrome theme legibility |

Regenerate: `node tools/v2-4c-eval.mjs` (needs Chrome,
LibreOffice, poppler; several minutes). Full matrices:
`out/v2-4c/browser/` (20), `out/v2-4c/pptx/<deck>/` (20).
Round-trip chart fixtures are eval-local (reverted); only this
set is committed.
