# V2-4B Evaluation — typography calibration

Date: 2026-10-10. Baseline `c5b564a` (V2-4A accepted).
Driver: `node tools/v2-4a-eval.mjs` (unchanged; outputs
gitignored `out/v2-4a/`, manifest `out/v2-4a/eval-manifest.json`).
Curated evidence: `docs/v2-4b-evidence/` + README. Befores are
the committed `docs/v2-4a-evidence/` shots; afters are new.
Method: same fixture scenes both ways — native PPTX →
LibreOffice raster (reference, regenerated to confirm
byte-stable behavior) vs headless-Chrome viewer screenshots.

## Verdict

F1 and F2 resolved with raster evidence. Display type respects
scene geometry; the failing metric/status cases are visibly
corrected; prose, cards, compare, table, chart, chrome, and
plate show no meaningful regressions. PPTX reference
unchanged (renderer-pptx untouched; OOXML sizes asserted).
Seven focused tests fail on the V2-4A baseline and pass after.

## Root causes

**F1 — fixed first baseline.** `textSvg` set the first line at
`el.y*96 + 14px` for every size. A 54pt metric (59.4px font at
the old scale) needs ~48px of ascent above its baseline, so its
glyphs overshot the box top by ~36px: `IMPLEMENTED` collided
with `26/26`, and `12.5`/`1.2` crossed their card tops. PPTX
anchors text boxes at top + 0.05in margin + true ascent, so the
reference was always clean — the bug lived only in the shared
SVG projection.

**F2 — preview type scale.** Font size used `pt × 1.1` where
canonical browser units are `pt × 96/72`. Browser type rendered
at 82.5% of true size relative to scene geometry (and PPTX).
Tracking in the same function already used 96/72 — the 1.1 was
a legacy preview fudge with no contract behind it.

## Old/new projection

| path | before | after |
|---|---|---|
| text font size | `pt × 1.1` | `pt × 96/72` (`pt2px`) |
| first baseline (top) | `y×96 + 14` | `y×96 + 0.05×96 + size×0.8` |
| middle/bottom anchor | `± total/2 + size×0.35` | unchanged (already size-relative) |
| table header/body size | `pt × 1.1` | `pt × 96/72` |
| chart label size | `pt × 1.1` | `pt × 96/72` |
| tracking, advances, wrap | — | unchanged (already size-relative / contract units) |
| image seat, pre-contract table | fixed decorative sizes | unchanged (not scene typography) |

`0.05in` is the literal PPTX text-box margin (`render.ts`
`addTextElement`); `0.8em` ascent is the measured
approximation for the theme faces, confirmed by the rasters
below. No compiler, schema, floor, or geometry change.

## Measured results (st-measured-s1, scene units → px)

| line | before (y / size) | after (y / size) |
|---|---|---|
| `IMPLEMENTED` 10pt | 203.1 / 11.0 | 204.6 / 13.3 |
| `26/26` 54pt | 236.7 / 59.4 | 285.1 / 72.0 |
| body 13pt second line | — | 357.1 / 17.3 |

Glyph-top math after: metric top ≈ 285.1 − 57.6 = 227.5 vs
status-box bottom 217.9 → 9.6px clear (before: top ≈ 189.2,
14px above the status baseline — the photographed collision).
Content-box bottom 391.5 clears the 357.1 second baseline.

## Role coverage (all read at full size)

Divider, prose (bullets, multi-line), cards, compare (+verdict
rule), table (header/body), metric, chart (bars exact, labels
at true size, still no value axis — V2-4C), status (both
tiles), chromed (marks, presenter, number), plate dark.
Zoom 200% scales geometry and type together (pure transform,
no independent font scaling); narrow viewport reflows the
viewer shell, never scene geometry.

## Remaining discrepancies (all owned, none new)

- Browser has no explicit left text inset while PPTX insets
  0.05in; ~5px, sub-perceptual except in the tightest boxes.
  Left as-is to bound blast radius; revisit if rasters show it.
- Display faces resolve via system fonts (V2-4D bundles
  webfonts); residual metric differences stay visible and
  documented, never auto-corrected.
- Structural charts still carry no axes/ticks (V2-4C).
- Groups render but remain uninspected slide-by-slide;
  rotation is parity-by-omission in both projectors.

## Tests

New `test/v2-typography-4b.test.js` (10): conversion across
five roles, table/chart parity, F1 box-top and status-clear
proofs, body anchor, multi-line steps, styling survival,
no-text-lost, selection/identity/chrome, OOXML `sz="1300"`
verbatim proof. Seven fail on `c5b564a` (verified via stash),
all pass after. One historical pin updated with explanation
(`v2-viewer-4a`: 20pt `22.0` → canonical `26.7`).
Consumer net 263/263; full suite 1424/1425 (sole failure the
known BYOK locale one).

## Limitations / next slice

V2-4C (per-kind chart geometry) is the correct next slice;
V2-4D (fonts) then removes the last systematic metric
residual. No new fitting policy was introduced — overflow,
wherever the browser disagrees with the compiler count,
stays visible and honest.
