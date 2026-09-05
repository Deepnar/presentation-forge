# What a deck costs, and what it can be sold for

The operating question behind this file: **if the TCET gateway does not come
back and Auto has to run on a commercial API key somebody pays for, is there a
price a student would pay that also makes money?**

Today the answer is no. After the work in §4 it is comfortably yes. That gap —
not the saving — is why the token cost matters.

Every number here is derived from the code and stated with its arithmetic, so
it can be corrected by measurement rather than re-argued. Nothing in this file
has been measured against a live paid provider yet; §6 says what would settle
it.

---

## 1. The finding

**The research excerpt is re-sent on every author call.**

`writeSlide` in `src/ai/generate.js` puts `RESEARCH NOTES\n${research}` into the
user message of every single slide call. The cloud excerpt cap
(`config/models.yaml`, `roles.author.transports.cloud.excerpt_chars`) is
**240,000 characters** — about 60,000 tokens. Real `research/notes.md` files on
disk run 126,000 to 594,000 characters, so that cap binds for most decks rather
than being a ceiling nothing reaches.

A 22-slide deck sends that excerpt **26 times**: once per slide, plus the plan,
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

For scale: a print shop near a campus charges ₹50–100 to make a
PowerPoint by hand. At the mid band this product currently costs **four times
that** in raw inference to produce one deck.

---

## 3. Why this is a business question, not a tuning question

The instinct on seeing a large token number is to lower the free tier. That is
the wrong lever, and the table below is the reason.

**Decks that can safely be included at a given price**, sized so that a user who
burns *100% of their allowance* still leaves a 30% margin — the cap as an
insurance policy rather than a target:

| price | optimisation | budget | cheap-mid | mid |
|---|---|---|---|---|
| ₹99 | **today** | 3 | **0** | **0** |
| ₹99 | excerpt cut to 48k | 14 | 3 | 0 |
| ₹99 | per-slide retrieval | **56** | **14** | 2 |
| ₹249 | **today** | 8 | 2 | 0 |
| ₹249 | excerpt cut to 48k | 37 | 9 | 1 |
| ₹249 | per-slide retrieval | **142** | **35** | 7 |

Read the first row. **At today's token cost, ₹99 buys three decks on the
cheapest model available and none at all on anything better.** There is no
student price point that works. Lowering the free tier does not change that; it
only decides who gets refused.

The last row is a product. Fourteen decks a month for ₹99, on a model good
enough to be worth using.

**So the cost reduction is not an optimisation. It is the precondition for
charging anything.**

---

## 4. The three levers, in order of what they buy

| level | change | tokens/deck | vs today |
|---|---|---|---|
| **L0** | today — 240k chars on every call | 1,616,600 | 1.0x |
| **L1** | cut `excerpt_chars` for cloud to ~48k | 368,600 | **4.4x** |
| **L2** | send each slide only the research it needs | 95,600 | **16.9x** |

### L1 — lower the cloud excerpt cap

One line in `config/models.yaml`. Immediate, no new code, and it costs
grounding quality: the writer sees less of the research, so a fact that would
have supported a slide may not be in front of it.

Worth doing today as a stopgap. Not the answer.

### L2 — retrieve per slide *(the one to build)*

Send each slide the research that slide needs, rather than all of it. The plan
already says what every slide is about — `spec.purpose`, `spec.section` and the
section label are exactly a retrieval query, and they are already computed.

This is the rare change that is **cheaper and better at the same time**. A model
writing slide 14 currently receives 60,000 tokens of which perhaps 1,500 are
relevant; the rest is distractor. The grounding guard and the coherence pass
both exist to catch failures that this noise contributes to. Less context, more
signal.

It also composes with everything already built: the meter will report exactly
what it saved.

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

| model band | cap for ₹99 | median user (25%) | cost | **margin** |
|---|---|---|---|---|
| budget | 56 decks | 14 decks | ₹17.1 | **83%** |
| cheap-mid | 14 decks | 4 decks | ₹19.5 | **80%** |
| mid | 2 decks | 1 deck | ₹24.4 | **75%** |

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
- **The free tier should finish one assignment.** Three decks is enough to
  produce something submittable and discover the tool is good. That is the
  conversion event; a free tier that cannot complete one real task converts
  nobody.
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

1. **L1 now** — one config line, 4.4x, buys room while L2 is built.
2. **L2 next** — per-slide retrieval. The real fix, and it should improve
   output quality rather than trade against it.
3. **Measure** — one paid run, correct the constants in `src/usage.js`.
4. **Then choose the tier numbers**, using the table in §5 against whichever
   provider was actually picked.
5. **Then the refusal surface**, which is the last thing between a working
   meter and a working checkout.

Payments integration itself is a day or two (`PRODUCTION.md` §2.1). The legal
and entity work (§2.2) is the real cost and is unaffected by any of this.
