# V2-8C final visual review

Implementation e41d509c20fca21a70b9a0c587ccb83684aee7e6. All115 images in
images.json were inspected through20 labeled contact sheets:76 current browser
PNGs,23 native PowerPoint rasters and16 SVG rasters. Full-resolution inspection
also covered the500px shell history dialog,480px dark catalog deletion dialog,
persisted edited text/chart/table output and embedded-shell chart/table exports.
The earlier partial25-image inspection is retained separately, not added to115.

## Browser behavior and layout

The complete26-file serial run supplies208 passing leaf tests. Captures cover
save/reopen/recovery/conflict; actual PostgreSQL restart/history/restoration;
dashboard empty, created and reopened projects; hosted authentication/signed-out
state; text/chart/table inspectors; layers; read-only controls; generated handoff,
refusals and changed sessions; project previews/loading/failure/retry; catalog
filters/deletion/error states; and separation of standalone developer controls.
Keyboard, Escape/focus, pending edits, switching and cleanup execute in the suites;
a still image alone does not prove those interactions.

No new foreground overlap or clipped dialog was found. Narrow history retains
visible revision rows and its close control. Narrow deletion retains explanatory
text, Cancel and Delete. Inspector controls remain visible in captured narrow
states. Existing narrow canvas/Fit overflow, C1 rail-transition strips/scrolled
headings, B2 composer/card capture and C2 pending-search snapshots remain visible
and retain their separately scoped limitations. This is no redesign or fix claim.
The Assistant remains the accepted placeholder; these provider primitives do not
wire it to a model.

Selection canvas bounds changed at most0.049484px across6 measured cases, below
the existing1px tolerance. The120-slide project opened in1543ms with120 thumbnails.
These local samples are not production percentiles. The pre-restart shell capture
and resumed serial captures use identical product/test source; no layout change
was introduced between them.

## Persisted content and native output

Both wire families ran through actual HTTP fixtures and the real durable runtime
on SQLite and PostgreSQL, closed/reopened the store, restored/reapplied history
and exported authoritative scenes. All8 original before/after PPTX files and
5 browser originals are preserved with hashes. OOXML verifies real text runs,
chart parts/data and native tables; these are not slide-background screenshots.
Native edited output shows Reviewed results, Reviewed score,2.5/15.75 and table
First/Second while preserving human rich-run styling and scene geometry. The
unrelated second slide is unchanged in every backend/family case. Browser-native
charts/tables retain readable labels and cells, including Shell edited content.

All23 native and16 SVG rasters were inspected. Native rich-run formatting is
preserved; SVG still flattens to first-run styling, as documented before this
slice. Native consumer chart internals and SVG differ; no pixel-parity or
interactive Microsoft PowerPoint qualification is asserted. The visible content
contains synthetic fixtures only, not live model quality evidence.

The3198-file evidence snapshot was restored and hash-verified. Five separately
preserved baseline browser archives were restored only after fresh export capture,
with all baseline witness hashes matched. Current fresh originals live in this
slice; their hashes are not substituted for historical archives. The two earlier
baseline originals were recovered from matching prior backups, not reconstructed.
