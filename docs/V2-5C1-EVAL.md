# V2-5C-1 Evaluation — drag coordinate fidelity correction

Date: 2026-10-11. Baseline `a10ea2c` (V2-5C implemented,
pending acceptance). One product-code fix
(`packages/editor/scene-edit.js` conversion), test
corrections, no engine/schema/compiler changes.

## Verdict

Elements now move exactly as far as the pointer indicates
at every zoom — PASS recommended as a correction to V2-5C;
V2-5C stays `[~]` for independent acceptance, V2-5D not
started.

## 1. Root cause

`unitScale()` returns client px per SVG px
(`k = R/(W·96)`), but drag preview and commit multiplied
client deltas by `k` instead of dividing. At fit
(k≈0.95–1) the k² error hid inside a percent; at 200% a
100px drag moved 200 SVG px instead of 50. The overlay
path (`measuredRect`, division) was always correct —
which is exactly why overlay-only assertions never
caught it, and why committed screenshots looked aligned
while geometry was wrong.

## 2. Old and new formulas

- Old (wrong): `dxSvg = dxClient · k`,
  `dxIn = dxClient · k / 96`.
- New (correct): `dxSvg = dxClient / k`,
  `dxIn = dxSvg / 96`, i.e. `dxClient · W / R`.
- Single central `clientToSvgDelta` serves preview and
  commit; per-axis `svgScales` (`kx`, `ky`) so
  non-uniform rendering cannot shear a drag (the stage is
  16:9 in practice; both axes measured live anyway).

## 3. Numerical results per scale (real Chrome, trusted drags)

k read live every run; scene position from the inspector,
client box from `getBoundingClientRect`:

| case | k | pointer | scene Δ (got) | scene Δ (want) | visual Δ |
|---|---|---|---|---|---|
| fit 1440 | 0.952 | (120, 60) | (1.3130, 0.6570) | (1.3131, 0.6566) | (120, 61) |
| zoom 200% | 1.904 | (120, 60) | (0.6570, 0.3280) | (0.6566, 0.3283) | (120, 60) |
| narrow 900 | 0.569 | (100, 40) | (1.8310, 0.7330) | (1.8315, 0.7326) | (100, 40) |

Scene deltas match the equation within 0.001in; visual
displacement matches the pointer within 1px; one command
each (rev 1). Under the old formula the zoom row would
read ≈(2.63, 1.31) — 4× too far.

## 4. Preview/commit parity

Both paths call `clientToSvgDelta` — one function, no
parallel formulas to drift. Release coordinates decide
the commit (not the last move event), covered by a
dedicated regression. Mid-gesture preview verified by
pixel-diff (moved title + ring at old and new positions)
and accent-color ring measurement.

## 5. Chrome displacement measurements

`pointer displacement converts to scene displacement at
every scale` (fit/200%/narrow, horizontal + vertical)
and `chart elements displace on both axes` (diagonal
80×40 drag on a bar body): scene deltas within 0.003in
of the equation, visual deltas within 4px of the
pointer, overlays aligned. Chart clicks target bar
bodies — hairline axis rects round-trip unreliably
through integer CDP coordinates (test helper prefers
area targets; product hit-testing unchanged).

## 6. Regression test changes

- `test/v2-edit-5c.test.js`: the scale-two case asserted
  the multiplication error (`origin + 200/96`); now
  asserts the equation (`origin + 50/96`). Added:
  division at 0.5/1/1.5/2x, per-rendered-scale drags,
  non-uniform axes, release-vs-last-move. 23/23 (4 fail
  on baseline).
- `test/v2-edit-chrome-5c.test.js`: added the two
  displacement suites above; 7/7.

## 7. Screenshots and evidence

`docs/v2-5c1-evidence/` holds the fixed-code zoomed and
fit drag shots; the full interaction set is reused from
`docs/v2-5c-evidence/` (regenerated on fixed code by
`node tools/v2-5c-eval.mjs`, deltas ≤ 0.1px). Driver
outputs stay gitignored under `out/v2-5c/`.

## 8. Known limitations

Unchanged from V2-5C (no text/resize/style editing, no
persistence, exact-ID tombstones, collapse-on-release in
edit mode). Nothing new introduced by this correction.

## 9. Validation totals

Focused at close: headless 23/23, Chrome 7/7 (each
re-verified in isolation after all changes), related
suites 127/127, typecheck clean, benchmark 50 cells L1
zero. Full `npm test`: **1639 total · 1636 pass · 3 fail ·
0 cancelled · 0 skipped · 0 todo** (171 suites). The
three failures: the standing BYOK locale grouping issue;
a fonts dist-build assertion that ran while a concurrent
build deleted `dist/` mid-run (ENOENT in-log, green in
isolation); and the edit-chrome file wedging 29 minutes
under parallel load (killed; 0/7 executed there, 7/7
isolated right after). No failure reclassified, no
accepted test rewritten.
