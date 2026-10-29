# Everything that is blocked, and what is blocking it

The one place to look before planning a session. If work is not moving, it is
for one of the reasons below, and each names **who or what can unblock it**.

Nothing here is a to-do list — `docs/ROADMAP.md` is. This file answers only
*"why can this not be worked on right now?"*

The following counts describe the original gateway/launch audit. Active V2
resource/service constraints are recorded in §4 and the current evaluation;
this table is not an exhaustive classification of the later V2 roadmap.

Three kinds of blocker, and they are not equally bad:

| kind | meaning | how many |
|---|---|---|
| **External** | outside anyone's control here; wait or route around | 1 |
| **Operator** | one person, one account, usually under an hour | 5 |
| **Decision** | needs a judgement nobody should make unilaterally | 2 |

Consult each active `docs/ROADMAP.md` entry for its actual dependencies rather
than assuming every engineering item is covered by those historical blockers.

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

### 2.5 No repository funding destination

**Blocks:** the GitHub funding button and `.github/FUNDING.yml` roadmap item.

`github.com/sponsors/Deepnar` currently redirects to the ordinary profile, so
the account is not GitHub Sponsors-enabled. No verified Ko-fi, Buy Me a Coffee,
Open Collective, Patreon or custom funding URL has been supplied either. The
operator must choose and activate one destination; only then can the repository
point at it without creating a broken or misleading payment link.

---

## 3. Decisions — nobody should make these alone

### Current V2 state: J6-1 accepted; browser-export implementation approved

