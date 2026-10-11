# Handoff — V2-4E implemented, in review; V2-4D accepted; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4B [x] at `34a758b`; V2-4 [~]; V2-4C
[~]; V2-4C-1 [~]; V2-4C-2 [~]; V2-4D [x] at `2509968`;
V2-4E [~] in review with evidence).

## Current state

On `v2`, over `2509968`. This session implemented V2-4E:
a read-only selection model with interaction geometry, plus
the reviewed V2-4D font-gate race correction — nothing else.
No compiler, schema, theme, table-contract, PPTX, or
projection changes (`scene-svg.js` byte-stable); viewer touch
is the selection model in `packages/editor/scene-dom.js`, a
thinner React shell, and an interactive CDP session in
`tools/chrome-shot.mjs`.

**What lands (expect ~5 scoped commits):** pending/failed
font-gate distinction + `test/v2-fontgate-4e.test.js` (slow
case fails on baseline); `selectedIds` model with
toggle/selectMany/cycle/bounds/inspect APIs, outermost-unit
hit resolution, overlay layer, scene-dom-owned keyboard;
thinner `SceneViewer.jsx` (three-state readout, inspector
panel, no key handler, no CSS outline); `openViewer`
interactive sessions (trusted CDP clicks); 18 linkedom tests
(`test/v2-selection-4e.test.js`) + 5 Chrome tests
(`test/v2-selection-chrome.test.js`); eval driver
(`tools/v2-4e-eval.mjs`, 8/8 shots assert exact ids, deltas
≤ 0.1px); report (`docs/V2-4E-EVAL.md`) + evidence
(`docs/v2-4e-evidence/`, eight inspected shots); architecture
note, roadmap, and this handoff.

**Result for the reviewer.** Elements select and inspect
reliably — click, shift-toggle, Tab, Escape, locked-safe,
group-aware — at fit, 200%, and narrow sizes with rings
aligned to measured rects and scenes byte-identical. PPTX
output is untouched. Known deferrals: marquee, line
tolerance halos, zoom-pan for paint overflow, child-level
group editing.

**Still true:** full suite (re-verify before push; expect
only the known BYOK locale failure); benchmark 50 cells L1
zero (re-verify); fixtures stable; `demo.html` seam open for
V2-5; V2-4F/V2-5 not started.

## Verification

- `test/v2-fontgate-4e.test.js` — 2/2 (slow case fails on
  `2509968`).
- `test/v2-selection-4e.test.js` — 18/18 (fails wholesale
  on baseline).
- `test/v2-selection-chrome.test.js` — 5/5 real Chrome.
- `test/v2-viewer-4a.test.js` — 25/25 unmodified.
  Smoke 3/3, fonts-4d 7/7.
- `npm run typecheck` — clean (re-verify before push).
- `node tools/v2-benchmark.mjs --raster none` (re-verify).
- Full `npm test` (re-verify before push).
- `node tools/v2-4e-eval.mjs` exits 0; tree clean after its
  round-trip.

## Continue from here

1. Independent review of V2-4E (commits +
   `docs/V2-4E-EVAL.md` + `docs/v2-4e-evidence/`). V2-4C,
   V2-4C-1, V2-4C-2 stay pending alongside it.
2. Do NOT begin V2-4F or V2-5 without authorization.
