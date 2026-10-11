# V2-4F Evaluation — live scene compilation, loading & browser integration

Date: 2026-10-11. Baseline `1a52170` (V2-4E implemented, in
review). Driver: `node tools/v2-4f-eval.mjs` (outputs gitignored
`out/v2-4f/`). Curated evidence: `docs/v2-4f-evidence/` +
README. No compiler, schema, theme, table-contract, PPTX, or
projection changes; the server gains three stateless routes,
the viewer a Live panel over one shared mount path.

## Verdict

Structured `DeckIntent` now compiles on the server through
the accepted deterministic pipeline and renders
interactively in the browser — no committed JSON involved,
no compiler duplication, no architecture expansion. All 8
eval shots assert exact selected ids with overlay deltas ≤
0.1px and were read at full size; the identical live scenes
render to native PPTX with authored text, chart values, and
status semantics intact. V2-4E is recommended accepted at
`1a52170` alongside this slice's review.

## 1. Server architecture audit

`app/server/index.js` is Express with per-route registration
(`register*Routes(app, deps)`), `ok`/`fail`/`wrap`
conventions, an 8mb JSON body, and auth-gated deck/report
routes beside public GETs (`/api/themes`, `/api/styles`).
The V2 pipeline pieces already existed and compose without
new logic: `validateDeckIntent`/`normalizeIntent`
(`packages/model/intent.ts`), `loadThemeDocument`,
`normalizeDesign`, `resolvePlateBackgrounds`/
`slideBackgrounds`, `planDeckComposition`,
`benchmarkChrome` (self-sufficient demo chrome over 1×1
seats), `compileDeckDetailed`, `validateScene`.

## 2. Integration strategy

New `app/server/v2-scenes-routes.js` exporting
`registerV2ScenesRoutes(app)` (no deps argument — it needs
none) plus a transport-free `compileLiveDeck()` the tests
call directly. One route per need, nothing else:

- `GET /api/v2/themes` — V2 allowlist from `themes/*.yaml`
  (cached set; the existing `/api/themes` serves the V1
  system and was left alone).
- `GET /api/v2/examples` — four deterministic example
  intents with full bodies (KBs by design, one fetch):
  technical, comparison/decision, chart-heavy (incl. a
  multi-series pie for the fallback path), status/
  uncertainty.
- `POST /api/v2/scenes` — `{ intent, theme?, variant? }`
  → `{ deck, scenes, findings, fitDiagnostics }`.

The browser never plans, lays out, or invents: it posts
meaning and renders returned scenes through the unchanged
`createViewer`/`sceneToSvg` path. No Neon, storage, auth,
queues, or LangChain entered.

## 3. Request/response contract

Request: `intent` (required object), `theme` (default
`warm-humanist`, must be allowlisted — no path joining of
user input, ever), `variant` (`plain` default, `chromed`
only). Response: deck identity (name/title/theme/variant/
slideCount), contract-validated scenes, plan findings, and
fit diagnostics as data. Errors: invalid intent → 422 with
slide-scoped `errors[]`; unknown theme/variant → 422;
>512KB body → 413 before parsing work; compiler-internal
failure → sanitized 500 (logged server-side). No stack
traces or secrets leak (tested with a path-traversal theme).

## 4. Validation and security boundaries

Schema caps structure (1..60 slides, 1..12 blocks,
string maxLengths — a redundant hand-rolled block cap was
removed as unreachable dead code once measured); the 512KB
body cap backstops size; theme names validate against the
allowlist set, never touch the filesystem. Quality findings
(L1/L2, incl. `chart-fallback-table`) propagate as response
data, never as exceptions, never suppressed. Deployment
exposure is explicit: public like `/api/themes`,
deterministic and CPU-cheap (tens of ms), but a hosted
deployment should sit it behind the existing session gate —
recorded here, not implemented, since this slice is local
integration.

## 5. Live-scene lifecycle

`app/web/src/lib/liveDeck.js` (framework-free, DOM-free):
idle → loading → ready | error, newest-request-wins,
AbortController per request, abort settles to idle, empty
responses are errors. The viewer keeps the displayed fixture
mounted while a compile flies (loading indicator only),
swaps the deck object on ready — remounting fonts, viewer,
and selection atomically — and ignores stale landings.
Fixture return aborts the loader and restores fixtures.
Unit-tested: notify order, rapid-replacement discard,
message surfacing, empty-response and abort paths.

