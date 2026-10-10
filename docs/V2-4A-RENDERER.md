# V2-4A Renderer Architecture — Decision Record

Date: 2026-10-10. Baseline `fdc7cf5`. Status: accepted direction
for this slice; Konva/moveable/selecto explicitly rejected below
with rationale (reconciles the old V2-4 roadmap line, which named
them as a first guess, not a decision).

## Audit answers

1. **Required scene properties.** Everything Layer C carries:
   `background` (fill/image/decor), all seven element kinds,
   text runs (role/family/weight/size/tracking/line/transform/
   color/align/bullet), shape fill/alpha/stroke, line geometry,
   image src/alt, chart data + labels contract, table rows +
   layout contract, group children, `opacity`, `z`,
   `locked`, `provenance`, stable `id`/`semanticRef`. Nothing
   else exists; nothing else is needed.
2. **Dimensions.** Canonical 13.333×7.5in
   (`packages/model/scene-constants.ts`); 96px per inch in all
   projections. Aspect 16:9 exactly (13.333/7.5).
3. **Ordering.** `z` ascending; background first, chrome last
   (chrome rides the continuing z sequence).
4. **Supported effects.** Solid fills, alpha, strokes,
   tracking, uppercase, bullets, alignment, image seats,
   decor, plates (as embedded images). Unsupported: per-kind
   chart geometry in preview, text auto-fit (by design).
5. **Reusable SVG.** `packages/editor/scene-svg.js` projects
   every kind with full contract fidelity. Reused verbatim via
   DOM parsing — zero projection duplication. Three additive
   gaps closed in this slice (opt-in text wrap, image src,
   `data-locked`); default string output byte-stable.
6. **Raster-tied preview.** `src/preview.js` (LibreOffice),
   server `/preview/*` endpoints, PNG grids in DeckDetail.
   The viewer touches none of it: filmstrip reuses the same
   SVG renderer at small scale.
7. **Package home.** `packages/editor` (already "the browser
   renderer" per ARCHITECTURE.md): `scene-dom.js` mount +
   interaction beside `scene-svg.js` projection.
8. **V2-5 seams.** Stable `data-el` ids, `data-locked`
   flags, `getBBox()` bounds, no scene mutation (read-only
   violations fail tests), commands seam untouched for later.
9. **Dependencies.** None. React 19 + Vite 8 already ship in
   `app/web`; fonts via existing fontsource imports.

## Decision: native inline SVG DOM, no canvas framework

Render `sceneToSvg` output into a live `<svg>` element (parsed
via a detached `div`'s `innerHTML`, then adopted into the mount);
bind events per `[data-el]`.
Konva/Fabric rejected: the scene vocabulary (rect/ellipse/
text/line/image/table/chart-as-group) maps 1:1 to SVG, hit
testing and selection are DOM events plus `getBBox()`, and a
canvas framework would add a dependency, a second coordinate
system, and rasterized text — destroying the selectable-text
and inspectability requirements for zero expressive gain.
`demo.html`'s div-based prototype is not extended: it mutates
scene objects in place, which V2-5 forbids.

## Browser-rendering contract (`renderSceneElement` discipline)

- Pure projection: `SlideScene` in, live DOM out. No AI, no
  persistence, no PPTX, no intent, no planning, no mutation
  (scenes are deep-frozen on mount so a read-only violation
  throws instead of corrupting), no invented
  data. Unknown kinds render nothing (same as string
  projection). Deterministic: same scene, same DOM.
- Identity: every element keeps `data-el` (+ `data-locked`
  where set, `data-semantic-ref` where set).
- Geometry: inches × 96, z-order preserved, backgrounds and
  chrome projected like any other layer.
- Text: compiler-resolved sizes render verbatim (px = pt ×
  96/72); line breaks via the shared `lineCount` heuristic so
  breaks match the compiler's count; browser metric mismatch
  stays visible and is documented, never auto-corrected.
- Extension: selection/zoom/filmstrip operate on the mounted
  DOM; V2-5 binds commands to the same ids.

## Tables and charts (bounded)

Tables: full contract (rects, header treatment, wrapped
lines, padding, grid) — scroll-free, complete. Charts:
structural bars + contract labels/legend (shared sizes);
per-kind geometry stays a documented V2-4 follow-up, same as
the string preview. Data exact in both; no values invented.

## Risks owned explicitly

- **Fonts.** Inter/IBM Plex Mono ship via fontsource; other
  theme families fall back per browser. Fallback changes
  metrics: visible, documented, never corrected by shrinking.
- **Wrapping.** Browser may wrap one line more/fewer than the
  heuristic where boxes are tight. Overflow shows; QA
  floor-hits remain the authority, not the preview.
- **Chrome images.** Banner/crest `src` may be local paths
  that never load in-browser: seat behavior mirrors the
  image rule (remote/embedded render, local paths seat).

## Follow-ups (not this slice)

V2-4B: per-kind chart geometry + table editing affordances.
V2-4C: selection model grown toward commands (multi-select,
focus, overlays) without mutating scenes. Live per-deck scene
endpoint (server compiles on demand) when the viewer leaves
fixtures. V2-5 closes the demo.html mutation seam.
