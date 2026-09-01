# Handoff — 2026-09-01, the landing rebuilt; the app and the hosting gaps next

Everything is on `origin/main`. `npm test` is 391 passing, the working tree is
clean.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. `docs/ARCHITECTURE.md` has a new section — **The design
system, and the landing page** — describing the token layer, the scene
mechanics and the imagery pipeline. `docs/TRAPS.md` holds the cross-cutting
failure modes and outlives this file. This file is only what those do not say.

---

## Do this first

The front-end item is no longer blocked and no longer needs a question asked.
Direction was agreed, the landing was built to it, and the remaining work has
its own roadmap entries. Take them in this order:

1. **`docs/ROADMAP.md` → "Hosting blockers — what strands a real user".**
   Password reset, email verification, and the report donor failing quietly.
   None is taste, none is visible in a demo, and the first one locks a real
   person out of their account permanently. **This is the gate on inviting
   anybody.**
2. **`docs/ROADMAP.md` → "The deck workspace — too many doors, no front one".**
   The page users live in, never designed. Eight controls before any content
   and no primary action.
3. **"The full functional sweep"** — every function exercised in the running
   app. Never done, and it is the item that finds what nobody predicted.

**Do not treat the core as finished.** Reports still "do not feel good", the
research→content flow is unverified end to end, and the fitter measures
letter-spacing in the wrong unit. The renderer is the strongest part of this
product; it is not a solved part.

---

## What was done this session

**A real design system.** Light and dark, resolved before first paint,
persisted, three-way (system is reachable). Controls in Settings and in the
profile popup. Contrast pairs are tokenised — `on-accent`, `on-danger` —
because the accent inverts wholesale and a literal white foreground becomes
*invisible*, not merely wrong.

**Every text colour re-picked against the worst ground it lands on**, not
against white. `fg-faint` was 2.56:1 on a panel; `amber` was 1.94:1, which is
not a colour, it is a suggestion. Both themes audit clean now: 0 failures over
230 text nodes, measured in a real browser.

**The landing page rebuilt** as pinned scenes — hero, pipeline, slide
vocabulary, theme cycle, feature grid, verification. Vertical scroll is the
only input; nothing has to be clicked or dragged to reveal content. The
pipeline's seven panels are hand-written markup of the actual interface rather
than screenshots, so they cannot go stale against the product they draw.

**The app is usable on a phone.** The sidebar was a 256px column on a 390px
screen, leaving the app 134px; below 768px it is an off-canvas drawer over a
scrim. The landing stacks the scenes it cannot pin.

**Two renderer defects, both found by looking.**

- **Fixed:** `callout`, `takeaway` and `compare`'s verdict bar painted their
  label in `accent_alt` on an ink-filled panel. **17 of 34 themes** were below
  3:1 against the panel the text sits on. `test/contrast.test.js` now covers
  that third surface.
- **Recorded, not fixed:** the fitter reads a type token's `tracking` as a
  percentage of the em; the renderer hands the same number to pptxgenjs as
  `charSpacing`, which is points. They disagree by `100/size`, so the 10pt
  uppercase eyebrow is measured at roughly a tenth of its real letter-spacing
  and `matrix`'s rotated axis wraps `CONTRACT / ED` with every check clean.
  See `docs/TRAPS.md`. **Fixing it moves the fit verdict for the whole gallery
  and wants its own round against a fresh `themematrix --save` baseline.**

**Auto tier tightened twice.** A recorded "request" is one pipeline operation,
not a model call — read correctly the old caps were 12–25 decks per account per
week on the operator's key. Now 12 requests / 45 slides per **five-hour**
window, 30 / 90 per week. Five hours rather than one because an hour is shorter
than a sitting.

## The state of the checks

