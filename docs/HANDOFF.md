# Handoff — V2-4F implemented, in review; V2-4E accepted; V2-5 NOT started

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§12 V2.1 program** (V2-3F [x]; V2-4A
[x] at `c5b564a`; V2-4B [x] at `34a758b`; V2-4 [~]; V2-4C
[~]; V2-4C-1 [~]; V2-4C-2 [~]; V2-4D [x] at `2509968`;
V2-4E [x] at `1a52170`; V2-4F [~] in review with evidence).

## Current state

On `v2`, over `1a52170`. This session implemented V2-4F:
stateless live DeckIntent compilation served to the browser
viewer — nothing else. No compiler, schema, theme,
table-contract, PPTX, projection, or auth changes; server
touch is three routes over the fixture-driver pipeline;
viewer touch is a Live panel, a loader state machine, and a
zoom-pan spacer on the shared mount path.

**What lands (expect ~5 scoped commits):** `POST/GET
/api/v2/*` + `compileLiveDeck` + 4 example intents
(`app/server/v2-scenes-routes.js`); `createLiveDeckLoader`
(`app/web/src/lib/liveDeck.js`); Live panel + deck swap +
spacer (`SceneViewer.jsx`); 16 API/loader tests
(`test/v2-live-4f.test.js`, fail on baseline) + 5 Chrome
tests (`test/v2-live-chrome-4f.test.js`); eval driver
(`tools/v2-4f-eval.mjs`, 8/8 shots assert exact ids, deltas
≤ 0.1px, PPTX equivalence from identical scenes); report
(`docs/V2-4F-EVAL.md`) + evidence (`docs/v2-4f-evidence/`,
eight inspected shots + one PPTX raster); architecture
note, roadmap, and this handoff.

**Result for the reviewer.** Validated intent in, real
scenes out, rendered through one viewer path with
filmstrip, zoom/scroll, selection, fonts, and chrome;
recompiles swap atomically; invalid input is 422s, never
500s or traces; PPTX from the same scenes carries exact
text, values, and status semantics. Deferrals: hosted
gating, non-light modes, ChromeInput passthrough, panel
error Chrome-shot (loader-tested).

**Still true:** full suite (re-verify before push; expect
only the known BYOK locale failure); benchmark 50 cells L1
zero (re-verify); fixtures stable; `demo.html` seam open for
V2-5; V2-5 not started.

## Verification

- `test/v2-live-4f.test.js` — 16/16 (fails on `1a52170`).
- `test/v2-live-chrome-4f.test.js` — 5/5 real Chrome.
- Prior suites (re-verify at close; panel fetches nothing
  until opened).
- `npm run typecheck` — clean (re-verify).
- `node tools/v2-benchmark.mjs --raster none` (re-verify).
- Full `npm test` (re-verify before push).
- `node tools/v2-4f-eval.mjs` exits 0; only gitignored
  outputs; no temp fixtures needed.

## Continue from here

1. Independent review of V2-4F (commits +
   `docs/V2-4F-EVAL.md` + `docs/v2-4f-evidence/`), then the
   final V2-4 acceptance gate per the eval doc §12. V2-4C,
   V2-4C-1, V2-4C-2 stay pending alongside it.
2. Do NOT begin the acceptance gate or V2-5 without
   authorization.