## 6. Viewer preservation

Fixtures stay first-class (eval, smoke, and deep links
untouched — the Live panel fetches nothing until opened).
Filmstrip, prev/next, zoom/fit, single/multiselect, locked
and group-aware inspection, font gating per deck, stable
ids, plates, tables, and charts all run the same code for
live scenes; the deck picker follows the live deck
(`live:<id>:<theme>:<variant> (live)`).

## 7. Zoom-pan decision

Implemented, tightly bounded: a spacer div sized to the
scaled slide (`margin: 0 auto` for safe centering) wraps the
mount, whose origin moved top-center → top-left. Layout
footprint now tracks paint, so zoomed slides scroll instead
of stranding content off-viewport; scene coordinates,
overlay math, filmstrip, and fit-center behavior are
unchanged. Verified in Chrome: `scrollWidth > clientWidth`
at 200% with aligned overlays after scrolling. No infinite
canvas, no gestures.

## 8. Browser screenshots

Eight UI-driven shots (§11 coverage: technical, decision,
data/chart, status, chromed, dark plate, loading, narrow)
plus a native PPTX raster of the identical live scenes.
Notable reads: the chromed title sits near the banner seat,
so its body — not the title — is the first hittable unit
(selection still exact); the dark-plate ring stays readable
via the accent + inset-white treatment; status badges and
qualifiers project from live intent untouched.

## 9. Native export parity

`compileLiveDeck` output feeds `renderPptxToFile` directly:
one native slide per scene, authored titles in slide XML,
native chart parts carrying exact values (12.5 asserted in
chart XML), multi-series pie preserved as an editable table.
No browser-only mode exists; editability and diagnostics are
the compiler's own.

## 10. Test results

- `test/v2-live-4f.test.js` — 16/16 (allowlist, examples
  validate, compile+diagnostics+scene-validity, 422 shapes,
  no-trace check, 61-slide and 413 bounds, determinism,
  exact chart values, fallback presence + diagnosis,
  status/uncertainty text, chromed locks, PPTX parity;
  loader: notify order, stale discard, errors, empty,
  abort). Fails on `1a52170` (no such routes).
- `test/v2-live-chrome-4f.test.js` — 5/5 real Chrome
  (compile+select+overlay+inspector, theme recompile with
  cleared selection and new faces, loading indicator,
  zoom-scroll with aligned overlays, narrow + fixture
  return).
- Prior suites untouched by the seam (panel fetches nothing
  until opened): viewer-4a 25/25, smoke 3/3, fonts-4d 7/7,
  fontgate 2/2, selection 18/18 + 5/5 Chrome (re-verify at
  close).
- `npm run typecheck` — clean (re-verify).
- `node tools/v2-benchmark.mjs --raster none` — 50 cells
  L1 zero (re-verify).
- Full `npm test` — re-verify; expect only the known BYOK
  locale failure.
- `node tools/v2-4f-eval.mjs` exits 0; only gitignored
  outputs; tree clean (no temp fixtures — live needs none).

## 11. Remaining limitations

- Panel error display is loader-tested, not Chrome-shot
  (the panel only offers valid examples; the 422 contract
  is API-tested and sampled in the manifest).
- Modes beyond light, explicit ChromeInput passthrough,
  and hosted gating are documented deferrals (§4).
- Marquee, line halos, and child-level groups remain
  V2-4E deferrals, unaffected.
- `document.fonts` per-glyph attestation remains
  unavailable (standing limitation).

## 12. Recommendation for the final V2-4 acceptance gate

V2-4A (renderer), V2-4B (calibration), V2-4C/C-1/C-2
(charts), V2-4D (fonts), V2-4E (selection), V2-4F (live)
each carry an eval report plus committed evidence and green
suites. The gate should re-run the six drivers on a clean
checkout, confirm the full suite shows only the known BYOK
failure, and mark V2-4 `[x]` — no new feature work is owed
by this line. V2-5 (mutation, commands, persistence) is not
started.
