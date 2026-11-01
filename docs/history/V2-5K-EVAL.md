# V2-5K Evaluation — new-slide layout gallery

Date: 2026-10-13. Baseline `dd4ab9b` (V2-5J + V2-5J1 accepted).
No persistence, agent paths, layout switching, group commands, or
image upload. Drivers: headless `test/v2-layouts-5k.test.js`;
browser `test/v2-edit-chrome-5k.test.js` (isolated, port 5257).
Curated evidence: `docs/layout-gallery-evidence/` + README.
Legacy audit: `docs/V2-LAYOUT-CATALOG-MAP.md`.

## Verdict

A user can open `+ Slide`, pick a recognizable layout from a
searchable gallery, and immediately edit its real native objects
— while AI-generated slides keep planning through the untouched
composition engine. PASS recommended; V2-5K `[~]` pending
independent review, V2-5 parent stays `[~]`.

## 1. Registry architecture

`packages/editor/layout-templates.js` is a small deterministic
registry independent of the AI composition selector: 15 entries,
each a stable id, name, category, description, use case,
`legacyAliases`, and a scene-construction function. It imports
only scene dimensions and sibling-sampling helpers — nothing from
`packages/compiler` (asserted by reading its own import lines, so
the independence cannot silently rot). The compiler likewise
never imports it. Both systems produce `SlideScene`; the gallery
path builds human-owned skeletons directly, generation keeps
planning from semantic intent.

Templates are flat top-level Layer-C (text/shape/line/chart/table
only, no groups), so every object is a Layers row and a direct
selection unit with no hierarchy to resolve.

## 2. Catalog

Essentials: `title`, `section`, `title-body`, `two-column`,
`closing`. Comparison: `compare-2col`, `pros-cons`,
`compare-3col`. Process & structure: `process-3step`, `timeline`,
`hierarchy`. Data & research: `metrics-3up`, `chart-insight`,
`data-table`, `key-findings`. Four categories with names and
blurbs; every entry carries a recommended use case and the legacy
names it covers (44 of 74 legacy types ride directly or as
aliases; the map records the rest with missing mechanics).

Omissions are chosen, not accidental: image-backed skeletons wait
on upload (no grey seats shipped), funnel/pyramid wait on polygon
shape forms, branching-flow on diamonds, framework/dependencies/
diagram/matrix/venn on node-link layout, icon-list on an icon
vocabulary, sparklines on miniature trend geometry, quote-family
and progress-bars on catalog focus. See the map, §15.

## 3. Placeholders and editability

Every placeholder is a real editable element: single-run
paragraphs throughout, so titles edit by double-click and bodies
take the uniform format panel. Starter copy is neutral
("Presentation title", "Category A", "Describe this step") and
starter data is labelled as such — metric/table/chart templates
carry visible "sample figures / placeholders" captions, and values
are short neutral figures, never fabricated research claims.
No element is locked; ids are stable per build under an injected
factory and random (`h-` + 12 hex) in the UI.

## 4. Theme compatibility

Viewer scenes carry resolved runs but no DesignSystem, so exact
inheritance is impossible at the editor seam.
`layoutContextFromSibling` is the whole bounded fallback: sibling
background verbatim (never a white guess), ink from a sibling run
else contrast, accent from an opaque unlocked non-ground shape
fill else fixed mid blue, table/chart presentation from a sibling
element else an explicit neutral contract. Translucent tints and
ground-matching fills never become the accent.

Found live on dark grounds: a dark run sampled off a light card
became near-black ink on a near-black slide. Fixed with a 3:1
contrast guard that falls back to the higher-contrast pole, plus
best-of-two pairing for text on accent fills — pinned by
per-run contrast tests over light, dark, black, and hostile
siblings. The proper future seam is passing a normalized
DesignSystem into the builders; until then no second theme engine
exists in the UI. Verified on light (`warm-humanist`),
dark (`gradient-mesh-dark`), black (`high-contrast-mono`), and
chromed/plain fixture decks.

## 5. Gallery UX

`+ Slide` is now a chooser: Blank slide (the accepted V2-5I path,
unchanged), Choose layout…, Duplicate current slide. The gallery
is a single fixed dialog — search across names, copy, categories,
and legacy aliases ("kpi" finds the metric layout); category
chips (All + 4); cards with preview, name, category, description,
and use-case hint. Click inserts directly after the active slide,
navigates, and selects it. Esc, backdrop, and ✕ cancel with zero
mutations (proven: revision and filmstrip untouched). No modal
stacking: insertion commits pending text drafts through the
existing gate, and the dialog caps at 94vw with a reflowing grid
for narrow screens (proven at 480px).

## 6. Truthful previews

No hand-drawn thumbnails: each card renders `sceneToSvg` over the
scene the same builder produces against the live sibling, so the
miniature IS the slide at a different scale. Asserted headless
(every text element present by id with its authored wording) and
read in screenshots (all 15 legible, placeholder copy visible).

## 7. Slide-management integration

`insertLayoutSlide` in `packages/editor/scene-edit.js` mirrors
blank insertion: resize/text gates, sibling context, insert after
the active slide (explicit index supported), mint retry. One
insert is one envelope, one revision, one undo entry; navigation
follows the new id. Element ids mint per build and each attempt
rebuilds against the live deck domain — `slide.insert` guards
slide ids only — so repeated uses of one template never collide
(proven: whole-catalog insertion leaves deck-wide identity
unique). Undo deletes the slide; redo restores the identical
bytes; duplicate/delete/reorder work afterward with recipe and
provenance intact. No React-side deck mutation.

## 8. Ownership and lifecycle policy

