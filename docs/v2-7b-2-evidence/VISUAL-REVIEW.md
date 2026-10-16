# Final-source visual inspection

Implementation `03cc89ef233db5469066599391cbaac68c2fc646`, branch `v2`.
All 30 final images in [images.json](images.json) were opened and inspected.
Each hash was recorded at inspection and compared again with the final copied
file. The pre-correction recovery screenshot under logs/attempts is excluded.
These are synthetic fixtures; no private presentation or live model output.

| Capture group | Count | Provenance and observations |
|---|---:|---|
| regression-shell/ | 11 | Fresh full V2-7A Chrome suite, SQLite and hosted signed-out fixture. Empty/populated dashboard, creation/reopening, blank/editor shell, history, read-only, chart/table and narrow editor/Projects views. Controls and dialogs remain usable; narrow inspector intentionally overlays the canvas. |
| imported/ | 5 | Fresh V2-7B-1 real production-server/CSP browser suite, SQLite. Human-edited chart/table, narrow inspector, qualified stats and temporal roles survive; no new clipping or overlapping controls. |
| Root handoff screenshots | 9 | Final PostgreSQL handoff repetition and supplemental actual hosted driver: completed chat, legacy deck action, progress, ambiguous response, expired session, history, narrow refusal/boundary and trusted double-click result. Original-deck access stays visible. Focused session recovery sits above the fixed composer; the full notice is asserted geometrically. Narrow refusal fits. |
| native/ | 5 | Actual authenticated exports rasterized by src/preview.js through LibreOffice/Poppler. Edited chart, edited table and all three handoff slides inspected. Titles, exact decimal values, chart unit and real table remain visible. Native assertions separately inspect OOXML, not just pixels. |

The opening-progress card can scroll under the fixed composer, with its action
and progress label still visible. Recovery is focused into view. No uncorrected
new overlapping controls, clipped dialogs or material canvas shift were found.
Chart selection moved at most 0.115891 CSS px in a measured bounding coordinate;
table selection at most 0.018929 px. At 480×900 the final imported inspector is
[192,44.003819,288,856]; the boundary handoff rail is approximately [192,44,288,856].
Raw bounds and timings are in [PERFORMANCE.json](PERFORMANCE.json) and measurements/.

Standing limits remain: Viewer Fit includes scroller padding and initially hides
approximately 24px; narrow inspector overlay and horizontal toolbar/grid scrolling
are accepted shell behavior. Fixture/developer controls remain pending roadmap
polish. LibreOffice raster inspection does not establish interactive Microsoft
PowerPoint behavior. No writing-quality or production-deployment claim is made.
