# V2-4 FINAL Evaluation — integration & acceptance gate

Date: 2026-10-11. Baseline `c45a473` (V2-4F implemented, in
review; V2-4A/B/D/E accepted). This gate verifies the slices
work together; it implements no features beyond one narrowly
scoped deployment guard (§6) plus its tests.

## 1. Baseline and environment

- Branch `v2`, HEAD = `origin/v2` = `c45a473`, tree clean
  except pre-existing user-owned files (`.agents/`, two root
  prompt/workdoc documents, untouched throughout).
- Node v24.16.0, Chrome 151.0.7922.173, LibreOffice 26.8.0.3,
  24 CPUs, 62GB RAM.
- One scene model (`packages/model`), one deterministic
  compiler (`compileDeckDetailed` in
  `packages/compiler/compile.js`; the `.d.ts` is a type shim),
  one native renderer (`renderPptx`/`renderPptxToFile`), one
  shared projection (`sceneToSvg` + `packages/editor/`) —
  verified by definer/call-site audit, not by report text.

## 2. Commands actually run

```
npm test                                              # full suite (parallel files)
node --test test/v2-live-chrome-4f.test.js            # isolation re-checks
node --test test/v2-fonts-4d.test.js
npm run typecheck                                     # tsc --noEmit
node_modules/.bin/vite build --config app/web/vite.config.js   # production build
node tools/v2-benchmark.mjs --out out/v2-4f-bench --raster none # canonical 50-cell
node tools/v2-4final-eval.mjs                         # gate driver (this slice)
```

Eval drivers were run sequentially (fixed ports 5211–5236
across suites); no two servers or screenshot drivers ran
concurrently from this session.

## 3. Full test totals (discrepancy resolved)

The V2-4F report's `1534 / 1536 — sole failure` left one
result unaccounted. Gate measurement, full parallel run:

- Total: **1536** · Pass: **1533** · Fail: **3** ·
  Skipped: **0** · Cancelled: **0** · Todo: **0**.

The three failures are two distinct causes, not two bugs:

1. `test/byok-budget.test.js` — the known unrelated BYOK
   locale grouping failure (`50,00,000` vs `5,000,000`).
   Persistent, out of scope, untouched.
2. Two `v2-live-chrome-4f` CDP timeouts (91s, 31s) under
   full-suite parallel load: five test files run `vite
   build` concurrently while four Chromes poll fixed
   60s gates on one box. Both pass in isolation —
   re-verified this session at 5/5, as did the other
   swept-up file (`v2-fonts-4d` 7/7 after a parallel-run
   wobble). No interaction bug: the same pages, clicks,
   and assertions succeed serially.

So: no skipped, cancelled, or hidden results; one genuine
persistent failure (BYOK, pre-existing); parallel-load
flakes confined to browser timeouts. The V2-4F session's
missing one was the same flake class. Recorded as P2-1
below (test-infrastructure parallelism, not product).

## 4. Canonical benchmark

5 decks × 5 themes × 2 variants, 50 cells, **L1 zero**
(`--raster none`; re-run at close). The compiler is
behaviorally unchanged across the whole V2-4 line.

## 5. Slice coverage (all green at gate)

| slice | unit/contract | real Chrome | evidence |
|---|---|---|---|
| 4A viewer | 25/25 | smoke 3/3 | 10-target pairs |
| 4B calibration | 10 (7 fail-base) | rasters | before/after |
| 4C charts | 24 invariants | structural | 6 kinds, 3 themes |
| 4C-1 ticks | 13 (6 fail-base) | — | micro magnitudes |
| 4C-2 fallback | 11 (7 fail-base) | — | pie/doughnut tables |
| 4D fonts | 7/7 | 48/48 `missing: []` | 6 pairs |
| 4D race fix | 2/2 (1 fails-base) | slow-fonts | — |
| 4E selection | 18/18 (fail-base) | 5/5 trusted clicks | 8 shots, deltas ≤ 0.1px |
| 4F live | 16 + loader 5 (fail-base) | 5/5 panel flows | 8 shots + PPTX |
| gate | guard matrix (new) | combos A/B, pairs | §8 |

## 6. Live API/security findings

