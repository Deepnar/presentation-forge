# I1 browser and native inspection

Implementation: `5170adcec56e65e08f4ec5c1e5067c127f1c4c9d`.
Implementer inspection only; independent acceptance remains pending.

All119 hash-indexed images in `images.json` were visually inspected:76 current
browser captures on13 browser contact sheets, followed by43 native/SVG/export
rasters on final contact sheets13–20. Full-size inspection included the narrow
editor, history overlay, narrow project/history/refusal/catalog dialogs, project
chart/table inspectors, four HTTP export slides, shell chart/table exports and
representative headless native/SVG and unrelated-slide preservation captures.

Dashboard creation/reopen, save/conflict/recovery, text/chart/table editing,
undo/redo, slide and layer management, history restore, read-only access, focus,
Escape, navigation/project-switch guards and cleanup are exercised by the recorded
26-file208-case serial regression group. Screenshots show the resulting states;
a static screenshot alone is not proof of every interaction. The signed-out
hosted dashboard reports its authentication state, and failure/session-change
views retain their bounded recovery controls. History and deletion dialogs fit
their inspected viewports; inspector controls remain visible. No new overlapping
controls, clipped dialog or unexplained canvas displacement was observed.

The current narrow-editor capture is byte-identical to the accepted H fresh
capture (`early-visual-inspection.json`). Inherited horizontal overflow/partial
narrow canvas remains. The older canonical V2-7A screenshot predates toolbar
cleanup and is not the accepted H visual reference. Known scroll/transition and
loading-capture limitations remain visible in covers/catalog/handoff captures;
no claim is made that those existing capture limitations were corrected by I1.
Their future work remains in the roadmap.

The maximum measured canvas selection displacement across six chart/table
measurements is0.04949951171875px. The120-slide/120-thumbnail opening sample is
1547ms. These are local observations, not production percentiles.

Headless before/after native rasters retain the italic title run, editable chart
and table, expected approved values2.5/15.75 and the untouched second slide.
The SVG first-run text-style and chart-consumer presentation differences remain
inherited limits. Both authenticated HTTP backends produce the expected approved
chart/table and preserved second slide; corresponding raster hashes match across
backends. Actual browser-export rasters retain human chart/table edits and import/
handoff content without observed clipping. The shell table's tall header is
present in the existing fixture, not a newly introduced transport defect.

Fifteen exact original PPTXs are retained:8headless,5actual browser and2actual
HTTP exports. Their hashes and numeric nonvisual identities were checked in107
OOXML parts (365properties); no duplicate per-part identities were found. These
are LibreOffice rasters and structural native checks. Interactive Microsoft
PowerPoint opening, selection, repair and editing were not executed. Offline
provider fixtures establish protocol/preservation behavior, not hosted Auto
content quality or live-provider latency.

All6102 prior evidence files, including179 original PPTXs, and5canonical output
originals were restored and hash-verified. No original archive was reconstructed.
