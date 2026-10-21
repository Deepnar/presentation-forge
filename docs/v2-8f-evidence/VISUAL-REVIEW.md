# V2-8F final visual inspection

Exact source0cab854. All115manifest images were inspected:76Chrome,23native
LibreOffice/Poppler rasters and16SVG rasters. The browser images were viewed through
5initial sheets/30images and8remaining sheets/46images; headless32images through
6sheets, plus7actual browser-export rasters through2sheets. Full-size narrow history,
inspector and native rich-text risk cases were also opened. The20final combined
sheets were generated, not separately all opened. Hash reconciliation proves the
inspected union matches the final115; this is inspection, not merely file creation.

Dashboard creation/reopening, empty/signed-out/authentication, save/conflict/recovery,
text/chart/table edits, undo/redo, slide/layer controls, history restoration, imports,
explicit handoff/refusal/session guards, covers/catalog and toolbar/read-only states
remain consistent with accepted behavior. Narrow history dialogs/confirmation
controls are contained and inspector controls remain visible. No new foreground
dialog/control regression was observed. Canvas movement across6measured cases is
at most0.06939697265625px, below1px;120slides opened with120thumbnails in1541ms.

Known limits remain:100percent/Fit narrow canvas/toolbar overflow and inspector
occlusion; the canonical C1narrow-dark transition capture obscures leading content;
the C2no-match capture still shows pending generated-content search. Catalog source
loading/action movement and earlier restore/capture provenance limits are retained,
not claimed corrected. Their work remains in the roadmap.

Native before/after output visibly retains the italic final run and edited text,
chart values/series and table cells. SVG still uses the first run's style for mixed
paragraphs. Unrelated slide2content remains unchanged in the fixtures. Actual5new
browser originals were preserved before restoration and7selected pages were inspected,
in addition to8new headless originals. OOXML cache/text/table/color assertions passed;
full scene/history preservation is exercised by the4persisted scenarios. This is
not interactive Microsoft PowerPoint qualification. Repeated nonvisual shape IDs
remain in all8headless archives, matching the inherited accepted finding; see the
separate identity observation and roadmap entry.

[Final image hashes](images.json), [reconciliation](visual-hash-reconciliation.json),
[performance](performance.json), [native originals](native-archives.json),
[browser originals](browser-archives.json), [identity observation](native-identity-observation.json).
