# V2-4E Evaluation — browser selection, hit testing & interaction geometry

Date: 2026-10-11. Baseline `2509968` (V2-4D implemented, in
review). Driver: `node tools/v2-4e-eval.mjs` (outputs gitignored
`out/v2-4e/`). Curated evidence: `docs/v2-4e-evidence/` +
README. No compiler, schema, theme, table-contract, or
PPTX-renderer changes; the viewer gains a read-only selection
model, and the CDP helper gains interactive sessions plus a
font-gate race correction.

## Verdict

Browser elements select and inspect reliably — single,
shift-additive, keyboard-cycled, group-resolved, locked-safe —
under fit, 200% zoom, resize, and narrow viewports, without
altering the authoritative scene. All 8 eval captures assert
their exact selected ids with overlay-vs-target edges within
0.1px; all 8 shots were read at full size. Native PowerPoint
output is untouched (same scenes, same renderer, full suite
green).

## 0. Selection gap (before)

V2-4A provided one nullable `selectedId`, plain-click
replacement, background/Escape clearing, and locked
no-op — no multiselect, no keyboard focus, no bounds API, no
overlays (only a CSS outline), and innermost-wins hit testing
that would have exposed group children as independent units.

## 1. Font-gate race correction (§2)

Independent V2-4D review found the viewer reporting
`data-fonts-ready="false"` while still loading, which the CDP
helper accepted as a completed result — captures could fail
on slow fonts that would have succeeded a moment later.

- The viewer now reports `pending` until the font promise
  settles, then `true`/`false` as before. Loading behavior
  and fallback reporting are unchanged.
- `gatedPage` polls through `pending`, succeeding only on
  `true` and failing clearly on `false` or timeout (poll
  interval also tightened 1000ms → 500ms).
- Regression: `test/v2-fontgate-4e.test.js` serves dist with
  woff2 held 3s. The slow-fonts case **fails on `2509968`**
  (helper returns the early `false` and throws in ~1.5s) and
  passes after; a synthetic pending→true gate pins the
  polling contract directly.

## 2. Selection-state model

`packages/editor/scene-dom.js` owns the model; React stays a
thin shell (it lost its key handler, kept its readout, gained
an inspector panel). State is `selectedIds`: an ordered,
de-duplicated list of authoritative element ids, independent
of scene content.

- `select(id)` replaces (locked/unknown → no-op, as before);
  `select(id, { additive: true })` / `toggle(id)` flips
  membership; `selectMany(ids)` sets deterministically.
- `selectedId` stays in the snapshot (first id or null) and
  in `data-viewer-state` alongside the new `selectedIds`, so
  the `?select=` deep link and existing consumers work
  unchanged.
- Zoom, refit, and resize preserve selection; slide change
  clears it (as before); deck change remounts clear it.
- Clicks: plain replaces, shift toggles, background and
  locked hits clear. Escape clears. Tab / Shift+Tab cycles
  single selection through selectable units in DOM order,
  wrapping, skipping locked units. Arrows/Home/End/zoom keys
  are unchanged, now bound in scene-dom so every shell —
  including headless tests — drives one path. The listener
  lives on the mount root, so inputs and filmstrip controls
  outside it are never hijacked.
- No op rewrites source scenes: the input objects are
  byte-identical after every op (tested).

## 3. API changes

Added to the viewer api: `toggle`, `selectMany`,
`cycleSelection`, `selectableIds`, `bounds` (scene geometry,
DOM-free), `measuredBounds` (DOM, null without layout),
`inspect` (grounded record), `reposition` (out-of-band layout
changes). `select`, `clearSelection`, `goTo`, zoom, and
`elementIds` keep their contracts. `walkSceneEls` is newly
exported for tests and V2-5 tooling.

## 4. Identity and group rules

Hits resolve to the outermost `[data-el]` ancestor. Chart and
table innards carry no `data-el`, so bars and cells resolve
to their unit with no special cases. Group children do carry
ids, and resolve to the parent group: children lack
authored-block semanticRefs, and group lock flags do not
propagate in the projection, so parent-first is both the
identity-honest and the lock-safe rule. Resolution climbs for
locks: a locked element — or a child of one — never
resolves, which closes the non-propagating group-lock gap at
selection time with zero projection changes. Programmatic
`select(childId)` resolves up the same way. No ids are
invented; child-level editing stays a V2-5 decision.