Middleware order audited: hardened headers → CORS →
8mb JSON parser → account/meter → path-scoped auth gates
(`/api/decks` etc.) → route registration. The v2 routes
mount publicly by design; only POST compiles.

Probe battery (temp script, results in §8 of the report
trail): >parser-limit body → express 413 HTML, no leak;
600KB → route JSON 413 before compiling; 2000-char text →
200 while 2001 → 422 (schema boundary exact);
`../secret`, `/abs`, numeric, empty themes → 422 (pure
allowlist, no path use); `{}`/`[]`/wrong types → 422;
malformed JSON → 400; 20 sequential compiles → all 200 in
92ms with no degradation. `theme: null` defaults (by
design, documented).

**Guard (the gate's one correction).** The endpoint was
public on every deployment including hosted. Small fix,
test-backed: `POST /api/v2/scenes` now 403s when hosted
unless `FORGE_V2_LIVE=1` (explicit `=0` always denies),
using the established sync `isHosted()` signal. GETs stay
public (static data, like `/api/themes`). This box itself
carries `config/hosted.json: true`, which proved the guard
end to end — and forced the test harnesses to pin their
signal explicitly (`setHostedForTest(false)` in
API/Chrome tests, `FORGE_V2_LIVE=1` in the dev-only
driver), so the default-allow path is tested, not assumed.
A hosted operator enables one env var; local development
is unchanged.

## 7. Browser integration results

- Live panel flows (5/5 Chrome): compile → filmstrip,
  select, overlay ≤ 3px, inspector, theme recompile with
  cleared selection and new faces, loading indicator,
  zoom-scroll, narrow, fixture return.
- Combo A (fixture switch mid-compile, 4s-delayed API):
  loader aborts, fixture stays, stale live never lands.
- Combo B (select → two sequential recompiles): newest
  wins, selection cleared, no crash.
- By construction the UI cannot double-fire compiles (the
  button disables while loading); concurrent replacement
  is covered by loader unit tests, which is the only layer
  where it can occur.
- Rapid theme switching, deck change during font load,
  and select-before-recompile all behave; no timers,
  listeners, or font state leak between decks (cleanup
  paths asserted by suite + combos).

## 8. Browser/PPTX fidelity evidence

Gate driver compiled the 12-slide mechanism intent on all
seven themes plus chromed (`compileLiveDeck`, plates
included) and rendered identical scenes both ways: 16/16
browser captures with no missing faces; 8/8 PPTX decks
with 12 native slides each. Curated pairs in
`docs/v2-4-final-evidence/` (prior sets reused by pointer).

Reads at full size: geometry, type, plates, tables, chart
meaning, chrome, and contrast all agree. Two difference
classes, both previously accepted and re-observed, neither
re-litigated: chart client-layout choices (browser y-ticks
stop at 2 where PPTX runs to 2.5; legend side/palette per
V2-4C) and the 4.8px PPTX text-box inset (V2-4D). No new
inconsistency was found; zero diagnostics were never
equated with perfect appearance — the pairs were looked at.

## 9. Scene-data preservation

Live scenes → `renderPptxToFile` → JSZip OOXML: one native
slide per scene, authored titles in slide XML, native chart
parts with exact values (12.5 asserted in chart XML),
status/uncertainty text and badges intact, tables complete,
locked chrome without authored refs, same-chart fallback
diagnosed. No browser-only mutation exists anywhere in the
path (selection is id sets + one state marker; asserted by
stripped-markup equality in Chrome).

**Export boundary (P2-4, stated plainly).** A hand-authored
Layer-C 2-series pie sent straight to the raw renderer
still drops S2 silently (1 `<c:ser>`, S2 values absent —
reproduced at gate). The live API can never hit this (it
always compiles, so the V2-4C-2 fallback applies), but any
future direct-renderer caller can. The boundary is NOT
solved here; it needs an export-time validation seam in
V2-5. Marked P2 only because no shipped path reaches it.

## 10. Font and chart fidelity

21/21 theme families ship locally (42-face manifest,
production dist asserted); 48/48 gated captures clean at
V2-4D plus 16/16 at gate; pending/failed states distinct
with a baseline-failing regression. Charts: six kinds
exact, step-exact ticks to micro magnitudes, multi-series
pies preserved as diagnosed tables — all holding at gate
with the benchmark at L1 zero.

## 11. Zoom and selection findings

Overlays align at fit, 200%, and narrow (gate deltas ≤
0.1px on identical scenes); zoomed stages scroll via the
V2-4F spacer with no coordinate change; multiselect,
locked exclusion (incl. locked descendants), group-parent
resolution, Tab/Escape, inspector grounding, and deep
links all hold in combination (combos A/B). The one
pre-existing shell truth re-confirmed: paint-overflowed
zoom regions without layout scroll are unreachable — the
spacer bounds this to genuinely off-viewport content, and
tests click what is actually under the cursor.

## 12. P0/P1/P2 register

- **P0: none found.** No content loss, no wrong numbers,
  no invalid scenes returned (post-compile `validateScene`
  gates the response), no crashes, no export corruption on
  any shipped path.
- **P1: none found.** No systemic visual failure, no
  broken loading, no unreliable selection, no serious
  zoom/accessibility problem, no new browser/PPTX
  inconsistency.
- **P2-1 (test infra): parallel-load browser flakes.**
  Concurrent `vite build` ×5 plus polling Chromes can time
  out 60s gates under `node --test`. Serial runs are
  green. Fix direction: serialize builds or share one
  dist; deliberately not attempted in the gate.
- **P2-2 (accepted): 4.8px horizontal text inset** —
  PPTX margin vs box-exact SVG (V2-4D §5).
- **P2-3 (accepted): interim chart-series palette** —
  theme-resolved carriage still pending (V2-4C).
- **P2-4 (open): raw-scene export validation** — §9
  boundary; V2-5 prerequisite (see §16).
- **P2-5 (accepted): latin-only font subsets; no
  per-glyph attestation** (V2-4D §§4–6).
- **P2-6 (accepted): no marquee, no line-tolerance halo,
  no child-level group editing** (V2-4E §9).
- **P2-7 (accepted): non-light modes, ChromeInput
  passthrough, panel-error Chrome shot** (V2-4F §11).
- **P2-8 (standing): rotation-blind bounds** (roadmap;
  no rotated content in V2-4 scope).

Known-limitation review: each item above was evaluated
against P0/P1 bar rather than auto-fixed or auto-failed;
none meets the bar.

## 13. Known acceptable limitations

§12 items P2-2–P2-8 plus the BYOK locale failure (suite)
and the dev-only driver env note (`FORGE_V2_LIVE=1` where
a hosted flag file exists). Nothing here blocks V2-5.

## 14. Correction commits made

1. Deployment guard + `liveCompileAllowed` matrix tests
   (`v2-scenes-routes.js`, `v2-live-4f.test.js`).
2. Test-signal pinning for hosted-flag boxes
   (`v2-live-4f`, `v2-live-chrome-4f`, `v2-4f-eval.mjs`
   env default).
3. Disabled-Compile click race in the loading-indicator
   test (wait for enabled; the same race class as P2-1,
   fixed deterministically rather than worked around).
4. Gate driver (`tools/v2-4final-eval.mjs`).

No architecture redesign; no V2-5 code; no unrelated
fixes (BYOK untouched).

## 15. Final recommendation: PASS

V2-4 is demonstrably ready as the rendering and
interaction foundation for the editor. Every slice holds
its contracts in combination: compile → scenes → browser
+ PPTX with exact data, reliable fonts, aligned
selection, and a bounded, gated live API. The P2 register
is tracked work, not hidden debt. V2-4F is accepted at
`c45a473` with this report; V2-4 parent stays `[~]` for
the reviewer's flip.

## 16. Next V2-5 prerequisites

1. **Export-validation seam (P2-4):** refuse or fallback
   invalid/dangerous raw scenes at `renderPptx*` time
   before any editor-driven export exists.
2. Command/revision machinery over stable `data-el`
   identities (the `demo.html` in-place seam must close).
3. Human-vs-agent edit ownership + suppression semantics
   for compiler-regenerated elements.
4. Test-infra parallelism (P2-1) before the editor
   multiplies browser suites further.