Human approved bounded J4 on2026-10-28; exact source665cd04 is independently
[accepted](reviews/V2-8J-4-665cd04.json) on2026-10-29. Selected41/41, typecheck0,
independent2/2 and exact owned-fixture cleanup are complete. No J4 validation,
review or service blocker remains. [Evaluation](V2-8J-4-EVAL.md) retains failures,
corrections and scope limits. Later direction/authority lives only in
[the roadmap](ROADMAP.md#assistant-search-source-integrity).

[J5 copy](V2-8J-5-PLAN.md) received scoped human direction on2026-10-29 after
independent readiness. Exact implementationf6487737 is independently accepted
after complete focused validation, new review challenges and verified owned
cleanup; no J5 blocker remains. Exact active scope/status lives in the
[roadmap](ROADMAP.md#assistant-citation-project-copy) and state; no decision blocker
remains for this bounded slice.

J6-1 notes-only export is independently [accepted](reviews/V2-8J-6-1-ecf82d3f.json)
at ecf82d3f after human direction, focused33/33, independent2/2, finaltypecheck0,
305/0audit and verified cleanup. No validation/review/service blocker remains.
[Evaluation](V2-8J-6-1-EVAL.md) preserves the corrected empty-scope defect, fixture
failures and portable/print limits. Later scope and direction live only in the
[roadmap](ROADMAP.md#assistant-citation-native-presentation).

The [J6-2 browser export contract](ROADMAP.md#assistant-citation-browser-export)
is independently ready at063e46d2 from accepted J6-1; all five technical review
findings are resolved. Human continuation after the concrete question approved scoped implementation
on2026-10-29. No direction/service blocker remains for that scope; independent
implementation acceptance is pending.

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

### 3.3 ~~The front end, and the landing page~~ — not blocked

**Struck.** A direction WAS agreed and it covers the app sweep as well as the
landing page — the roadmap entry records it verbatim: *"Landing first, then a
full app sweep."* Treating the app half as direction-gated was a
misreading, and it kept the item off three sessions' lists for no reason.

What is left there is a polish pass with no named defects, re-scoped off
HIGHEST, and it needs a walk rather than a decision.

The one genuinely blocked piece is the **refusal as an offer**, and it waits on
§3.2 rather than on any question of taste: where a 429 becomes a Buy button and
what it says depends on whether a purchase is credits or a subscription, and on
there being a checkout to point at. The half that needed neither — the usage
panel showing the trial and how much of it is spent — is built.

## 4. Historical closed audit (before the V2 program)

The following older audit work was completed; this is not a statement that all
current roadmap work is blocked:

- Housekeeping found during the audit — every item struck through
- The coherence pass's repetition blindness — it was never looking; now computed
- `looksCutAtCap` — a headline is not a truncated sentence
- The image progress counter, and six status frames the UI could not label
- The `Auto` rename off one institution's name
- Adding a slide to a finished deck, written by the writer rather than by chat
- The lifetime trial, and the score recorded per generation
- `feature-grid`'s note debt, *diagnosed* — a 1pt gap on a deliberately compact
  theme rather than the 2pt a misreported floor claimed

V2-8I-1 is independently accepted at5170adc with complete required validation and
231/231independent repeats/typecheck. Exact owned-service cleanup saved/fsynced an
actual0catalog before its single stop; exact-ID absence and5544refusal are independently
verified. Earlier resource holds remain historical. There is no remaining I1
validation/review/cleanup blocker. [The roadmap](ROADMAP.md#assistant-surface-integration)
owns future scope; acceptance does not authorize dependent implementation.

V2-8I-2 is independently accepted at58662ec with complete required validation,
313primary+4native independent successful repeats and typecheck. Its owned service
was removed after saved/fsynced actual0projectDBs; bounded exact-ID absence and5544
refusal were independently verified. There is no remaining I2 validation/review/
cleanup blocker. [The current evaluation](V2-8I-2-EVAL.md) records exact evidence
and limitations; dependent scope remains only in the linked roadmap entry.

I3's admission-only hold and cancelled first browser attempt are historical. Full
validation passed all9gates/3048primary+4distinct native cases/119images, with actual
PostgreSQL and unchanged quiet thresholds. Separate exact-source
[ACCEPT](reviews/V2-8I-3-2ba82cb.json) accepts2ba82cb; exact-owned cleanup and fresh
independent verification are complete. There is no remaining I3 validation/review/
cleanup blocker. [The evaluation](V2-8I-3-EVAL.md) retains helper/resource chronology,
standing locale and inherited limitations. Dependent scope remains gated in the
roadmap; acceptance supplies no implementation/deployment authority.

The active V2 task is recorded in `docs/development-state.json` and
`docs/ROADMAP.md` §12. For V2-7A a quiet shared-machine
window was obtained and all required validation executed against the isolated
Forge service. Independent review accepted corrected source `fe749fb`; the owned
service was stopped after review. See `docs/V2-7A-EVAL.md` for execution,
measurements and known limits. V2-7B-1 conversion/creation was approved on
2026-10-15 and independently accepted on 2026-10-16; the explicit browser
handoff is independently accepted at `03cc89e` in
[the roadmap](ROADMAP.md#v2-7b-2-plan). Its isolated restore-test timeout remains
a recorded validation followup, not a proven product regression; the owned
review service has been removed after checks. Review status/baseline are indexed
in development-state.json. V2-7C-1 covers are independently accepted at `f79ae07`;
all required validation executed and its isolated service was removed after
review. See [the evaluation](V2-7C-1-EVAL.md). C2 discovery is independently
accepted at `bf1bd8f`; its validation and review executed with the owned service.
After the interrupted session's host restart, the auto-remove/tmpfs container
was already absent; cleanup observations and the unavailable pre-removal database
count are explicit in [the C2 evaluation](V2-7C-2-EVAL.md). Current state indexes
acceptance. No constraint or green test authorizes another milestone.

The approved V2-8A headless foundation is now independently accepted atd4f446c;
see [evaluation](V2-8A-EVAL.md) and state. All required checks executed. The isolated
service was removed after a saved0-database observation and closed5544probe.
Acceptance authorizes planning only; later scope and standing limits remain in
the roadmap. The explicit original-PPTX provenance limitation is not a new product
blocker or a claim of recovered archives.

The approved V2-8B durable run core is independently accepted at1fb39ff; see
[evaluation](V2-8B-EVAL.md), [decision](reviews/V2-8B-1fb39ff.md) and state.
All required validation executed. Owned PostgreSQL cleanup saved/fsynced the
zero-database observation before removal and verified5544closed. This historical
execution does not turn unavailable future PostgreSQL checks into passes. Later
scope and inherited limitations remain in the roadmap.

The approved V2-8C provider exchange boundary is independently accepted at
`e41d509`; [evaluation](V2-8C-EVAL.md) and [decision](reviews/V2-8C-e41d509.md)
record no blocking findings and complete required execution. Current owned
PostgreSQL cleanup saved/fsynced zero project databases before removal and verified
port 5544 closed. The earlier reboot-lost service count remains unavailable.
Live-provider quality was outside this contract, not a passing fixture claim;
later scope and inherited limits remain in the [roadmap](ROADMAP.md#v2-8-remaining).

V2-8D preparation/explicit queueing is independently accepted at8c1e5c4; its
[evaluation](V2-8D-EVAL.md) and [decision](reviews/V2-8D-8c1e5c4.json) report complete
required execution and no blocking finding. The owned service was removed after a
saved/fsynced zero-project-database observation and verified5544closure. The earlier
readiness-placeholder skip remains archived with unknown original cause; complete
34-case rerun and independent execution passed. Remaining live qualification and
hosted proposal-lifetime scope stay in the [roadmap](ROADMAP.md#v2-8-remaining).

V2-8E bounded tool-conversation preparation is independently accepted atc71d65e;
[evaluation](V2-8E-EVAL.md) and [decision](reviews/V2-8E-c71d65e.json) record complete
required execution and no blocking finding. Exact owned-service cleanup saved/fsynced
actual0project databases and verified removal/5544closure. The inherited native
identity limitation and remaining parent scope stay in the
[roadmap](ROADMAP.md#native-pptx-shape-id-uniqueness).

V2-8F shared web-search boundary is independently accepted at `0cab854`;
[evaluation](V2-8F-EVAL.md) and [decision](reviews/V2-8F-0cab854.json) record complete
required execution and no blocking finding. Exact owned-service cleanup saved/fsynced
a fresh actual zero-project-database observation and verified removal/5544 closure.
Remaining [parent scope](ROADMAP.md#v2-8-remaining) stays in the roadmap. The
[older model-stream risk](ROADMAP.md#model-provider-stream-resource-bounds) is now
resolved by independently accepted V2-8G source `f3e784a`; [evaluation](V2-8G-EVAL.md)
records complete required validation and the separate standing limitations. Its
owned service was removed after saved/fsynced zero-project-database observation
and exact-ID/port-closure verification. Acceptance adds no feature authorization.

Two are worth naming because they look like engineering and are not:

- **The turn grammar's unscoped case** (options 2 and 3). The selection-scoped
  half is shipped and covers the common path. What is left changes the SHAPE of
  a decoding grammar — an `anyOf` union or a discriminated `oneOf` — and this
  module's history is a list of grammars that die silently rather than loudly.
  It needs a model to run against, so it is blocked by §2.1 rather than by
  anybody's judgement.
- **`feature-grid`'s remaining note debt.** Closing it means either cutting the
  `body` cap for all 34 themes or changing card geometry for one. That is a
  trade-off, not a fix, so it is §3 — a decision — and a small one.

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


I4's critical-CPU resource hold is resolved by fresh180.701second quiet
requalification and unchanged full5Kretry9/9,0fail/skip/cancelled. The original
7pass/1timeout/1unfinished attempt remains retained. The later completed validation
and acceptance are recorded below; these earlier requirements are historical, not
current blockers. See [the evaluation](V2-8I-4-EVAL.md) and
[roadmap](ROADMAP.md#assistant-work-discovery).

I4 is independently accepted at8378a20 after completed source validation and
30/30focused independent repeats. The formerly owned backend is absent/5544refused,
independently verified; pre-removal count/cause remain unavailable. The decision
explicitly accepts that operational provenance limit for source correctness and
does not certify cleanup. Current independent PG replay remains unexecuted; no
service recreation or additional broad run is required. No ongoing I4 product/
validation/review blocker remains. [Evaluation](V2-8I-4-EVAL.md) preserves the gap;
[roadmap](ROADMAP.md#assistant-surface-integration) owns future gated scope.

I5 is independently accepted at5cf5b5c with four focused gates complete (32new
runtime tests and typecheck),36affected governance cases and3new independent
challenges passing. No ongoing I5 validation/review blocker or persistent service
exists. The Auto-only bridge remains disabled; live-provider use and activation
are unexecuted. [Evaluation](V2-8I-5-EVAL.md) records bounded acceptance;
[the roadmap](ROADMAP.md#assistant-surface-integration) owns later gated scope.


I6 is independently accepted at dce5628: required26/26, affected governance37/37,
typecheck0 and independent3/3 new challenges. No ongoing I6 validation/review or
service blocker remains. [Evaluation](V2-8I-6-EVAL.md) retains the finite-hint,
progress, close and offline limits. Later interface/progress direction is in
[the roadmap](ROADMAP.md#assistant-surface-integration), not approval for activation.

I7 exact target wake is independently accepted at3da0801: required33/33,
selected governance4/4, typecheck0 and new independent2/2. No ongoing I7 source/
validation/review blocker or owned service remains. Its initial SQLite wait's
cause remains unresolved, explicitly accepted for default-off source without live
latency qualification. [Evaluation](V2-8I-7-EVAL.md) retains all prior attempts and
scope limits; [the roadmap](ROADMAP.md#assistant-surface-integration) alone owns
later interface/fairness/activation decisions. No production activation follows.


I8 source b9c2d20 is independently accepted: selected product26/26, governance4/4,
typecheck0 and independent3/3. No ongoing I8 validation/review blocker remains. No missing backend/model execution blocks this offline/default-
off slice. [Evaluation](V2-8I-8-EVAL.md) exposes selected-case browser evidence and
provenance limits. Scope/remaining authority is solely in
[the roadmap](ROADMAP.md#assistant-visible-editor).


J1 is independently accepted atf161901 with selected153/153, typecheck0 and
independent2/2 passing. No J1 source/validation/review or owned-service blocker
remains. [Evaluation](V2-8J-1-EVAL.md) preserves the first unresolved integration
timeout, compiler-transcription and external API-lifecycle limits. Research remains
headless with ephemeral sources; public activation and durable source/data policy
are outside acceptance. Later scope/authority is solely in
[the roadmap](ROADMAP.md#assistant-search-source-integrity).


J2 is independently [accepted](reviews/V2-8J-2-6d51cd4.json) at6d51cd4 after
human-approved private snippet retention/clear/delete implementation. Selected57/57,
typecheck0 and independent2/2 pass; no J2 validation/review or owned-service blocker
remains. [Evaluation](V2-8J-2-EVAL.md) retains the corrected failures, capture
applicability and inherited lock-wait/erasure/provenance limits. No model run or
production activation follows acceptance. Later scope/authority is solely in
[the roadmap](ROADMAP.md#assistant-search-source-integrity).


J3 is independently [accepted](reviews/V2-8J-3-edda5ec.json) atedda5ec after
human-approved read-only foundation implementation. Required50/50 plusselected
governance2/2, independent2/2 and typecheck0 pass. No J3 validation/review or owned-
service blocker remains; actual0 catalog was saved before exact-ID removal and
private-credential deletion, with independent absence verification.
[Evaluation](V2-8J-3-EVAL.md) retains preparation errors, source applicability,
lock-wait/locator limits and exclusions. All later scope/authority is solely in
[the roadmap](ROADMAP.md#assistant-search-source-integrity).
