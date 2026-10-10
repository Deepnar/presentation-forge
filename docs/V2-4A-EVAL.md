# V2-4A Evaluation — read-only browser scene viewer

Date: 2026-10-10. Baseline `fdc7cf5` (+ `9e387d5` roadmap acceptance).
Driver: `tools/v2-4a-eval.mjs` (committed; outputs gitignored
`out/v2-4a/`, manifest `out/v2-4a/eval-manifest.json`). Curated
evidence: `docs/v2-4a-evidence/` + README. Method: same fixture
scenes rendered both ways — native PPTX → LibreOffice raster vs
headless-Chrome screenshots of the viewer at 1440×900 — and read
side by side at full scale.

Targets (10): divider, prose, cards, compare, table, metric,
chart (mech plain 0–6), status (source-of-truth 2), chromed
prose (mech chromed 1), plate dark divider (gradient-mesh-dark
0, generated locally, never committed).

## Verdict

Foundation accepted as built, with two projection-calibration
findings (F1, F2) scoped to V2-4B. The viewer faithfully
projects geometry, order, identity, backgrounds, chrome,
tables, and structural charts; where it disagrees with PPTX,
the cause is identified below with its owning layer. No
compiler, schema, or floor changes were needed or made.

## Element-support matrix

| Scene content | Browser rendering | Parity vs PPTX |
|---|---|---|
| text family/size/weight/color/align | verbatim projection | agree, modulo F2 scale |
| tracking, uppercase, bullets, italic | verbatim projection | agree (prose bullets match) |
| text wrap | shared `lineCount` heuristic, opt-in `wrapText` | breaks match compiler count |
| shape rect/roundRect/ellipse, fill/alpha/stroke | verbatim | agree (cards, metric frames, status marks) |
| line geometry/stroke | verbatim | agree (compare rule, divider rule) |
| image `data:`/`https:` | `<image>` slice | agree (crest placeholder identical) |
| image empty/local path | gray seat + alt | agree by rule (never a broken icon) |
| background fill/image/decor | layered verbatim | agree incl. 25MB plate raster |
| chrome presenter/number/content-mark | projected, locked, unselectable | positions agree; crest is the benchmark's red-dot placeholder in both |
| table contract (rects, header, wrap, grid) | complete, scroll-free | geometry agrees |
| chart bars + labels/legend | structural, ratios exact | NO axes/gridlines/tick values → V2-4C |
| group children | offset projection | implemented, not visually inspected (m-cycle/m-hier) |
| rotation | carried, applied by neither projector | parity by omission (pre-existing; PPTX header notes the same gap) |
| z-order, opacity | ascending / verbatim | agree, unit-tested |
| unknown kinds | render nothing | same as string projection, by rule |

## Fidelity findings

**Agree:** divider (layout identical), prose (bullets, sizes,
spacing), cards (frames, header treatment), compare (sides +
verdict rule), table (header + grid geometry), chromed (all
three marks, presenter translucency, numbering), plate dark
(raster, decor line, surface ink — the V2-3F plate contract
holds in the browser).

**F1 — display-type first baseline (browser-only overlap).**
`textSvg` sets the first baseline at a fixed `el.y*96 + 14px`
regardless of size. For the 54pt metric (59.4px font) the
glyphs overshoot the box top by ~36px; the content box sits
0.05in below the status box, so `IMPLEMENTED` collides with
`26/26`, and `12.5`/`1.2` cross their card top edges. PPTX is
clean: text boxes anchor at top + margin + true ascent.
Owning layer: shared projection (`packages/editor/scene-svg.js`
`textSvg`), affecting string preview and viewer together —
not the compiler, not a floor. Fix (V2-4B): size-proportional
first baseline mirroring the PPTX anchor; the middle/bottom
branches already scale with size (`0.35*size`), only `top`
is fixed.

**F2 — preview type scale understates ~17%.** SVG font-size
uses `pt × 1.1` (historical preview constant) where canonical
CSS px is `pt × 96/72` (×1.333); letter-spacing in the same
function already uses the true factor. Relative to scene
geometry, browser type renders at 82.5% of true size. Owning
layer: same shared projection. Fix with F1 in V2-4B as one
calibration slice with before/after evidence; both changes
alter default SVG string output, so its tests travel with the
slice.

**Chart boundedness (by design, not a bug).** Browser bars
preserve exact data ratios (A=1, B=2) with contract labels and
legend, but draw no value axis — honest about what it knows.
Per-kind geometry (axes, gridlines, ticks) is V2-4C.

## Viewer capabilities (all working, smoke-tested in real Chrome)

Viewport 16:9 canonical, fit-to-container scaling,
25%–400% zoom controls, filmstrip with active state,
prev/next + Home/End/Escape keyboard nav, `?deck=&slide=`
`&select=&zoom=` deep links, read-only click selection
(locked chrome never selects), resize via ResizeObserver +
eager first fit, loading/empty/error states. Mounts in ~350ms
per slide; full smoke (build + 4 dumps + 3 screenshots) in
~2.5s. Scenes deep-frozen on mount; 25 linkedom contract
tests + 3 real-Chrome tests green.

## Known limitations (not this slice)

- F1/F2 calibration open (V2-4B).
- Chart axes/ticks open (V2-4C).
- Theme display faces (Merriweather) resolve via system
  fonts in the browser; no bundled webfont yet (V2-4D).
- Viewer serves committed fixtures; no live per-deck scene
  endpoint yet (V2-4F). Plate fixtures stay out of the
  bundle for size (25MB); the eval driver round-trips them
  locally with automatic revert.
- Groups render but were not visually inspected slide by
  slide; rotation is parity-by-omission.

## Follow-up slices (proposed order)

- **V2-4B projection calibration** — F1 + F2 with
  before/after evidence; shared with the string preview.
- **V2-4C chart fidelity** — per-kind SVG geometry,
  data-exactness tests.
- **V2-4D browser fonts** — bundle the display faces themes
  reference; document residual fallback.
- **V2-4E selection model** — multi-select, focus,
  overlays, bounds inspection; still no mutation.
- **V2-4F live scenes** — server compiles deck scenes on
  demand; viewer leaves fixtures.

## Evidence map

`docs/v2-4a-evidence/`: browser-status vs pptx-status (F1),
browser-chart vs pptx-chart (boundedness), browser-metric vs
pptx-metric (F1), browser-chromed vs pptx-chromed (parity),
browser-plate-dark (plate contract). Full matrices:
`out/v2-4a/browser/` (10), `out/v2-4a/pptx/<deck>/` (41
rasters), `out/v2-4a/eval-manifest.json`. Regenerate:
`node tools/v2-4a-eval.mjs` (needs Chrome, LibreOffice,
poppler; several minutes).
