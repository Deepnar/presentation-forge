# V2-4D Evaluation — browser fonts, typography fidelity & export comparison

Date: 2026-10-11. Baseline `95165b5` (V2-4C/C-1/C-2 in review,
unchanged by this slice). Driver: `node tools/v2-4d-eval.mjs`
(outputs gitignored `out/v2-4d/`). Curated evidence:
`docs/v2-4d-evidence/` + README. No compiler, schema, theme,
table-contract, or PPTX-renderer changes; the browser gains
local font loading plus a font-readiness gate.

## Verdict

Supported V2 themes now render in their intended browser
fonts instead of depending on viewer-machine substitution.
All 48 font-gated browser captures across 8 decks report
`missing: []`; the six inspected browser/PPTX pairs agree
face-for-face with no clipping, overlap, or wrapping change.
Native PowerPoint output is byte-for-byte untouched (same
scenes, same renderer). The ~4.8px horizontal text inset is
the PPTX 0.05in text-box margin against box-exact SVG and is
left unchanged by design (§5).

## 0. Recovery note (interrupted session)

This slice resumes work from a session that stopped with an
invalid-parameters error at local HEAD `95165b5` (= remote).
Recovered uncommitted work, preserved and reused as-is:

- `app/web/src/fonts.js` (new) — scene-driven loading,
  `FONT_COVERAGE`, 42-entry `FONT_FILES` manifest.
- `package.json` / `package-lock.json` — 20 Fontsource
  packages (installed; `node_modules/@fontsource/` present).
- `app/web/src/components/SceneViewer.jsx` — font gate
  (`data-fonts-ready` / `data-missing-fonts`), mount waits
  for settle, scenes never recompiled or mutated.
- `app/web/src/scenes.jsx` — Inter italic static import.
- `test/v2-fonts-4d.test.js` (new) — 7 inventory/projection
  tests, incl. a production-build asset case.
- `test/v2-viewer-smoke.test.js` — CDP font-gated dumps and
  screenshots, font assertions on mount.
- `tools/chrome-shot.mjs` (new) — dependency-free CDP
  client: `fontGatedScreenshot` / `fontGatedDom` /
  `fontGatedEvaluate`.
- `tools/v2-4d-eval.mjs` (new) — 8-deck × 6-slide eval
  driver with `v24d-` temp-fixture guard (cf. TRAPS entry on
  temp/committed fixture collision).
- `out/v2-4d/` — full driver output (48 browser PNG,
  8 PPTX + rasters, manifest), reused without regeneration.

Nothing was restarted or reverted. User-owned untracked
files (`.agents/`, two root prompt/workdoc documents) are
untouched.

## 1. Font inventory (complete, machine-checked)

All 21 theme-declared families are covered, with exact key
equality between theme `family:` values and `FONT_COVERAGE`:

Anton, Archivo Black, Bebas Neue, Bodoni Moda, Cormorant
Garamond, Fraunces, IBM Plex Mono, IBM Plex Sans, Inter,
Karla, Lora, Manrope, Merriweather, Oswald, Outfit, Playfair
Display, Poppins, Public Sans, Source Serif 4, Space Grotesk,
Syne.

Theme weights use only 400/500/600/700; every declared
family+weight resolves to a shipped face (`every V2 theme
family is covered`, `every weight in committed scenes is
covered`). Scene-family projection is verbatim
(`font-family="…"` for all seven probed display faces;
weights/italics project without CSS knowledge).

## 2. Loading architecture

Layer C stays authoritative: families and weights come from
compiled scene runs, never from a second theme-typography
system. Static families load latin woff2 through literal
`FONT_FILES` loaders (Vite code-splits per file, hashes the
asset); Inter (variable + italic) and IBM Plex Mono ride the
existing static package imports. Each needed face is injected
once as `@font-face`, then awaited via the Font Loading API;
screenshots gate on the result instead of racing
substitutions. Unknown families report missing rather than
silently substituting; a failed load still mounts and reports
via `data-missing-fonts` instead of hanging. No Google Fonts
network access at runtime; production asset paths verified by
the dist-asset test (§6). No duplicate or competing
font-resolution mechanism was introduced.

## 3. Licensing / asset decisions

All faces ship as Fontsource packages (OFL-licensed sources,
self-hosted woff2), consistent with the two pre-existing
Fontsource dependencies. No new license class enters the
bundle.