## 5. Hit-testing decisions

DOM hit testing (`closest('[data-el]')` + resolution), real
and trusted in Chrome via CDP input dispatch. Deliberately
unchanged: thin lines and small shapes stay exactly hittable
(no tolerance halo — a V2-5 overlay concern, documented in
§9); text line-gap clicks hit background and clear (no
backing rects added, no bytes changed in `scene-svg.js`).
`scene-svg.js` is byte-stable: no projection change was
needed.

## 6. Bounds and overlays

Overlay rings live in a pointer-transparent layer over the
stage, positioned in SVG px so the shell's scale transform
carries them through zoom and fit for free; borders draw
inside the box so edge elements keep an unclipped ring. Rects
come from `getBoundingClientRect` mapping (transform-proof)
with scene-geometry fallback without layout. The scene SVG
gains only the `data-selected` state marker — asserted by
comparing stripped markup before/after. Repositioning runs on
render, every selection op, zoom, and refit, plus an explicit
`reposition()` for font settle and stylesheet arrival.
Measured edge deltas: 0.0px at fit and narrow, ≤ 0.1px at
200% and on chart units.

## 7. Zoom/resize behavior

Overlays align at fit, 200%, and 900×1400 (all ≤ traces
above). One pre-existing shell constraint surfaced: scaled
zoom overflows paint-only (no layout scroll), so off-center
content can sit outside the viewport unreachable at 200% —
the zoom test clicks the unit actually under the cursor on
the centered divider slide. Zoom scrolling is out of scope;
it is noted for a future shell pass, not corrected here.

## 8. Accessibility/keyboard behavior

Mount root is `role="application"` with `tabIndex=0`; Tab
moves selection (not DOM focus) with `preventDefault`, so
focus stays put while the ring walks the slide; `aria-live`
regions announce slide/selection and zoom. No shortcuts leak
into inputs.

## 9. Remaining limitations

- No marquee/rectangular selection (geometry understood,
  scope deferred; single/shift/keyboard cover the read-only
  need).
- No line/small-shape tolerance halo (V2-5 overlay work).
- No zoom-pan for paint-overflowed content (§7).
- Child-level group selection deferred to V2-5 group-editing
  semantics.
- `document.fonts` proves resolvability, not per-glyph paint
  (standing V2-4D limitation).
- The inspector panel reflows stage scale on appear (normal
  responsive refit; aspect and markup asserted stable).

## 10. Tests and commands

- `test/v2-selection-4e.test.js` — 18/18 linkedom (single,
  replace, shift-add/toggle, selectMany determinism,
  background/Escape/slide-change clearing, Tab order/wrap/
  locked-skip, locked exclusion incl. chromed fixture,
  chart/table-as-one via inner-node hits, parent-group
  resolution, locked descendants, exact bounds, inspect
  incl. semantic refs, zoom/refit overlay stability, scene
  immutability). Fails wholesale on `2509968` (new API
  absent).
- `test/v2-selection-chrome.test.js` — 5/5 real Chrome
  (trusted click/shift-toggle/background, Escape + locked
  chrome, 200% hit + overlay ≤ 4px, overlay ≤ 3px with
  size/markup/inspector assertions, deep link + narrow).
- `test/v2-fontgate-4e.test.js` — 2/2 (pending gate,
  slow-fonts viewer; latter fails on baseline).
- `test/v2-viewer-4a.test.js` — 25/25 unmodified.
  `test/v2-viewer-smoke.test.js` — 3/3 (also exercises the
  refactored CDP helper). `test/v2-fonts-4d.test.js` — 7/7.
- `npm run typecheck` — clean.
- `node tools/v2-benchmark.mjs --raster none` — 50 cells,
  L1 zero (re-verify at close).
- Full `npm test` — re-verify at close; expect only the
  known BYOK locale failure.
- `node tools/v2-4e-eval.mjs` exits 0; tree clean after its
  round-trip (temp group deck reverted, dist rebuilt).

## 11. Proposed V2-4F work

Server-compiled live scenes on demand; the viewer leaves
fixtures. Selection model rides unchanged (ids are
scene-stable). Suggested companions: zoom-pan for scaled
overflow (§7) and marquee selection geometry — both recorded
here, neither started.
