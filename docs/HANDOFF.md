# Handoff — V2-4D implemented, in review; V2-4C/C-1/C-2 open; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4B [x] at `34a758b`; V2-4 [~]; V2-4C
[~]; V2-4C-1 [~]; V2-4C-2 [~]; V2-4D [~] in review with
evidence).

## Current state

On `v2`, over `95165b5`. This session resumed the
interrupted V2-4D session (recovered uncommitted work
intact, no restarts or reverts) and completed the slice:
scene-driven local browser fonts with a font-readiness
gate — nothing else. No compiler, schema, theme,
table-contract, or PPTX changes; viewer touch is one font
module, one gate in `SceneViewer.jsx`, one italic import;
eval touch is one CDP helper, one driver, and docs.

**What lands (expect ~4 scoped commits):** `app/web/src/fonts.js`
(21-family coverage, 42-face manifest, Font Loading API
readiness, honest missing-face reporting); 20 Fontsource
dependencies; viewer font gate (`data-fonts-ready` /
`data-missing-fonts`, mount waits, scenes never mutated);
7 inventory/projection tests (`test/v2-fonts-4d.test.js`);
font-gated smoke assertions + CDP helper
(`tools/chrome-shot.mjs`); eval driver
(`tools/v2-4d-eval.mjs`, 48/48 captures `missing: []`);
report (`docs/V2-4D-EVAL.md`) + evidence
(`docs/v2-4d-evidence/`, six inspected browser/PPTX pairs);
architecture note, roadmap, and this handoff.

**Result for the reviewer.** Every supported theme renders
its intended faces locally with no network dependency;
browser and PPTX agree face-for-face on all six pairs with
no clipping or wrapping change. PPTX output is untouched
(same scenes, same renderer). The ~4.8px horizontal inset is
the native 0.05in text-box margin, accepted and documented.

**Still true:** full suite 1489/1490 (sole failure the known
BYOK locale one); benchmark 50 cells L1 zero; fixtures
stable; `demo.html` seam open for V2-5; V2-4E–F not started.

## Verification

- `test/v2-fonts-4d.test.js` — 7/7.
- `test/v2-viewer-smoke.test.js` — 3/3 in real Chrome.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells,
  L1 zero.
- Full `npm test` — 1489/1490 (only known BYOK failure).
- `node tools/v2-4d-eval.mjs` exits 0; tree clean after its
  round-trip (reused `out/v2-4d/` from recovery).

## Continue from here

1. Independent review of V2-4D (commits +
   `docs/V2-4D-EVAL.md` + `docs/v2-4d-evidence/`). V2-4C,
   V2-4C-1, V2-4C-2 stay pending alongside it.
2. Do NOT begin V2-4E–F or V2-5 without authorization.
