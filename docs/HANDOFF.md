# Handoff — 2026-09-01, the front end: landing rebuilt, app sweep begun

Everything is on `origin/main`. `npm test` is 391 passing, the working tree is
clean.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. `docs/ARCHITECTURE.md` has two new sections — **The design
system, and the landing page** — describing the token layer, the scene
mechanics and the imagery pipeline. `docs/ROADMAP.md`'s front-end entry now
records the answers, what shipped and four Learned items. `docs/TRAPS.md` holds
the cross-cutting failure modes. This file is only what those do not say.

---

## Do this first

**The app sweep is what is left of the top item, and it does NOT need to
stop and ask.** Direction was agreed for the whole front end; the landing was
built to it and the app half was only patched where it was outright confusing.
Continue there.

Concretely, and in this order:

1. **The deck / project workspace** (`views/DeckDetail.jsx`, 1.8k lines). Never
   examined this session — it needs a generated deck to look at, and generating
   one spends the operator's gateway budget. Ask before spending it, or point a
   local Ollama at it.
2. **The briefing flow end to end** — `ChatView.jsx` is 2.3k lines and carries
   the whole guided briefing. The empty state is fixed; the flow itself is
   unreviewed.
3. **Density and hierarchy across the app.** The landing has a type scale and a
   spacing rhythm now; the app does not use them.

---

## What was done

**A real design system.** Light and dark, resolved before first paint,
persisted, three-way (system is reachable). A control in Settings and a quick
one in the profile popup. Contrast pairs are tokenised — `on-accent`,
`on-danger` — because the accent inverts wholesale and a literal white
foreground becomes *invisible*, not merely wrong.

**Every text colour was re-picked against the worst ground it lands on**, not
against white. `fg-faint` was 2.56:1 on a panel and `amber` 1.94:1. Both themes
now audit clean: 0 failures across 230 text nodes, measured in the browser.

**The landing page was rebuilt** as pinned scenes — hero, pipeline, slide
vocabulary, theme cycle, feature grid, verification. Scroll is the only input.

**Two renderer defects, found by looking.**

- **Fixed:** `callout`, `takeaway` and `compare`'s verdict bar painted their
  label in `accent_alt` on an ink-filled panel. **17 of 34 themes** were below
  3:1 against the panel the text sits on. `test/contrast.test.js` now covers
  that third surface.
- **Recorded, not fixed:** the fitter reads a type token's `tracking` as a
  percentage of the em; the renderer hands the same number to pptxgenjs as
  `charSpacing`, which is points. They disagree by `100/size`, so the 10pt
  uppercase eyebrow is measured at about a tenth of its real letter-spacing.
  `matrix`'s rotated axis wraps `CONTRACT / ED` with every check clean. See
  `docs/TRAPS.md`. **Fixing it moves the fit verdict for the whole gallery and
  wants its own round against a fresh `themematrix --save` baseline.**

**Auto tier tightened twice.** A recorded "request" is one pipeline operation,
not a model call — read correctly, the old caps were 12–25 decks per account
per week on the operator's key. Now 12 requests / 45 slides per **five-hour**
window and 30 / 90 per week. Five hours, not one: an hour is shorter than a
sitting.

## The state of the checks

| check | result |
|---|---|
| `npm test` | 391 passing |
| `npm run themematrix` | clean, 34 themes x 73 types |
| `npm run themematrix --deck decks/_public/landing/deck.yaml` | clean, 25 slides x 34 themes |
| landing contrast audit, both themes | 0 failures / 230 nodes |
| landing blank-viewport scan | 0 empty stops / 14.8 screens |

## New instruments

`tools/landing.mjs` (`npm run landing`) renders `decks/_public/landing/deck.yaml`
across a chosen cast into committed WebP — 46 frames, 0.52 MB — plus a manifest
carrying dimensions, measured darkness and the slide-type count so the page
hardcodes no number.

**The deck is committed and swept.** It is written to the same caps as any
generated deck and clears `themematrix` on all 34 themes, so the imagery is
produced by the real renderer under the real constraints.

## Traps this session paid for, that will bite again

**`overflow-x: hidden` silently kills `position: sticky`.** One axis hidden and
the other visible is invalid CSS; the browser promotes the visible axis to
`auto`, and an element with `overflow-y: auto` is a scroll container — which is
what sticky sticks to. Trying to undo it with `overflow-visible` on the same
element does not work. This cost two rounds: signed out the landing was
perfect, signed in every scene stuck to the wrong box and the reader scrolled
through blank page. **Eleven empty viewports against none, on the same build —
so test the landing signed IN.**

**An effect that binds to an element rendered later never rebinds.** A scene
returning `null` until its data arrives has no element on first render, and a
ref's identity never changes. `useSceneProgress` takes explicit deps for this
reason. The failure looks like a scene that works but never advances.

**IntersectionObserver does not fire in a hidden or prerendering tab** — the
state a link-preview bot, a background tab and a headless capture are all in.
Anything that hides content until observed must fail OPEN.

**Headless Chrome cannot be verified from the Browser pane if the pane is
hidden**: no compositing, so no screenshots and no rAF. Drive Chrome over CDP
instead (`--remote-debugging-port`, Node 24 has a global `WebSocket`). Scratch
scripts for scene capture, blank-scanning and mobile emulation were written
this session; they are throwaway but the technique is worth repeating.

## Known and not fixed

- **`venn`'s caps are too generous** — §10, unchanged.
- **`feature-grid`** is two lines of speaker-note debt on `minimal-muji`.
- **`matrix` is held out of the landing showcase** with its reason recorded in
  `tools/landing.mjs`; it comes back when the tracking bug is fixed.
- **`ParticleField` is dimmer than it was** — the page ground was lightened for
  the new palette and the old dot opacity read hard against it.
- The landing cast deliberately excludes `aurora-mesh`, `sunset` and
  `gradient-mesh-dark`. They work and remain usable; they are just not what the
  product should flaunt.

## Generation

Unchanged. The TCET gateway answers in under a second with
`FORGE_TCET_API_KEY` in a gitignored `.env`.

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

## Known and deliberate

- The callout bar inverts to light on dark themes. Consistent and intentional.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
- The dev account store holds well over a hundred throwaway test accounts, and
  this session added `uxprobe@example.com` to reach the signed-in screens. That
  database must not travel to production.
- `decks/electrochemical-impedance-spectroscopy-for-l` is the real-content
  fixture. Every check takes `--deck`; use it.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.
