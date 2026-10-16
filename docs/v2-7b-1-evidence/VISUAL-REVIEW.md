# Final browser and native inspection

Source `662f7d6a08647d431eded1ea17c5d13e7ca1c591`. All **23** final PNGs in
[image-manifest.json](image-manifest.json) were opened and inspected after the
unchanged-source run: **11** fresh 7A regression screenshots, **5** imported-project
screenshots and **7** actual native-export slide rasters. These are current
captures, not historical screenshots reused as new execution evidence.

Dashboard empty/populated states, creation/reopening, text/chart/table editing,
undo/redo, locks/visibility, slide management, history restoration, read-only
mode, focus/Escape, navigation/pending-draft guards and cleanup execute in the
full serial inventory. Fresh regression captures are under `regression-shell/`.
History and saved-project dialogs retain visible controls inside their viewport;
long lists scroll. The wider table inspector grid remains horizontally scrollable.
No new overlapping controls or unexpected dialog clipping was observed.

The five import captures use the actual authenticated production server and its
unchanged CSP. Chart/table images show saved revision 3 after edit → undo → redo;
source-request replay returns that edited document. Both tests observe
`dirty → saving → saved`. Early-document and post-edit CSP violation arrays stay
empty. Stat qualifiers remain visibly under their corresponding values;
Before/After prefixes distinguish identical authored titles. The audience/context
carrier is not an invented step or comparison peer.

Measured chart stage bounds change from y108.297737 to108.251099px, table from
y108.297836 to108.251167px. Their x456px, width719.991699px and height404.992554px
remain unchanged: maximum change **0.0467px**, below the 1px assertion. Fresh 7A
selection measurements show at most 0.0496px movement. No selection-induced canvas
reflow was observed.

The new narrow capture is an exact **480×900 CSS viewport**; inspector bounds
are **[192,44,288,856]**, reaching x480 and y900 without leaving the viewport.
The inspector intentionally overlays the canvas; the top bar scrolls, and the
left portion of the slide remains behind that overlay. This is visible in the
capture and is not a claim that the entire slide is visible while the rail is
open. Historical 7A narrow regression captures use its existing 500px viewport.
The standing Fit/border-box issue still leaves about 24px of the initial canvas
outside the center; it was not corrected in this slice.

Native exports are the actual saved projects, not regenerated legacy decks.
`export-inspection.json` records byte hashes and native OOXML checks. Chart data
and the edited category survive; the edited table remains `<a:tbl>`. Two repeated
section labels retain 01/02, stat qualifiers share their value's carrier, the
sectioned flow has exactly two step badges, and Before/After roles survive native
export. All seven selected LibreOffice/Poppler rasters show contained text,
readable labels, intact tables/charts and no unexpected overlap. Chart clients
may choose their own axis/legend layout; browser/native pixel identity is not
claimed. Interactive Microsoft PowerPoint was unavailable.

Opening measurements include Chrome startup, fixture/font-gated boot and route
navigation: imported3-slide projects 1512/1503ms; imported60-slide /60-thumb
boundary 1555ms; existing120-slide /120-thumb regression 1543ms. These are individual
observations on the recorded machine, not service-level guarantees. No live
writing-quality, exhaustive accessibility or hosted generation claim is made.
