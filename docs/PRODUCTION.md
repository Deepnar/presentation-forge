# What is left — production and hosting readiness

Everything still outstanding, in one place. `docs/ROADMAP.md` is the per-feature
plan and history; this is the operational answer to *"what stands between here
and real users?"*, written so the list can be worked through rather than
rediscovered.

Every claim below was checked against the code on the day it was written, not
carried forward from memory. Where something is asserted as broken, the file and
the symptom are named so it can be confirmed in a minute.

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

### 2.3 Making the limits bind is where the engineering is

`src/limits.js` is a good foundation built for the wrong purpose — fair use on
the operator's key, not billing. The gaps, in the order they bite:

- **Tokens are never recorded.** `recordAutoEvent` accepts a token count and
  every call site passes zero: `reserveAutoOrThrow(email, slides)` in
  `app/server/index.js` has a `tokens = 0` default and not one of its five
  callers supplies it. So `weeklyTokens` (80,000) is a cap nothing can reach.
  **You are billed in tokens and metering in "requests"** — a 24-slide dense
  deck with deep research costs many times a 10-slide sparse one and both count
  as 1. *Nothing can be priced honestly until this is fixed, and it is the first
  thing to do.* It needs no model.
- **No plan or tier.** Every account gets identical caps; the `users` table
  (`src/db.js:39`) has no plan column. Per-plan limits are a small change once
  the settings layer is used.
- **Spend is taken up front and never reconciled.** `reserveAuto` holds the
  budget before the run, which is right — but a failed generation still consumes
  it. For fair use that is fine; for money it is a refund request. Reserve an
  estimate, adjust to actual on completion, which is how metered APIs work.
- **A refusal is a dead end, not a product surface.** A 429 saying "12 of 12
  used" with a Buy button converts; a bare error does not.
- **Keep BYOK as the pressure valve.** A user on their own key costs nothing and
  should not be metered at all — `resolveProviderKey` already works this way.

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

## 4. Open engineering, in priority order

### 4.1 The turn grammar is built from every slide type at once

*High. Chat is affected; the critic path is fixed.*

`buildOpsSchema` assigns every type's properties into one flat object, so a name
two types share belongs to whichever was walked last. Thirteen types declare
`items`; `contact` wins. Twelve property names collide this way (`items`, with
eight distinct element shapes, plus `cards`, `body`, `rows`, `steps`, `events`,
`nodes`, `entries`, `stages`, `columns`, `left`, `right`).

The critic now passes `onlyTypes` and is fixed. **Chat runs through the same
primitive and is not**, and the product vision puts the chat panel at the centre.
Two candidate directions remain (permissive merge, or a type-conditional patch);
the measurement is already in the roadmap entry.

### 4.2 The front-end app sweep

*Highest priority in the roadmap, no model needed.* The landing page was rebuilt
against an agreed direction; the app half — the surfaces you live in rather than
the front door — is what remains.

### 4.3 Measuring content quality so it accumulates

`npm run deckscore` is the deterministic half and exists. What is missing is the
half a number cannot reach: whether the deck ARGUES anything. What would make it
accumulate rather than evaporate —

- a small fixed set of briefs, generated on Auto, kept as a baseline to read
  against, so "the output got worse" is a comparison rather than a memory;
- the score recorded per generation, so a regression shows up as a number before
  anybody notices by eye.

### 4.4 Research and content flow, end to end

*Medium, needs a model.* Standing distrust of both the research pass and the
argument a deck makes. The briefing now steers queries; whether that reaches the
page is unverified.

### 4.5 The full functional sweep

*Medium.* Every function exercised in the running app rather than by unit test —
every theme against every slide type, deck→report, report→deck, speaker scripts.
To be done in one pass rather than piecemeal.

### 4.6 "Auto" is bound to one institution's name, not to a role

*Medium, and it rises the moment this is hosted for anyone outside the college.
No model.* The free tier is the literal id `tcet-auto` and the literal env var
`FORGE_TCET_API_KEY` — `autoProvider()`, the encrypted key row, every default in
`src/limits.js`, and a `kind: "tcet"` that reaches a UI label. Rename to a role
(`auto` / `FORGE_AUTO_API_KEY`), read the old names as fallbacks so no deployment
breaks, and migrate the `global_keys` and `auto_events` rows. Worth doing before
anyone outside the college is invited.

### 4.7 (Stretch) Canvas slide-builder

Long-standing stretch item. Not on the path to launch.

---

## 5. Smaller defects and papercuts

Each is small, real, and has a named symptom.

- **Image progress prints a slide index where a counter belongs** — the supply
  emits `{ index }` (the slide) and the CLI's generic printer renders
  `index + 1 / total`, so a one-image deck logs `images 3/1`.
- **`illustrated-points` with an empty seat leaves the lower half of the slide
  empty**, and the vision critic flags it as `blank`. It is equally true of a
  four-item `bullets` slide, so the question is whether the layout should
  breathe differently when no picture is coming — a decision, not a bug.
- **`looksCutAtCap` false-positives on headlines and labels.** It flags any
  field sitting at its cap without terminal punctuation, but a headline is a
  noun phrase and ends without a full stop by design, so `"$10.9M"` and
  `"Weighing V2G Economics Against Grid Impact"` are sent to the rewrite
  unnecessarily. Harmless, imprecise, wastes a model call.
- **The coherence pass missed three near-identical headlines.** On the V2G deck,
  slides 18, 21 and 22 all said a version of "Scaling V2G Requires Cross-Sector
  Collaboration". Nothing caught it. *The report half of this had a mechanical
  cause and is fixed — its writer was told not to repeat other sections while
  being shown none of them. The deck half is unexamined and may be the same
  shape of problem.*
- **`feature-grid` carries two lines of speaker-note debt on `minimal-muji`** —
  the only failure in the `--notes` sweep.

---

## 6. Known and accepted — not defects

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

## 7. Operational notes for whoever deploys this

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
