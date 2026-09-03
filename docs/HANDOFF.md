# Handoff — 2026-09-03, assume no model; there is non-model work and it is listed

Everything is on `main`. `npm test` is **526 passing**, `npm run themematrix` is
clean across 34 themes (`--notes` holds the two known `feature-grid` entries),
`textcheck` and `drawcheck` are clean, `capfit` reports **zero** unseatable
caps, and the working tree is clean.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. `docs/TRAPS.md` is the cross-cutting failure list and gained
**seventeen** entries this session — it outlives this file and is the most
valuable thing here. `docs/ROADMAP.md` carries every item below as a proper
entry.

---

## Plan for next session: do the non-model work

**The gateway has been down for generation across two full sessions**, and the
working assumption is that it stays down. Do not plan around it answering.

```bash
curl -s -m 90 -w "\nchat %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/chat/completions \
  -H "Authorization: Bearer $FORGE_TCET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6","messages":[{"role":"user","content":"Say ok"}],"max_tokens":4}'
```

`/v1/models` answers 200 in ~0.45s; `/v1/chat/completions` returns nothing in
90s. Health that is not health. Check it once, note the result, move on.

**A correction to what the last handoff claimed.** It said every no-model item
was closed. That was too strong: what is closed is every item that was both
unblocked *and* not deliberately parked. Real non-model work remains, and this
is it, in the order I would take it.

### 1. Image supply — auto, not just upload  *(no model, no decision, unstarted)*

**The one substantial feature available without a model, and it is specified
already.** Today an image only reaches a slide by upload; a slide that *wants*
one gets its description stripped to an `[image]` note. The design is in the
roadmap entry: SearXNG's image category or Unsplash Source, opt-in per deck,
CC licence recorded, cached under `decks/<slug>/assets/auto/`, `resolveAsset`
preferring it. **No model writes a URL** — that rule is the whole point, and
`src/ai/images.js` (`supplyDeckImages`) is the seam it plugs into.

Worth checking before building: `SEARXNG_URL` is already wired for research, so
the image category may need only a query parameter rather than a new backend.

### 2. Rate limits and quotas under real load  *(no model)*

Under *Surfaces nothing has ever run*. `src/limits.js` caps what one account
may spend on the shared gateway and has never been driven — needs concurrent
requests, not a model. `test/tenancy.test.js` is the executable contract for
the boundaries; this is the behaviour under contention.

### 3. The admin panel, swept  *(no model, deliberately deferred)*

The roadmap says *"Later, not now"* because it is the operator's own surface
rather than a user's. It is genuinely doable and now cheap: the browser-use
plugin gives working screenshots (see below), and the density sweep's method —
walk every route in both appearance modes with the in-page contrast audit —
transfers directly. Take it if the two above are done or blocked.

### 4. Monochrome charts need pattern fills  *(no model, renderer)*

A mono theme carries three or four distinguishable greys and no more, so a
chart with five series is unreadable in one. OOXML pattern fills are the real
answer. Design scope rather than a defect, which is why it has sat at low
priority — but it is renderer work and needs nothing external.

### Two decisions that are yours, and both cheap

- **Browser-level regression coverage.** *No model, but needs a direction
  before any code.* Three defects this session existed only in a running
  browser and none was reachable from 526 tests; two were total outages
  (in-app navigation dead, an export button 401 for everyone). Component-test
  infrastructure (jsdom + a React renderer) versus a scripted browser pass run
  before a release — both would have caught all three and they cost very
  different things.
- **The 19 divider contrast debts.** `tools/contrast-debt.mjs` proves these are
  *not* a to-do list: twelve cannot be fixed by any token edit, because their
  ink is already pure white and white does not clear 4.5:1 against those
  grounds; seven more are reachable only by making `muted` the same colour as
  `ink`. They are a question about nineteen divider **backgrounds** — the
  themes' identity. The five that were genuinely payable are paid.

### Parked on purpose, not forgotten

`(stretch) Canvas slide-builder` and `(stretch) CC image search` are scope, not
defects. The **front end** entry still reads "No model" in its header, but what
is left inside it — the chat view's outline and editing phases — can only be
reached by generating something, so it has become model-blocked since the entry
was written.

---

## If a model does become available

Then the order changes completely and these come first, because nothing has
been generated in two sessions:

1. **Generate one deck and read it.** `npm run deckscore <slug>` gives the
   mechanical half; the prose still needs a person.
2. **The thinking-mode experiment.** §6 of the CoE guide: reasoning is OFF by
   default and taken per request. The author and critic roles opt in at
   `medium`, and **none of it has ever been run** — verified structurally
   against a recording server, never behaviourally. Same brief with `thinking:`
   toggled on `roles.author`, then compare. `medium` is a guess; the guide
   recommends `xhigh` for long reasoning chains.
   **Grep `cloudSpec` before trusting any per-role option** — it builds its own
   spec instead of going through `resolveRole` and has silently dropped these
   before, on exactly the path a hosted deck takes.
3. **Watch the critic loop once.** `--critic` renders every slide, sends the PNG
   to the `critic` role, and hands the findings to a fix turn that EDITS THE
   DECK. Built, gated, never watched.