| check | result |
|---|---|
| `npm test` | 391 passing |
| `npm run themematrix` | clean, 34 themes x 73 types |
| `npm run themematrix -- --deck decks/_public/landing/deck.yaml` | clean, 25 slides x 34 themes |
| landing contrast audit, both themes | 0 failures / 230 nodes |
| landing blank-viewport scan | 0 empty stops / 17.4 screens |
| landing at 390px | no horizontal overflow; scenes that cannot pin, stack |

## New instruments

`tools/landing.mjs` (`npm run landing`) renders `decks/_public/landing/deck.yaml`
across a chosen cast into committed WebP — 46 frames, 0.52 MB — plus a manifest
carrying dimensions, measured darkness and the slide-type count, so the page
hardcodes no number. **The deck is committed and swept**: it clears
`themematrix` on all 34 themes, so the imagery is produced by the real renderer
under the real constraints.

## Traps this session paid for, that will bite again

**`overflow-x: hidden` silently kills `position: sticky`.** One axis hidden and
the other visible is invalid CSS, so the browser promotes the visible axis to
`auto`, and an element with `overflow-y: auto` is a scroll container — which is
what sticky sticks to. Undoing it with `overflow-visible` on the same element
does not work. This cost two rounds because **signed out the landing was
perfect and signed in every scene stuck to the wrong box**: eleven empty
viewports against none, same build. Test the landing signed IN.

**Two display utilities on one element are resolved by Tailwind's ordering, not
by the order you wrote them.** `hidden sm:inline-flex` on a `<Button>` lost to
the component's own base `inline-flex`, and the composer showed two send
buttons on every phone. Wrap the element instead of fighting the cascade.

**An effect that binds to an element rendered later never rebinds.** A scene
returning `null` until its data arrives has no element on first render, and a
ref's identity never changes, so `[ref]` alone left the observer attached to
nothing. `useSceneProgress` takes explicit deps for exactly this. The failure
looks like a scene that works but never advances — the hardest kind to see.

**IntersectionObserver does not fire in a hidden or prerendering tab** — the
state a link-preview bot, a background tab and a headless capture are all in.
Anything that hides content until observed must fail OPEN.

**The Browser pane cannot verify anything while it is hidden**: no compositing,
so no screenshots and no `requestAnimationFrame`. Drive Chrome over CDP instead
(`--remote-debugging-port`; Node 24 has a global `WebSocket`). Scratch scripts
for scene capture, blank-scanning, mobile emulation and contrast auditing were
written this session — throwaway, but the technique is worth repeating, and the
blank-viewport scan is what proved the scrolling complaint fixed rather than
believed fixed.

## Known and not fixed

- **`venn`'s caps are too generous** — §10, unchanged.
- **`feature-grid`** is two lines of speaker-note debt on `minimal-muji`.
- **`matrix` is held out of the landing showcase** with its reason recorded in
  `tools/landing.mjs`; it returns when the tracking bug is fixed.
- The landing cast excludes `aurora-mesh`, `sunset` and `gradient-mesh-dark`.
  They work and stay usable — they are just not what the product should flaunt.
  Dropping `gradient-mesh-dark` was an inference from "no gradient themes", not
  an explicit instruction; check before adding it back.
- **`SlideEditor.jsx` and the deck/report views on a phone are unverified.**

## Generation

Unchanged. The TCET gateway answers in under a second with
`FORGE_TCET_API_KEY` in a gitignored `.env`.

```bash
FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 24 --density dense
FORGE_HOSTED=1 npm run forge -- generate <slug>
```

Generating a deck spends the operator's gateway budget — ask before doing it to
look at a UI, or point a local Ollama at it.

## Known and deliberate

- The callout bar inverts to light on dark themes. Consistent and intentional.
- `config/identity.yaml` on the dev machine reads `institution.name: HACKED`.
- The dev account store holds well over a hundred throwaway test accounts, and
  this session added `uxprobe@example.com` to reach the signed-in screens. That
  database must not travel to production.
- `decks/electrochemical-impedance-spectroscopy-for-l` is the real-content
  fixture. Every check takes `--deck`; use it.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.
