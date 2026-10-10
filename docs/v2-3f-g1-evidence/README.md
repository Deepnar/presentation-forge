# V2-3F-G1 review evidence

Curated, committed review set for the word-width calibration
slice. Full reproducible outputs live gitignored under `out/`
(see regeneration below); these nine files are the ones a
reviewer needs to judge the slice without rerunning anything.

## P1-1 pairs (rendered both eras, LibreOffice 26.8, 110 dpi)

- `01-p1-calib.png` — 16-column table, Inter Bold 13pt headers
  `Head0`–`Head15`. **Before and after renders are
  pixel-identical** (single file serves both): `Head10`–`Head15`
  split mid-word (`Head1`/`0`), `Head0`–`Head9` fit. Six
  `table-cell-overflow` findings before AND after — preserved
  true positives, the rendered proof that the original
  diagnostics were correct.
- `02-hyphen-narrow-before.png` / `03-hyphen-narrow-after.png`
  — 16 narrow columns of `2000-Qn` tokens. **Pixel-identical
  across eras** (same SHA); findings go 16 → 0 because
  renderers break words after hyphens (`2000-`/`Qn`), which
  the refined model now measures as fragments. No geometry
  changed anywhere in this slice: correction is diagnostic
  precision only.

## Representative sheets (post-calibration benchmark + 3F-9 status run)

- `04-decision-plain.png` — comparison slide with capacity
  allocation, support, verdict.
- `05-data-table-plain.png` — native table with header
  hierarchy, units, caveat.
- `06-chart-plain.png` — native bar chart, categories, legend,
  unit, caption.
- `07-status-plain.png` — implemented/planned badges beside
  rails and caveats.
- `08-decision-chromed.png` — banner, crest, presenter,
  slide number intact beside comparison content.
- `09-plate-dark-status.png` — glassmorphism status deck
  (rendered in the 3F-9 session; geometry-identical post-G1
  since this slice moves no pixels — verified by hash on the
  pairs above and by construction: only diagnostic emission
  changed).

## Regeneration

```bash
node tools/v2-benchmark.mjs --out out/v2-3f-g1 --raster key
node tools/v2-eval-matrix.mjs --out out/v2-eval
```

P1-1 pair inputs: 16 `HeadN` headers (Inter Bold 13pt,
0.7458in columns, 0.05in padding) and 16 `2000-Qn` cells;
full calibration deck (34-char tokens, uppercase, digits,
wide/narrow glyphs, symbols) procedure recorded in the
V2-3F-G1 evaluation entry.
