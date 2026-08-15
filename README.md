# Presentation Forge

> A brief goes in — a themed, graded-format deck and report come out.
> The app does the bulk — research, structure, draft content, render — you do
> the final touches: verify the facts, tune the words, make it yours.

**Local-first academic presentation and report generator.** Node + pptxgenjs +
local models by default, optional cloud backend per role. Built for TCET-style
graded submissions: institutional chrome, fixed section order, per-member
presenter blocks, and a report that matches the donor template.

`topic in → guided briefing → outline gate → deck + report out`

```
brief ──► research ──► outline ──► [you approve] ──► content ──► render ──► critique
          SearXNG      plan.yaml                     deck.yaml   .pptx      vision
          + papers     (plain-language cards)                   .docx
```

---

## Tags

`node` · `pptxgenjs` · `ollama` · `local-first` · `chat-first UI` · `50+ slide types`
`searxng` · `arxiv/crossref research` · `report renderer` · `docker` · `MIT`

---

## Why this shape

The obvious approach — ask a model to write pptxgenjs code — falls apart with a
local model. Slide layout is coordinate arithmetic, text metrics and overflow
handling, which is exactly what small models are worst at, and it is unstable:
every regeneration reshuffles the geometry.

So layout is made unreachable. Three layers, strictly separated:

| Layer | Owns | Written by |
|---|---|---|
| **chrome** | institutional marks, presenter, slide number | locked code |
| **theme** | palette, type, spacing, shape | YAML, by hand |
| **content** | what the slides actually say | the model, as validated YAML |

The model picks *what to say* and *which of 75 slide types fits each beat*. It
cannot place anything, colour anything, or choose a font. All design quality
lives in theme files where it is deterministic and tunable.

## What it does today

- **Chat-first UI** — login, per-user workspaces, and a chat window as the
  whole app: send a topic, answer a guided one-question-at-a-time briefing
  (title, team, guide, subject, theme gallery with live previews, slide count,
  density, branding), approve a plain-language outline, and watch it generate.
  The chat stays alive after the deck is ready and edits it by conversation.
  The machine drafts — the outline gate, editable content and chat refinement
  are the final-touch surfaces that stay human.
- **75 slide types** in 14 families — data/stats, charts (line/bar/scatter/
  radar/stacked-bar), comparison, process/flow, timeline, quote, callout,
  image/table, diagram-ish (framework, matrix, venn, hierarchy), definitions,
  team, hero/dividers — each with a live per-theme preview and per-slide swap.
- **Research that researches** — multi-angle queries, source-diversity
  scoring, claim cross-checking against `research/notes.md`, arXiv/Crossref
  paper search, optional Jina Reader fallback, and a grounding pass that flags
  invented statistics instead of shipping them.
- **Graded reports** — template-donor `.docx` renderer (institutional chrome
  byte-identical to the donor, fixed section order, watermark preserved),
  standalone brief→report, deck-from-report, full/brief depth, Word-page
  previews, one-click render-and-download.
- **Content quality controls** — global density sweep (sparse/balanced/dense),
  auto-trim of overfull slides to a readable font floor, presenter blocks that
  are contiguous and balanced (every member gets a slide when the count
  allows), dividers never assigned.
- **20+ themes** — `tokens`/`voice` split per theme; native shapes or the
  Chrome plate renderer (glassmorphism, clay, neumorphism, aurora).
- **Deployment-ready** — one container (Node + LibreOffice + Chrome +
  SearXNG), env-driven config, monthly old-data sweep with SMTP mail, auth
  rate limits, CORS hardening.

## Requirements

