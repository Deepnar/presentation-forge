# Handoff — 2026-09-04, a model at last: the first deck generated and read

Everything is on `main`. `npm test` is **618 passing**, `npm run themematrix` is
clean across 34 themes, and the working tree is clean. `textcheck`, `drawcheck`
and `capfit` were not re-run: nothing this session touched a theme, a layout, a
cap or the fitter, and the clean matrix is the evidence for that.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map. `docs/TRAPS.md` is the cross-cutting failure list and gained
three entries; it outlives this file. `docs/ROADMAP.md` carries every item below.

---

## The gateway is wedged, and the model runs here instead

**Do not spend time on the gateway.** Probed every way it can be probed:

| Probe | Result |
|---|---|
| `/v1/models` | 200 in 0.47s |
| Bad API key | **401 in 0.43s** — the auth layer is alive |
| `/v1/completions`, `/v1/responses` | **404** — they do not exist on this deployment |
| Exact served model id, streaming, thinking flags | hang |
| **Malformed body** `{"nonsense":true}` | **hangs 20s** |

That last row is the diagnosis. A merely BUSY server rejects garbage instantly
with a 400 — it never reaches the model. Hanging on garbage means requests are
forwarded to a backend that is **wedged, not queued**. No request shape gets
through; only the CoE operators can fix it. (The served id has changed to
`…-NVFP4-Fast`, so somebody is redeploying it.)

**It does not matter any more.** `ollama pull qwen3.6:35b-a3b` gives the same
family and shape the gateway serves — 35.5B, 3B-active MoE, 4-bit — and
`config/models.yaml` now points author, research and critic at it. It declares
vision and thinking, so it covers all three roles.

```bash
SC=/tmp/forge-local && mkdir -p $SC && cp config/models.yaml $SC/
cp config/identity.example.yaml $SC/identity.yaml
printf '{"hosted": false}\n' > $SC/hosted.json && echo '{"settings":{}}' > $SC/runtime.json
FORGE_TCET_API_KEY= FORGE_HOSTED=0 FORGE_CONFIG_DIR=$SC npm run forge -- new "<topic>" --research --images
```

**`docs/LOCAL-MODEL.md`'s vLLM route is abandoned, and should stay abandoned.**
22 GiB of weights against a *laptop* 5090 already holding 4 GiB means mandatory
`--cpu-offload-gb`, and FlashInfer's SM120 JIT compiles with `nproc` (24)
parallel `nvcc` jobs at 2-4 GB each — ~72 GB against 62 GB of RAM whose **only
swap is zram**, which is compressed RAM with no disk to spill to. That is a hard
freeze, and it is what happened. Ollama needs none of it: **184 tok/s, 100% GPU,
68°C at 146 W of a 150 W cap.**

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

### The admin panel, swept

Driven in a real browser, both modes, every tab. **Three things it stated were
untrue**: Storage counted `out/deck.pptx` alone and read 23.8 MB on a box
holding 79; "Model calls" was the exact misreading `src/limits.js` warns about
in its own header, and Analytics called the same number "requests"; and
`weeklyTokens` is a cap nothing can reach, because no call site records a token
count.

**Two deployment blind spots**: `FORGE_SWEEP_DAYS` and `FORGE_OPEN_REGISTRATION`
appeared on no screen, so a box keeps every deck forever and nothing said so;
and `pruneAutoEvents()` was written when the table was added and **never called
from anywhere**.

**The page was slowest when it mattered** — `autoHealth`'s cache covered every
case but a cold one, so the first load after a restart awaited the full probe:
20.6s, on the page an operator opens when the gateway is down. Now 0.10s.

**And the missing verb**: the operator's vocabulary was find, promote, delete.
Each account's spend against its cap is now visible, and an account can be
zeroed — a quota is a cost control, not a punishment.

### Operating settings, changeable from the panel

The sweep made the controls visible, which invites the question of why they
cannot be changed. `src/runtime.js` now owns retention, signup and the spend
caps; they apply on the next request with no restart, and the sweep tick is
scheduled unconditionally and reads its setting when it fires (it used to be
armed only if the env var was set AT BOOT, so turning retention on at runtime
would have scheduled nothing).

**The precedence runs opposite ways on purpose, and this is the thing to know:**

| | Wins | Why |
|---|---|---|
| Operating settings | **stored** over env | a setting that cannot change at runtime is the problem being solved |
| Secrets (gateway key) | **env** over stored | a key rotated in the deployment must beat one typed in months ago |

Every value names its source and flags one shadowing an env var, because a
stored override means editing your compose file and redeploying will not change
it. **Reset** hands it back.

The gateway key can now be stored from the panel, **write-only** — nothing
returns a key to the browser, the status carries only the last four characters,
and it refuses when `FORGE_KEY_PEPPER` is unset (which it is on this box) rather
than encrypting under a constant published in this repository.

### Bulk account cleanup

Built with the shape agreed: a dry run that returns the **whole list** rather
than a count, groups every spared account by why, and hands back a token bound
to that exact **set** — so a signup or a new deck between preview and confirm
invalidates it and the list must be read again. The typed phrase carries the
count.

Four vetoes the caller cannot switch off: admins, whoever is signed in, anyone
who owns a deck, anyone who has generated; plus a seven-day floor that may only
be raised. The deck rule matters because `deleteUserAccount` does **not** remove
decks — they would keep an owner that no longer exists and sit on the volume
invisible to everyone.

**Run on this box**: 116 accounts to 6 (4 admins, 2 under a week old), all 16
deck folders intact, **zero orphaned decks**, foreign keys clean.

