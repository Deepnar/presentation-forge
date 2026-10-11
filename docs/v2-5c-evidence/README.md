# V2-5C evidence — native canvas editing through the command engine

Full driver output is gitignored (`out/v2-5c/`: 8 trusted-input
screenshots plus `eval-manifest.json` with per-shot selected
ids and overlay-vs-target edge deltas, all ≤ 0.1px).
Regenerate: `node tools/v2-5c-eval.mjs` (builds, serves dist,
drives the real Edit panel; the group deck round-trips one
temporary fixture, reverted). Every shot below was read at
full size; mid-gesture alignment was additionally verified by
pixel-diffing (moved title + ring at old and new positions)
and by accent-color ring measurement, not eyeballing alone.

| shot | shows |
|---|---|
| `drag-prose.png` | trusted drag commits one move (rev 1); ring on committed geometry, inspector marks human |
| `drag-preview-mid.png` | mid-gesture preview at rev 0: content shifted by transform, overlay following, nothing committed |
| `drag-chart.png` | bar-rect drag moves the whole chart unit |
| `nudge-delete-undo.png` | nudge → delete → undo sequence lands at rev 3 with selection reconciled |
| `locked-reject.png` | locked-banner drag commits nothing (rev 0), no selection, chrome intact |
| `zoomed-drag.png` | 200% divider drag; inspector shows moved human coords, ring aligned |
| `group-drag.png` | child-label drag moves the parent group; inspector reports the group unit |

Findings: one drag is one history entry; previews never
touch scenes; locked chrome never selects or moves; group
children resolve to the parent; overlays track committed
and preview geometry alike.
