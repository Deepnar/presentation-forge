# Existing screenshot review

Reviewed 2026-10-14 against application implementation `a298767`. These are the
six existing committed captures, not newly executed interactions. Application
source has not changed during this continuity task. Images were opened and
inspected; their hashes below identify the exact reviewed bytes.

| Image | Actual size | Observation / limit |
|---|---|---|
| dashboard-empty.png | 1440×757 | Empty-state text and both creation controls readable; no visible overlap |
| dashboard.png | 1440×757 | Two real project cards and their actions readable; does not prove reopen now |
| editor-blank.png | 1440×757 | Saved rev 0, slide rail and inspector shown; central column ~721px (~50% of full viewport) |
| editor-shell.png | 1440×757 | History modal within viewport, scrolling list; selected text/layers behind modal. No before/after canvas pair |
| editor-readonly.png | 1440×757 | Assistant honestly unavailable, export/present visible; no editing tools in visible region. Does not prove every mutation is disabled |
| editor-narrow.png | 500×757 | Chrome clamped requested 480×900. Top bar runs beyond the capture; inspector and later controls not visible. Does not establish reachability |

No dialog appears visibly clipped in the desktop history capture; the revision
list intentionally scrolls. No captured pair measures canvas shift under the
same selection/zoom state. White stage extends beyond the visible center at
100% zoom; that image alone cannot classify it as a layout regression.

Narrow-control clipping is an unresolved finding. Source: `data-topbar` lacks
horizontal-overflow treatment while `data-toolbar` has it, and the hosting App
clips horizontal overflow. The existing narrow test opens the left rail and adds
text but does not exercise the inspector toggle. Confirm behaviour and fix narrowly
under the V2-7A validation scope when the quiet window permits. Do not call the
existing narrow capture a responsive pass. The finding is tracked in the roadmap.

Missing final evidence: actual hosted sign-out capture, 120-slide timing, shell
chart/table edits, redo/discard/pending-draft paths, narrow inspector/dialogs,
controlled same-scene bounds and final export rasters. See the active evaluation
and RUNBOOK; screenshots alone cannot replace those interactions.

## SHA-256

- `dashboard-empty.png`: `4e0841eea28b43d38b6f3163204028ab4fb7d2aff0a4437f42f7c8c4bca16cba`
- `dashboard.png`: `ca763cac2c65ee6db928d918edd3ddb6b8ea448cbf92b9dba6bd7cb087ec96cb`
- `editor-blank.png`: `ac6aff54b150b3982ac177ea6e3e2b6661364744234278431baa590a07ff301e`
- `editor-narrow.png`: `7651f2a1e845472478e015c79a0d3b87a5f3f3f49d3b9e6ec6e1ea8f5535cf95`
- `editor-readonly.png`: `23921299a0afc8b81f529523ae834cfee1d88512a660bd4576e1c480c41455ad`
- `editor-shell.png`: `c364d0da158c109ac221eae0d3d7aa555641c3e7a2a3bae99e5b1c3e12041687`
