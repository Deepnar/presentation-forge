# V2-3F-5 Evaluation — Plate Background Compatibility

Date: 2026-10-09. Head `9a1459f` (this slice, unpushed at writing).
Baseline: `03ca8d6` (V2-3F-6 accepted). No model judged anything
here: plates were rasterized from checked-in theme templates by
deterministic code, every number below was read off machine output
or rasterized pixels by the author, and the full 34-theme audit is
pinned in `test/v2-plate-3f5.test.js` (30 tests).

Runners: `node tools/v2-benchmark.mjs --out out/v2-3f-after
--raster key` (canonical five themes) plus `plate-run` driver with
`themes: ["glassmorphism", "gradient-mesh-dark"]`
(`out/v2-3f-plates-after`). Before-outputs came from a worktree at
`03ca8d6` running the same harness unmodified. `out/` is gitignored
and reproducible given the same Chrome binary.

## Theme compatibility matrix (all 34 audited)

**A. Native-compatible — 24 themes.** Twelve flat themes render the
palette ground exactly as before (art-deco, bauhaus,
brutalist-paper, editorial-magazine, editorial-serif-light,
high-contrast-mono, linear-dark, material-you, memphis-postmodern,
neubrutalism, newsprint, warm-humanist): pixel-identical output
before/after, plain and chromed. Twelve decor themes lost their
dressing in V2 (the normalizer kept decor, the compiler never
emitted it) and regain it here as background shapes: blueprint (6
grid rules), corporate-alegria, corporate-clean-blue (edge bar +
halo), letterpress, minimal-muji, mono-terminal-light (7 rules),
nature-organic, notion-clean, paper-pastel, risograph, sci-fi-hud
(magenta bar + cyan ticks), swiss-international (hairlines). All
decor is rect/ellipse with transparency 0–94 — fully expressible
natively once shape alpha exists.

**B. Native with a small model extension — translucency.** Seven
themes declare `cardFill`; four are translucent: glassmorphism (42),
claymorphism (18), neumorphism (88), soft-glass-light (44). V2
ignored `cardFill` entirely (frames used `palette.surface`
opaque). Frames now resolve `cardFill` with alpha, projected as
OOXML transparency and SVG fill-opacity. The schema extension is
two optional fields (`fillAlpha`, `strokeAlpha`); old scenes
validate unchanged. Note: translucency over a flat ground is nearly
invisible — the alpha slice only pays off together with the plate
beneath it, which is why the raster path is in this slice rather
than deferred.

**C. Background-only raster — 10 plate themes.** aurora-mesh,
chalkboard, claymorphism, glassmorphism, gradient-mesh-dark,
isometric-dark, neumorphism, retro-crt, soft-glass-light, sunset.
Their plates are gradients, masks, blur panels, grain, scanlines,
and grids — unrepresentable in OOXML, all generated from tokens at
resolve time. No plate references any external asset: the only
`url()` values are embedded `data:` SVG grain, so resolution has
zero network surface. Every theme interpolates fully (no leftover
`{{…}}` on any of 30 template/surface combinations — tested).

**D. Unsupported or deferred.** Shadow projection (declared by most
themes, projected nowhere — a real channel, explicitly not a
constant tweak); live frost over native cards (the baked panel plus
flat translucent fills is the honest static approximation);
divider title/section flat grounds (scenes still render the single
palette ground per family); V1-only triangle/roundRect decor forms
(no theme uses them); animated or interactive CSS (no theme uses
any). A missing decorative grain is not counted equal to a lost
identity: all ten plate identities render.

## Root causes of fidelity loss (three, not one)

1. `normalizeDesign` drops plate HTML by design (purity), and the
   compiler had no asset seam to receive it back through.
2. The compiler never read `design.shape.cardFill`, and the scene
   schema could not carry alpha anywhere except whole-element
   opacity (different compositing).
3. The compiler never emitted `design.background.decor`.

## What was built

Scene: optional `background.decor[]`, `background.image {src,
hash}`, `shape.fillAlpha`/`strokeAlpha`. Compiler
(`packages/compiler/background.ts`): cardFill resolution with
4-decimal alpha, flat/decor background assembly, per-surface plate
attachment with family-derived surface mapping, and the divider
surface-ink rule below. Adapter (`src/v2-plates.js`): theme load,
template interpolation against mode-resolved tokens plus
DesignSystem panel geometry, sandboxed Chrome raster, sha256 +
sampled-corner contrast per surface, explicit rejection of scripts
and remote/file references. Renderers: PPTX assigns image
backgrounds before any element draw (the chart-rId trap), decor
behind content, alpha as OOXML transparency; SVG projects the same
contract with fill-opacity and a sliced background image.

The divider surface-ink rule deserves its own paragraph because it
was found by looking, not by design: six light themes flip
lightness on title plates and three on section plates (content
plates never flip — measured across all 30 pairs). The first glass
raster rendered dark palette text on the dark title plate,
unreadable. When a plate replaces a divider's ground, the divider
now compiles ink/muted/accent from that surface's contract; content
families and plateless decks are untouched.

## Evidence

- 35 scene dumps (5 decks × 7 themes) before/after: 20 cells
  byte-identical; 15 differ only by added `decor` arrays (swiss,
  sci-fi) or added `fillAlpha: 0.58` on existing frames (glass).
  Zero geometry changes, zero id changes, zero element-count
  changes; all 35 cells semantically identical projections.
- Benchmark findings identical before/after: canonical 50 cells
  L1 = 20 floor-hits (decision deck only); plate 20 cells L1 = 8.
  No new findings, no silenced ones.
- Rasters viewed: research-defense × warm-humanist,
  high-contrast-mono, sci-fi-hud, glassmorphism,
  gradient-mesh-dark, plain and chromed. Flat themes
  pixel-identical (sha256 per page). Sci-fi regains its magenta
  bar and cyan ticks. Glass renders frosted plates with crisp
  accent shapes behind translucent cards and a white-on-dark
  title opener. Gradient-mesh renders the aurora curtain with a
  dark content pane, fully legible. Chrome: banner/crest/
  presenter/numbers correct on every sheet; dark plates get the
  white footer with presenter 0.45 and number 1.0 (accepted
  behavior, pinned in test).
- OOXML inspected, not just file size: plate bytes embedded as
  `ppt/media` parts with slide rel targets, `<p:bg>` present,
  `<a:alpha val="58000"/>` on glass cards, text/charts/tables
  native (`<a:t>`, chart parts).
- Full suite: 1311 tests, 1310 pass; sole failure is the known
  unrelated BYOK locale expectation (untouched).

## Known limits

- Neumorphism cards stay subtle in V2 (alpha 0.12 over flat
  ground, no shadow projection) — the correct subtle (declared
  color) rather than the previous invisible (wrong color: frames
  used the bg-colored surface).
- Scene JSON carries ~200–600 KB base64 per unique plate (≤3 per
  deck, shared across slides). Portable and detachable by design;
  hash-keyed dedup belongs to V2-6 storage, not this slice.
- Chrome-version raster drift is possible (no text in plates, so
  no font variance); the recorded hash makes drift visible.
- Dark-mode plates resolve (adapter takes mode) but the benchmark
  stays light-only, as before.
