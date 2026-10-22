# V2-8G browser and native inspection

2026-10-22 · implementer inspection, not independent acceptance.
Exact source `f3e784ac6227f46628dc99a54762f6a861eeed64`.

All 115 current-source images in `images.json` were hash-verified and inspected
through 20 contact sheets. The eight shell images in `early-shell-inspection.json`
were also viewed at full size and reconciled to that manifest. Additional full-size
checks covered the narrow import refusal, dark preview cards, narrow catalog delete
dialog, light/dark narrow editor, SQLite/OpenAI-compatible and PostgreSQL/Anthropic
native after-edit slides, and native shell chart/table exports.

The complete 28-case shell suite exercised creation/reopening, save transitions,
text/chart/table edits, undo/redo, slide management, layers, history restoration,
keyboard/focus/Escape, hosted authentication, read-only mode, navigation guards,
pending edits and cleanup. The other 25 serial files exercised the accepted
standalone, persistence, import/handoff, previews, discovery and toolbar surfaces.
These are actual Chrome runs over isolated fixture stores, not source-only claims.

Observed dialogs and refusal/recovery messages remain readable and within their
tested viewports. Dashboard actions and preview fallback/recovery states are
visible. Native exports show the edited text, numeric chart values and native
tables without newly observed overlap or clipping. Exact scene/history and OOXML
checks accompany the rasters; images alone do not prove document preservation.

The 120-slide project opened with 120 thumbnails in 1,537 ms. Shell chart/table
canvas deltas were 0.04953 / 0.02929 px; the maximum across all captured canvas
measurements was 0.171753 px. These are local samples under the recorded shared-
machine conditions, not production percentiles.

Inherited limitations remain visible and are not relabeled as fixed: Fit still
uses the existing padded scroller accounting (720 px client width / 768 px scroll
width in the hosted sample); narrow toolbars scroll horizontally, and an open
inspector overlays much of the narrow canvas. Table inspector data can require
horizontal scrolling. SVG mixed-run text retains its first-run styling limitation,
while native exports retain the differing run styles. Existing native shape-ID,
fit, capture/provenance and timeout issues remain in the roadmap/prior evaluations.

Four persisted native cases cover SQLite/PostgreSQL and both model protocol
families, using loopback fixtures. Eight native archives and five actual browser
export archives were preserved with hashes. All 5,137 snapshotted evidence files,
including ignored archives, and all five canonical browser-output originals were
restored and hash-verified; the two owned harness adjustments retain old bytes and
an explicit adjustment record. No original bytes were reconstructed.

Interactive Microsoft PowerPoint and real-model output quality were not executed.
No real model API or local inference was used. Independent acceptance is pending.