- Blank user-created slides: `managed`, zero elements (unchanged).
- Template-created slides: `customized` + human provenance on
  every element, no `semanticRef`, `recipeId: layout:<id>`.
- Duplicated slides: existing deep-remap semantics; human stays
  human, recipe survives.
- Generated slides: compiler provenance, `managed`, untouched.
- Detached slides: explicit user action only, never a birth
  state — auto-detaching templates would conflate
  "human-authored" with "compiler-hands-off" and contradict the
  V2-5A rule that detachment is never a side effect.

`customized` + human is the correct birth state because it is
exactly what the equivalent sequence of `element.add` commands
produces, and the orphan rule (`compile.js:443-446`: non-compiler
ref-less elements carry forward with geometry intact) preserves
template slides across any single-slide recompile — proven for
title/body, chart, and table skeletons against an unrelated
intent. Template ids cannot overlap AI identity (random 48-bit
slide ids, per-build element mints, domain-checked submits), and
with no `semanticRef` there is no key a regen pass could join on.

Recorded future rule: deck-level regeneration (not yet built)
must leave slides with no intent in place — they are human
content regardless of `layoutState`. Layout switching on existing
slides is a separate future slice (content mapping + edit
preservation); this slice only lays out new slides.

## 9. Editability verification

After insertion: placeholder text selects and edits through
`element.updateText` with inverses; shape fills restyle through
`element.setStyle`; chart starters (single-series bar, lengths
agree, finite values) edit through `element.setChartData`;
table starters (rectangular, headed) edit through
`element.setTableData`; Layers names every element; lock/hide,
reorder, delete, undo/redo all behave as ordinary slides. Proven
headless (engine + commands) and in Chrome (dblclick→Commit,
Layers-row→Apply style, chart panel→Apply).

## 10. Chart and table starters

One supported chart kind (bar, single series of four), categories
and values length-matched, explicitly placeholder-labelled —
multi-series pie/doughnut never enter the registry because every
boundary (command validator, adapter, preflight) refuses them.
One headed 5×4 table with even resolved geometry, header
treatment from the sampled accent with legible header ink, and a
sample-data caption. Both edit natively after insertion and both
export completely (chart XML carries categories + values, table
stays `<a:tbl>`).

## 11. Native PowerPoint validation

A 10-slide deck (light- and dark-sampled templates) exports
clean: exact count, insertion order, native text/shapes, one
native chart part with starter data, native tables, font styling,
no raster images, safe preflight. LibreOffice rasters of the
export match the browser previews element for element (chart
slide on light, timeline on dark inspected closely). Verification
notes worth keeping: chart categories live in the chart part, not
the slide XML; pptxgenjs always emits `ppt/media/` and embeddings
boilerplate, so export-purity checks must look for image files,
not the directory.

## 12. Headless results

`test/v2-layouts-5k.test.js` — 31/31: registry ×6, validity and
geometry ×6, theme fallback ×5, ownership ×2, engine insertion
×5, editability ×3, previews and regen ×3, PPTX ×1. Baseline
`dd4ab9b` (isolated worktree): the file fails at import
(`Cannot find module layout-templates.js`) — the required
fail-first proof. Related suites green (281/281 across engine,
slides, layers, preservation, ownership, tombstones, text,
style, resize, format, tables, scenes, composition, renderers).

## 13. Browser results

`test/v2-edit-chrome-5k.test.js` — 9/9 (isolated, port 5257):
chooser actions, category browsing with 15 truthful previews,
title insert + heading edit, comparison insert + card restyle via
Layers, chart insert + value edit, undo/redo exactness with
identical slide id, filmstrip drag reorder, cancel-as-no-op,
480px narrow use. The 5i blank-insert and narrow suites were
updated to the chooser flow (blank via "Blank slide") and stay
green. One test-debug note kept: shape SVG nodes carry `data-el`
themselves (no wrapper), so DOM assertions must read the node's
own attributes.

## 14. Full validation

- Related headless suites: 281/281 (list in §12).
- Full `npm test`: exact totals at close (BYOK locale standing;
  browser files isolated per the bounded-concurrency rule).
- `npm run typecheck`: clean (registry is JS, outside the TS
  boundary like the rest of the editor package).
- Production browser build: green.
- Canonical benchmark: 50 cells L1 zero (`--raster none`).
- Browser: 9/9 gallery + updated 5i blank/narrow green in this
  session; remaining browser files per the standing isolation
  rule (none counted on kill/timeout).

## 15. Legacy map

`docs/V2-LAYOUT-CATALOG-MAP.md`: all 74 legacy types (counted
from the schema, not assumed) with purpose, closest V2
composition family, skeleton status (17 direct, 27 alias, 5
partial, 25 omitted with mechanics or priority), and grouped
near-duplicates. Legacy names survive as `legacyAliases` on
registry entries and are searchable in the gallery. The family
column describes the generation path only — no legacy name is
equated with a V2 family, and the gallery constrains nothing the
AI plans.

## 16. Remaining limitations

No layout switching on existing slides (future slice). No image
skeletons without an asset story. No new shape forms, icons, or
diagram auto-layout (map records each). Middle-position insert
takes an explicit index only through the adapter (UI inserts
after active). Previews rebuild per gallery open (cheap pure
builds; no cache). `layoutInk`'s 0.45 threshold survives only as
the no-sample fallback; sampled ink answers to the contrast
guard. Gallery needs Edit mode like every engine op.

## 17. Recommended next slice

V2-6 persistence binding (snapshots + log per the V2-5A §13
seam): template slides make unsaved work more valuable and more
losable, and gallery-built decks are the first decks users will
mind losing. Then layout switching as its own slice. Nothing
started here.
