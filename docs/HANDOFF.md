# Handoff — 2026-09-02, hosting blockers closed; the content half is next

Everything is on `origin/main`. `npm test` is 422 passing, `npm run themematrix`
is clean across 34 themes, the working tree is clean.

**Start here.** `AGENTS.md` is the working agreement and has a **new section —
*Which model to judge the product by***; read it before running anything.
`CLAUDE.md` is the operational map. `docs/ARCHITECTURE.md` gained three
sections this session. `docs/TRAPS.md` holds the cross-cutting failure modes
and outlives this file. This file is only what those do not say.

---

## The one thing that will decide next session

**The TCET gateway is down for generation, and it fails in a shape that looks
like health.** Check it first, before planning anything:

```bash
curl -s -o /dev/null -m 20 -w "models %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/models -H "Authorization: Bearer $FORGE_TCET_API_KEY"
curl -s -m 90 -w "\nchat %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/chat/completions \
  -H "Authorization: Bearer $FORGE_TCET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6","messages":[{"role":"user","content":"Say ok"}],"max_tokens":4}'
```

As of the last check: `/v1/models` answers **200 in 0.68s**, `/v1/chat/completions`
returns **nothing in 90s** (HTTP 524 from Cloudflare at ~125s). Streaming does
not help; both the configured id `qwen3.6` and the served id
`/home/user1/models/Qwen3.6-35B-A3B-NVFP4-Fast` hang identically. The API front
is up and the vLLM box behind it is not. Nothing in this repo can fix it.

- **Gateway up →** do the content items below on Auto, as `AGENTS.md` says.
- **Gateway down →** local Ollama is for *exercising* the pipeline only, never
  for judging output quality. Read the rule in `AGENTS.md`; it is written down
  precisely so this does not get fudged.

**Also verify once the gateway is back:** `config/models.yaml` declares
`tcet-auto.models: [qwen3.6]`, but `/v1/models` reports the id as
`/home/user1/models/Qwen3.6-35B-A3B-NVFP4-Fast`. Both hang right now so it is
untested whether the short alias is actually accepted. If it is not, hosted
generation fails even against a healthy server.

## Running anything locally — read this or waste an hour

**This machine is flipped to hosted.** `config/hosted.json` has
`"hosted": true` (set 2026-08-23). In hosted mode `resolveRole` never looks at
installed models: every role goes to the gateway, and when the gateway has no
key it **falls through to whatever BYOK provider holds one**. On this box that
is `opencode-go` in `config/local.yaml` — the agent's subscription per
`AGENTS.md`, not the product's budget.

So a plain `chat()` here silently ran `deepseek-v4-flash`. To actually test on
local, flip the box first (Admin → System → "Switch to local", or edit
`config/hosted.json`) and confirm with:

```bash
node -e 'const {roleAudit}=await import("./src/ai/ollama.js");console.log(await roleAudit())'
```

It answers `hosted — roles resolve through the gateway or BYOK, not local
models` while hosted, and lists the four roles once it is not. All four
configured models **are** installed; the roadmap entry claiming otherwise was
stale and is now closed.

---

## What to tackle next

1. **`docs/ROADMAP.md` → "Reports — structure, and the wait"** — marked `[~]`.
   The wait half is done and measured (16.9s → 6.7s). The structure half is
   untouched: whether the report says anything worth reading. **Needs the
   gateway.** This is the natural next item and the one the direction change
   was about.
2. **"Research and content flow, end to end"** — needs a model. Whether the
   briefing actually steers the research and whether the research reaches the
   page. The plumbing half can be exercised on local; the judgement half cannot.
3. **"The full functional sweep"** — every function exercised in the running
   app. Reset, confirmation, the four project pages and the report split all
   landed this session and want a real pass over them.
4. **"The admin panel, swept"** — new entry, no model needed. Three panels were
   added to that page this session and nothing on it had ever been reviewed.
   Good gateway-down work.
