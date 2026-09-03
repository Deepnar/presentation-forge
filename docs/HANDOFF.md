# Handoff — 2026-09-03, blockers, auth and the UI; the gateway is still down

Everything is on `main`. `npm test` is **516 passing**, `npm run themematrix` is
clean across 34 themes, the working tree is clean.

**Start here.** `AGENTS.md` is the working agreement. `CLAUDE.md` is the
operational map and carries the gateway's specification. `docs/TRAPS.md` gained
nine entries this session and outlives this file. `docs/ROADMAP.md` carries
every item below as a proper entry; this file is the order I would take them in.

---

## The one thing that will decide next session

**The TCET gateway is still down for generation**, and still fails in a shape
that looks like health. Checked twice this session, six hours apart, unchanged:

```bash
curl -s -o /dev/null -m 20 -w "models %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/models -H "Authorization: Bearer $FORGE_TCET_API_KEY"
curl -s -m 90 -w "\nchat %{http_code} %{time_total}s\n" \
  https://ai.tcetcercd.in/v1/chat/completions \
  -H "Authorization: Bearer $FORGE_TCET_API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"qwen3.6","messages":[{"role":"user","content":"Say ok"}],"max_tokens":4}'
```

`/v1/models` answers 200 in ~0.45s. `/v1/chat/completions` returns nothing in
90s. **Nothing was generated this session** — the work below needed no model,
which is why it was the work.

`FORGE_DEV_LOCAL_FALLBACK=1` exists for exactly this. Read the section in
`CLAUDE.md`: off by default, env-only, and a fallback run tells you nothing
about quality.

---

## Running anything — read this or lose an hour

**This box is flipped to hosted** (`config/hosted.json`), and `.env` holds
`FORGE_TCET_API_KEY`, which **pulls the AUTHOR role to the gateway even in
LOCAL mode** — `auto` resolves to the gateway whenever a key exists. To
generate genuinely locally, withhold the key and use a scratch config:

```bash
SC=/tmp/forge-scratch && mkdir -p $SC && cp config/models.yaml $SC/
cp config/identity.example.yaml $SC/identity.yaml
printf '{"hosted": false}\n' > $SC/hosted.json

FORGE_TCET_API_KEY= FORGE_CONFIG_DIR=$SC \
  npm run forge -- new "<topic>" --max-slides 16 --density dense --research
```

**`config/identity.yaml` on this box is now the unfilled template.** It read
`institution.name: HACKED` and the real values were gone — not in git (the file
is gitignored), not in any deck's `meta.yaml`. The boot log and Admin → System
now say so on every start until it is filled in. **That is one thing this
session could not do for you: the real institution name, short form, department
and guide.** Settings → Identity, per account, is the place.

---

## What this session did

**The four hosting blockers, all of them.** Roadmap entry *Hosting blockers —
what a stranger hits* is ticked with a Learned block. Three of the four were
worse than filed, for the same reason each time: each began as a
single-operator design, grew a per-account version, and left the original
behind as the silent default.

