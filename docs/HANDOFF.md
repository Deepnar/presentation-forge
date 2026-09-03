# Handoff — 2026-09-03, every no-model item is closed; the gateway decides the rest

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

## The one thing that decides next session

**The TCET gateway is still down for generation.** Checked repeatedly across two
sessions, always the same shape — health that is not health:

```bash
curl -s -o /dev/null -m 20 -w "models %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/models -H "Authorization: Bearer $FORGE_TCET_API_KEY"
curl -s -m 90 -w "\nchat %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/chat/completions \
  -H "Authorization: Bearer $FORGE_TCET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6","messages":[{"role":"user","content":"Say ok"}],"max_tokens":4}'
```

`/v1/models` answers 200 in ~0.45s; `/v1/chat/completions` returns nothing in
90s. **Nothing has been generated in two sessions.**

**This is now the binding constraint on everything left.** Every no-model,
no-decision item in the roadmap is closed. What remains needs either a working
model or an answer from the human — see *What to tackle next*.

---

## The way out: run the gateway's own model here

`docs/LOCAL-MODEL.md` is the full writeup. The state as left:

- **Weights are downloaded** — `nvidia/Qwen3.6-35B-A3B-NVFP4`, 22 GiB in
  `~/.cache/huggingface`. Same weights and same quantisation as the gateway.
- **vLLM is installed** — `~/.venvs/vllm-forge`, vLLM 0.28.0, torch 2.13+cu130,
  outside the repo so it can never reach git or the Docker build context.
- **The GPU is Blackwell (`sm_120`)**, which is why NVFP4 runs here at all
  rather than a GGUF approximation.

**Two things will bite, both measured rather than guessed:**

1. **The weights are 22 GiB against 23.5 GiB of VRAM.** They do not fit with any
   KV cache, so `--cpu-offload-gb` is required, not optional. With 6 GB offloaded
   the load reported 14.2 GiB on device.
2. **The first start will take the machine down if you let it.** FlashInfer
   JIT-compiles its SM120 kernels from source — there are no prebuilt ones in
   the wheel — and unconstrained it took this box from 62 GiB free to **1 GiB**
   in three minutes at load average 28. The model had already loaded; none of
   it was inference. **Cap the build and start it when the machine is idle:**

   ```bash
   MAX_JOBS=2 NVCC_THREADS=1 ~/.venvs/vllm-forge/bin/vllm serve \
     nvidia/Qwen3.6-35B-A3B-NVFP4 --served-model-name qwen3.6 --port 8000 \
     --max-model-len 8192 --kv-cache-dtype fp8 --gpu-memory-utilization 0.92 \
     --cpu-offload-gb 6
   ```

   Watch `free -g`, not CPU. The kernels cache afterwards; this is one-time.

Wire it in as a **provider**, not through `FORGE_DEV_LOCAL_FALLBACK` — the
config block is in `docs/LOCAL-MODEL.md` and needs no code change. The fallback
substitutes a *weaker* model and marks its runs as saying nothing about
quality, which is right for what it is and wrong for this.

---

## Running anything — read this or lose an hour

**This box is hosted** (`config/hosted.json`), and `.env` holds
`FORGE_TCET_API_KEY`, which **pulls the AUTHOR role to the gateway even in
LOCAL mode**. To generate genuinely locally, withhold the key and use a scratch
config:

```bash
SC=/tmp/forge-scratch && mkdir -p $SC && cp config/models.yaml $SC/
cp config/identity.example.yaml $SC/identity.yaml
printf '{"hosted": false}\n' > $SC/hosted.json
FORGE_TCET_API_KEY= FORGE_CONFIG_DIR=$SC npm run forge -- new "<topic>" --max-slides 16
```

**`config/identity.yaml` is the unfilled template** and the boot log says so on
every start. The real values are gone and are the operator's to enter — the
user has confirmed this is fine while developing.

