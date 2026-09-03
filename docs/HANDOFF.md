# Handoff — 2026-09-03, image supply is built; the credits it writes are invisible

Everything is on `main`. `npm test` is **556 passing**, `npm run themematrix` is
clean across 34 themes, `textcheck` reports every declared word surviving in all
34, `drawcheck` covers 331 fields across 73 types with none undrawn, and the
working tree is clean. `capfit` was not re-run: nothing this session touched a
theme, a layout or a cap, and a fully clean specimen sweep is the evidence for
that.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. `docs/TRAPS.md` is the cross-cutting failure list and gained a
new section — **Third-party APIs and outside data** — plus four entries under
rendering; it outlives this file and is the most valuable thing here.
`docs/ROADMAP.md` carries every item below.

---

## The gateway, checked once

Still down, and still down in the shape that looks like health.

```bash
curl -s -m 90 -w "\nchat %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/chat/completions \
  -H "Authorization: Bearer $FORGE_TCET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6","messages":[{"role":"user","content":"Say ok"}],"max_tokens":4}'
```

`chat 000` after the full 90s — no response at all. Three sessions now. Check it
once, note the result, move on.

---

## What this session did

Eleven commits, no model involved in any of it. **Image supply — auto, not just
upload** is built, and the roadmap item is closed.

**The last handoff was wrong about it, in the expensive direction.** It said
"unstarted". `src/ai/images.js` had existed since `f63ff07`, was imported by
`src/ai/pipeline.js`, and was called in `finalizeDeck` — and returned an empty
array on every run. That is worse than unstarted: an absent module gets built,
a present one gets trusted. Two sessions planned around it as greenfield.

Four defects, each verified by calling the live upstreams rather than reading:

| | What was actually true |
|---|---|
| Unsplash fallback | `source.unsplash.com` answers **503** to everything. Retired. The module listed two sources and had one. |
| "CC licence recorded" | Primary source was SearXNG, which **drops the licence from every image row** — including its own `openverse` engine. Nothing recorded anything, and the images were ordinary copyrighted stock. |
| Query | The writer's phrase went through verbatim. Openverse ANDs its terms: `"electrolysis"` → 240 hits, `"electrolysis cell"` → **0**. |
| Seating | Set `slide.image` on whatever type carried the note. But `image`/`image-text`/`hero-image`/`image-grid` all **require** that field, so a valid deck never has one waiting — every seat it filled was on a type whose layout never draws one. |

**Now:** Wikimedia Commons primary (states `AttributionRequired` per file, no
punitive rate limit, deep in the technical figures an academic deck wants, and
`iiurlwidth` rasterises SVG so vector diagrams arrive placeable), Openverse
secondary and budgeted (20/min, 200/day anonymous, remainder read from the
response header; `OPENVERSE_API_TOKEN` raises it). `licenceTier` ranks rather
than filters — PD/CC0, then CC BY, then CC BY-SA, with NC/ND/unreadable refused
— which is why the live run chose a public-domain US Dept. of Energy photograph
over the CC BY-SA candidates without being told to. `queryLadder` widens in
defined steps and stops at the first rung that lands. Opt-in per deck via
`meta.imageSupply`, asked in the briefing beside research, `--images` on the
CLI, `imageSupply` on `POST /api/decks`.

**Seating is lossless or it does not happen**, and it is gated twice — schema
(on the touched slide only) and **fit**. Verified end to end on the real
generated deck: promotion seated, all four bullets survived, `section`,
`standfirst`, `speaker_note` and `cites` intact, rendered and looked at, fit
sweep back to its 5-problem baseline.

---

## Plan for next session

### 1. Image credits, surfaced  *(no model, high — and it is the honest completion of the above)*

**The supply writes `CREDITS.md` and `assets/auto/credits.json`, and no surface
mentions either.** A public-domain image owes nothing and the ladder prefers
those, so the gap is survivable — but a CC BY image is only compliant if its
attribution reaches a reader, and today that depends on the user finding a file
nobody told them about. The roadmap entry names three seats (deck page, report
section, and the existing `attribution` slide type). **The third changes the
deck's slide count, so agree it before building.**

