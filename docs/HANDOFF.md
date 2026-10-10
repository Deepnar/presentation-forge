# Handoff — V2-4A implemented, in review; V2-4 open; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x] at
`fdc7cf5`; V2-4 [~]; V2-4A [~] in review with evidence).

## Current state

On `v2`, over `9e387d5` (V2-3F/G1 acceptance + V2-4 opening).
This session implemented V2-4A: native inline-SVG browser
renderer foundation and read-only viewer — nothing else. No
compiler, schema, floor, theme, or PPTX changes; the only
shared-code touch is additive `scene-svg.js` options with
byte-stable defaults (proven by untouched V2 suites).

**What landed (expect ~5 scoped commits):** ADR
(`docs/V2-4A-RENDERER.md`); projection additions + mount
module (`packages/editor/scene-svg.js`, `scene-dom.js`);
viewer page (`app/web/scenes.html`, `scenes.jsx`,
`SceneViewer.jsx`, vite second entry + monorepo `fs.allow`);
four committed fixture decks + generator
(`tools/v2-viewer-fixtures.mjs`); 25 contract tests
(`test/v2-viewer-4a.test.js`) + 3 real-Chrome smoke tests
(`test/v2-viewer-smoke.test.js`); eval driver
(`tools/v2-4a-eval.mjs`), report (`docs/V2-4A-EVAL.md`),
curated evidence (`docs/v2-4a-evidence/`); architecture,
roadmap, and this handoff.

**Findings for the reviewer.** Geometry, order, identity,
backgrounds, chrome, tables, plates agree with PPTX across
10 compared slides. Two projection-calibration items scoped
to V2-4B (F1 fixed first baseline overlaps display type;
F2 `pt×1.1` understates type ~17% vs canonical px) — both
live in `scene-svg.js`, shared by preview and viewer, never
a compiler floor. Charts structurally exact without axes
(V2-4C). Details + support matrix + slice plan in
`docs/V2-4A-EVAL.md`.

**Still true:** benchmark and V2 suites untouched and green
(full-suite sole failure remains the known BYOK locale one);
structured fixtures still closed; plate fixtures never
committed (25MB; eval round-trips locally with revert);
`demo.html` mutation seam still open for V2-5; V2-4B–F not
started.

## Verification

- `test/v2-viewer-4a.test.js` — 25/25.
- `test/v2-viewer-smoke.test.js` — 3/3 in real Chrome
  (~2.5s: build + dumps + screenshots).
- V2 compiler/export suites green (re-verify before push).
- Full `npm test` (re-verify before push; expect only the
  known BYOK locale failure).
- `node tools/v2-viewer-fixtures.mjs --check` stable.
- `node tools/v2-4a-eval.mjs` exits 0; working tree clean
  after its plate round-trip (verify with `git status`).

## Continue from here

1. Independent review of V2-4A (commits + `docs/V2-4A-EVAL.md`
   + `docs/v2-4a-evidence/` + viewer at `/scenes.html`). On
   acceptance, flip V2-4A; the V2-4 accept/reject call stays
   with the reviewer.
2. Do NOT begin V2-4B–F or V2-5 without authorization.
   V2-4B (F1+F2 calibration) is the correct next slice when
   authorized — it changes default SVG string output, so its
   tests travel with it.
