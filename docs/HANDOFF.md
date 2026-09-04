# Handoff — 2026-09-04, credits reach a reader, two quiet defects closed

Everything is on `main`. `npm test` is **585 passing**, `npm run themematrix` is
clean across 34 themes, and the working tree is clean. `textcheck`, `drawcheck`
and `capfit` were not re-run: nothing this session touched a theme, a layout, a
cap or the fitter, and the clean matrix is the evidence for that.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. `docs/TRAPS.md` is the cross-cutting failure list and gained
three entries; it outlives this file. `docs/ROADMAP.md` carries every item below.

---

## The gateway, checked once

Still down, still in the shape that looks like health. `chat 000` after the full
90s — no response at all. Four sessions now.

```bash
curl -s -m 90 -w "\nchat %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/chat/completions \
  -H "Authorization: Bearer $FORGE_TCET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6","messages":[{"role":"user","content":"Say ok"}],"max_tokens":4}'
```

Check it once, note the result, move on.

---

## What this session did

**Image credits, surfaced** is built and the roadmap item is closed. No model
was involved in any of it.

The supply had been writing `CREDITS.md` and `assets/auto/credits.json`
correctly for weeks and **no surface mentioned either**, so in practice every
CC BY image in a deck was uncredited. Writing the file felt like discharging the
obligation and did not.

`src/credits.js` is the shared record — `readCredits`, `writeCredits`,
`creditText`, `sourceLabel`, `isCitable`, `creditsSlide`. It sits in `src/`
rather than beside the supply because `src/ai/report.js` already imports
`src/report.js`; a renderer reaching back into the model layer closes that loop.

**Four seats, and they are not alternatives** — the entry named three and the
fourth came from asking where the obligation is actually met:

| Seat | Carries | Alone, it fails when |
|---|---|---|
| Deck page | every credit, short form | you leave the app |
| Research view | every credit + what the report omits and why | you leave the app |
| Report appendix | citable sources only | the deck is presented without its report |
| **`attribution` slide** | only what owes attribution | — the only copy that survives the `.pptx` |

`isCitable` splits provenance a report can name from a stock photograph.
Openverse aggregates 52 providers; 42 are museums, national libraries, archives,
government agencies and scientific registers, so the **denylist** of ten
consumer platforms is the short and stable half. It fails open deliberately.

**Verified, not asserted.** A real `.docx` rendered through the donor and read
back with `pdftotext` — TOC row numbered and paginated, both citable credits
present, the Flickr one correctly absent. Both web surfaces driven in a real
browser, light and dark. The credits slide rendered and rasterised.

### The one thing only the render showed

`attribution.name` caps at 30. "National Renewable Energy Laboratory" is 35, so
the first credits slide read **"National Renewable Energy Lab…"** — which is not
an attribution, on a slide whose only job is to attribute. The slide validated,
the tests passed, the object looked right. A long creator now moves to
`contribution` (60 chars) and the source takes the name.

### Two defects closed on the way

**`needsFinalize` was true for every finished deck.** `generationStatus` read
`complete` — every plan slide written — as evidence of an interrupted run, which
is true of every deck that ever succeeded. `DeckDetail` AUTO-RUNS finalize on
that flag, so opening a finished deck re-ran grounding, a coherence model call,
image supply, the render and the preview, and its banner returned before every
panel below it. `meta.status` already carried the answer and was not consulted.

**The Auto quota reserves in one step.** `src/limits.js` had never been driven
concurrently. Driven now, on an isolated instance, and **the expected race did
not reproduce**: 30 simultaneous requests against a budget of 2 admitted exactly
2 on the pre-fix code, because nothing between the check and the record yields to
the event loop. That safety was undocumented and one `await` from gone — ten
same-tick callers were all admitted. `reserveAuto` makes it structural.

---

## Plan for next session

### 1. Does a real writer ever emit `[image]` notes it can seat?  *(needs a model)*

The whole image path — supply, seating, credits, all four surfaces — has been
exercised by **injecting `[image]` notes into existing decks by hand**. What has
never been observed is how often a real writer emits them and on which types.
The lossless rule refuses a promotion when the list is longer than
`image-text`'s four-line body, and on the one real generated deck on disk the
two bullets slides carried 4 and 5 bullets — one refused outright, the other
seated and then reverted by the fit gate. **If real notes mostly land on 5- and
6-bullet slides, the answer is a new slide type, not a looser rule.** This is
the first thing to look at when the gateway returns.

### 2. The admin panel, swept  *(no model, deliberately deferred)*

Still "later, not now" in the roadmap because it is the operator's surface. Now
cheap: browser-use works (see below), and the density sweep's method — walk
every route in both appearance modes with the in-page contrast audit —
transfers directly. **This is the next no-model item.**