### 2. Rate limits and quotas under real load  *(no model)*

Unchanged from last session and still the largest untouched thing.
`src/limits.js` caps what one account may spend on the shared gateway and has
**never been driven** — needs concurrent requests, not a model.
`test/tenancy.test.js` is the executable contract for the boundaries; this is
the behaviour under contention.

### 3. The admin panel, swept  *(no model, deliberately deferred)*

Still "later, not now" in the roadmap because it is the operator's surface. Now
cheap: browser-use gives working screenshots, and the density sweep's method
(walk every route in both appearance modes with the in-page contrast audit)
transfers directly.

### 4. Monochrome charts need pattern fills  *(no model, renderer)*

A mono theme carries three or four distinguishable greys; a five-series chart is
unreadable in one. OOXML pattern fills are the real answer. Design scope rather
than a defect, needs nothing external.

### Two decisions that are yours, both still open

- **Browser-level regression coverage.** Unchanged and now more pointed: this
  session's briefing work was verified by driving a real browser, and nothing in
  556 tests would have caught a card that renders but never persists.
  Component-test infrastructure (jsdom + a React renderer) versus a scripted
  browser pass before a release — both would work, they cost very differently.
- **The 19 divider contrast debts.** `tools/contrast-debt.mjs` proves these are
  not a to-do list: twelve cannot be fixed by any token edit (their ink is
  already pure white), and seven more only by making `muted` equal `ink`. They
  are a question about nineteen divider **backgrounds** — the themes' identity.
  The five genuinely payable ones are paid.

### Parked on purpose

`(stretch) Canvas slide-builder` is scope, not a defect. `(stretch) F13 image
search` is **now closed** — it was this feature under its older name.
The **front end** entry's remaining half (the chat view's outline and editing
phases) stays model-blocked: reaching it means generating something.

---

## If a model does become available

The order changes completely and these come first — nothing has been generated
in three sessions.

1. **Generate one deck and read it.** `npm run deckscore <slug>` gives the
   mechanical half; the prose needs a person. **Generate one with
   `imageSupply: auto`** — every image path so far was exercised by injecting
   `[image]` notes into an existing deck by hand, so what has never been seen is
   *how often a real writer emits them and on which types*. If they mostly land
   on 5-and-6-bullet slides, the lossless rule will refuse nearly everything and
   the answer is a new slide type, not a looser rule.
2. **The thinking-mode experiment.** §6 of the CoE guide: reasoning is OFF by
   default and taken per request. Author and critic opt in at `medium` and
   **none of it has ever been run** — verified structurally against a recording
   server, never behaviourally. Same brief with `thinking:` toggled on
   `roles.author`, then compare. `medium` is a guess; the guide recommends
   `xhigh` for long chains.
   **Grep `cloudSpec` before trusting any per-role option** — it builds its own
   spec instead of going through `resolveRole` and has silently dropped these
   before, on exactly the path a hosted deck takes.
3. **Watch the critic loop once.** `--critic` renders every slide, sends the PNG
   to the `critic` role, and hands findings to a fix turn that EDITS THE DECK.
   Built, gated, never watched.
4. **`--upload` research, `report-new`, `deck-from-report`**, and presenter
   assignment with a real team — every deck so far rendered `Presenter: —`.

### Running the gateway's own model here

`docs/LOCAL-MODEL.md` is the full writeup; the pieces are in place but this is
**not** the plan for next session, because standing it up is its own afternoon.

- **Weights downloaded** — `nvidia/Qwen3.6-35B-A3B-NVFP4`, 22 GiB in
  `~/.cache/huggingface`. Same weights and quantisation as the gateway.
- **vLLM installed** — `~/.venvs/vllm-forge`, 0.28.0, torch 2.13+cu130, outside
  the repo so it cannot reach git or the Docker build context.
