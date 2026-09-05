# What a deck costs, and what it can be sold for

The operating question behind this file: **if the TCET gateway does not come
back and Auto has to run on a commercial API key somebody pays for, is there a
price a student would pay that also makes money?**

Before the work in §4 the answer was no. After it, yes. That gap — not the
saving — is why the token cost mattered.

**Status: L2 is shipped.** A 22-slide deck went from ~1,616,600 tokens to
~134,600, a measured **12x**. The tables below give both, because the
before-figure is the argument for the after-figure.

Every number here is derived from the code and stated with its arithmetic, so
it can be corrected by measurement rather than re-argued. Nothing in this file
has been measured against a live paid provider yet; §6 says what would settle
it.

**This file is analysis, not a work list.** The work it implies lives in
`docs/ROADMAP.md` — *Selling it: tiers, checkout, and what a refusal offers*,
*Prompt caching, if the numbers still need it*, and *A provider key, so the
money figures stop being derived*.

---

## 1. The finding

**The research excerpt was re-sent on every author call.** *(Fixed in §4 — this
section is the diagnosis, in the past tense, because the numbers it produces
are the argument for the fix.)*

`writeSlide` in `src/ai/generate.js` put `RESEARCH NOTES\n${research}` into the
user message of every single slide call. The cloud excerpt cap
(`config/models.yaml`, `roles.author.transports.cloud.excerpt_chars`) is
**240,000 characters** — about 60,000 tokens. Real `research/notes.md` files on
disk run 126,000 to 594,000 characters, so that cap binds for most decks rather
than being a ceiling nothing reaches.

A 22-slide deck sent that excerpt **26 times**: once per slide, plus the plan,
the field-length pass, the coherence pass and the critic's fix turn.

```
26 calls x (60,000 research + 1,500 overhead)  =  1,599,000 input tokens
22 slides x ~800 output                        =     17,600 output tokens
                                                  ─────────
                                            ~1,616,600 tokens per deck
```

**98.9% of the cost is input, and almost all of that input is the same text
sent again.** The writing is noise beside it: a slide is ~800 tokens out
against ~61,500 in.

This was missed because the first estimate in `src/usage.js` costed the
*writing* — a flat 9,000 tokens per slide, putting a deck at 244,000. That is
six times too low, and it was wrong in the direction that matters: it made the
product look affordable when it is not.

---

## 2. What that costs

Assumptions: ~4 characters per token for English prose; ₹85 to the US dollar;
input-price bands are orders of magnitude rather than quotes for any named
provider — **check current prices before committing to any of them.**

| band | $/1M input | tokens/deck | $/deck | ₹/deck |
|---|---|---|---|---|
| budget | $0.15 | 1,616,600 | $0.24 | ₹20.6 |
| cheap-mid | $0.60 | 1,616,600 | $0.97 | ₹82.4 |
| mid | $3.00 | 1,616,600 | $4.85 | ₹412.2 |

For scale: a print shop near a campus charges ₹50–100 to make a PowerPoint by
hand. At the mid band, producing one deck cost **four times that** in raw
inference. After §4 it costs ₹34.32 — and ₹1.72 at the budget band.

---

## 3. Why this is a business question, not a tuning question

The instinct on seeing a large token number is to lower the free tier. That is
the wrong lever, and the table below is the reason.

**Decks that can safely be included at a given price**, sized so that a user who
burns *100% of their allowance* still leaves a 30% margin — the cap as an
insurance policy rather than a target:

| price | | budget | cheap-mid | mid |
|---|---|---|---|---|
| ₹99 | **before** | 3 | **0** | **0** |
| ₹99 | **now** | **40** | **10** | 2 |
| ₹249 | **before** | 8 | 2 | 0 |
| ₹249 | **now** | **101** | **25** | 5 |

Read the "before" rows. **At the old token cost, ₹99 bought three decks on the
cheapest model available and none at all on anything better.** There was no
student price point that worked, and lowering the free tier would not have
changed that — it only decides who gets refused.