**Screenshots work through the browser-use plugin, not the in-app pane.** The
Browser pane does not composite here, so `computer{action:"screenshot"}` times
out; `browser-use` drives a real Chrome and its screenshots work. Half this
session's UI findings needed eyes. It marks the tab it drives with a 🐴 in the
title — that is the harness, not the app.

---

## What this session did

44 commits. Every remaining no-model, no-decision roadmap item is now closed.

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
the schema caps were moved to what the layouts can seat (114 fit failures to
12, `capfit` residue 26 to 0); the `tracking` unit bug was fixed with a
baseline, which released `matrix` into the landing showcase.

**Two icons that drew the wrong thing** — a gear that was a sun, and a
collapse/expand pair that drew the same arrow.

---

## What to tackle next

Nothing below is blocked on more no-model work. Pick by whether the gateway
answers.

### If the gateway answers (or the local vLLM is up) — do these, in order

1. **Generate one deck and read it.** Nothing has been generated in two
   sessions. `npm run deckscore <slug>` gives the mechanical half; the prose
   still needs reading. This is the single highest-value thing available.
2. **The thinking-mode experiment.** §6 of the CoE guide: reasoning is OFF by
   default and taken per request. The author and critic roles opt in at
   `medium`, and **none of it has ever been run** — it is verified structurally
   against a recording server and never behaviourally. Same brief with
   `thinking:` toggled on `roles.author`, then compare. `medium` is a guess;
   the guide recommends `xhigh` for long reasoning chains.
   **Grep `cloudSpec` before trusting any per-role option** — it builds its own
   spec instead of going through `resolveRole` and has silently dropped these
   before, on exactly the path a hosted deck takes.
3. **Watch the critic loop once.** `--critic` renders every slide, sends the
   PNG to the `critic` role and hands the findings to a fix turn that EDITS THE
   DECK. Built, gated, never watched.
4. **The unexercised entry points** — `--upload` research, `report-new`,
   `deck-from-report`, and presenter assignment with a real team (every deck so
   far rendered `Presenter: —`).

### Two decisions that are yours, and cheap to answer

- **The 19 divider contrast debts.** `tools/contrast-debt.mjs` proves they are
  *not* a to-do list: twelve cannot be fixed by any token edit because their
  ink is already pure white and white does not clear 4.5:1 against those
  grounds, and seven more are reachable only by making `muted` the same colour
  as `ink`. They are a question about nineteen divider **backgrounds** — the
  themes' identity. Five that were genuinely payable are paid.
- **Browser-level regression coverage.** Three defects this session existed only
  in a running browser and none was reachable from 526 tests; two were total.
  Component-test infrastructure (jsdom + a React renderer) versus a scripted
  browser pass before a release — both would have caught all three and they
  cost very different things.

### Still open, needing a model or deliberately deferred

- **The front end** — first pass done and recorded; what is left is the chat
  view's outline and editing phases, which need a model to reach.
- **The admin panel, swept** — deferred on purpose; the operator's own surface.
- **Measuring content quality** — a fixed set of briefs kept as a baseline, and
  the score recorded per generation. Needs the model.
- **A monochrome theme can only carry three or four distinguishable greys.**
  OOXML pattern fills are the real answer. Renderer work, no model, but genuine
  design scope rather than a defect.

---

## Instruments worth reusing

- **Prove the check fails on the old code.** `test/buildcontext.test.js` and
  `test/specimen-valid.test.js` were both run against the pre-fix state before
  being trusted. A test written after a fix and never seen red tests nothing.
- **Render both extremes.** `matrix`'s two failures — overprinting at the caps
  and wrapping on the showcase — pull in opposite directions, and a fix aimed
  at one caused the other. Only rendering both located the line.
- **A contact sheet is reliable for structure and not for detail.** `scorecard`
  was called broken from a cell and reads perfectly at full size. That is the
  second time this has been paid for.
- **Drive two accounts, not one.** Every per-account boundary is invisible from
  inside a single session.
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
