# Final frontend and native-export inspection

Source: `fe749fb41e744961df156e8b9dcf80f0155b4e0b`. Inspected 2026-10-15.
All 15 PNGs in [image-manifest.json](image-manifest.json) were opened, including
fresh Chrome captures and LibreOffice rasters of actual saved-project exports.
This is implementation verification, not independent acceptance.

| Surface / behavior | Executed evidence | Inspection |
|---|---|---|
| Empty/dashboard, creation and reopening | 7A dashboard 5/5 and route 3/3; dashboard-empty/dashboard/editor-blank PNGs | Card actions and creation controls readable, no overlapping controls |
| Text and save transitions | 7A text, conflicts, delayed saves, failed saves, drafts and readonly recovery; editor-shell | Save pill uses confirmed revisions; unchanged history/engine ownership |
| Chart/table in embedded shell | Native data edited, saved and read back from API; editor-chart/editor-table | Selection and native data visible; table grid intentionally scrolls horizontally in fixed inspector |
| Undo/redo, slides, layers, locks and visibility | 7A plus serial 5C/5D/5E/5F/5I/5J/5K suites | Persisted visibility and redo assertions, real filmstrip and authoritative layer identities |
| History restoration | Actual rev0 restored as new rev2, native export; editor-history | Dialog inside viewport, readable controls and successful restore message |
| Narrow inspector and projects dialog | 7A inspector reachability, real insertion/save, dialog bounds and Escape assertions | editor-narrow/editor-narrow-projects: inspector toggle reachable by top-bar scrolling; dialog inside viewport, rows scroll |
| Read-only / present / assistant | 7A present, Done, unbound/bound dirty preservation | editor-readonly: edit mutations unavailable, honest assistant placeholder |
| Keyboard / focus / Escape | 7A and 5D browser suites | Caret remains in textarea with deterministic headless focus; real click-away and Escape paths preserved |
| Hosted signed-out and signed-in | 7A anonymous state plus supplemental actual login form against hosted PostgreSQL | dashboard-hosted-anon/signedin and editor-hosted-signedin: auth modal, owned list, confirmed rev1 after reopen |
| Native export | Actual trusted export controls with bearer request, HTTP200 and attachment; saved chart/table PPTX rasterized via src/preview.js | export-chart/export-table: edited labels present, no clipped text, overlapping chart/table content or missing objects |
| Navigation / cleanup | Back/Forward, sidebar and switch Cancel/Save/Discard, pending PUT/draft, failed reload, repeated remounts | No duplicate commit after remount; cancelled choices preserve the active project |

Chrome's requested 1440×900 window produced **1440×757** captures on this host;
requested 480×900 produced **500×757**. Those are the actual inspected dimensions,
not a claim to have tested a 480px CSS viewport. Narrow rails are overlays and
intentionally cover part of the canvas while open. Top-bar late controls remain
reachable through horizontal scrolling. No overlapping controls or clipped dialog
bounds were found in these final captures. Keyboard focus containment for all
possible modal/tab sequences was not exhaustively audited; the recorded Escape,
caret and opener-return paths were executed.

## Controlled geometry and opening measurement

[Chart](canvas-chart.json) selection: x/width unchanged, y delta−0.049576px.
[Table](canvas-table.json) selection: x/width unchanged, y delta−0.095993px.
Height changes were approximately−0.000031px. Assertions require every measured
stage coordinate/dimension delta below 1px. The small y deltas coincide with
existing entrance animation settling; no meaningful selection-induced canvas
shift was found.

[Large-deck measurement](large-deck.json): **120 slides, 120 thumbs, 1542ms**.
It includes Chrome startup, fixture font gate and project route/open; it is not
isolated editor rendering latency. The original 120000ms bound was retained.

A separate [hosted geometry measurement](canvas-hosted.json) exposed a **pre-existing
Fit limitation**: scroller 720px, padding 24px each side, scroll width 768px, stage
width719.9917px at x456, ending 1175.9917 while the visible scroller ends 1152.
The last approximately 24px are initially offscreen and reachable by scrolling.
The same padding and border-box refit inputs exist at accepted 97a12de. This is
not a new selection shift; it is recorded in the roadmap's Viewer Fit item and
remains a known limitation of this validation scope.

## Export and benchmark limits

[Export inspection](export-inspection.json) records SHA256, bytes and native OOXML
parts for the actual exported fixtures. The chart remains a native chart part;
the table remains a native `<a:tbl>`. Both preserve “Shell edited”. Rasters show
LibreOffice output; Microsoft PowerPoint was not available for an interactive
viewer check. Native chart legend placement differs from browser SVG, as expected
for the existing renderer; this pass did not claim pixel identity or change it.
The generated PPTX files remain under ignored out/ and are reproduced by the
full 7A case; PNG evidence is retained here.

The canonical 50-cell benchmark ran with raster none:0 L1,0 L2,0 fit diagnostics,
0 missing blocks,0 takeaway findings and0 chart-data mismatches. Theme semantic
invariance agrees for all five decks. All six current semantic counterfactuals
are sensitive; three older purpose-only/audience controls remain insensitive,
as recorded in the benchmark. These results concern deterministic compilation
and OOXML, not gateway writing quality or visual inspection of all 50 cells.
