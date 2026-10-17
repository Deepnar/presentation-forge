# Final visual inspection — V2-7C-1

Implementation f79ae07d6ad1696da3106a2a1148ae0ce7f58f51. The implementer opened
all 39 final PNGs: 16 cover views, two supplemental hosted views, 11 shell captures,
five imported-deck captures and five native slide rasters. Contact sheets were
used for coverage, with full images opened for desktop/narrow cards, inspector,
narrow project dialog, chart/table editing, font recovery and the completed chat.
`images.json` records exact hashes, dimensions, backend and inspected status.
Shell/import captures inspected earlier in the run were hash-checked unchanged
after the coordinator copied them. Cover/hosted captures are final PostgreSQL runs, except the narrow main image
replaced by the independently inspected settled SQLite diagnostic; development
capture uses Vite StrictMode with the PostgreSQL API.

- Project covers show the first saved slide above existing title/actions.
  Desktop, blank, detached, hidden-text, chart and table content match the shared
  SVG representation. Literal human `<b>` text remains literal, not markup.
- The 480×900 dark view keeps the complete cover and Open/History/Rename/Export/
  Delete actions inside the viewport. Existing heading wrapping is retained.
- Loading, network failure, synthetic font rejection, actual dynamic/static font
  outages and timeout preserve card geometry. Retry stays inside the preview
  area and does not cover metadata/actions; successful font recovery shows the
  slide again. Open remains available. Thirty projects reach at most two active
  requests; grid-relative card coordinates are identical before/after loading.
- Pending, settled and actual cross-tab account changes remove all old cards and
  show focused reload recovery. The restored cover shows revision 3 and the
  original first slide after real restore-as-new history interaction.
- Fresh shell evidence covers empty/populated/signed-out dashboard, blank/editor,
  history restoration, read-only mode, narrow inspector/projects dialog and
  chart/table editing. Controls and dialogs have no new overlap or accidental
  clipping. The narrow inspector intentionally overlays the canvas, and the
  wide toolbar/table editor uses existing horizontal scrolling. The known Fit
  content-box issue is unchanged; these images do not claim to resolve it.
- Imported text/data scenes retain qualifiers and before/after relationships.
  Chart/table inspector values and fresh native output retain 1.25 and 12.5,
  with human labels present. Native charts and tables remain real OOXML objects.
- The hosted completed-chat action, original-deck link and explanatory text are
  fully above the fixed composer. The trusted double-click handoff reaches the
  saved project and complete filmstrip. No new unexpected canvas movement appears.

Five native pages were produced by actual authenticated exports, checked in
OOXML and rasterized through `src/preview.js`/LibreOffice/Poppler. All were opened:
chart2, table3 and handoff1–3. Text fits, table values remain readable and chart
bars/labels reflect the native values. These rasters do not establish interactive
Microsoft PowerPoint behavior or live model writing quality.

Selection-coordinate changes in the shared shell are at most 0.049691px for the
chart and 0.018990px for the table; imported-scene measurements are at most
0.102784px/0.069329px. These are small settled transition differences, with no
geometry-command reflow. Card loading coordinates are exactly unchanged.
Independent acceptance is separate from this implementer inspection.

The independent narrow diagnostic retained a fresh mid-resize frame that partially
occluded the card. RAF geometry traced the 220ms navigation transition: transient
edge occlusion at 39.8/56.2ms; by 356–373ms the aside is fully offscreen and every
one of five preview sample points and six card-button centers hits its intended
element across stable frames. This establishes a capture timing issue, not
persistent occlusion. The canonical assertions were preserved; product/tests
were unchanged. Both contexts opened the settled image, now the main narrow
capture with updated SQLite provenance/hash. Original PostgreSQL and independent
mid-transition captures remain in scratch/independent evidence. The diagnostic
passes 1/1 as a repeated case, excluded from the distinct matrix count.