The "now" rows are a product: ten decks a month for ₹99 on a model good enough
to be worth using, or forty on the cheapest one.

**So the cost reduction is not an optimisation. It is the precondition for
charging anything.**

---

## 4. The three levers, and which one was taken

| level | change | tokens/deck | vs before | status |
|---|---|---|---|---|
| **L0** | 240k chars on every call | 1,616,600 | 1.0x | was |
| **L1** | cut `excerpt_chars` for cloud | 368,600 | 4.4x | **rejected** |
| **L2** | send each call only the research it needs | **134,600** | **12x** | **shipped** |

### L1 — lower the cloud excerpt cap *(rejected)*

Recommended here first as a stopgap, then dropped. Attempting it failed
`test/transport.test.js`, which asserts the cloud excerpt is *strictly deeper*
than the local one — a deliberate invariant, written when a cloud model was
chosen because it has the window for more research.

That test was right. Auto is still the free college gateway, so cutting the
excerpt today buys nothing and costs grounding, and L2 makes the cap moot
anyway. A failing test that encodes a real premise is worth more than a
stopgap.

### L2 — retrieve per call *(shipped)*

Send each slide the research that slide needs, rather than all of it. The plan
already says what every slide is about — `spec.purpose`, `spec.section` and the
section label are exactly a retrieval query, and they are already computed.

This is the rare change that is **cheaper and better at the same time**. A model
writing slide 14 currently receives 60,000 tokens of which perhaps 1,500 are
relevant; the rest is distractor. The grounding guard and the coherence pass
both exist to catch failures that this noise contributes to. Less context, more
signal.

Built as BM25 over heading-anchored passages in `src/ai/retrieve.js` — lexical,
deterministic, no dependency and no model. An embedding index would score
better and cannot be justified: it needs a model to build, a store to keep and
an invalidation rule, to improve on a job where query and corpus share a
vocabulary by construction.

**The deck title had to come out of the query, and that was the whole
difference.** Every passage in the corpus shares the title's terms — that is
why the corpus was researched — so including them pulled every slide toward
the same generically-on-topic passages. Measured on the real V2G deck: with
the title, any two slides shared 62% of their top passages and the whole deck
reached 16 of 55; without it, 24% and 36 of 55.

The report writer had the identical defect and took the identical fix, with the
section's focus sentence as its query. References keep the whole corpus, since
that section is drawn from the sources rather than from an argument.

### L3 — prompt caching

Provider-specific (Anthropic, OpenAI and Google all offer it in some form), and
worth roughly 10x on a *stable* prefix, since cached input typically prices near
10% of list.

Note the tension: **caching wants a large identical prefix; retrieval wants a
small variable payload.** They partially cancel. The sensible combination is a
cached stable prefix (system prompt, slide catalogue, theme voice, and a small
shared research core) plus a short retrieved tail per slide.

Do this after L2, and only once a provider is chosen — the wire format differs
per provider and building it blind would be guesswork.

---

## 5. The pricing model that works for both sides

Three properties are wanted at once: low cost to run, real profit on a sale,
and a price that feels trivial to a student. They are not in tension once the
token cost is fixed, because of one fact:

> **The allowance is not the cost. Utilisation is.**

A student writing an IE report needs two to five decks in a semester, not
twenty a month. Sell an allowance that *looks* generous and bound it so that
even a user who exhausts it cannot lose money. Everybody below that line is
margin.

At L2, with the cap set so worst case still returns 30%:

| model band | ₹/deck | cap for ₹99 | median user (25%) | **margin** |
|---|---|---|---|---|
| budget | ₹1.72 | 40 decks | 10 decks | **83%** |
| cheap-mid | ₹6.86 | 10 decks | 3 decks | **79%** |
| mid | ₹34.32 | 2 decks | 1 deck | **65%** |

### The three tiers, concretely

