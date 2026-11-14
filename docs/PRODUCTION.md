# Production and hosting readiness

This is the operational answer to *"what stands between here and real users?"*.
`docs/ROADMAP.md` remains the only work list and per-feature history.

Every claim below was checked against the code on the day it was written, not
carried forward from memory. Where something is asserted as broken, the file and
the symptom are named so it can be confirmed in a minute.

**Blocked on something?** `docs/BLOCKED.md` is the single list of blockers and
who can clear each one.

**Two launches, now explicitly separated.** The self-hosted repository is
public and released as
[`v0.1.0`](https://github.com/Deepnar/presentation-forge/releases/tag/v0.1.0).
It needs neither a domain nor operator-funded model access: a user runs the
private Docker bundle and chooses BYOK or host Ollama. The blockers in this
document apply to an operator-run, internet-facing multi-user service and its
possible paid tiers. They do not make the downloadable release unfinished.

**How this file relates to the others.** `docs/ROADMAP.md` is the single list
of work items and the only place a new one should be written. This file is the
standing answer to *what stops real users*, `docs/ECONOMICS.md` to *what it
costs and what it can be sold for*, `docs/ARCHITECTURE.md` to *how it is built*
and `docs/TRAPS.md` to *what has bitten before*. Anything forward-looking that
turns up while reading them belongs in the roadmap.

**Where this actually stands.** The hard infrastructure is done and is not the
problem. Accounts, sessions, email verification and password reset; per-account
decks, identity, brand marks, report donor and BYOK keys with
`test/tenancy.test.js` as the executable contract; an admin panel that reports
what is broken and can change the operating settings without a restart; atomic
spend limits; a Docker deployment with a TLS profile and documented backups;
legal pages; the automated test suite, `themematrix` / `drawcheck` / `textcheck` / `capfit`
clean across 34 themes × 74 slide types.

What is left divides into four blockers, a payments track that only matters if
money is involved, a set of journeys nobody has ever run, and a defect list.

---

## 0. Every way it ships, and what each still needs

Written 2026-11-14 at the owner's request. Three shapes, one codebase: the
**hosted website**, **plugins** inside other assistants, and **self-hosting**.
The work items themselves are in the roadmap (linked); this is the map.

### 0.1 The hosted website

**Who supplies the model.** Two modes, and only one is built:

| Mode | State | What the user sees |
|---|---|---|
| **Bring your own key** | the launch path | Connects OpenAI, OpenRouter, Anthropic, Gemini or any OpenAI-compatible endpoint once ([F10](ROADMAP.md#finish-line)); every deck is billed to their key. |
| **We provide the model** | **coming — not built** | A visible "Forge model — coming soon" choice beside BYOK, with no checkout, no plan and no price. Payments, credits, metering-for-billing and the legal side (§2) stay unbuilt until the owner decides it is time; it will take a long while to settle. |

BYOK today: OpenAI and OpenCode Go are configured; OpenRouter is a commented
template; Anthropic and Gemini have OpenAI-compatible endpoints but no tested
preset. Per-account keys, resolution and limits exist (`resolveProviderKey`,
`src/limits.js`).

**Work before strangers can use it** (the rest of this document, in order):

1. The finish line's core items: F7 reports in the project, F9 hosted
   lifecycle (Postgres default, the decks directory's lifetime, the V2
   container), then F5/F6/F10 as one front-end pass.
2. One AI connection with tested Anthropic, Gemini and OpenRouter presets,
   and the "coming soon" provided-model card (F10).
3. Operator items that no code removes: SMTP, a domain and TLS, a host
   (`BLOCKED.md` §2).
4. A scripted browser pass over the main journeys before release (§1.4),
   and the journeys nobody has run (§3) driven once on a real key.
5. Abuse and cost controls for an open signup on someone else's key:
   per-account limits already bind; add upload size/rate caps per account
   and an export rate limit (exports render server-side).

### 0.2 Plugins — ChatGPT, Claude, Gemini and local clients

**One MCP server serves all of them.** Checked 2026-11-14: ChatGPT apps are
built on MCP (OpenAI's Apps SDK) and are added by the URL of a public `/mcp`
endpoint, with a directory listing after OpenAI review and identity
verification; Claude takes the same remote MCP server as a custom connector
(any user, by URL) or, after Anthropic's review, from its Connectors
Directory — it wants OAuth 2.0, tool safety annotations, a privacy policy,
documentation and an icon; Gemini CLI extensions are a manifest that points
at an MCP server. Whether the consumer Gemini app takes third-party MCP
servers could not be confirmed — re-check when the work starts.

The point of this route: **the host's model writes the content and ours
does not run**, so a plugin user costs the operator compile, render and
storage only — no model bill, no BYOK key. That makes it the cheapest
public surface there is. Work ([F12](ROADMAP.md#finish-line)):

- an MCP endpoint on the API (`/mcp`, streamable HTTP) exposing the same
  tools the Assistant uses plus create/import/export, as an adapter over
  `packages/tools` — never a second agent;
- OAuth 2.1 on the account system (authorization server metadata, dynamic
  client registration, consent screen), since both directories require it
  for private data;
- exports delivered as short-lived signed download links;
- for ChatGPT, optionally an inline widget showing slide thumbnails;
- per-host listing material: privacy policy, docs page, icon, review.

### 0.3 Self-hosting — every combination

Self-hosting needs no domain and no operator money. The axes are
independent; this is what each value needs and how far it is proven.

| Axis | Values | State |
|---|---|---|
| Install | Docker bundle (app + SearXNG + optional Caddy) · bare Node for development | Docker bundle released for V1 (`v0.1.0`); **the V2 image is F9 work** (V2 routes, editor build, Postgres option) |
| Model | BYOK cloud key · local Ollama · any local OpenAI-compatible server (vLLM, LM Studio, llama.cpp) · mixed per role | All four wired; Ollama is the tested local path; a local OpenAI-compatible server works but has no tested preset; the gateway's own model under vLLM is abandoned on a 24 GB laptop (§5) |
| Storage | SQLite on a volume · PostgreSQL | Both pass the same contract suite; SQLite is the single-box default |
| Users | just me (registration off) · a small group | A group needs SMTP for verification and resets; without it accounts verify on creation |
| Network | localhost · LAN · public with domain + TLS | Caddy profile exists; public needs the operator items |
| Research | SearXNG sidecar · none (your own files only) | Both work; with none, research is uploads and project files |
| Plugins | Claude Desktop / Claude Code / Gemini CLI / Cursor to a local MCP · ChatGPT | Local clients can reach `localhost` (stdio or HTTP); **ChatGPT needs a public HTTPS URL**, so a self-hoster wanting it needs a tunnel or a domain |

Every combination of those runs the same code; what is *untested* is
recorded in the roadmap under F9 so a self-hoster is told before they find
out. The combinations worth testing as named profiles: **solo laptop**
(Docker, Ollama, SQLite, localhost, no SearXNG), **lab server** (Docker,
BYOK or LAN model server, Postgres, LAN, SMTP), and **public self-host**
(Docker, BYOK, Postgres, Caddy + domain, SMTP).

---

## 1. The four things that block an operator-hosted public launch

### 1.1 A model you can serve — the only real blocker

The TCET CoE gateway is wedged (`/v1/models` answers in under a second while
`/v1/chat/completions` hangs, including on a malformed body, which is how you
know it is forwarding to a dead backend rather than queueing). Re-probed
2026-09-05: `/v1/models` in 0.7s, a two-token completion still timing out at
90s. Unchanged. A 22 GB model on
the developer's laptop is not a hosting story.

Three honest options, and the middle one is cheapest by a distance:

| Option | Cost | Notes |
|---|---|---|
| The gateway comes back | none | Outside our control. Do not plan around it. |
| **BYOK only** | **none per deck** | Every user brings their own OpenAI/OpenRouter key. `resolveProviderKey` and Settings → Cloud already exist. Removes billing entirely. |
| Pay a hosted API and charge | see §2 | Four to six weeks, and most of it is not code. |

**Nothing in the code binds you to TCET.** Point
`providers.auto.baseURL` at any OpenAI-compatible endpoint and put its key in
`FORGE_AUTO_API_KEY` and Auto works unchanged. The cost is that the
config then names one institution while serving another — see §5.5.

### 1.2 SMTP

Without it there is no password reset, and `DEPLOY.md` is explicit: configure it
before inviting anybody. `mailConfigured()` decides both whether mail is sent and
whether confirmation is *enforced*, so with no SMTP accounts are verified on
creation and those flows never run. **An hour of work, not a project.**

### 1.3 A domain and TLS

The Caddy profile exists in `docker/docker-compose.app.yml` and wants a domain
pointed at it. Also an hour.

### 1.4 Browser regression coverage — *needs a direction agreed first*

Three total outages have shipped that existed only in a running browser and were
reachable from no test: in-app navigation dead, an export button 401 for
everyone, a confirm screen spending its token twice. Two of the three made a
whole surface inert. Nothing prevents a fourth.

The roadmap says explicitly to agree the direction before building either:

- **Component tests** (jsdom + a React test renderer) — a real dependency, a
  second test command, and a body of test code with its own upkeep.
- **A scripted browser pass** over the surfaces that matter, run before a
  release rather than per commit. Would have caught all three, needs no new
  dependency, and the tooling is already used to find them.

*Recommendation: the scripted pass.* It is the one worth taking before launch
rather than after.

---

## 2. If money is involved: payments, and making the limits bind

Three separate difficulties, and **the technical one is the smallest.**

### 2.1 The integration is easy — a day or two

Razorpay or Stripe: create an order server-side, run their checkout, verify the
webhook signature, mark the account. The app already has accounts, an
admin-gated settings layer and a per-account key store, so there is a clean
place to hang all of it.

### 2.2 The legal side is the real cost, and it is not code

In India: a registered entity or an individual with PAN, bank account and KYC;
GST registration and remittance once turnover crosses the threshold; a published
refund policy, terms and privacy policy — Razorpay checks these during
activation, and `Legal.jsx` is a start. Days to weeks of paperwork.

**Settle the entity question first.** Taking money in a personal account for
something carrying a college's name is a problem to solve before writing any
code.

### 2.3 Making the limits bind — mostly done

`src/limits.js` was a good foundation built for the wrong purpose — fair use on
the operator's key, not billing. The metering half is now built; what is left is
the surface that sells against it, and a calibration run.

- **[x] Tokens are recorded.** `src/usage.js` is an async-local meter, attached
  in the same middleware as the account; `chat()` adds every call's
  `promptCount`/`evalCount` to it. Those numbers were never missing — the
  gateway reports `usage.prompt_tokens`, Ollama reports `prompt_eval_count` —
  they were discarded by every caller above. **You were billed in tokens and
  metering in "requests"**; you are now metering in tokens.
- **[x] Four routes spent with no quota check at all.** Found while wiring the
  meter: `report/generate` (the whole graded report), `script` (one model call
  per slide), `sweep` (rewrites every slide), and `generate/resume` +
  `finalize` (the rest of a plan, then the field-length, coherence, image and
  critic passes). All metered now.
- **[x] Plans and tiers.** `users.plan`, and `PLANS` in `src/limits.js`. The
  admin settings define FREE — unchanged from what every account already got —
  and a paid tier is a multiple of it. Budgets scale; window length and
  slides-per-deck do not, because those are the shape of one piece of work
  rather than an allowance. `POST /api/admin/users/:email/plan`, admin-gated
  and asserted so over HTTP.
- **[x] Spend is reconciled.** `reserveAuto` still holds an estimate before the
  run — it must, or concurrent requests all read an unspent budget — and
  `settleAuto` replaces it with the measured total, including when the run
  failed or was stopped. A generation settles its own reservation because it
  outlives the request that started it.
- **[x] The old token caps contradicted the slide allowance in both directions.**
  80,000 was too small for even one deck; 1,000,000 was too large for the
  stated four-deck week. The shipped defaults are now 550,000 tokens per week
  (about four ~135,000-token decks) and a 420,000-token lifetime free trial
  (about three). They remain estimates until one provider-backed run replaces
  the constants in `src/usage.js` with measurements.
- **A refusal is still a dead end in the UI.** The data is there now — a 429
  carries the tier and what is left of each budget, and `/api/auto/usage`
  reports the same so it can be seen coming — but nothing renders it. A 429
  saying "12 of 12 used" with a Buy button converts; a bare error does not.
  *This is front-end work and is what remains of this item.*
- **Keep BYOK as the pressure valve.** A user on their own key costs nothing and
  should not be metered at all — `resolveProviderKey` already works this way,
  and `isAutoRoute` decides it before any of the above is consulted.

**What actually makes people pay** is not enforcement, it is a free tier that is
genuinely useful and bounded exactly where a real user needs more. The current
defaults — 12 runs per 5 hours, 30 a week, 45 slides — are already about "a few
decks a week", which is close to right for a student product.

### 2.4 The honest estimate

BYOK-only is roughly **a week of evenings**: SMTP, a domain, and a pass over the
unexercised journeys below. The paid path is **four to six weeks on top**, and
most of it is paperwork.

---

## 3. Surfaces nobody has ever run

The answer to "does the product work?" is not knowable while these are
unexercised. Every session that has driven one of these has found defects in it,
without exception.

| Journey | Status |
|---|---|
| **`report-new`** — standalone report from a brief | machinery driven; **no model run** |
| **`deck-from-report`** — companion deck from a report | machinery driven; **no model run** |
| **`--upload` research** — a user's file as the only source | **zero runs** |
| Chat turns through the UI | zero runs (needs a model) |
| Convert / slide-type swap through the UI | zero runs (needs a model) |
| The browser UI against a real deck | done — found 2 defects, one total |
| Auth flows end to end | done — found 1 defect |
| Presenter assignment with a real team | done — **no defect** |
| Rate limits under real load | done — the expected race did not reproduce |
| The vision critic loop | done — found 2 defects |

**The report is the highest-stakes item on this list.** It is the *graded*
artefact — the thing a student is actually marked on — and it runs through the
same model and grammar machinery that produced five separate "the right answer
was unrepresentable" defects in one session.

Its machinery has now been driven end to end with no model available:
`generateReport` against the real donor with a stub that obeys every bound it
is handed, through `renderReport`, to a `.docx` read back with
`pdftotext -layout`. That found **four more defects of the same family** — see
*The report's structure* in `ROADMAP.md` — including one that had already
shipped: a team of four or fewer got a report with no body section at all, and
`report-new`, solo by construction, could produce nothing else.

What is verified: the section list is read from the donor template, a
topic-specific section survives planning and renders in the right position, the
two-pass TOC page numbers are exact on every section, and the whole chain
brief → plan → write → assemble → validate → render holds together.

**What remains is the only part a stub cannot answer: whether what the model
writes into those sections is any good.** That needs Auto. Read the artefact
back — do not assert on `report.yaml`.

---

## 4. Open engineering, and every other work item

**They live in `docs/ROADMAP.md`, not here.** That file is the single list of
work — planned, in progress and done, with the reasoning and the `Learned.`
blocks — and this section used to be a second copy of part of it, which meant
two places to update and one of them always stale.

The launch-blocking context remains in the sections above because "what stops a
stranger using this" is a different question from "what is worth building
next". The current work, its order and each completion record are only in
[`ROADMAP.md`](ROADMAP.md).

## 5. Known and accepted — not defects

Recorded so nobody spends an afternoon rediscovering them.

- **`capstress` reports 17 joint-at-caps fit events.** Not a defect count:
  `capfit` measures one field with the others at their own scale and converges
  to zero, while `capstress` puts every field at its cap at once, which is not a
  slide a model writes.
- **`flickr` is excluded from the report's citable set**, which also excludes the
  genuine government photostreams it hosts. Named in `src/credits.js`; the
  denylist fails open on purpose.
- **A low auto-image fill rate is intended.** A wrong picture ships on a
  submitted deck; a refused one leaves a seat that renders as an ordinary list.
  The relevance floor is set to refuse.
- **`decks/.specimen-cache` is ~608 MB** of dev artefact. Harmless, not what the
  admin Storage card counts, but it dominates any `du` of `decks/`.
- **`decks/perovskite-solar-cells-stability-challenges-2`** predates `headline`
  being required on every content type, so it needs three headlines added before
  it will render. Still the fixture the checks' `--deck` flag wants.
- **`docs/LOCAL-MODEL.md`'s vLLM route is abandoned and should stay abandoned.**
  22 GB of weights against a laptop 5090 forces `--cpu-offload-gb`, and
  FlashInfer's SM120 JIT compiles with 24 parallel `nvcc` jobs at 2-4 GB each —
  ~72 GB against 62 GB of RAM whose only swap is zram. That is a hard freeze,
  and it is what happened.

---

## 6. Operational notes for whoever deploys this

- **The workload is not serverless-compatible.** Generation is a multi-minute
  SSE stream, rendering shells out to LibreOffice and Chrome, and state is a
  local SQLite file plus a deck directory tree. It needs a long-running
  container with a writable disk. Porting the UI to Next.js changes none of it.
- **Fonts are load-bearing and fail silently.** The build stage runs
  `tools/install-fonts.mjs` and the runtime stage runs `fc-cache` and asserts
  `fc-match "Inter"` resolves. Without the fonts every server-side render uses
  substituted type and the `.pptx` still looks fine, so nothing tells you.
- **The report donor is not in the build context.** `FORGE_REFERENCE_DIR` points
  it at the volume and an admin uploads it at runtime via
  `POST /api/admin/donor`. Reports cannot render without one.
- **Storage is dominated by preview PNGs.** A deck with previews runs 5-15 MB.
  That is the sizing driver for any deployment.
- **`FORGE_SWEEP_DAYS` and `FORGE_OPEN_REGISTRATION` are admin-settable at
  runtime** and win over the env var, deliberately — a setting that cannot
  change without a redeploy was the problem being solved. Secrets run the other
  way: env beats stored, so a rotated key wins.
- **A local model needs `think` sent explicitly.** A thinking-capable model
  reasons by default, so a role that does not declare thinking must be told
  `think: false` or it reasons on every call — measured at 27s against 3s for
  the research role.
