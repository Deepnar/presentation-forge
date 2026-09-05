# What is left — production and hosting readiness

Everything still outstanding, in one place. `docs/ROADMAP.md` is the per-feature
plan and history; this is the operational answer to *"what stands between here
and real users?"*, written so the list can be worked through rather than
rediscovered.

Every claim below was checked against the code on the day it was written, not
carried forward from memory. Where something is asserted as broken, the file and
the symptom are named so it can be confirmed in a minute.

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
legal pages. 660 tests, `themematrix` / `drawcheck` / `textcheck` / `capfit`
clean across 34 themes × 74 slide types.

What is left divides into four blockers, a payments track that only matters if
money is involved, a set of journeys nobody has ever run, and a defect list.

---

## 1. The four things that actually block a public launch

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
`providers["tcet-auto"].baseURL` at any OpenAI-compatible endpoint and put its
key in `FORGE_TCET_API_KEY` and Auto works unchanged. The cost is that the
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
- **[x] The free tier's token budget was a third of one deck.** 80,000 against
  a 90-slide week, which is about four 22-slide decks at roughly 244,000 tokens
  each. Harmless only while nothing counted. Now 1,000,000 — four decks, the
  same allowance said in the other unit — and admin-settable.
  **It is an estimate and wants calibrating against a real gateway run before
  anyone is charged against it.** `estimateTokens` in `src/usage.js` has the
  arithmetic written down; replace the constants with measurements.
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

What sits there now, roughly in the order it matters:

| item | needs a model? | needs a decision? |
|---|---|---|
| The front end, and the landing page | no | **yes** |
| Add a slide to a finished deck, written like the others | no | no |
| A turn's grammar is built from every type at once | no | partly |
| "Auto" is bound to one institution's name, not a role | no | no |
| Nothing can test the browser | no | **yes** — see §1.4 |
| Research and content flow, end to end | **yes** | no |
| The full functional sweep | **yes** | no |
| Measuring content quality | **yes** | no |
| Housekeeping found during the audit | no | no |
| (stretch) Canvas slide-builder | no | **yes** |

The launch-blocking items keep their own section above, because "what stops a
stranger using this" is a different question from "what is worth building next"
and this file exists to answer the first one.

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
