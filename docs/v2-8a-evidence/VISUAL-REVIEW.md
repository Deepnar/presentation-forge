# V2-8A final-source visual inspection

Source d4f446c7b2fcae851c37d1a46288cf91317c38b4,2026-10-18. Implementer inspection; later separate independent ACCEPT recorded in
docs/reviews/V2-8A-d4f446c.json.
All 91 final images in images.json were inspected across11 contact sheets. Narrow
catalog dialog, narrow dark toolbar, headless before/after and shell chart/table
native rasters were enlarged. All 91 hashes matched. Final captures exclude the
retained earlier-attempt images.

The complete serial execution covers dashboard creation/reopening, save/dirty/
failed/conflict states, text/chart/table editing, undo/redo, slide management, layers/
locks/visibility, history restoration, narrow inspector, read-only behavior,
keyboard/Escape/focus, navigation/pending edits and cleanup.7A passes28/28;
the corrected B2 handoff passes11/11; covers12/12, catalog16/16 and toolbar9/9.
Screenshots show visible states; command/history and browser assertions establish
behavior. No new overlapping controls or clipped dialogs were observed.

Toolbar selection has exactly0px SVG-bound delta for chart/table on SQLite.
The full7A selection matrix has maximum0.049485px absolute drift, with effectively
unchanged dimensions. At480x900 both toolbar themes retain40.1875px height and
insertion/Fit actions remain reachable through the asserted horizontal scrolling.
The120-slide deck opens all 120 thumbnails in1537ms. The60-slide import handoff
takes656ms; the3-slide cold/warm handoffs take558/556ms. These are single local
measurements, not production percentiles or a Fit correction.

The headless caller applies text/chart/table wording/data as one agent batch.
Exact scene snapshots establish0 geometry change, untouched style/layout/run
metadata, unchanged unrelated slide and exact undo/redo. Context is4268characters
(1067estimated tokens by ceil(chars/4)); projected model input excludes the other
slide and renderer/authority/configuration fields. This is scripted plumbing,
not live provider/content-quality evidence.

All 11 selected native pages and 4 SVG rasters are readable without new overlap or
clipping. OOXML checks retain native charts/tables and exact decimal values.
Before/after native text preserves the second run's italic/size/colour. The SVG
renderer joins paragraph wording and applies the first run's style, both before
and after this edit. Thus scene/style preservation is exact, but mixed-run visual
parity is an inherited limitation registered in ROADMAP.md#mixed-run-svg-parity.
Existing chart legend/axis conventions also differ between native and SVG;
this report makes no pixel-equivalence claim. Native preview is LibreOffice/
Poppler, not interactive Microsoft PowerPoint. The raster-none50-cell benchmark
supplies separate structural/fit/OOXML invariance evidence.

Retained capture limits: C1 narrow dark has the inherited rail transition strip;
canonical B2 completed-chat capture leaves the action below its composer; C2
no-match captures still label a pending generated-content search. These do not
establish persistent product failures or completed empty-search responses.
The source-retry gesture failure was separately traced and the click readiness
corrected without replacing the original evidence. Its original untraced sequence
and the older history-restore timeout are not claimed explained by a passing run.
Existing narrow canvas/inspector clipping follows the registered Fit behavior.

Sources: images.json, measurements/provenance.json, headless-inspection.json,
export-inspection.json, shell-export-inspection.json and exact-source test logs.


Archive provenance after review: 2 globally ignored original headless PPTX files
were omitted from the review backup and are unavailable after rerun. Their original
scene/SVG/PNG/TAP witnesses and hashes remain exact; all 91 final images still match.
Fresh independently checked archives have new hashes in the independent namespace.
See independent/archive-provenance-limit.json; no original archive recovery claim.