- **Two measured warnings.** 22 GiB of weights against 23.5 GiB of VRAM, so
  `--cpu-offload-gb` is required rather than optional. And the first start will
  exhaust the machine unless the kernel build is capped — FlashInfer JIT-compiles
  its SM120 kernels from source and took this box from 62 GiB free to **1 GiB**
  in three minutes at load average 28, none of it inference. Use
  `MAX_JOBS=2 NVCC_THREADS=1`, start it when the machine is idle, and watch
  `free -g` rather than CPU.

Wire it in as a **provider**, never through `FORGE_DEV_LOCAL_FALLBACK` — that
switch substitutes a *weaker* model and marks its runs as saying nothing about
quality, which is right for what it is and wrong for this.

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
every start. The real values are gone; the user has confirmed this is fine
while developing.

**Screenshots work through the browser-use plugin, not the in-app pane.** The
Browser pane's own `computer{action:"screenshot"}` times out here; `browser-use`
drives a real Chrome and its screenshots work. It marks the tab it drives with
a 🐴 in the title — that is the harness, not the app. Use `preview_start` to run
the dev server (never Bash), then drive it with browser-use.

**There are several stale `forge.chats.*` localStorage keys** from earlier
sessions' throwaway accounts. Reading "the first one" gives another account's
briefing — this cost real confusion this session, where a card looked like it
was not persisting and was persisting perfectly. Read the key for the account
you are signed in as.

**Two accounts, not one.** Every per-account boundary is invisible from inside
a single session. Mint a session without the signup form:

```js
import { register, startSession } from "./src/auth.js";
await register({ name: "T", email: "t@example.test", password: "..." });
const token = await startSession({ email: "t@example.test" });  // the token itself
// in the browser: localStorage.setItem("forge.token", token); location.reload()
```

---

## Instruments worth reusing

- **Call the API before designing against it.** Two of the four image defects
  were upstream facts no code reading finds (a retired host, an aggregator that
  strips the field you want). The roadmap entry, written from documentation,
  named both as the design. One `curl` each at design time.
- **Prove the check fails on the old code.** The new `test/images.test.js` was
  run against the pre-fix module, which confirmed all three of: seats an image
  on a type that cannot draw it, writes PNG bytes to `.jpg`, records no licence.
  A test written after a fix and never seen red tests nothing.
- **And prove the check fails for the RIGHT reason.** The first fit-gate test
  passed against a completely broken gate, because the fixture had no
  `speaker_note` — the note reserves 0.7in and is what tips the slide over. The
  companion test that stands the gate down (`fitGate: false`) is what makes the
  first one meaningful.
- **Audit against a real deck.** Two bugs appeared only on
  `decks/perovskite-solar-cells-stability-challenges-2` and on no fixture: a
  whole-deck validity gate that refused every supply (real decks arrive
  slightly invalid), and the fit overflow above. Every check takes `--deck`.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.

## Known and not fixed

- **Nothing surfaces `CREDITS.md`** — item 1 above. The licence ladder's
  preference for public domain is what keeps this survivable rather than a
  breach.
- **The fit gate's strictness is unmeasured against real writer output.** It
  refuses a promotion whose slide does not fit on any of the covering eight.
  That is the right rule, but how *often* it refuses depends on the bullet
  lengths a real writer produces, and no model has run. See item 1 of the
  model-available list.
- `feature-grid` is two lines of speaker-note debt on `minimal-muji` — seven
  hundredths of an inch, on a card derived end to end.
- `capstress` reports 17 joint-at-caps fit events. **Not a defect count**:
  `capfit` measures one field with the others at their own scale and converges
  to zero; `capstress` puts every field at its cap at once, which is not a slide
  a model writes.
- The dev box holds **115 throwaway accounts** (this session added
  `imgcheck@example.test`). Harmless now that `config/` is excluded from the
  build context by default; `Admin → Users` is where to look.
- A **public** deck's `assets/` is deliberately NOT gitignored, so auto-supplied
  images in `decks/_public/<slug>/` would be committed. That is intended — a
  showcase deck must render from a clean checkout, and a credit outside the repo
  is a credit lost. `.gitignore` says so; do not widen the rule.
- Existing deck slugs still show the old counter (`...-12`, `...-19`). Nothing
  renames them; the mint changed, not the history.