4. **`--upload` research, `report-new`, `deck-from-report`**, and presenter
   assignment with a real team — every deck so far rendered `Presenter: —`.

### Running the gateway's own model here

`docs/LOCAL-MODEL.md` is the full writeup; the pieces are in place but this is
**not** the plan for next session, because standing it up is its own afternoon.

- **Weights downloaded** — `nvidia/Qwen3.6-35B-A3B-NVFP4`, 22 GiB in
  `~/.cache/huggingface`. Same weights, same quantisation as the gateway.
- **vLLM installed** — `~/.venvs/vllm-forge`, 0.28.0, torch 2.13+cu130, outside
  the repo so it cannot reach git or the Docker build context.
- **Two measured warnings.** The weights are 22 GiB against 23.5 GiB of VRAM,
  so `--cpu-offload-gb` is required rather than optional. And the first start
  will exhaust the machine unless the kernel build is capped — FlashInfer
  JIT-compiles its SM120 kernels from source and took this box from 62 GiB free
  to **1 GiB** in three minutes at load average 28, none of it inference. Use
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
Browser pane does not composite here, so `computer{action:"screenshot"}` times
out; `browser-use` drives a real Chrome and its screenshots work. Half this
session's UI findings needed eyes, and I spent hours working blind before
noticing. It marks the tab it drives with a 🐴 in the title — that is the
harness, not the app.

**Two accounts, not one.** Every per-account boundary is invisible from inside
a single session. Mint a session without the signup form:

```js
import { register, startSession } from "./src/auth.js";
await register({ name: "T", email: "t@example.test", password: "..." });
const token = await startSession({ email: "t@example.test" });  // the token itself
// in the browser: localStorage.setItem("forge.token", token); location.reload()
```

---

## What this session did

44 commits, no model involved in any of it.

**Four hosting blockers** — the dev account DB was already shipping into the
Docker image (`.dockerignore` named the *pre-SQLite* account store); an
unconfigured operator identity now reports itself; `uniqueSlug` no longer leaks
other accounts' titles; the report donor is per account.

**The auth flows, run end to end for the first time** — `tools/mailsink.mjs`
plus `npm run dev:mail` is why they could run at all: `mailConfigured()` decides
whether confirmation is *enforced*, so with no SMTP the verification path does
not execute at all. Found the confirm screen reporting a dead link for an
address it had just confirmed.

**The browser UI, driven for the first time** — found that **in-app navigation
had been completely broken for a day**: a second `hashchange` listener plus a
no-dep-array effect meant the `applyHash` listener was removed mid-dispatch, so
every tab, link and the back button changed the URL and nothing else.
`router.js` is pure, unit-tested, and passed throughout.

**The briefing rebuilt** — fifteen walked cards to two forms. Two clicks to a
deck.

**The density sweep** in both appearance modes — dark had never been looked at.
Contrast is clean everywhere; found a *border* token used as ink, and a
thumbnail with no edge in dark that no contrast audit could see.

**The renderer round** — `venn` was overprinting itself with every check clean;
the schema caps moved to what the layouts can seat (114 fit failures to 12,
`capfit` residue 26 to 0); the `tracking` unit bug fixed with a baseline, which
released `matrix` into the landing showcase.

**Two icons that drew the wrong thing**, and a **fonts manifest** whose
`used_by` had drifted on 18 of 27 families while carrying six no theme used.

---

## Instruments worth reusing

- **Prove the check fails on the old code.** `test/buildcontext.test.js`,
  `test/specimen-valid.test.js` and `test/fonts-manifest.test.js` were each run
  against the pre-fix state before being trusted. A test written after a fix
  and never seen red tests nothing.
- **Render both extremes.** `matrix`'s two failures — overprinting at the caps
  and wrapping on the showcase — pull in opposite directions, and a fix aimed
  at one caused the other. Only rendering both located the line.
- **A contact sheet is reliable for structure and not for detail.** `scorecard`
  was called broken from a cell and reads perfectly at full size. Second time
  this has been paid for.
- **Look at dark mode.** It had never been looked at, and the defect there was
  one no contrast audit can see, because a missing edge involves no text.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.

## Known and not fixed

- `feature-grid` is two lines of speaker-note debt on `minimal-muji` — seven
  hundredths of an inch, on a card derived end to end.
- `capstress` reports 17 joint-at-caps fit events. **This is not a defect
  count**: `capfit` measures one field with the others at their own scale and
  converges to zero; `capstress` puts every field at its cap at once, which is
  not a slide a model writes. Driving it to zero would penalise fields that
  were never the problem. Each of the four that appeared after the `tracking`
  fix was rendered and reads correctly.
- The dev box holds **114 throwaway accounts**. Harmless now that `config/` is
  excluded from the build context by default; `Admin → Users` is where to look.
- `decks/perovskite-solar-cells-stability-challenges-2` is the real generated
  deck kept as a fixture. Every check takes `--deck` — use it, because the
  specimen's payloads are hand-written to behave.
- Existing deck slugs still show the old counter (`...-12`, `...-19`). Nothing
  renames them; the mint changed, not the history.
