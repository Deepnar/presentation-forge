# V2-4E evidence — read-only selection, eight inspected shots

Full driver output is gitignored (`out/v2-4e/`: 8 trusted-click
screenshots plus `eval-manifest.json` with per-shot selected
ids and overlay-vs-target edge deltas, all ≤ 0.1px). Every shot
below was looked at at full size.

| shot | shows |
|---|---|
| `single-prose.png` | one ring on the display title, inspector row with id/kind/geometry/provenance |
| `multi-prose.png` | two rings (title + bullet block), two inspector rows with semantic refs |
| `chart-select.png` | bar-rect hit selects the whole chart unit; ring round the chart, `ref ch1` in the inspector |
| `table-select.png` | cell-text hit selects the whole table unit; exact table ring |
| `zoomed-divider.png` | 200% zoom: tight ring on the display glyphs, inspector correct |
| `locked-chromed.png` | locked-banner click selects nothing: no rings, no inspector, chrome intact |
| `narrow-prose.png` | 900×1400 viewport: single ring aligns, layout holds |
| `nested-group.png` | child-label hit selects the parent group; inspector reports the group unit |

Findings: rings align to measured DOM rects at fit, 200%,
and narrow sizes; selection never resizes, moves, or edits
scene markup (one `data-selected` state marker only); locked
chrome — including locked descendants — never selects.