## 4. Weight and italic coverage

`FONT_COVERAGE` ships every theme-used weight; requested
weights resolve to the nearest shipped face per family
(committed scenes: all within 200 of a shipped weight).
Italics: themes declare zero italic roles; the single italic
run in committed fixtures is Inter 500, covered by the
`@fontsource-variable/inter/wght-italic.css` static import.
Other families inject normal-style faces only, which matches
all authored usage.

## 5. Horizontal inset decision (the 4.8px)

The last probe of the interrupted session reported SVG text
at box-exact x with a ~4.8px smaller left inset than PPTX.
Cause, from code (not substitution): `scene-svg.js`
`textSvg` anchors `tx = el.x * IN` exactly, while
`packages/renderer-pptx/render.ts` passes `margin: 0.05` —
0.05in × 96px/in = 4.8px of PPTX text-box margin. Font glyph
bearings and substitution are excluded (captures are
font-gated with `missing: []`).

Left unchanged. Modelling the margin into SVG would shift
every left-aligned run right by 4.8px and shrink the wrap
budget (`wrapCell` already budgets `el.w * IN - 8`), risking
wrapping and alignment regressions across all themes for a
sub-perceptual gain. The vertical margin *is* modelled
(V2-4B: first baseline at margin + 0.8em ascent); the
horizontal one stays a documented renderer difference. No
clipping, misalignment, or fidelity failure was observed in
any of the six inspected pairs.

## 6. Runtime font verification (real Chrome)

- Eval manifest: 48/48 browser captures `missing: []`
  (8 decks × slides 0,1,2,4,5,6; display, prose, cards,
  table, metric, chart specimens).
- Live CDP probe (this session, `fontGatedEvaluate` over
  `mech-warm-humanist-plain` slide 1):
  `document.fonts.check` true for Merriweather, Source
  Serif 4, Inter, IBM Plex Mono; Merriweather 700/900
  `loaded`; gate `true / missing=none`.
- Smoke suite asserts `data-fonts-ready="true"` and empty
  `data-missing-fonts` on mount and at every screenshot.

Limitation, stated honestly: the Font Loading API proves a
face resolves and loads — it cannot prove which physical
font painted every glyph. No per-glyph attestation is
claimed; the evidence is resolvability + gated captures +
visually correct faces in all six pairs.

Scene immutability holds: fonts never recompile or mutate
scenes (gate is a mount precondition only); zoom/resize,
filmstrip, deep links, selection, locked chrome, and theme
switching are covered by the unchanged viewer contract plus
the gated smoke assertions.

## 7. Bundle-size impact

`app/web/dist/assets/`: 66 hashed woff2 files, 1.5MB total
fonts; 2.6MB total assets. The per-face code-split loaders
keep this pay-per-face at runtime (deck loads only its
scenes' faces), while the dist ships all static faces so any
deck resolves locally.

## 8. Tests and commands

- `node --test test/v2-fonts-4d.test.js` — 7/7 (inventory,
  scene-weight coverage, 42-entry manifest pinned with real
  package files, production-build dist ships every face,
  verbatim projection, weight/italic projection, honest
  no-font-API degradation).
- `node --test test/v2-viewer-smoke.test.js` — 3/3 in real
  Chrome (mount identities, deep-link slide/zoom/selection,
  font-gated evidence screenshots).
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --out out/v2-4d-bench
  --raster none` — 5 decks × 5 themes × 2 variants, 50
  cells, L1 zero (temp out dir removed after reading).
- Full `npm test` — 1490 tests, 1489 pass; sole failure is
  the known unrelated BYOK locale grouping issue
  (`test/byok-budget.test.js`: en-IN `50,00,000` vs
  expected `5,000,000`), untouched by this slice.

## 9. Remaining limitations

- Non-latin subsets are not bundled (latin woff2 only);
  decks remain latin-script as before — no behaviour change,
  but non-latin text still falls back per previous behavior.
- Per-glyph font attestation is not available (§6).
- The horizontal PPTX-margin difference (§5) is accepted,
  not corrected.
- `out/v2-4d/` full outputs stay gitignored; only the six
  curated pairs are committed.

## 10. Recommended next slice

V2-4D is complete and ready for independent review; no
follow-up slice is required inside V2-4D. The natural next
work is V2-4E (selection model) on reviewer approval — not
started here.