| tier | price | allowance | worst-case cost | worst-case margin |
|---|---|---|---|---|
| **Free** | — | **3 decks, lifetime** | ₹5–21 *once, per signup* | n/a — it is the ad |
| **Starter** | ₹99/mo | 10 decks/mo | ₹17 – ₹69 | 83% / 31% |
| **Pro** | ₹249/mo | 25 decks/mo | ₹43 – ₹172 | 83% / 31% |
| **BYOK** | — | unlimited | ₹0 | n/a |

Two figures per cell because the model band is not settled: the first is the
budget band, the second cheap-mid. At the budget band every tier is comfortable
at any utilisation. At cheap-mid the worst case is 31% and the realistic case
near 80% — still a business, but the allowances are the lever if that feels
thin.

`unlimited` stays in `PLANS` for the operator's own account and for anyone
comped by hand; it is not a sales tier.

Why each side wins:

- **The buyer** pays ₹99 for what looks like far more than they will use, at
  roughly ₹5–7 a deck against three hours of their own evening. Cheaper than
  the print shop and faster than doing it themselves.
- **The operator** carries a worst case that is still profitable, and a median
  case at ~80%. The cap is not a punishment; it is the thing that makes the
  price safe to publish.
- **Neither** is exposed to a surprise, because the meter is real. This model
  is only safe to run because `settleAuto` records what was actually spent —
  a tier priced against an unmeasured allowance is a guess.

### Structural notes

- **Price in decks, not tokens.** A student understands "15 decks". Nobody
  outside this repository has an intuition for a million tokens, and a number
  that cannot be reasoned about reads as a trap.
- **The free tier should be a TRIAL, not an allowance.** Three decks is enough
  to produce something submittable and discover the tool is good, which is the
  conversion event — a free tier that cannot complete one real task converts
  nobody. But it must be three decks *ever*, not three a week. Every quota in
  `src/limits.js` is a rolling window, and a rolling window resets: a user who
  waits gets unlimited decks forever, and the exposure per account cannot be
  budgeted. A lifetime cap is bounded by construction — **₹5–21 per signup,
  once**, against ₹110–439 per user per semester and rising. Twenty-one times
  cheaper, and a number that can be written down in advance, which is what a
  one-person operation actually needs. Keep the rolling windows on top as abuse
  protection; the lifetime cap is what decides what is free.
- **BYOK stays free and unmetered.** A user on their own key costs nothing —
  `isAutoRoute` excuses them before any of this is consulted. It is the
  pressure valve for the heavy user who would otherwise be the loss.
- **A refusal must be a surface.** A 429 already carries the tier and what is
  left of every budget (`app/server/index.js`), and `/api/auto/usage` reports
  the same. Nothing renders it yet. "12 of 12 used" beside a price converts;
  a bare error does not.

---

## 6. What would settle this

Everything above rests on two approximations and one reading of the code:

1. **~4 characters per token.** Real tokenisers vary by 10–20% on technical
   prose. Cheap to check against any provider's token-count endpoint.
2. **The price bands.** Illustrative. Real prices move and differ per model.
3. **26 research-carrying calls per deck.** Read from the code, not observed.

**One real generation through a paid key settles all three at once**, and the
metering built for this reports it directly: `meterSummary()` breaks the total
down per role, so it will say exactly how much went to the author calls and how
much to everything else. Run one 22-slide deck, read the number, and replace
the constants in `src/usage.js` with it.

Until then the constants are conservative in the safe direction — they
over-estimate, so a reservation refuses early rather than overspending.

---

## 7. Recommended order

1. ~~L1~~ — attempted and rejected; see above.
2. ~~L2~~ — **shipped.** 12x measured.
3. **Measure** — one paid run, correct the constants in `src/usage.js`. Still
   the outstanding item, and now the cheapest it will ever be to do.
4. **Then choose the tier numbers**, using the table in §5 against whichever
   provider was actually picked.
5. **Then the refusal surface**, which is the last thing between a working
   meter and a working checkout.
6. **L3, prompt caching**, only if the numbers still need it after a real
   measurement. Retrieval has taken most of what caching would have.

Payments integration itself is a day or two (`PRODUCTION.md` §2.1). The legal
and entity work (§2.2) is the real cost and is unaffected by any of this.