5. **§10 "Every theme against every slide type"** and **"The visual audit, at
   schema caps"** — no model, both still open, both are looking rather than
   building.

## What was done this session

**Hosting blockers — closed.** Password reset and address confirmation, single-
use tokens stored as SHA-256, `#/reset/<token>` and `#/verify/<token>` screens
above the auth gate. A completed reset kills every session for the account.
`forgot` answers identically whatever the truth is, and dispatches rather than
awaits the send so a real address is not measurably slower than an unknown one.
The verification gate is default-deny by method at the workspace entrance
(`verifiedRequestOnly` in `src/auth.js`) — reading free, changing gated, DELETE
open. It sits there rather than on the Auto tier because routing resolves per
request and falls back, so a per-provider gate leaks.

**The deck workspace — closed.** It is a project of four pages now: `Deck ·
Report · Research · Script`, plain links under the title, routes not tabs.
Report and Research were thinner copies of views that were already routed, so
`DeckDetail` lost ~350 lines. The header carries one action chosen by stage, and
none while the run banner is up.

**Model roles — closed.** `roleAudit()` surfaces substitutions that were
recorded and never read.

**Reports, the wait — halved.** See the roadmap entry for the measurements.

**Four "healthy-looking box" defects, all the same shape.** A missing report
donor, absent SMTP, a substituted model, and a dead gateway all used to show
green or nothing. All four now report at boot and on Admin → System.

## Traps this session paid for

All four are in `docs/TRAPS.md`. The two that will bite again soonest:

**`app.use("/api/x/:param")` shadows every literal route registered after it.**
`POST /api/decks/search` was dead for every non-admin for months — admins pass
the ownership check that shadows it, so the operator's own box worked. Fixed,
with the first HTTP-level test in the suite (`test/routing.test.js`), because
route order is not reachable from a unit test.

**A hover-revealed control is absent on a phone, not hidden.**
`matchMedia("(hover: hover)")` is false on touch, so the per-slide toolbar's
Edit/Punch/Swap were unreachable and the slide editor could not be opened at
all.

Also: a module-level `const` reading `process.env` defeats a seam that sets it
(`src/db.js`'s test seam had never once worked), and identical function
preambles make a whole-file replace land twice.

## Instruments worth reusing

- **CDP screenshots.** The Browser pane cannot composite while hidden, so drive
  Chrome with `--remote-debugging-port` (Node 24 has a global `WebSocket`).
  Two gotchas: `/json/new` needs a **PUT**, and setting `localStorage` then
  reloading kills the evaluation mid-flight — seed the token on the origin
  *before* navigating.
- **A local SMTP sink** (~40 lines, `node:net`) plus a launch config with
  `FORGE_SMTP_*` and scratch `FORGE_CONFIG_DIR`/`FORGE_DECKS_DIR` is how the
  reset and confirmation flows were driven end to end. Scratch dirs keep test
  accounts out of the dev `config/forge.db`, which already holds 100+.
- **The API serves `app/web/dist`**, so `npx vite build` once and the whole app
  runs on ONE port with no Vite proxy — also how production runs, and it dodges
  another chat's dev server on 5173/5174.
- Admin tab labels are lowercase with CSS `capitalize`; clicking "System" from
  a script finds nothing, the text is `system`.

## Known and not fixed

- **The fitter's `tracking` unit bug** — unchanged, still wants its own round
  against a fresh `themematrix --save` baseline.
- **`venn`'s caps are too generous** — §10.
- **`feature-grid`** is two lines of speaker-note debt on `minimal-muji`.
- **`matrix` is held out of the landing showcase** until the tracking bug is fixed.
- `config/identity.yaml` on this machine reads `institution.name: HACKED`.
- The dev account store holds 100+ throwaway accounts and must not reach
  production. Nothing was added to it this session — everything ran against
  scratch config dirs.
- `decks/electrochemical-impedance-spectroscopy-for-l` is the real-content
  fixture. Every check takes `--deck`; use it.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.