It left exactly one thing behind, which is how the next fix was found: a
per-account identity file keyed by a hash of a deleted email. Brand marks and
the report donor were in the same position and are the larger leak.
`deleteUserAccount` now removes all three — the cascade list says what the
*database* reclaims, not what the *feature* owns.

### Chart colours

Opened as "monochrome charts need pattern fills". **The premise was stale** —
that entry was written when charts borrowed the UI palette; `src/chartpalette.js`
fixed it, and the one monochrome theme in 34 now authors its own chromatic chart
colours. There was no monochrome chart to fix.

Measuring found the real defect, and it is only reachable through a **pie**,
whose colours come from its uncapped `categories` while `series` is capped at
four. A declared palette was cycled, so an eight-slice pie on
`high-contrast-mono` drew slices 7 and 8 in the colours of 1 and 2 — **8
identical pairs across the gallery**. The derived ramp maximised hue gap and
alternated lightness by parity, drawing two greens at ΔE 6.

Now: wrapped entries shift value and keep the author's hue, and the picker
searches hue and lightness scored on CIE76 distance. Worst distance anywhere
**0.0 → 13.1**, zero identical pairs, rendered and looked at.

**Pattern fills were not built.** pptxgenjs 4.0.1 has no `pattFill` at all, so it
means post-processing chart XML inside the `.pptx` — real work for a premise
that no longer exists. It is a genuine *accessibility* idea (greyscale print,
colour-vision deficiency) and wants its own entry if desired.

### The first deck in four sessions, and what reading it found

**83/100.** A real thesis ("A Technical Audit, Not a Hype Cycle"), a coherent
three-part arc, 100% varied, 90% grounded, a takeaway that makes a claim. **The
prose is good.** Three defects came out of reading it:

- **A chart whose categories and series disagree in length makes the entire
  `.pptx` unopenable.** Not the chart — LibreOffice refuses the file and the
  only symptom is "source file could not be loaded". `writeFile()` succeeds, so
  every check was clean. Two bad charts cost twenty good slides. Fixed: the
  renderer reconciles towards the data (a blank label costs a tick mark, a
  dropped value changes what the chart says) and `analyzeQuality` reports it.
- **Three of twenty slides had no headline**, rendering as a tall empty band
  above stretched content. `headline` was required on 15 types and optional on
  57; it is now required on every content type, and the ops grammar inherits it.
- **Research returned 16 junk sources out of 21.** Not fixed — item 1 below.

Fixing the first one also exposed two scoring bugs: the render reported the
disagreement per theme, so a 34-theme sweep counted 68 fit failures and
`deckscore` read the deck's fit at 0% when four elements actually missed; and
`deckscore` scored the finding under `varied`, dropping a perfectly varied deck
to 50%.

---

## Plan for next session

### 1. Research relevance — 16 of 21 sources were not about the topic

*No model needed. The largest quality defect the first real deck exposed.*

The corpus for a solid-state battery deck held Wikipedia's **"India"** (31,107
words) and **"History of India"** (28,946), four Microsoft *"How to get help in
Windows"* pages, a **Minecraft "Lithium" mod**, and **drugs.com** and **Mayo
Clinic** on lithium the medication. Five of twenty-one were about batteries.

The queries are fine — one reasonable angle query, *"India solid state battery
policy framework"*, matched the country article on "India" alone. **The problem
is that nothing between the search results and `notes.md` asks whether a page is
about the topic**: `absorb` in `src/ai/research.js` filters on `item.ok`, URL
dedupe and a per-host cap, full stop.

Already measured on the real pages, so the design is settled — **use density,
not presence**. Wikipedia "India" contains 5 of the 7 topic terms (a presence
rule passes it) at **0.44 hits per 1000 words**, against Wikipedia "Solid-state
battery" at **35.55**. An 80x margin; a floor near 1.0/1000 drops the junk with
room to spare. Derive the terms from the brief so the code stays topic-agnostic.

### 2. The image-seating question, now answerable  *(a model is available)*

`--images` ran and supplied **nothing**: every `[image]` note landed on a type
that cannot carry one without losing content. That is one deck and not yet an
answer — but the question the last three handoffs could not ask is now one
generation away. If real notes keep landing on 5- and 6-bullet slides, the
answer is a new slide type, not a looser rule.

### 3. The thinking experiment and the critic loop  *(a model is available)*

Both were model-blocked and are not any more. `qwen3.6:35b-a3b` declares
thinking AND vision, so `roles.author.thinking` can be toggled and compared, and
`--critic` can finally be watched sending slide PNGs to a model that can read
them. **Grep `cloudSpec` before trusting any per-role option** — it builds its
own spec instead of going through `resolveRole` and has silently dropped these.

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

Start it with `setsid` from a detached subshell, or the tool call that launches
it takes the shell down with it.

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
- The dev box now holds **6 accounts** (4 admins). The 110 throwaway ones were
  removed through `Admin → Users → Clean up stale accounts`.
- `decks/solid-state-batteries-for-electric-vehicles` is the first deck this
  project generated end to end. Keep it: its research corpus is the evidence for
  item 1 and its charts are the fixture for the length bug.
- `decks/.specimen-cache` is **608 MB** of dev artefact. Harmless, and not what
  the admin Storage card counts, but it dominates any `du` of `decks/`.
- `decks/perovskite-solar-cells-stability-challenges-2` is the real generated
  deck kept as a fixture. Every check takes `--deck` — use it, because the
  specimen's payloads are hand-written to behave.