- Node 24+
- [Ollama](https://ollama.com) with at least one instruction-following model
  (or a cloud provider in `config/models.yaml`)
- LibreOffice and poppler (`pdftoppm`) — used to rasterise slides for review
- Docker, if you want local web search

## Running it locally

Two ways — pick the one that fits your machine:

| | Local models (fully offline) | Cloud models (any laptop) |
|---|---|---|
| Needs | Node 24+, Ollama + a model, ~8GB+ RAM | Node 24+, an API key |
| Model calls | stay on your machine | go to the cloud provider |
| Your data | local, always | local, always (only model calls leave) |

### Setup (both paths)

```bash
git clone https://github.com/Deepnar/presentation-forge.git
cd presentation-forge
npm install
npm run fonts                 # 27 typefaces the themes call for
npm run brand                 # normalises brand marks (generates placeholders if none)
cp config/identity.example.yaml config/identity.yaml   # then edit: institution, guide, team
```

### Models

**Local (default):** start Ollama and pull a model — the app resolves every
role to Ollama automatically:

```bash
ollama pull qwen3:4b          # or any instruction-following model you have
npm run dev
```

**Cloud:** in the app go to Identity → Cloud, paste your key (any
OpenAI-compatible endpoint — OpenAI, OpenRouter, OpenCode Go, …), flip the
header toggle to CLOUD. The key is stored in the gitignored `config/local.yaml`
and never sent anywhere but the provider.

**Which cloud models are offered:** the list a provider exposes is the one the
host curates. In `config/models.yaml`, a provider may declare an explicit
`models:` list (e.g. `models: [my-model-a, my-model-b]`) — that is what the
picker shows, labelled "Models this host has enabled". If a provider's
`models:` is empty or omitted, the server fetches the list from the provider's
own `GET {baseURL}/models` endpoint instead, so a hosted box whose provider
does not ship a curated list still gets a working picker. Either way the
curation is an admin decision: what the host enables is what users can pick.

### Run

```bash
npm run dev                   # web UI :5173, API :5174 — the app
```

Open http://localhost:5173/, register an account, start a new chat, type a
topic, answer the briefing, approve the outline — deck and report come out.
(Optional local web search: `npm run searxng` on :8888.)

### Where your data lives (all local, all yours)

| What | Where |
|---|---|
| Decks (per account) | `decks/<slug>/` — deck.yaml, plan.yaml, research/, out/ |
| Accounts | `config/users.json` (scrypt hashes — no plaintext passwords) |
| Sessions | `config/sessions.json` (opaque bearer tokens) |
| Saved briefing presets | per-account, in config/ |
| Institution identity | `config/identity.yaml` |
| Cloud API key | `config/local.yaml` (gitignored, never committed) |
| Brand marks | `brand/logos/` + `brand/generated/` (gitignored) |

Every user gets their own scope (decks carry the owning account's email,
presets and sessions are per-account). No database — it's all JSON/YAML
files, which is also what makes a deck portable: copy `decks/<slug>/` to
another machine and it opens there.

### Troubleshooting

- **Previews fail / "pdftoppm not found"** — install poppler-utils and
  LibreOffice: `sudo apt install libreoffice poppler-utils` (Debian/Ubuntu)
  or `sudo pacman -S libreoffice-fresh poppler` (Arch).
- **Nothing renders from chat** — check the API log (`npm run dev` output)
  and that Ollama is running (`ollama list`); if using cloud, check the key
  in Identity → Cloud.
- **Ports busy** — the app binds :5173 (UI) and :5174 (API); change with
  `FORGE_API_PORT` or the Vite config.

## Use

```bash
npm run dev                                   # web UI :5173, API :5174 — the app
npm run render decks/gpu-demo/deck.yaml       # deck.yaml -> .pptx
npm run preview decks/gpu-demo/out/deck.pptx  # .pptx -> PNGs, so you can SEE it
npm run search "your query"                   # research from the terminal
npm run sweep -- --dry-run                    # preview the monthly deck sweep
```

Generate a deck from a brief (headless):

```js
import { generateDeck } from "./src/ai/generate.js";
import { loadTheme } from "./src/theme.js";

const { deck } = await generateDeck({
  theme: await loadTheme("warm-humanist"),
  brief: "Introduce real-time ray tracing: what it is, how it differs from "
       + "rasterisation, the pipeline stages, and where hardware is heading.",
});
```

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl+K` | focus the sidebar search |
| `Ctrl+N` | start a new chat |
| `Ctrl+Z` / `Ctrl+Y` | undo / redo a deck edit (in a deck view) |
| `Escape` | close the open modal / lightbox |

## Themes

One YAML file each, split into two halves that never overlap:

- **`tokens`** — exact machine values. Read only by the renderer. Hex, points,
  inches. No adjectives, no "or similar".
- **`voice`** — tone and density. Read only by the model. No hex, no geometry.

That disjointness is load-bearing. Give a model sight of hex values and it
starts inventing them; give the renderer adjectives and it starts guessing.

## What is worth reading

- **[`docs/TRAPS.md`](docs/TRAPS.md)** — the most portable thing here. Constrained
  decoding guarantees shape, not sense, and a large schema actively degrades
  generation. Records how that fails, in what order, and why tuning sampling
  parameters does not help.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — why this shape, the two
  rendering paths, why not LangChain.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — status plus what was learned per feature.

## Brand marks and identity

`brand/logos/` and `config/identity.yaml` are gitignored. Institutional logos
are trademarks and identity files carry personal details, so neither belongs in
a repository. `npm run brand` generates neutral placeholders when no marks are
present, so a fresh clone renders immediately; drop your own in and re-run it.
The UI can also upload marks from Identity → Brand (written to the gitignored
dirs, re-normalised, never committed).

## Deploying on a home Linux server

The app is built to be "plug your API key and play" on a friend's old laptop —
one container, one command, persistent data:

```bash
cd docker
cp ../.env.example .env        # then set FORGE_SMTP_* etc.
docker compose -f docker-compose.app.yml up -d --build
```

The `forge` container ships Node, LibreOffice and headless Chrome (the whole
render pipeline), serves the built UI on one port, and talks to the bundled
SearXNG container for local research. State lives in a Docker volume
(`/data`): decks, brand marks, config, plate cache. Redeploying never loses a
deck.

Environment (set in `docker/.env`, all optional):

| Variable | Meaning |
|---|---|
| `FORGE_PORT` | public port (default 8080) |
| `FORGE_SWEEP_DAYS` | delete decks older than N days of inactivity (default off) |
| `FORGE_SWEEP_HOUR` | run the daily sweep at this hour (default 3) |
| `FORGE_SMTP_HOST/PORT/USER/PASS/FROM/TO` | sweep email (see `src/mail.js`) |
| `FORGE_SMTP_SECURE=1` | implicit TLS for SMTP |
| `FORGE_AUTH_RATE_LIMIT` | login/register attempts per 10 min per IP (default 20) |
| `FORGE_OPEN_REGISTRATION` | `0` closes self-signup; the owner account is seeded from `FORGE_ADMIN_EMAIL`/`FORGE_ADMIN_PASSWORD` at boot |
| `FORGE_SESSION_TTL_DAYS` | session idle timeout in days (default 30; a token unused that long is revoked) |
| `FORGE_TRUST_PROXY=1` | set behind a reverse proxy so the rate limiter sees real client IPs |
| `FORGE_UI_ORIGIN` | comma-separated allowed CORS origins (empty = same-origin only) |

The monthly sweep is what keeps the server from becoming cloud storage: decks
older than `FORGE_SWEEP_DAYS` are deleted unless their `meta.yaml` has
`keep: true`, and an email is sent on sweep day listing what was removed.
People download daily to local machines, so the server only ever holds recent
work. `npm run sweep` runs it manually; `POST /api/sweep` does the same from
the UI (dry run by default, and gated behind a login).

**Local models:** the container does not bundle Ollama. For local-first
generation install Ollama on the host (or any other machine on the LAN) and
point `config/models.yaml` at it (`host: http://host-ip:11434`) — the app
talks to it over HTTP like any other model backend. For cloud-only, just
attach an API key in Identity → Cloud and set the LOCAL/CLOUD toggle.

**Sweep timezone:** the in-process scheduler runs on the container clock,
which is UTC. `FORGE_SWEEP_HOUR` is a UTC hour.

**Backups:** everything that matters lives in the `forge_data` volume —
decks, brand marks, and `config/users.json` + `config/sessions.json` (the
accounts). To back up:

```bash
docker compose -f docker-compose.app.yml stop forge
docker run --rm -v forge_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/forge-data-$(date +%F).tar.gz -C /data .
docker compose -f docker-compose.app.yml start forge
```

Restore the other way: stop, extract the tarball back into `/data`, start.
Backing up `config/users.json` and `config/sessions.json` is what preserves
accounts — without them every visitor must log in again, and with
`FORGE_OPEN_REGISTRATION=0` nobody can self-register to recover.

For a domain in front, put a reverse proxy (Caddy/nginx) on the public port
with a TLS cert and forward to the container. Set `FORGE_TRUST_PROXY=1` so
the rate limiter counts real client IPs, and set `FORGE_UI_ORIGIN` to your
domain if the UI is served from elsewhere. The research papers feature
(arXiv/Crossref) and the Jina Reader fallback (`RESEARCH_JINA=1`) are the only
outbound network calls the app makes beyond SearXNG.

## Licence

MIT for the code. Any brand marks or institutional templates you add are yours
and are not covered by it.
