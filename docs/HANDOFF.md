# Handoff — 2026-09-30, canvas slices 1–5 + research reorder (uncommitted)

Read `AGENTS.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then
`docs/ROADMAP.md` → **§11 canvas ([x] — slices 1–5 landed) + §12 user feedback**
(+ new "Per-slide source refs" item).

## Session notes that override paper

- **The human codes directly now — no opencode sessions.** The user corrected
  this mid-session ("that was an old thing"): implementation happens in this
  chat, not via delegated `opencode run` workers. `AGENTS.md`'s Orchestration
  section still says otherwise and needs a rewrite when the user confirms.
- **Commits still need explicit OK each time** — work below is uncommitted.

## Current state

Uncommitted changes (`git status`): `schema/deck.schema.json`,
`src/{overrides,render,composition}.js`, `src/layouts/core.js`,
`app/server/artifact-routes.js`, `app/web/src/views/ResearchView.jsx`,
`src/ai/{ops,catalog,turn,generate,fieldlength,trim}.js`,
`test/{canvas-layout,canvas-overrides,canvas-preservation}.test.js`,
`app/web/{src/components/CanvasEditor.jsx,src/components/Lightbox.jsx,src/views/{DeckDetail,ResearchView}.jsx,src/api.js}`,
`package.json` + `package-lock.json` (konva + react-konva),
`docs/{ROADMAP,ARCHITECTURE,TRAPS}.md`.

Previously here (committed as `c497ffd`): human-only bounded editing — blank
of any type without AI, descriptor fixes, semantic reorder, tell-to-add door,
image blanks with the add-image badge. Refs slide verified against a real deck
(second-to-last, part-scoped, top 10, plain text, nothing clickable).

**Canvas slice 1 landed this session** (spec §11, paint + semantics decided
last session): per-slide human `overrides` block — `elements` (geometry,
inches on the 13.333×7.5 canvas), `paint` (theme-token-path or hex),
`textboxes`, `images`. Named `overrides`, not `layout`: `diagram` already owns
`layout` as a content enum and a shared object-typed `layout` failed every
diagram slide (blank, vocabulary, specimen tests caught it; TRAPS has the rule
now).

- Grammar exclusion is unconditional in `buildOpsSchema` + `sharedFieldList`;
  turn prompt names the ban; `scrubLayoutOps` strips model-written blocks
  with a visible change note.
- Preservation: `replace_slide` carries the old block, `update_slide` cannot
  touch it, sweep/field-length re-attach verbatim, insert strips, convert +
  remap drop `elements` only (`layoutForTypeChange`). Chat/punch/coherence/
  critic ride `runTurn`, covered centrally. Trim clones + mutates, untouched.
- Editor PUT + SlideEditor merge whole slide objects, so the block round-trips
  with no change (verified by reading, no UI yet).
- Chrome stays locked; freeform stays the rasterised hatch (unchanged).

**Canvas slice 2 landed this session:** `src/overrides.js` (`overrideGeom` /
`overridePaint` resolve inside the layout; `drawFreeforms` after it; crest +
footer locked with visible refusal). `bullets` tagged first; headline +
standfirst through shared `drawHeading`, so all routing layouts gain those
targets. Remaining ~70 layouts ignore unknown targets — tagging is
incremental follow-up, never a flag day.

**Canvas slice 3 landed this session:** `test/canvas-preservation.test.js`
(turn scrub/preserve/visible-refuse, scoped punch path, coherence end to
end, trim). The audit caught a real defect: trim popped
`overrides.elements` as a zero-min array — fixed at the shared root
(`overrides` into `slideFieldMeta`'s NOT_TRIMMABLE), which also covers the
field-length inventory and drawcheck. Critic fixes ride `runTurn`, covered.

**Canvas slice 4a landed this session (backend read path):** `overrideGeom`
records every tagged box's resolved rect into `ctx.placed` (overridden or
not — the editor needs defaults too); `render()` returns per-slide `placed`
(one entry per slide, `{}` for untagged); `GET
/api/decks/:slug/geometry?theme=&mode=` serves it headless (no .pptx, no
raster); `render --geometry` keeps CLI parity. Editor pairs placed with the
slide PNGs. Verified: CLI prints resolved rects; endpoint needs the normal
session auth like every deck route. `test/canvas-overrides.test.js` now 11.

**Tell-to-add validated end to end (2026-09-30, no code changed):** exact
deck-page instruction via `runTurn` on a scratch copy of the 17-slide
perovskite deck → `+ slide 18 (stats)`, existing slides byte-unchanged,
re-render clean, appended slide rasterised and read clean. Local
`qwen3.6:35b-a3b` (plumbing only); `config/hosted.json` flipped temporarily
and restored (verified `{"hosted": true}` after). Roadmap entry marked [x].

**Research tab reorder (2026-09-30, user ask):** the Sources panel moved to
the top of `ResearchView` (right after Coverage, before Figures/Notes) via a
new `SourcesPanel` component — same table, new position. `vite build` clean.
Also filed §12 "Per-slide source refs" (schema `cites` exists, nothing
writes/reads it — needs a supporting-source contract before building).

## Verification

- `test/canvas-layout.test.js` — 22/22, `test/canvas-overrides.test.js` — 11/11,
  `test/canvas-preservation.test.js` — 5/5 (stub chats, no model calls).
- Full `npm test` — 888/889; the one failure is pre-existing and unrelated
  (`byok-budget.test.js` locale: `50,00,000` vs `5,000,000`).
- Rasterised demo (bullets + moved body + accent headline + free textbox):
  read clean — shifted body, accent headline, clear textbox, no overflow.
  `npx vite build` clean. `git diff --check` clean.
- Roadmap §11 entry records slice 1 + Learned; ARCHITECTURE content section
  documents the block; §12 holds the three external-feedback items (LM Studio,
  custom themes, template-PPT flow) — all unstarted.

## Continue from here

1. **Canvas slice 5** (the `react-konva` editor surface itself: stage over
   the slide PNG, select/drag/resize placed targets, palette-first paint via
   the existing `/api/themes` palette, free textboxes/images, save through
   the existing `commitDeck` funnel so undo + re-render come free) — LANDED
   2026-09-30 as `CanvasEditor.jsx` (entry: per-slide canvas button on the
   deck-page cards, beside Edit/Punch/Swap — moved off the lightbox toolbar
   per user ask; `konva@10` + `react-konva@19` installed, matching React 19; `vite build`
   clean). NOT visually proofed — the site sits behind login and there are
   no credentials in this session; needs a logged-in click-through (open any
   deck → lightbox → canvas button → drag a box → Save).
2. Then slide-links pick (the "References slide carries clickable links" item
   needs direction first — options (a)/(b)/([c]) are in the entry; ask, then
   wait), functional sweep (gateway-blocked for the generation half).