### 3. Monochrome charts need pattern fills  *(no model, renderer)*

A mono theme carries three or four distinguishable greys; a five-series chart is
unreadable in one. OOXML pattern fills are the real answer. Design scope rather
than a defect.

### Two decisions that are yours, both still open

- **Browser-level regression coverage.** More pointed each session: this
  session's four credit surfaces were verified by driving a real browser, and
  nothing in 585 tests would have caught a panel that renders but is never
  reached — which is exactly what the `needsFinalize` defect did. Component-test
  infrastructure (jsdom + a React renderer) versus a scripted browser pass
  before a release. Both would work; they cost very differently.
- **The 19 divider contrast debts.** `tools/contrast-debt.mjs` proves these are
  not a to-do list: twelve cannot be fixed by any token edit (their ink is
  already pure white), and seven more only by making `muted` equal `ink`. They
  are a question about nineteen divider **backgrounds** — the themes' identity.
  The five genuinely payable ones are paid.

### Parked on purpose

`(stretch) Canvas slide-builder` is scope, not a defect. The **front end**
entry's remaining half (the chat view's outline and editing phases) stays
model-blocked: reaching it means generating something.

---

## Running anything — read this or lose an hour

**This box is hosted** (`config/hosted.json`), and `.env` holds
`FORGE_TCET_API_KEY`, which **pulls the AUTHOR role to the gateway even in
LOCAL mode**. To run genuinely locally, withhold the key and use a scratch
config:

```bash
SC=/tmp/forge-scratch && mkdir -p $SC && cp config/models.yaml $SC/
cp config/identity.example.yaml $SC/identity.yaml
printf '{"hosted": false}\n' > $SC/hosted.json
FORGE_TCET_API_KEY= FORGE_CONFIG_DIR=$SC npm run forge -- new "<topic>" --max-slides 16
```

**`config/identity.yaml` is the unfilled template** and the boot log says so on
every start. The user has confirmed this is fine while developing.

**Screenshots need browser-use, and browser-use needs a Chrome already
running.** The in-app Browser pane does not composite here, so
`computer{action:"screenshot"}` times out — that part is unchanged. What the
last handoff did not say is that the `browser-use` daemon fails with
`chrome-not-running` until a Chromium-family browser is up with a debug port:

```bash
google-chrome-stable --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-prof about:blank &
```

Then `new_tab(...)`, and note it marks the tab it drives with a 🐴 in the title —
that is the harness, not the app.

**Driving the UI needs a session in localStorage, set before the app boots.**
Setting the token and changing the hash is not enough; the app resolves auth
once on mount, so it needs a full reload afterwards.

```js
import { register, startSession, promoteToAdmin } from "./src/auth.js";
await register({ name: "T", email: "t@example.test", password: "..." });
await promoteToAdmin("t@example.test");        // ownerless CLI decks are admin-visible
const token = await startSession({ email: "t@example.test" });
// in the browser: localStorage.setItem("forge.token", token); location.reload();
```

**A finished deck's page renders a "Finishing this deck…" banner and nothing
else** (item 2 above). To look at any panel on a real deck, delete `plan.yaml`
from a *copy* of the deck — that is what makes `total` non-zero.

**Two accounts, not one.** Every per-account boundary is invisible from inside a
single session.

---

## Instruments worth reusing

- **Prove the check fails on the old code.** The image-supply tests were run
  against the previous implementation before being trusted, and all three
  headline defects reproduced. A test written after a fix and never seen red
  tests nothing.
- **Read the artefact back, do not assert on the intermediate.** The report
  appendix was checked by rendering a real `.docx` through the donor and running
  `pdftotext -layout` over it. The XML assertions passed on a version whose page
  numbering would have been wrong.
- **Rasterise anything that carries an exact string.** The truncated attribution
  above passed schema validation and every test.
- **A denylist is sometimes the careful choice.** When the allowlist is the long
  half, it is the one that fails silently.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.

## Known and not fixed

- `feature-grid` is two lines of speaker-note debt on `minimal-muji`.
- `capstress` reports 17 joint-at-caps fit events. **Not a defect count**:
  `capfit` measures one field with the others at their own scale and converges
  to zero; `capstress` puts every field at its cap at once, which is not a slide
  a model writes.
- `flickr` is excluded from the report's citable set, which also excludes the
  genuine government photostreams it hosts. Named in `src/credits.js`.
- The dev box holds **115 throwaway accounts**. `Admin → Users` is where to look.
- `decks/perovskite-solar-cells-stability-challenges-2` is the real generated
  deck kept as a fixture. Every check takes `--deck` — use it, because the
  specimen's payloads are hand-written to behave.
