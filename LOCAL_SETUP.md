# Run Presentation Forge on your own machine

There are two intentionally different ways to run Forge:

| You want to… | Use | What runs where |
|---|---|---|
| **Use the app** | [`compose.yaml`](compose.yaml) | Forge + LibreOffice + Chromium + fonts + private SearXNG in Docker; your choice of BYOK or host Ollama |
| **Develop Forge** | this guide | Node, LibreOffice, Chromium and fonts installed on your machine |
| **Operate it for other people** | [`docs/DEPLOY.md`](docs/DEPLOY.md) | hosted mode, TLS, mail, admin controls, persistent production secrets |

The first is the normal path. Starting the application is one command after
Docker is installed; model access can be BYOK or local Ollama. The rest of this
document covers both paths.

## Normal local install — Docker

```bash
git clone https://github.com/Deepnar/presentation-forge.git
cd presentation-forge
docker compose up -d --build --wait
docker compose exec forge env FORGE_CHECK_URL=http://localhost:5174 node tools/local-check.mjs
```

Open <http://localhost:8090>. Compose starts Forge and an unexposed SearXNG
research service. The first build downloads the application image, renderer
dependencies and theme fonts. Later starts are `docker compose up -d --wait`.

Before generating, choose either model path:

- **BYOK, no Ollama required:** open **Settings → Cloud**, add an
  OpenAI-compatible provider and switch to Cloud. Decks, accounts, research and
  the report donor remain local; only model requests leave the machine.
- **Local inference:** install [Ollama](https://ollama.com), run
  `ollama pull qwen3:4b`, and leave the picker on Auto. The 4B model is a small
  starter that makes the pipeline usable on ordinary hardware, not the quality
  reference for the product. Configure a stronger installed model when the
  machine can carry it.

This is a **private-machine** install, not a replacement for a hosted account
service. The first visit creates one local owner, logs it in immediately and
closes registration. Email is only the local account identifier: there is no
verification mail, Google login or password-reset flow. The account still owns
the workspace and encrypted BYOK keys. Existing local volumes keep their old
accounts and logins; the upgrade never deletes or merges them.

Do not expose this bundle to strangers or use it as shared public hosting. Use
the production deployment when multi-user account guarantees matter.

### Docker Desktop — macOS and Windows

Install Docker Desktop, then run the commands above in Terminal or PowerShell.
If using local inference, also install the Ollama desktop app; Docker Desktop
already exposes its host endpoint under `host.docker.internal`.

### Docker Engine — Linux

Install Docker Engine with the Compose plugin, then run the same commands. If
using local inference, install Ollama as well. Forge supplies Docker's
host-gateway mapping automatically. If the container check says no local model
is visible while `ollama list` works on the host, Ollama is likely listening
only on loopback. Start it with an endpoint the container can reach:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

For a permanent system service, set that environment value using your Linux
service manager rather than leaving a terminal open. Do this only on a trusted
network: it makes Ollama reachable from Docker and potentially your LAN.

### Ollama somewhere else

The model can live on a trusted LAN machine instead. Point Forge at it while
starting Compose:

```bash
FORGE_OLLAMA_HOST=http://192.168.1.42:11434 docker compose up -d
```

The `docker compose exec … local-check` command is the install proof: it asks
Forge, rather than Docker, whether the app is healthy and reports whether the
model picker sees Ollama or still needs BYOK/local model setup. It runs inside
the container so Docker-only users do not need Node on the host.

## Source-development prerequisites

Skip this section when using the normal Docker route.

| Requirement | Linux | macOS | Windows |
|---|---|---|---|
| Node.js 24+ | package manager / nvm | Homebrew / installer | installer / nvm-windows |
| Ollama | [Ollama](https://ollama.com) | Ollama app | Ollama app |
| LibreOffice | package manager | LibreOffice app | LibreOffice app |
| Poppler | package manager | `brew install poppler` | install Poppler and put `bin` on PATH |
| Chromium | package manager | Chrome/Chromium | Chrome/Chromium |

The Docker route carries LibreOffice, Poppler, Chromium and the 21 font
families already. Do **not** install them merely to use the container.

## Source setup

```bash
git clone https://github.com/Deepnar/presentation-forge.git
cd presentation-forge
npm install
npm run fonts
npm run brand
cp config/identity.example.yaml config/identity.yaml
ollama pull qwen3:4b
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:5174>

On first run, create the local owner, start **New chat**, describe the topic,
answer the briefing, review the outline, then approve it.

`config/identity.yaml` is ignored by Git. Put your institution, guide and team
there; it is a local default, not a file to commit.

## Choose a model

### Ollama — default

With `FORGE_HOSTED` unset or `0`, Auto resolves to Ollama on
`http://localhost:11434`. Change the roles or models in `config/models.yaml`
if you have a different local setup.

### BYOK — first-class, including in the Docker install

Open **Settings → Cloud**, add an OpenAI-compatible provider key, then switch
the app to Cloud. The app sends model requests only to that provider; decks,
research, accounts and the report donor remain local.

For source development, provider keys are stored in local state and must never
be committed. For the Docker install they live in its persistent volume. On
first local Docker boot Forge creates a random encryption pepper in that volume
automatically; production never does this and still requires the operator to
supply `FORGE_KEY_PEPPER` explicitly.

## Useful source commands

```bash
npm test                                      # tests
npm run render decks/<slug>/deck.yaml         # content -> .pptx
npm run preview decks/<slug>/out/deck.pptx    # .pptx -> PNGs
npm run forge -- new "<topic>" --research     # headless outline
npm run forge -- generate <slug> --critic     # headless deck
npm run searxng                                # optional SearXNG only, for source mode
```

The browser app and the CLI call the same `src/` pipeline. The server is a
transport, not a second implementation.

## Where data lives

| Data | Source run | Docker local run |
|---|---|---|
| Deck workspaces | `decks/<slug>/` | `forge_local_data` volume (`/data/decks`) |
| Accounts, sessions, encrypted keys | `config/forge.db` | `forge_local_data` volume (`/data/config/forge.db`) |
| Identity and local model config | `config/` | `forge_local_data` volume (`/data/config/`) |
| Brand and report donor | `brand/`, `reference/` | `forge_local_data` volume (`/data/brand`, `/data/reference`) |

Nothing is deleted by default. A production retention sweep is a production
choice, not a local-install surprise.

## Troubleshooting

- **Ollama cannot be reached** — make sure `ollama list` works. In Docker run
  the `docker compose exec … local-check` command above; if Ollama is on
  another machine, start Compose with
  `FORGE_OLLAMA_HOST=http://host:11434 docker compose up -d`.
- **Preview fails** — source runs need LibreOffice and Poppler on `PATH`;
  Docker already includes both.
- **Plate or freeform slides fail** — source runs need Chrome/Chromium. Docker
  includes Chromium and configures its no-sandbox container mode.
- **Ports are busy** — source uses :5173 / :5174. The local Docker bundle uses
  :8090; change it with `FORGE_PORT=8091 docker compose up -d`.
- **I want to start clean** — `docker compose down -v` removes the local Docker
  volume. It permanently removes decks, accounts, keys and the report donor.
  `docker compose down` does not.

## Production is different on purpose

The local bundle is private, local mode and convenience-first. Do not expose it
to the internet by changing its port binding. When you need users outside your
machine, use [`docs/DEPLOY.md`](docs/DEPLOY.md): it enables hosted mode, Caddy
TLS, SMTP, secure cookies, an administrator, tenant controls and real secrets.
