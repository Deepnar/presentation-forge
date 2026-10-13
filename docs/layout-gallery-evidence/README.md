# Layout gallery evidence

Real Chrome runs over the committed fixture
(`mech-warm-humanist-plain`), plus LibreOffice rasters of a native
export mixing light- and dark-sampled template slides, plus
headless engine/OOXML assertions in `test/v2-layouts-5k.test.js`.
Every preview below renders the same scene builder the insertion
path commits — no hand-drawn thumbnails anywhere.

Reproduce:

```
node --test test/v2-layouts-5k.test.js       # 31/31 headless
node --test test/v2-edit-chrome-5k.test.js   # 9/9 real Chrome (isolated; needs google-chrome-stable)
```

The browser file serves `app/web/dist` on 127.0.0.1:5257 and writes
`out/layout-gallery/`; the ten shots here are that output curated
(renamed, otherwise byte-identical). The PPTX rasters come from a
10-slide template deck (`title` through `closing`, light and dark
siblings) exported via `renderPptx` and rasterised with LibreOffice.

| shot | shows |
|---|---|
| `01-chooser.png` | + Slide chooser: Blank slide / Choose layout… / Duplicate current slide |
| `02-gallery-all.png` | gallery open: search, 4 category chips, all 15 cards with live previews, name, category, description, use case |
| `03-gallery-data.png` | Data & research filter: 4 cards |
| `04-title-edited.png` | inserted title slide with edited heading ("Presentation title — live"); the honest overflow advisory for the lengthened 44pt line is visible and the commit still landed (rev 2) |
| `05-comparison-styled.png` | inserted comparison slide with a recolored card |
| `06-chart-edited.png` | inserted chart slide with edited categories/values |
| `07-narrow.png` | 480px viewport: inserted two-column slide selected, filmstrip badge "Custom", gallery panel fits |
| `08-pptx-chart-light.png` | LibreOffice raster of the exported chart slide: native bars, categories, legend, insight copy |
| `09-pptx-timeline-dark.png` | LibreOffice raster of the exported dark timeline: legible white on near-black, blue spine and dots |
| `10-reordered.png` | template slide reordered in the filmstrip via drag |

Scene and OOXML values (not screenshots alone): registry
uniqueness, determinism, schema validity, geometry, contrast,
ownership, insert position, undo/redo exactness, orphan carry,
and slide-XML/chart-XML/table-XML markers are asserted headless —
see `docs/V2-5K-EVAL.md`.