- **The dev account database was already shipping into the Docker image.**
  Filed as housekeeping — "must not travel to production". It was travelling.
  `.dockerignore` excluded `config/users.json` and `config/sessions.json`, the
  account store from *before* the SQLite migration, and named nothing about
  `config/forge.db` (accounts, password hashes, the encrypted BYOK vault, Auto
  usage) or `config/uploads/` (users' own research documents). Both reached the
  image through `COPY config ./config`. No symptom: `FORGE_CONFIG_DIR` points
  at the volume so `/app/config` is never read — but an image layer is readable
  by anyone who pulls it. `config/` is now deny-by-default with the two
  committed templates re-included by name, and `test/buildcontext.test.js`
  implements enough of docker's matching to hold it. It fails on the old file
  with `config/forge.db would be copied into the image`.
- **An unconfigured operator identity is now a reported state.**
  `identityStatus()` (`src/ai/identity.js`) answers missing / template /
  incomplete / ok on `donorStatus`'s model, read by the boot log and Admin →
  System, never fatal. `incomplete` is structural rather than a list of suspect
  values — a file naming an institution with no short form and no department
  was abandoned half-written whatever the name says, which is what catches
  `HACKED` without pretending to recognise it.
- **`uniqueSlug` no longer reads other accounts.** The `-2`, `-4` counter ran
  against the one flat `decks/` namespace, so asking for a title another
  account held reported how many strangers had it — the suffixes on this box
  reach `-19`. An owned deck now gets an opaque four-character token
  **whether or not anything collided**, because a suffix applied only on
  collision still answers the question one bit at a time. Ownerless decks keep
  the readable counter: no second account to leak to, and `decks/<topic>` is
  what every sweep and `--deck` flag refers to.
- **The report donor is per account** — the last of identity / brand / donor to
  get there. `donorDirForDeck(deckDir)` resolves it from the deck's own owner,
  so no caller threads a user through and an admin rendering somebody else's
  report still draws it on theirs. An account uploads its own under Settings →
  Identity → Report template; anyone who uploads nothing falls through to the
  operator's default.

**All four were driven, not just tested.** Two throwaway accounts on the dev
box: A uploaded a template, B still saw the operator's default, both UI states
rendered correctly, delete fell back, a non-`.docx` was refused without
destroying the stored one. The accounts and `reference/users/` were removed
afterwards. **A per-account boundary is invisible from inside one account** —
that is now a TRAPS entry.

**Then the browser UI**, driven against a real deck for the first time. It
found that **in-app navigation had been completely broken since `c1dab18` the
day before** — the commit that added the reset/verify screens added a second
hashchange listener, and the interaction between it and a no-dep-array effect
meant the `applyHash` listener was removed mid-dispatch and never ran. Every
tab, every sidebar link and the back button changed the URL and nothing else.
`router.js` is pure, unit-tested, and passed the whole time. Also: Export →
Bundle answered 401 for every user.

**Then the auth flows** (section 2 below), which found the confirm-screen
defect and a third instance of the same stale-ignore-list mistake:
`.gitignore` covered `config/identity.yaml` and `brand/logos/` but not
`config/identities/` or `brand/users/<hash>/`, the per-account directories
underneath them — a real account's institution and its crest, both
committable. `test/buildcontext.test.js` now asks git the same question it
asks docker.

---

## What to do next, in the order I would do it

### 1. The model work — unchanged, and first the moment the gateway answers

Nothing here moved this session because nothing could. From the previous
handoff, still exactly true:

- **Nothing has been generated with thinking on.** §6 of the CoE guide says the
  gateway runs with reasoning OFF by default and takes it per request. The
  author and critic roles now opt in at `medium` and the wiring is verified
  *structurally* — the right JSON reaches the right endpoint, checked against a
  recording server — and never behaviourally.
- **`medium` is a guess.** The guide recommends `xhigh` for "very hard problems,
  long reasoning chains". Planning a 16-slide deck may be that.
- The experiment, now that `deckscore` exists to measure it:

  ```bash
  FORGE_HOSTED=1 npm run forge -- new "<topic>" --max-slides 16 --density dense
  FORGE_HOSTED=1 npm run forge -- generate <slug>
  npm run deckscore <slug>
  ```

  Toggle `thinking:` on `roles.author` between runs. `deckscore` catches a
  mechanical regression; the prose difference still needs reading. Two runs read
  closely beat a sweep — it spends the operator's budget.

**If you add another per-role model option, grep `cloudSpec` first.** It builds
its own spec rather than going through `resolveRole`, and silently dropped
`thinking`, `reasoning_effort` and the provider capability flag on exactly the
path a hosted deck takes.

#### Running the gateway's own model locally — see `docs/LOCAL-MODEL.md`

**`docs/LOCAL-MODEL.md` is the full writeup — setup, serving flags, the
provider block, and what a result from it is and is not. Start there.** The
venv is built and the weights were pulled on 2026-09-03; what follows is why.

`/v1/models` answers even while generation does not, and it names what the CoE
serves:

    /home/user1/models/Qwen3.6-35B-A3B-NVFP4-Fast

That is reproducible here, and it is the difference between "exercise the
pipeline" and "answer the quality question". The checks that matter:

- **`nvidia/Qwen3.6-35B-A3B-NVFP4` is published on Hugging Face**, so the exact
  weights and the exact quantisation format are available.
- **NVFP4 needs Blackwell, and this box is Blackwell.** The gateway runs a DGX
  Spark (GB10); this machine is an RTX 5090 Laptop (GB20x, SM120). vLLM +
  FlashInfer + CUTLASS support SM120.
- **35B total, 3B active.** At 4 bits the weights are ~17.5 GB, so it fits in
  this card's 24 GB — the same range as the `qwen3.8:27b` already installed.

**The real constraint is that this is the 24 GB laptop part, not the 32 GB
desktop 5090 every published write-up assumes.** Weights fit; the KV cache gets
the remaining ~5 GB, and deck generation sends large prompts (research notes
plus the type catalog plus the schema). Expect to cap context and use an FP8 KV
cache, and expect that to be the thing that bites, not the weights.

Setup notes: vLLM is not installed, the system Python is 3.14 (too new for its
wheels — make a 3.12 venv with `uv`), CUDA is 13.3, and there is 957 GB free.

**Wire it in as a provider, not through the dev fallback.** This is the part
worth getting right. `FORGE_DEV_LOCAL_FALLBACK` exists for a gateway that has
become unreachable mid-request: it warns at boot, warns per role, marks the
response `devLocalFallback` and is documented as telling you nothing about
quality — all correct, because it swaps in a *different, weaker* model. Running
the *same* weights is a different claim, and it deserves a different mechanism.
`config/models.yaml` already takes it with no code change:

```yaml
  tcet-local:
    type: openai-compatible
    baseURL: http://localhost:8000/v1
    label: Qwen3.6-35B-A3B, local vLLM
    models: [qwen3.6]
    vision_models: [qwen3.6]     # same model, so the vision critic is viable
    supports_thinking: true      # the whole point — enable_thinking per request
```

That buys the two things the gateway is blocking: **thinking mode can finally
be run rather than verified structurally**, and `medium` vs `xhigh` becomes an
experiment instead of a guess. It also exercises `cloudSpec`, the hosted path,
which is where per-role options have been lost before.

Be honest about what it is when recording results: same weights and same
quantisation format, different serving stack and a much smaller card. Close
enough to answer "does the deck argue anything"; not a substitute for a timing
or throughput claim about the gateway.

### 2. Surfaces never exercised — auth and Settings are done, the rest are not

**The auth flows ran end to end for the first time**, and the reason they never
had is worth knowing before touching anything near them: `mailConfigured()`
decides both whether mail is sent and whether confirmation is *enforced*. With
no SMTP an account is verified on creation, so on an ordinary dev box the
verification path does not run weakly — it does not run. `tools/mailsink.mjs`
is committed for exactly this:

```bash
npm run dev:mail     # api + web + an SMTP sink on :2525 that prints every link
```

Covered: register → confirmation mail → unverified login (allowed) → workspace
write refused 403 `email_unverified` → confirm → forgot password → reset mail →
new password → old credential dead, new live, verified preserved, reset token
single-use. **It found one defect** — the confirm screen reported a dead link
for an address it had just confirmed, because the effect ran twice and the
token is single-use. Fixed via `singleFlight`; see the roadmap's Learned block.

Still zero runs behind:

- **[x] The browser UI against a real deck** — done, on an owned copy of
  `perovskite-solar-cells-stability-challenges-2`. All four project pages, the
  slide grid, the downloads and the export menu. **Two defects, one total:**
  in-app navigation did nothing at all (every route change moved the URL and
  left the view behind, fixed in 54363f3), and Export → Bundle answered 401 for
  everyone (a raw fetch with no credential, fixed in a40d180). Chat and convert
  *turns* through the UI are still unexercised — those need a model.
- **`--upload` research**, **`report-new`**, **`deck-from-report`** — three
  entry points, zero runs. These need a model.
- **Presenter assignment with a real team.** Every deck so far had none, so
  every slide rendered `Presenter: —`. The split is deterministic, so it can be
  exercised on an existing deck without generating one.
- **Rate limits and quotas** under real load.

The fixture that makes UI work possible, worth keeping:

```js
// mint a session without the signup form; tear down with deleteUserAccount
import { register, startSession } from "./src/auth.js";
await register({ name: "T", email: "t@example.test", password: "..." });
const token = await startSession({ email: "t@example.test" });  // the token itself
// in the browser: localStorage.setItem("forge.token", token); location.reload()
```

**Every test account created this session was deleted afterwards.** The dev box
holds **114 accounts**, all pre-existing. Harmless now that they cannot reach
an image, but `Admin → Users` is where to look.

### 3. Two decisions waiting on you

- **Nothing can test the browser.** Three defects this session existed only in
  a running browser and none was reachable from 516 passing tests; two were
  total. Component-test infrastructure (jsdom + a React renderer) versus a
  scripted browser pass run before a release — both would have caught all
  three, and they cost very different things. New roadmap entry; agree the
  direction before building either.
- **Running the gateway's model locally.** See below.

### 4. Content quality — half of it is measurable, the half that matters is not

`npm run deckscore <slug>` measures the deterministic half — intact, fits,
grounded, varied, whole. The real generated deck scores **73**. The other half
— does the deck ARGUE anything, is the research any good, does the report READ
well — is answered on the gateway and nowhere else. The roadmap's "Measuring
content quality" wants a small fixed set of briefs kept as a baseline and the
score recorded per generation.

### 5. Run the critic loop end to end

Built, never watched. `--critic` renders every slide, sends the PNG to the
`critic` role, and hands the findings to a fix turn that EDITS THE DECK — so a
critic that cannot see is worse than none. Hosted runs one model, so critic and
author both resolve to the gateway; the split is local-only and forced by what
Ollama reports each model can do.

### 6. Still-open roadmap items

- **The front end** — priority HIGHEST in the file. The briefing is fifteen
  cards and a user who answers nothing still clicks through all fifteen; the
  completed transcript reads "0 members / no guide set / no subject set". That
  is product judgement and `AGENTS.md` says to ask before changing it.
- **The admin panel, swept** — deferred deliberately; the operator's own
  surface. It gained an identity row this session and nothing else.
- **The fitter's `tracking` unit bug** — unchanged, still wants its own round
  against a fresh `themematrix --save` baseline. Keeps `matrix` out of the
  landing showcase.
- **24 contrast pairings** clearing 3:1 but not 4.5:1 (`test/contrast.test.js`).
- **`venn`'s caps** — measured at 14, declared at 30/27.
- **`tools/fonts.manifest.json`'s `used_by` list** has drifted: six families
  listed that no theme uses, and nothing reads the field.

---

## Instruments worth reusing

- **Prove the check fails on the old code.** `test/buildcontext.test.js` was run
  against the previous `.dockerignore` via `git stash` before being trusted; it
  named `config/forge.db` exactly. A test written after a fix and never seen red
  is a test of nothing.
- **Drive two accounts, not one.** Every per-account boundary looks correct from
  inside a single session.
- **Generate, then LOOK.** Unchanged and still the only thing that finds the
  real defects. The specimen deck's payloads are hand-written to behave; use
  `--deck` on a real generated deck.
- `FORGE_GEOM_TRACE=1` prints the stack behind a geometry verdict.

## Known and not fixed

- `config/identity.yaml` is the unfilled template. The real values need a human.
- `decks/perovskite-solar-cells-stability-challenges-2` is the deck the previous
  session's thirty defects were found in — real generated content, kept as a
  fixture. Every check takes `--deck`; use it.
- The older `decks/electrochemical-impedance-spectroscopy-for-l` predates the
  cap corrections and still reports over-length fields. That is the caps
  working, not a regression.
- `matrix` is held out of the landing showcase until the tracking bug is fixed.
- `feature-grid` is two lines of speaker-note debt on `minimal-muji`.
- Existing deck slugs still show the old counter (`...-12`, `...-19`). Nothing
  renames them; the mint changed, not the history.
