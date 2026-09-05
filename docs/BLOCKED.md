# Everything that is blocked, and what is blocking it

The one place to look before planning a session. If work is not moving, it is
for one of the reasons below, and each names **who or what can unblock it**.

Nothing here is a to-do list — `docs/ROADMAP.md` is. This file answers only
*"why can this not be worked on right now?"*

Three kinds of blocker, and they are not equally bad:

| kind | meaning | how many |
|---|---|---|
| **External** | outside anyone's control here; wait or route around | 1 |
| **Operator** | one person, one account, usually under an hour | 4 |
| **Decision** | needs a judgement nobody should make unilaterally | 3 |

---

## 1. External

### 1.1 The TCET gateway is down

**Blocks:** every question about whether the OUTPUT is any good.

`/v1/models` answers in under a second while `/v1/chat/completions` times out —
including on a malformed body, which is how you know it is forwarding to a dead
backend rather than queueing. Re-probed 2026-09-05: 0.7s and a 90s timeout
respectively. Unchanged.

**Why it blocks so much.** Hosted is what ships and Auto is what a hosted user
gets, so Auto's output *is* the product's quality. A local model can exercise
the pipeline — does research reach the page, does resume work, does the report
render — and can never answer whether the writing is good. A local answer to
that question is worse than no answer, because it reads like one.

**Route around it:** a commercial API key (§2.1). Nothing in the code binds to
this gateway — point `providers.auto.baseURL` at any OpenAI-compatible endpoint
and it works unchanged.

---

## 2. Operator — things only you can do

### 2.1 No provider API key *(the big one)*

**Blocks:** report content quality, chat and convert turns through the UI,
`--upload` research, research-to-page flow, **and every money figure in
`docs/ECONOMICS.md`.**

Those figures rest on three approximations: ~4 characters per token,
illustrative price bands, and a count of research-carrying calls read from the
source rather than observed. **One 22-slide generation settles all three at
once** — `meterSummary()` breaks the total down per role, so it reports exactly
where the tokens went.

It is also now the cheapest it will ever be: per-slide retrieval took a deck
from ~1.6M tokens to ~135K, so the measurement run costs roughly a rupee at the
budget band.

**Status:** expected, but not immediately. Nothing should be planned around
having one this week, and **no price should be published against a derived
figure.**

### 2.2 No SMTP credentials

**Blocks:** password reset and address confirmation end to end — and now the
free trial's integrity.

SMTP is how the app sends mail. It cannot send by itself; it logs in to a
mail service. Five values in `.env`:

```
FORGE_SMTP_HOST   FORGE_SMTP_PORT   FORGE_SMTP_USER   FORGE_SMTP_PASS   FORGE_SMTP_FROM
```

Free tiers that are ample: Brevo (~300/day), Resend (~3,000/month), Amazon SES.
About fifteen minutes.

**Why it got more important.** `mailConfigured()` decides both whether mail is
sent and whether confirmation is *enforced*. With no SMTP every account is
verified on creation — so with a lifetime trial, making a new account is the
way around it. Confirmation is the cheapest real deterrent, which moves this
from a launch nicety to part of the trial's design.

### 2.3 No domain

**Blocks:** TLS, and eventually a payment gateway, which will want a real one.

Not blocking development. A free subdomain gets Caddy issuing certificates for
testing; a `.in` or `.xyz` is ₹100–800/year and is what you want before taking
money.

### 2.4 No host provisioned

**Not really blocked — the answer is already in the repo.**
`docs/DEPLOY.md` covers Oracle Cloud Always Free (ARM Ampere), and
`docker/Dockerfile` already builds for arm64 for exactly that reason. Current
allowance is 2 OCPU / 12 GB + 200 GB; this needs about 2 GB.

Two things to expect: ARM capacity is often exhausted, so "out of capacity" on
creation is normal — retry, or pick a quieter region **at signup**, because the
home region cannot be changed afterwards. And an idle Always Free account can
be reclaimed; this app with a healthcheck is not idle. If ARM will not come
free, Hetzner CX22 is about €4/month.

---

## 3. Decisions — nobody should make these alone

### 3.1 Browser regression coverage

**Blocks:** `Nothing can test the browser` in the roadmap.

Three total outages have shipped that existed only in a running browser and
were reachable from no test: in-app navigation dead, an export button 401 for
everyone, a confirm screen spending its token twice. Two made a whole surface
inert. Nothing prevents a fourth.

- **Component tests** — jsdom plus a React test renderer. A real dependency, a
  second test command, a body of test code with its own upkeep. Catches
  regressions per commit.
- **A scripted browser pass** — drive the surfaces that matter before a
  release. Would have caught all three, needs no new dependency, and the
  tooling is already used to find them.

*Recommended: the scripted pass.* Cheaper, and it catches the class of failure
that actually shipped.

### 3.2 Subscription or credits

**Blocks:** naming the paid tiers, and therefore the checkout.

Same money, different shape. ₹99/month for 10 decks is predictable revenue, but
a student who needs nothing in September pays anyway and churns. ₹99 for 10
non-expiring credits matches how they actually work — nothing for two months,
four decks in exam week — and converts better, at the cost of lumpy revenue you
cannot forecast.

*Leaning: credits*, because the usage is bursty and a subscription somebody
forgets to cancel is how you earn refund requests on a campus where everyone
knows each other.

### 3.3 The front end, and the landing page

**Blocks:** the app sweep, and the refusal surface that sits inside it.

The roadmap entry says to agree direction before building, because it changes
what a surface IS rather than whether it works.

One piece of it is *not* a taste question and could be split out: **the refusal
surface.** The data already exists — a 429 carries the tier and what is left of
every budget, and `/api/auto/usage` reports the same including the trial — and
nothing renders it. "12 of 12 used" beside a price converts; a bare error does
not.

---

## 4. Not blocked — available right now

For contrast, so this file is not read as "everything is stuck". All of these
need no model, no key and no decision:

- Housekeeping found during the audit
- The coherence pass's deck half — check what it is actually given before
  assuming the comparison is at fault
- `feature-grid`'s remaining note debt on `minimal-muji` — now correctly
  reported as a 1pt gap on a deliberately compact theme rather than a 2pt one
- The turn grammar's unscoped case (options 2 and 3), though those change the
  SHAPE of a decoding grammar and should not land without a model to run them
  against — which makes them *partly* blocked by §2.1

---

## 5. What is NOT a blocker, so nobody looks for one

- **Local Ollama being busy.** It exercises the pipeline and is never evidence
  about quality, so its absence blocks nothing that was not already blocked by
  §1.1.
- **The gateway's own model running locally.** `docs/LOCAL-MODEL.md`'s vLLM
  route is abandoned deliberately — 22 GB of weights against a laptop 5090
  forces CPU offload and FlashInfer's SM120 JIT compiles with 24 parallel nvcc
  jobs at 2–4 GB each. That is a hard freeze, and it happened.
- **Payments integration.** A day or two of code. What is slow is the entity
  and KYC question, which is §2 of `docs/PRODUCTION.md` and is paperwork, not
  engineering.
