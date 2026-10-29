# Actual native visual inspection — 2026-10-29

Root inspected qualified/slide-1.png, slide-2.png, slide-3.png and
short-notes/notes.png using the image viewer. All paths are under this folder's
native/. Text/chart/table remain visible and editable-native in OOXML; nested group
positions, the image placeholder's two primitives and chrome furniture preserve
existing layout. No new clipping/overlap/shift observed. Raster controls are
pixel-identical on all three1067×600 canvases:0changed channels,0maximum delta.
The actual one-page notes PDF shows the slide thumbnail, complete short notice,
C1 object label, title and URL with clear separation and no clipping.

visual-01 produced all actual PDFs/PNGs, then its literal PDF substring check failed
because the claim-support notice wrapped across lines. This is a harness expectation
error, not missing notes. visual-inspect-01 reuses those artifacts and checks extracted
text with whitespace normalization; no native render was repeated. Raw logs retain
both outcomes. Installed LibreOfficeDev26.8.0.0.alpha0's local registry explicitly
supports ExportNotesPages/ExportOnlyNotesPages. This is a local Impress/Poppler sample,
not interactive Microsoft PowerPoint qualification or general printable-fit evidence.
The long-note native test preserves128complete title/URL fields and its overflow notice;
long printed notes pages are intentionally not certified.
