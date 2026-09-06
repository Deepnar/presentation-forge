# Handoff — 2026-09-06, local self-hosting is a product path

Read `AGENTS.md`, `CLAUDE.md`, `docs/TRAPS.md`, `docs/BLOCKED.md`, then the
relevant entry in `docs/ROADMAP.md`. The roadmap is the only future-work list;
do not create a second one here or in `PRODUCTION.md`.

## Clean stopping point

The repository now has a usable private local-install path alongside the
separate hardened hosted deployment. This session stops after implementation,
documentation and live-container verification; there is no partially edited
feature to continue.

### What shipped in this checkpoint

- **Root `compose.yaml` is the normal self-host install.**

  ```bash
  ollama pull qwen3:4b
  docker compose up -d --build
  ```

  It binds Forge to `127.0.0.1:8090`, starts private SearXNG, keeps state in
  `forge_local_data`, opens registration and disables local retention sweeps.
  It does not request a domain, SMTP account, shared-provider key or
  production secret.
- **Ollama stays external and BYOK remains available.** `FORGE_OLLAMA_HOST`
  changes only the transport host, never a self-hoster’s `models.yaml`. Docker
  Desktop and Linux's host-gateway use `host.docker.internal`; a trusted LAN
  endpoint can be supplied explicitly. Settings → Cloud works in this bundle.
- **Local BYOK keys are not encrypted with a published default.** The entrypoint
  creates `/data/config/local-key-pepper` once, mode 0600, and reuses it. Hosted
  mode still requires `FORGE_KEY_PEPPER` from the operator.
- **The production route stays separate.**
  `docker/docker-compose.app.yml` retains hosted mode, explicit secrets and
  Caddy/TLS. Its old hourly quota variable names were corrected to the current
  runtime names: 5-hour / weekly abuse windows, 550,000 weekly tokens and the
  420,000-token lifetime trial.
- **Docker now actually contains the theme picker assets.** The final image was
  missing `app/gallery`, producing 34 thumbnail 404s only in Docker. It now
  copies that directory. The image build also has a narrow font-cache layer, so
  edits to unrelated tools no longer download the font set again.
- **The image context is an allow-list.** It dropped from roughly 950 MB on the
  legacy builder to roughly 2.6 MB, and only `config/models.yaml` plus
  `config/identity.example.yaml` may enter it. Never relax that to
  `config/*.yaml`: it can leak `identity.yaml` and `local.yaml`.
- **Static UI behavior is fixed.** The Docker CSP now hashes the built inline
  dark-mode prepaint script instead of blocking it. Server bind failures now
  report the actual port error instead of throwing a second TypeError.
- **The README is a real local-install page.** It includes actual committed
  `theme-system.gif/mp4` and `app-workflow.gif/mp4` captures. The app clip is
  correctly labelled as inspecting public existing work, not as a generation
  run. `tools/landing.mjs` protects those manual assets from its stale-file
  sweep.
- **Local auth is intentionally limited today.** The private bundle has no
  SMTP, so a local registration is immediately verified and password-reset mail
  is unavailable. Accounts still separate workspaces and secure BYOK keys. The
  next session must not casually remove them; a purposeful personal-owner mode
  is a recorded product decision in the roadmap.

## Verification completed

- `node test/buildcontext.test.js` — 5 passing.
- `node test/local-compose.test.js` — 6 passing.
- Both root/local and production Compose files parse with `docker compose
  config` (production supplied harmless verification-only required secrets).
- Running local stack: Forge and SearXNG both healthy; the in-container check
  reports local mode, an installed Ollama model and configured research.
- Live runtime checks confirmed a theme thumbnail returns HTTP 200 and the CSP
  authorizes the exact hash of the built prepaint script.
- README link/media audit: 38 local targets present.

No generation was run and no local model was used for content work. The health
check only read the already-running model picker.

### Full-suite caveat

`npm test` is **not clean in this Codex sandbox**: 81 test files passed, then
ten unrelated integration workers aborted inside Node 24's native
`InternalCallbackScope::Close` assertion. Running the affected files alone in
this environment does the same, so there is no usable application assertion to
repair here. This is recorded in `docs/BLOCKED.md` §5. Re-run the full suite in
an ordinary host shell before a release; do not lower the test bar or rewrite
unrelated tests to mask a Node/runtime failure.

## What remains for the next session

There is no unblocked non-model implementation remaining. The next session
should begin with the first item that the user actually unblocks:

1. **Provider key or Auto recovery** — run one real 22-slide deck, inspect the
   deck and report, record `meterSummary()` by role, then replace the derived
   economics constants. This also permits the honest end-to-end product video.
   See `docs/BLOCKED.md` §1.1–2.1 and roadmap *A provider key…*.
2. **A decision on credits versus subscription** — necessary before checkout or
   a refusal can become an offer. Credits are the recorded lean; do not build
   either without an explicit choice. See `docs/BLOCKED.md` §3.2.
3. **A decision on browser coverage** — scripted release pass is the recorded
   recommendation. Do not substitute component-test infrastructure without the
   choice. See `docs/BLOCKED.md` §3.1.
4. **One second-college donor template** — a cheap, model-free test of the
   claim that reports adapt to another institution. It requires a legitimate
   template supplied by the user; do not invent or publish one.
5. **A decision on local authentication** — recommended: personal-owner mode
   after first boot, with no pretence of email verification/recovery. The
   current shared-machine accounts are acceptable only on a trusted private
   machine. See `docs/BLOCKED.md` §3.4 and the roadmap entry.

The one outstanding demo subtask is a 30–60 second real run from topic through
report, naming its backend. It is deliberately not faked from the new GIFs.

## Local state left intentionally in place

`docker compose ps` currently shows the task-created local Forge and SearXNG
containers healthy on `127.0.0.1:8090`. They use the `forge_local_data` volume,
which contains a throwaway `demo-capture@example.invalid` account and the
public-deck capture workspace. No private V2G capture deck remains; it was
removed before assets were committed. Do not publish the volume or capture
browser state. Leave the containers alone unless the user asks to stop them;
`docker compose down` preserves the volume, while `docker compose down -v`
destroys it.
