# Handoff — 2026-09-06, local self-hosting and BYOK guard complete

Read `AGENTS.md`, `CLAUDE.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then the
relevant entry in `docs/ROADMAP.md`. The roadmap is the only future-work list;
do not copy work items into this file or `PRODUCTION.md`.

## Clean stopping point

The private local-install track and the cross-deployment BYOK spending guard are
complete, documented, tested and running. There is no partially implemented
local or BYOK-safety feature to continue. Provider-quality, checkout and public
hosting remain separate later tracks.

The matching public checkpoint is version `0.1.0`, tagged as `v0.1.0`. Release
copy describes the repository as self-hosted software and does not claim that
the later hosted/paid product is live.

## The local product as shipped

From a clone, the application starts with one Docker command:

```bash
docker compose up -d --build --wait
```

The root `compose.yaml` starts Forge and a private SearXNG companion, exposes
only `127.0.0.1:8090`, persists all state in `forge_local_data`, and requires no
domain, SMTP credentials, shared-provider key or production secret. Forge's
image contains Node, LibreOffice, Chromium, fonts and the theme gallery. Ollama
is deliberately not bundled into that process image.

Model access is chosen after startup:

- BYOK works in the downloadable app under **Settings → Cloud** and requires no
  Ollama installation. Only model requests go to the chosen provider. The key
  owner's provider bills their account, and the owner must acknowledge that
  before saving a key.
- Local inference uses host Ollama through `host.docker.internal` or an explicit
  `FORGE_OLLAMA_HOST`. `qwen3:4b` is documented as a lightweight starter, not as
  the product's quality reference.

`tools/local-check.mjs` now distinguishes application readiness from model
choice. A healthy fresh install passes and explains that it still needs BYOK or
Ollama; when Ollama is visible it reports the selected local model. It runs
inside Forge's container, so a Docker-only user does not need host Node.

## Local authentication

Private installs default to personal-owner mode:

- A fresh volume offers **Set up your workspace**.
- The first registration atomically creates a verified administrator, starts
  its session, and closes registration.
- Later visits offer **Open workspace** and normal local login.
- Google sign-in, email confirmation, resend and password-reset routes are not
  local-owner surfaces; the UI does not advertise them.
- Accounts remain because they own decks and encrypted BYOK keys. Existing
  volumes and all existing accounts are preserved without migration or merge.
- `FORGE_LOCAL_MULTI_USER=1` is the explicit compatibility option for an old,
  trusted shared-machine install. It is not the normal Compose default.
- Hosted mode retains its existing multi-user registration, verification,
  recovery, Google and administrator behavior.

The first-owner insert uses SQLite `BEGIN IMMEDIATE`; two first-load tabs cannot
both create owners. `/api/auth/registration` carries the explicit installation
posture, so the browser never guesses auth behavior from missing SMTP.

## README and platform contract

The README now puts the local path before implementation detail, presents BYOK
and Ollama as equal choices, and contains one local-install explanation instead
of two. The animated four-theme proof replaces its duplicate static grid. Two
real app captures are embedded: the existing-work viewer and a fresh private
install walking from topic entry through briefing choices and optional thesis
details. The latter stops before generation and says so because no model was
available; it makes no output claim.

`LOCAL_SETUP.md` covers Docker Desktop on Windows/macOS, Docker Engine on Linux,
host/LAN Ollama, BYOK, persistent data and destructive reset behavior. Host
LibreOffice/Poppler/Chromium requirements are clearly scoped to source
development, not Docker use. All 34 README-local paths resolve.

## BYOK cost safety

The same guard applies to user-supplied OpenAI-compatible keys in the local and
hosted applications because enforcement lives in the shared model transport:

- each account starts with a 180,000-token rolling 24-hour ceiling, editable in
  **Profile → Cloud** between 10,000 and 5,000,000;
- every real provider attempt is atomically reserved before the network call,
  including retries, repairs, reports, scripts and key tests;
- successful calls settle to provider-reported usage or a conservative text
  estimate; failed/time-out calls retain their reservation;
- each response is capped at 12,000 tokens, output-cap doubling is disabled and
  transport failures receive at most one retry;
- the UI shows used/remaining tokens and the approximately 134,600-token
  preflight estimate for a researched 22-slide deck;
- saving or replacing a key requires explicit acknowledgement that provider
  pricing, balance, taxes, currency, billing limit and final invoice belong to
  the key owner. Terms, Privacy, README, local setup and deployment docs repeat
  the boundary and direct the owner to set a hard provider-side monetary cap.

This is deliberately a token safety rail rather than currency accounting.
Provider-specific prompt caching is still a separate roadmap item and should be
implemented only after a provider is selected and measured; the spending guard
does not depend on it.

## Verification

- `npm test` — **808 passing, 0 failing** outside the restricted test sandbox.
- `npx vite build --config app/web/vite.config.js` — clean build; only the
  pre-existing bundle-size/dynamic-import warnings remain.
- Local-owner HTTP integration — fresh setup, admin/session creation,
  registration closure, login, disabled local mail/Google routes and unchanged
  hosted registration all pass.
- Compose/build-context tests — local/production separation, private SearXNG,
  persistence, host-Ollama override and config allow-list all pass.
- Local-check tests — both BYOK-ready/no-Ollama and visible-Ollama states pass.
- Live `docker compose up -d --build` — Forge and SearXNG healthy.
- Live install check — Forge healthy, bundled research configured, existing
  local model visible. This read the model list only; it did not generate or
  use the local model.
- Live auth contract — `localOwner: true`, `ownerConfigured: true`, signup
  closed, mail and verification disabled on the existing volume.
- Browser DOM check — rebuilt app loaded at `#/home` with no console errors and
  showed **Open workspace** with no public signup action. The browser control's
  screenshot/click channel timed out after that read, so no modal screenshot is
  claimed; route behavior is covered by the HTTP test.
- Briefing capture — a disposable isolated Docker volume was used to create a
  dummy owner, enter a topic, choose briefing settings and open optional thesis
  details. It stopped before generation, made no model call, and the temporary
  containers, network and volume were removed after capture.
- BYOK unit/transport tests — concurrent reservations, refusal-before-fetch,
  provider-usage settlement, omitted-usage estimation, retained failed-call
  reserve, response cap and one-retry ceiling all pass.
- Disposable Docker HTTP integration — changed a fresh owner's budget, proved
  key save fails without cost acknowledgement, saved a dummy key with
  acknowledgement and observed its acceptance timestamp. The temporary
  container and its fake account/key were removed afterward.
- Browser legal-page check — the rebuilt app visibly serves the
  **Bring-your-own-key costs** Terms section at `127.0.0.1:8090`.

## Local runtime left in place

The Forge and SearXNG containers are healthy on `127.0.0.1:8090`. The preserved
`forge_local_data` volume contains the prior throwaway capture account and
public demo workspace. Do not publish that volume or browser state.
`docker compose down` preserves it; `docker compose down -v` permanently
deletes decks, accounts, keys and the report donor.

## Next session

Choose an item directly from `docs/ROADMAP.md`, using `docs/BLOCKED.md` to avoid
work that still needs a provider, operator asset or product decision. There is
no remaining local-hosting or provider-neutral BYOK-safety item to select. Do
not run a local model to judge content quality; the repository working
agreement defines the hosted Auto path as the quality reference.
